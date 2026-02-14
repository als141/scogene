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

### 必須の実装パターン

```python
from PIL import Image, ImageDraw, ImageFont
import math, os

# 1. /mnt/data/ から生徒の解答画像を開く
files = [f for f in os.listdir("/mnt/data/") if f.lower().endswith((".png",".jpg",".jpeg",".webp"))]
img = Image.open(f"/mnt/data/{files[0]}").convert("RGBA")
w, h = img.size
scale = w / 1200  # 画像サイズに応じたスケーリング

# 2. 透明オーバーレイを作成（元画像を損なわない）
overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)

# 3. フォント（日本語フォント未搭載のためデフォルト使用）
font = ImageFont.load_default(size=int(20 * scale))
score_font = ImageFont.load_default(size=int(48 * scale))

# 4. 各問題の解答箇所に注釈を描画（以下は例）
# ... ここで採点結果に基づいて描画 ...

# 5. 合成して保存
result = Image.alpha_composite(img, overlay)
result.save("/mnt/data/annotated_answer.png")
```

### 日本式採点マーク（赤ペン）

日本の学校では、すべてのマークを**赤色**で統一します。
- **○（マル）**: 正解を示す。解答の横に赤い丸を描く。
- **×（バツ）**: 不正解を示す。解答の横に赤いバツを描く。
- **△（サンカク）**: 部分正解・惜しい場合に使用。

| 要素 | 色 (RGBA) | 描画方法 |
|------|-----------|----------|
| 正解マル ○ | (220, 30, 30, 220) | draw.ellipse() で解答の横に赤い丸。線幅は int(3*scale) |
| 不正解バツ × | (220, 30, 30, 220) | draw.line() で2本線の赤いバツ。線幅は int(3*scale) |
| 部分点サンカク △ | (220, 30, 30, 220) | draw.polygon() で赤い三角形。線幅は int(3*scale) |
| 誤答箇所の下線 | (220, 30, 30, 180) | draw.line() で赤い下線 |
| コメント文字 | (220, 30, 30, 220) | 白背景 (255,255,255,200) 付きテキスト |
| 得点表示 | (220, 0, 0, 240) | 右上に大きく「8/10」のように赤で表示、白枠付き |

### ○（マル）の描き方（正解）
```python
# 解答の横に赤い丸を描く
cx, cy = answer_x + offset, answer_y  # 解答の右横の座標
r = int(20 * scale)
draw.ellipse(
    [cx - r, cy - r, cx + r, cy + r],
    outline=(220, 30, 30, 220),
    width=int(3 * scale),
)
```

### ×（バツ）の描き方（不正解）
```python
# 解答の横に赤いバツを描く
cx, cy = answer_x + offset, answer_y
r = int(16 * scale)
draw.line([(cx - r, cy - r), (cx + r, cy + r)], fill=(220, 30, 30, 220), width=int(3 * scale))
draw.line([(cx + r, cy - r), (cx - r, cy + r)], fill=(220, 30, 30, 220), width=int(3 * scale))
```

### 描画の具体的な手順
1. 画像のビジョン分析で各問題の解答位置を特定する
2. 正解の問題 → 解答の横に赤い○（マル）を描く
3. 不正解の問題 → 解答の横に赤い×（バツ）を描く、間違った箇所に赤い下線
4. 部分点の問題 → 解答の横に赤い△（サンカク）を描く
5. テキストコメント → 白背景付きで誤りの指摘や正解を赤で記述（英数字・記号で）
6. 合計得点 → 画像右上に赤色で大きく「8/10」のように表示
7. 全解答画像に対して処理を繰り返す
8. **重要**: すべてのマーク・コメントは赤色系統 (220, 30, 30) で統一する。緑色は使わない。

### 重要な制約
- テキストは英数字・数式記号のみ使用（日本語フォント未搭載のため）
  例: "OK!", "x", "Ans: 96", "3x+2=8 -> x=2", "-2pts"
- 透明オーバーレイ方式（Image.alpha_composite）で元画像を保持
- 画像サイズに応じてマークをスケーリング（scale = w / 1200）
- 必ず /mnt/data/ に保存

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
            reasoning=Reasoning(effort="medium"),
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
        "\n\n重要: 必ず Code Interpreter で生徒の解答画像（/mnt/data/ 内）を開き、"
        "赤ペン添削（✓/✗マーク、得点表示、エラー囲み、コメント）を描き込んだ画像を生成してください。"
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
                    raw = event.item.raw_item
                    tool_type = getattr(raw, "type", "unknown")
                    yield {
                        "event": "tool_called",
                        "data": f"ツール実行中: {tool_type}",
                    }
                elif event.item.type == "tool_call_output_item":
                    yield {
                        "event": "tool_output",
                        "data": "ツール実行完了",
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
