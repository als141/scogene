"""
数学採点エージェント

OpenAI Agents SDK を使用した単一エージェント設計。
Code Interpreter で数式検証・画像に赤ペン添削を行う。
ストリーミング対応。

重要なアーキテクチャ:
  - input_image: モデルのビジョンで画像内容を「見る」ためのもの
  - container.file_ids: Code Interpreter の /mnt/data/ に配置し Python で「読み書き」するためのもの
  - 同じ file_id を両方に渡すことで、ビジョン＋編集の二重活用が可能
"""

from __future__ import annotations

import traceback
from collections.abc import AsyncGenerator
from typing import Any

import httpx
from agents import Agent, CodeInterpreterTool, ModelSettings, Runner
from openai import AsyncOpenAI
from openai.types.responses import ResponseTextDeltaEvent
from openai.types.shared import Reasoning

from config import settings
from models import GradingResult

# OpenAI クライアント
_openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# ── 採点エージェントの指示 ──

GRADING_INSTRUCTIONS = """\
あなたは日本の高校で20年以上の経験を持つ、非常に優秀な数学教師です。
生徒の数学の解答を採点します。

## あなたの役割
- 問題文と生徒の解答を読み取り、正確に採点する
- 途中式や解法のプロセスを詳細に評価する
- 部分点を適切に与える
- 建設的で教育的なフィードバックを提供する

## 採点の基準

### 1. 解答の正確性
- 最終的な答えが正しいか確認する
- 数値、符号、単位の正確性をチェックする

### 2. 途中式・解法プロセスの評価
- 論理的な流れが正しいか
- 式変形が正確か
- 適切な公式や定理を使用しているか
- 計算過程に誤りがないか
- 解法の効率性（より良い方法があれば指摘）

### 3. 部分点の付与
- 解法の方針が正しいが計算ミスがある場合：配点の50-70%
- 途中まで正しいがそこから間違っている場合：正しい部分に応じた部分点
- 答えのみで途中式がない場合：正解でも配点の80%（過程の記述が重要）
- 完全な誤答でも正しいアプローチの兆候がある場合：配点の10-20%

### 4. フィードバック
- 間違いの原因を具体的に指摘する
- どこで計算ミスをしたか、どの概念を誤解しているか
- 改善のための具体的なアドバイスを提供する
- 良い点は必ず褒める

## 配点について
- 問題に配点が明示されている場合はそれに従う
- 配点が不明な場合は、問題の難易度と分量から適切に推定する（デフォルト各問10点）
- 回答用紙に模範解答が提供されている場合はそれを参照する

## 赤ペン添削（画像注釈）— 最重要タスク

生徒の解答画像は Code Interpreter のサンドボックス内 `/mnt/data/` に配置済みです。
**必ず** Code Interpreter を使い、元の解答用紙の上に直接赤ペン添削を描いてください。
添削画像の生成は省略してはいけません。これがユーザーにとって最も重要な成果物です。

### ステップ1: 画像の読み込みと解答位置の分析

まず画像をビジョンで十分に観察してから Code Interpreter に取り掛かること。
具体的に各問題の解答が画像のどの位置（上部、中部、下部、左右）にあるか、
座標の概算（画像サイズに対する割合 0.0〜1.0）をメモしてから描画する。

### ステップ2: 添削コードの実行

**以下のコードを基本テンプレートとして必ず使用してください。**
画像ごとに個別に実行し、各画像に必ず注釈を付けてください。

```python
from PIL import Image, ImageDraw, ImageFont
import os, math

RED = (220, 30, 30, 230)       # 全マーク共通の赤色
RED_LIGHT = (220, 30, 30, 160) # 下線・囲みなど薄め
WHITE_BG = (255, 255, 255, 210) # コメント背景

# ── 画像を開く ──
files = sorted([f for f in os.listdir("/mnt/data/")
                if f.lower().endswith((".png",".jpg",".jpeg",".webp"))])
img = Image.open(f"/mnt/data/{files[0]}").convert("RGBA")
w, h = img.size
scale = max(w, h) / 1200  # 画像サイズに応じたスケーリング

overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)

# フォントサイズ（見やすさ重視で大きめに）
font = ImageFont.load_default(size=int(22 * scale))
font_sm = ImageFont.load_default(size=int(16 * scale))
score_font = ImageFont.load_default(size=int(56 * scale))

# ── ヘルパー関数 ──

def draw_maru(cx, cy, r=None):
    \"\"\"正解マーク ○ を描く\"\"\"
    if r is None:
        r = int(22 * scale)
    lw = max(int(3.5 * scale), 2)
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=RED, width=lw)

def draw_batsu(cx, cy, r=None):
    \"\"\"不正解マーク × を描く\"\"\"
    if r is None:
        r = int(18 * scale)
    lw = max(int(3.5 * scale), 2)
    draw.line([(cx-r, cy-r), (cx+r, cy+r)], fill=RED, width=lw)
    draw.line([(cx+r, cy-r), (cx-r, cy+r)], fill=RED, width=lw)

def draw_sankaku(cx, cy, r=None):
    \"\"\"部分点マーク △ を描く\"\"\"
    if r is None:
        r = int(18 * scale)
    lw = max(int(3 * scale), 2)
    pts = [(cx, cy - r), (cx - r, cy + r), (cx + r, cy + r)]
    draw.polygon(pts, outline=RED, width=lw)

def draw_comment(x, y, text):
    \"\"\"白背景付きコメントを描く\"\"\"
    bbox = draw.textbbox((x, y), text, font=font_sm)
    pad = int(4 * scale)
    draw.rectangle(
        [bbox[0]-pad, bbox[1]-pad, bbox[2]+pad, bbox[3]+pad],
        fill=WHITE_BG
    )
    draw.text((x, y), text, fill=RED, font=font_sm)

def draw_score_box(score_text):
    \"\"\"右上に合計点を大きく表示\"\"\"
    pad = int(12 * scale)
    bbox = draw.textbbox((0, 0), score_text, font=score_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = w - tw - pad * 3
    y = pad
    # 白い角丸背景
    draw.rounded_rectangle(
        [x - pad, y - pad, x + tw + pad, y + th + pad],
        radius=int(8 * scale),
        fill=(255, 255, 255, 230),
        outline=RED,
        width=max(int(2.5 * scale), 2),
    )
    draw.text((x, y), score_text, fill=(200, 0, 0, 250), font=score_font)

# ══════════════════════════════════════════
# ここから各問題の採点結果に基づいて描画する
# 座標はビジョン分析で特定した位置を使う
# ══════════════════════════════════════════

# 例: 問1 (正解) — 画像の上部 20% あたり
# draw_maru(int(w * 0.85), int(h * 0.15))

# 例: 問2 (不正解) — 画像の中部 45% あたり
# draw_batsu(int(w * 0.85), int(h * 0.45))
# draw_comment(int(w * 0.55), int(h * 0.48), "2x+3=7 -> x=2")

# 例: 問3 (部分点) — 画像の下部 70% あたり
# draw_sankaku(int(w * 0.85), int(h * 0.70))

# 合計得点を右上に表示
# draw_score_box("7/10")

# ── 合成して保存 ──
result = Image.alpha_composite(img, overlay)
result.save("/mnt/data/annotated_answer.png")
print("saved: /mnt/data/annotated_answer.png")
```

### 日本式採点マーク（赤ペン） — 全てのマークは赤色で統一

| マーク | 意味 | 関数 |
|--------|------|------|
| ○（マル） | 正解 | `draw_maru(cx, cy)` |
| ×（バツ） | 不正解 | `draw_batsu(cx, cy)` |
| △（サンカク） | 部分正解 | `draw_sankaku(cx, cy)` |

### 座標の決め方（重要）

1. ビジョンで画像を観察し、問題番号・解答が書かれた位置を割合（0.0〜1.0）で推定する
2. 各問題の解答の**右横**（x=幅の80〜90%, y=解答の縦位置）にマークを置く
3. マークは解答文字に重ならないよう、解答領域の右外側に配置する
4. コメントは解答の下や横の余白に配置する
5. 合計得点は画像右上の角に `draw_score_box()` で配置する

### 描画の必須ルール

1. **全ての問題**に対して必ず ○/×/△ のいずれかのマークを付ける
2. 不正解の問題には、間違いの指摘コメントを `draw_comment()` で追加する
3. 合計得点を必ず `draw_score_box("得点/満点")` で右上に表示する
4. **全ての解答画像**（複数ある場合）に対して処理を繰り返す
5. 各画像ごとに `/mnt/data/annotated_N.png` として保存する（N=0,1,2,...）
6. 複数画像がある場合は for ループで files リストを回す
7. 緑色は一切使わない。全て赤色 (220, 30, 30) 系統で統一する

### コメントの書き方

- テキストは英数字・数式記号のみ（日本語フォント未搭載）
  - 良い例: "OK!", "Correct", "x=2", "3x+1=7", "-2pts", "Ans: 96"
  - 悪い例: "正解です"（日本語は文字化けする）
- 計算の正解を示す場合: "Ans: 2x+3" のように書く
- 減点を示す場合: "-3pts" のように書く
- 途中式の誤りを示す場合: 該当行の横に下線 + コメント

### 重要な制約
- 透明オーバーレイ方式（Image.alpha_composite）で元画像を保持すること
- 画像サイズに応じてマークをスケーリング（scale = max(w,h) / 1200）
- 必ず /mnt/data/ に保存
- **添削画像の出力を省略しないこと。これが最も重要な成果物。**

## 出力形式
必ず指定された JSON 構造で結果を返してください。日本語で回答してください。
"""


def create_grading_agent(container_file_ids: list[str] | None = None) -> Agent:
    """
    採点エージェントを作成。

    container_file_ids: Code Interpreter の /mnt/data/ に配置するファイルIDリスト。
    これにより Code Interpreter の Python から画像ファイルを読み書きできる。
    """
    container_config: dict = {"type": "auto"}
    if container_file_ids:
        container_config["file_ids"] = container_file_ids

    return Agent(
        name="数学採点教師",
        model=settings.OPENAI_MODEL,
        instructions=GRADING_INSTRUCTIONS,
        tools=[
            CodeInterpreterTool(
                tool_config={
                    "type": "code_interpreter",
                    "container": container_config,
                }
            ),
        ],
        output_type=GradingResult,
        model_settings=ModelSettings(
            reasoning=Reasoning(effort="high"),
            truncation="auto",
        ),
    )


async def upload_file_to_openai(
    file_bytes: bytes,
    filename: str,
    purpose: str = "user_data",
) -> str:
    """ファイルを OpenAI にアップロードし、file_id を返す"""
    file_obj = await _openai_client.files.create(
        file=(filename, file_bytes),
        purpose=purpose,
    )
    return file_obj.id


# ── 入力コンテンツ構築 ──


def _build_input_content(
    problem_file_ids: list[tuple[str, str, str]],
    answer_file_ids: list[tuple[str, str, str]],
    answer_key_file_ids: list[tuple[str, str, str]] | None = None,
    notes: str | None = None,
) -> list[dict]:
    """
    エージェント入力コンテンツを構築。

    各 file_ids は (file_id, mime_type, filename) のタプルリスト。
    画像は input_image（ビジョン用）、PDF は input_file で渡す。
    Code Interpreter 用のファイルアクセスは container.file_ids で別途設定。
    """
    content: list[dict] = []

    def _add_files(file_ids: list[tuple[str, str, str]]) -> None:
        for file_id, mime_type, _ in file_ids:
            if mime_type.startswith("image/"):
                content.append({
                    "type": "input_image",
                    "file_id": file_id,
                    "detail": "high",
                })
            else:
                content.append({
                    "type": "input_file",
                    "file_id": file_id,
                })

    # 問題文
    filenames = ", ".join(fn for _, _, fn in problem_file_ids)
    content.append({
        "type": "input_text",
        "text": f"【問題】以下が問題文です（ファイル: {filenames}）：",
    })
    _add_files(problem_file_ids)

    # 生徒の解答
    filenames = ", ".join(fn for _, _, fn in answer_file_ids)
    content.append({
        "type": "input_text",
        "text": (
            f"【生徒の解答】以下が生徒の解答です（ファイル: {filenames}）。\n"
            f"これらのファイルは /mnt/data/ にも配置済みです。"
            f"Code Interpreter で開いて赤ペン添削を行ってください。"
        ),
    })
    _add_files(answer_file_ids)

    # 模範解答（任意）
    if answer_key_file_ids:
        filenames = ", ".join(fn for _, _, fn in answer_key_file_ids)
        content.append({
            "type": "input_text",
            "text": f"【模範解答】以下が模範解答です（ファイル: {filenames}）。これを参考に採点してください：",
        })
        _add_files(answer_key_file_ids)

    # 追加指示
    instructions = "上記の問題と解答を確認し、詳細な採点を行ってください。"
    if notes:
        instructions += f"\n\n追加の指示: {notes}"
    instructions += (
        "\n\n## 必ず実行すること（最重要）\n"
        "1. まず画像をビジョンで観察し、各問題の解答位置を特定してください。\n"
        "2. Code Interpreter で /mnt/data/ 内の全ての解答画像を開き、"
        "上記テンプレートの draw_maru / draw_batsu / draw_sankaku / draw_comment / draw_score_box 関数を使って"
        "日本式の赤ペン添削を描き込んでください。\n"
        "3. 各問題に必ず ○/×/△ マークを付け、合計得点を右上に表示してください。\n"
        "4. 添削済み画像を /mnt/data/ に保存してください。\n"
        "5. 添削画像の出力を絶対に省略しないでください。"
    )
    content.append({"type": "input_text", "text": instructions})

    return content


async def _prepare_file_ids(
    files: list[tuple[bytes, str, str]],
) -> list[tuple[str, str, str]]:
    """ファイル群を OpenAI にアップロードし (file_id, mime_type, filename) のリストを返す"""
    results = []
    for file_bytes, filename, mime_type in files:
        file_id = await upload_file_to_openai(file_bytes, filename)
        results.append((file_id, mime_type, filename))
    return results


def _collect_all_file_ids(
    *file_id_lists: list[tuple[str, str, str]] | None,
) -> list[str]:
    """全ファイルリストから file_id だけを収集（container.file_ids 用）"""
    ids: list[str] = []
    for flist in file_id_lists:
        if flist:
            ids.extend(fid for fid, _, _ in flist)
    return ids


# ── 注釈画像の抽出（複数の API 形式に対応） ──


async def _extract_annotated_images(new_items: list[Any]) -> list[bytes]:
    """
    Code Interpreter 出力から注釈付き画像を抽出。

    3つの方法を順に試行:
      1. code_interpreter_call.outputs[].url (Responses API の画像出力)
      2. code_interpreter_call.results[].files (レガシー形式)
      3. メッセージの container_file_citation アノテーション
    """
    annotated_images: list[bytes] = []
    seen: set[str] = set()  # 重複防止

    for item in new_items:
        if not hasattr(item, "raw_item"):
            continue
        raw = item.raw_item
        if not hasattr(raw, "type"):
            continue

        if raw.type == "code_interpreter_call":
            # 方法1: outputs の image URL (Responses API)
            for output in getattr(raw, "outputs", None) or []:
                if getattr(output, "type", None) == "image":
                    url = getattr(output, "url", None)
                    if url and url not in seen:
                        seen.add(url)
                        try:
                            async with httpx.AsyncClient(timeout=30) as http:
                                resp = await http.get(url)
                                if resp.status_code == 200:
                                    annotated_images.append(resp.content)
                        except Exception:
                            traceback.print_exc()

            # 方法2: results の files (レガシー/Assistants API 形式)
            for ci_result in getattr(raw, "results", None) or []:
                for f in getattr(ci_result, "files", None) or []:
                    fid = getattr(f, "file_id", None)
                    if fid and fid not in seen:
                        seen.add(fid)
                        try:
                            file_content = await _openai_client.files.content(fid)
                            annotated_images.append(file_content.content)
                        except Exception:
                            traceback.print_exc()

    # 方法3: メッセージアノテーションから container_file_citation を探す
    if not annotated_images:
        for item in new_items:
            if not hasattr(item, "raw_item"):
                continue
            raw = item.raw_item
            for content_block in getattr(raw, "content", None) or []:
                for ann in getattr(content_block, "annotations", None) or []:
                    if getattr(ann, "type", None) == "container_file_citation":
                        fname = getattr(ann, "filename", "")
                        if not fname.lower().endswith(
                            (".png", ".jpg", ".jpeg", ".webp")
                        ):
                            continue
                        cfile_id = getattr(ann, "file_id", None)
                        container_id = getattr(ann, "container_id", None)
                        if cfile_id and container_id and cfile_id not in seen:
                            seen.add(cfile_id)
                            try:
                                resp = (
                                    await _openai_client.containers.files.content.retrieve(
                                        file_id=cfile_id,
                                        container_id=container_id,
                                    )
                                )
                                annotated_images.append(resp.content)
                            except Exception:
                                traceback.print_exc()

    return annotated_images


# ── 通常実行（非ストリーミング） ──


async def grade_submission(
    problem_files: list[tuple[bytes, str, str]],
    answer_files: list[tuple[bytes, str, str]],
    answer_key_files: list[tuple[bytes, str, str]] | None = None,
    notes: str | None = None,
) -> tuple[GradingResult, list[bytes]]:
    """採点を実行する（同期的に完了を待つ）"""

    problem_file_ids = await _prepare_file_ids(problem_files)
    answer_file_ids = await _prepare_file_ids(answer_files)
    answer_key_file_ids = (
        await _prepare_file_ids(answer_key_files) if answer_key_files else None
    )

    all_fids = _collect_all_file_ids(
        problem_file_ids, answer_file_ids, answer_key_file_ids
    )
    input_content = _build_input_content(
        problem_file_ids, answer_file_ids, answer_key_file_ids, notes
    )

    agent = create_grading_agent(container_file_ids=all_fids)
    result = await Runner.run(
        agent,
        input=[{"role": "user", "content": input_content}],
    )

    annotated_images = await _extract_annotated_images(result.new_items)
    grading_result: GradingResult = result.final_output
    return grading_result, annotated_images


# ── ストリーミング実行 ──


async def grade_submission_stream(
    problem_files: list[tuple[bytes, str, str]],
    answer_files: list[tuple[bytes, str, str]],
    answer_key_files: list[tuple[bytes, str, str]] | None = None,
    notes: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    採点をストリーミング実行する。
    SSE イベントとして dict を yield する。

    イベント種類:
      - {"event": "status", "data": "..."}         ステータス更新
      - {"event": "reasoning", "data": "..."}       推論過程テキスト
      - {"event": "text_delta", "data": "..."}      テキスト差分
      - {"event": "tool_called", "data": "..."}     ツール呼び出し
      - {"event": "tool_output", "data": "..."}     ツール出力
      - {"event": "_images", "data": [...]}         注釈画像バイナリ（内部用）
      - {"event": "result", "data": {...}}           最終採点結果
      - {"event": "error", "data": "..."}           エラー
    """

    yield {"event": "status", "data": "ファイルをアップロード中..."}

    try:
        problem_file_ids = await _prepare_file_ids(problem_files)
        answer_file_ids = await _prepare_file_ids(answer_files)
        answer_key_file_ids = (
            await _prepare_file_ids(answer_key_files) if answer_key_files else None
        )

        # 全 file_id を収集 → Code Interpreter の container.file_ids に渡す
        all_fids = _collect_all_file_ids(
            problem_file_ids, answer_file_ids, answer_key_file_ids
        )

        yield {"event": "status", "data": "AIが採点を開始しました"}

        input_content = _build_input_content(
            problem_file_ids, answer_file_ids, answer_key_file_ids, notes
        )

        agent = create_grading_agent(container_file_ids=all_fids)
        streamed_result = Runner.run_streamed(
            agent,
            input=[{"role": "user", "content": input_content}],
        )

        async for event in streamed_result.stream_events():
            # 生の LLM イベント（テキスト差分・推論テキスト）
            if event.type == "raw_response_event":
                data = event.data
                if isinstance(data, ResponseTextDeltaEvent):
                    yield {"event": "text_delta", "data": data.delta}
                elif (
                    hasattr(data, "type")
                    and data.type == "response.reasoning_summary_text.delta"
                ):
                    yield {
                        "event": "reasoning",
                        "data": getattr(data, "delta", ""),
                    }

            # RunItem イベント
            elif event.type == "run_item_stream_event":
                if event.item.type == "tool_call_item":
                    yield {
                        "event": "tool_called",
                        "data": "解答を分析中...",
                    }
                elif event.item.type == "tool_call_output_item":
                    yield {
                        "event": "tool_output",
                        "data": "分析完了",
                    }
                elif event.item.type == "reasoning_item":
                    yield {
                        "event": "status",
                        "data": "推論中...",
                    }

        # ストリーム完了 → 最終結果を取得
        # RunResultStreaming は .final_output / .new_items に直接アクセス
        yield {"event": "status", "data": "添削画像を取得中..."}
        annotated_images = await _extract_annotated_images(streamed_result.new_items)

        grading_result: GradingResult = streamed_result.final_output
        result_dict = grading_result.model_dump()

        # 注釈画像を内部イベントとして先に yield（main.py で Supabase にアップロード）
        if annotated_images:
            yield {
                "event": "_images",
                "data": annotated_images,
            }

        yield {
            "event": "result",
            "data": {
                "grading": result_dict,
                "annotated_image_count": len(annotated_images),
            },
        }

    except Exception as e:
        traceback.print_exc()
        yield {"event": "error", "data": str(e)}
