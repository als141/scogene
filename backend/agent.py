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
あなたは日本の高校で20年以上の経験を持つ数学教師です。
生徒の手書き数学解答を正確に採点し、赤ペン添削画像を作成します。

# 採点手順（効率的に実行すること）

## ステップ1: 画像の観察（ビジョン）

入力画像をよく見て以下を把握してください：
- 各問題の内容と配点
- 生徒の途中式と最終解答を一文字ずつ正確に読み取る
- 各解答の画像内での位置（上から何%あたりか）

### 手書き文字の注意点
- 数字: 1⇔7, 6⇔0, 2⇔z, 5⇔S
- 記号: ×⇔x, -⇔=, ÷⇔+
- 分数の区切り線、根号の範囲、指数位置に注意
- 迷ったら文脈から判断する

## ステップ2: 検算 + 赤ペン添削（Code Interpreter）

**検算と添削を1回のコード実行にまとめてください。分割しないこと。**

```python
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
from IPython.display import display
import sympy as sp
import os

# ═══ Part A: 検算 ═══
x = sp.Symbol('x')
# 問1: (ここで正解を計算)
# 問2: (ここで正解を計算)
print("=== 検算結果 ===")
# 各問の正解と生徒の答えの比較を表示

# ═══ Part B: 添削画像の作成 ═══
RED = (220, 30, 30, 230)
RED_LIGHT = (220, 30, 30, 160)
WHITE_BG = (255, 255, 255, 210)

# /mnt/data/ には解答ファイル（画像またはPDF）が配置されている
all_files = sorted([f for f in os.listdir("/mnt/data/")
    if not f.startswith("annotated_")])

# PDFページを画像に変換し、画像ファイルと統合
answer_images = []  # (PIL.Image, 元ファイル名) のリスト
for f in all_files:
    path = f"/mnt/data/{f}"
    if f.lower().endswith(".pdf"):
        import fitz  # PyMuPDF
        doc = fitz.open(path)
        for page_num in range(len(doc)):
            pix = doc[page_num].get_pixmap(dpi=200)
            page_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            answer_images.append((page_img, f"{f}_p{page_num+1}"))
        doc.close()
    elif f.lower().endswith((".png",".jpg",".jpeg",".webp",".gif")):
        answer_images.append((Image.open(path), f))

for idx, (raw_img, fname) in enumerate(answer_images):
    img = raw_img.convert("RGBA")
    w, h = img.size
    scale = max(w, h) / 1200

    # 軽いコントラスト強調（手書き文字を見やすく）
    base = img.convert("RGB")
    base = ImageEnhance.Contrast(base).enhance(1.3)
    base = ImageEnhance.Sharpness(base).enhance(1.5)
    img = base.convert("RGBA")

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    try:
        font_sm = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            int(16 * scale))
        score_font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            int(56 * scale))
    except:
        font_sm = ImageFont.load_default(size=int(16 * scale))
        score_font = ImageFont.load_default(size=int(56 * scale))

    def draw_maru(cx, cy, r=None):
        r = r or int(22 * scale)
        lw = max(int(3.5 * scale), 2)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=RED, width=lw)

    def draw_batsu(cx, cy, r=None):
        r = r or int(18 * scale)
        lw = max(int(3.5 * scale), 2)
        draw.line([(cx-r,cy-r),(cx+r,cy+r)], fill=RED, width=lw)
        draw.line([(cx+r,cy-r),(cx-r,cy+r)], fill=RED, width=lw)

    def draw_sankaku(cx, cy, r=None):
        r = r or int(18 * scale)
        lw = max(int(3 * scale), 2)
        pts = [(cx, cy-r), (cx-r, cy+r), (cx+r, cy+r)]
        draw.polygon(pts, outline=RED, width=lw)

    def draw_comment(x, y, text):
        bbox = draw.textbbox((x, y), text, font=font_sm)
        pad = int(4 * scale)
        draw.rectangle(
            [bbox[0]-pad, bbox[1]-pad, bbox[2]+pad, bbox[3]+pad],
            fill=WHITE_BG)
        draw.text((x, y), text, fill=RED, font=font_sm)

    def draw_score_box(score_text):
        pad = int(12 * scale)
        bbox = draw.textbbox((0, 0), score_text, font=score_font)
        tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
        x = w - tw - pad * 3
        y = pad
        draw.rounded_rectangle(
            [x-pad, y-pad, x+tw+pad, y+th+pad],
            radius=int(8 * scale),
            fill=(255, 255, 255, 230),
            outline=RED,
            width=max(int(2.5 * scale), 2))
        draw.text((x, y), score_text, fill=(200, 0, 0, 250),
                  font=score_font)

    # ── 採点結果に基づいて描画 ──
    # 座標: (int(w * 割合), int(h * 割合))
    # draw_maru(int(w*0.X), int(h*0.Y))   正解
    # draw_batsu(int(w*0.X), int(h*0.Y))  不正解
    # draw_sankaku(int(w*0.X), int(h*0.Y)) 部分正解
    # draw_comment(int(w*0.X), int(h*0.Y), "...")
    # draw_score_box("得点/満点")

    result = Image.alpha_composite(img, overlay)
    result.save(f"/mnt/data/annotated_{idx}.png")

    # ★★★ 必ず display() で出力（省略厳禁）★★★
    display(result)
    print(f"Saved: annotated_{idx}.png")
```

## 日本式赤ペンマーク — 全て赤色

| マーク | 意味 | 関数 |
|--------|------|------|
| ○（マル） | 正解 | `draw_maru(cx, cy)` |
| ×（バツ） | 不正解 | `draw_batsu(cx, cy)` |
| △（サンカク） | 部分正解 | `draw_sankaku(cx, cy)` |

### 描画ルール
1. **全問題**に ○/×/△ を必ず付ける
2. 不正解には `draw_comment()` で英数字コメントを追加
3. `draw_score_box("得点/満点")` を右上に必ず表示
4. **display() で画像を出力する**（絶対に省略しない）
5. 緑色は一切使わない

### コメント例（英数字のみ）
- 計算ミス: "calc error: 3*4=12, not 14"
- 符号ミス: "sign error: -(-3)=+3"
- 正解提示: "Ans: x=2"
- 減点: "-3pts: missing process"

## 採点基準

### 部分点
- 方針正しいが計算ミス → 配点の 50-70%
- 途中まで正しい → 正しい部分に応じた部分点
- 答えのみ途中式なし → 正解でも配点の 80%

### 配点
- 明示されていればそれに従う
- 不明なら問題の難易度から推定（デフォルト各問10点）

## 出力形式

全ステップ完了後、指定された JSON 構造で結果を返してください。日本語で回答。

### フィードバック方針
- 間違いの原因を具体的に指摘
- どの計算ステップで誤ったか明示
- 改善の具体的アドバイスを提供
- 良い点は必ず褒める
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
            f"【生徒の解答】（ファイル: {filenames}）\n"
            f"/mnt/data/ にはこれらの解答ファイル（画像またはPDF）が配置されています。"
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
        "\n\n## 必ず実行すること\n"
        "1. 画像をビジョンで観察し、各問題の解答を正確に読み取る\n"
        "2. Code Interpreter で検算と赤ペン添削を実行する（回数は最小限に）\n"
        "3. display() で添削画像を必ず出力する（省略厳禁）\n"
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


# ── 注釈画像の抽出（複数の API 形式に対応） ──


async def _extract_annotated_images(new_items: list[Any]) -> list[bytes]:
    """
    Code Interpreter 出力から注釈付き画像を抽出。

    4つの方法を順に試行:
      1. code_interpreter_call.outputs[].url (Responses API の画像出力 — display() 使用時)
      2. code_interpreter_call.results[].files (レガシー形式)
      3. メッセージの container_file_citation アノテーション
      4. コンテナ内の annotated_* ファイルを直接取得（フォールバック）
    """
    annotated_images: list[bytes] = []
    seen: set[str] = set()  # 重複防止
    container_id: str | None = None  # フォールバック用

    for item in new_items:
        if not hasattr(item, "raw_item"):
            continue
        raw = item.raw_item
        if not hasattr(raw, "type"):
            continue

        if raw.type == "code_interpreter_call":
            # コンテナIDを記録（フォールバック用）
            cid = getattr(raw, "container_id", None)
            if cid:
                container_id = cid

            # 方法1: outputs の image URL (Responses API — display() 使用時)
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
                                    print(f"[画像抽出] 方法1: URL から取得 ({url[:60]}...)")
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
                            print(f"[画像抽出] 方法2: file_id から取得 ({fid})")
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
                        c_id = getattr(ann, "container_id", None)
                        if cfile_id and c_id and cfile_id not in seen:
                            seen.add(cfile_id)
                            try:
                                resp = (
                                    await _openai_client.containers.files.content.retrieve(
                                        file_id=cfile_id,
                                        container_id=c_id,
                                    )
                                )
                                annotated_images.append(resp.content)
                                print(f"[画像抽出] 方法3: citation から取得 ({fname})")
                            except Exception:
                                traceback.print_exc()

    # 方法4 (フォールバック): コンテナ内の annotated_* ファイルを直接取得
    if not annotated_images and container_id:
        print(f"[画像抽出] 方法4: コンテナ {container_id} からファイル一覧を取得")
        try:
            container_files = await _openai_client.containers.files.list(
                container_id=container_id
            )
            for cf in container_files.data:
                fname = getattr(cf, "filename", "") or ""
                if (
                    "annotated" in fname.lower()
                    and fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
                ):
                    cf_id = cf.id
                    if cf_id not in seen:
                        seen.add(cf_id)
                        try:
                            resp = (
                                await _openai_client.containers.files.content.retrieve(
                                    file_id=cf_id,
                                    container_id=container_id,
                                )
                            )
                            annotated_images.append(resp.content)
                            print(f"[画像抽出] 方法4: コンテナから取得 ({fname})")
                        except Exception:
                            traceback.print_exc()
        except Exception:
            traceback.print_exc()

    print(f"[画像抽出] 合計 {len(annotated_images)} 枚の添削画像を取得")
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

    # 解答ファイルを Code Interpreter コンテナに配置（添削対象）
    container_fids = [fid for fid, _, _ in answer_file_ids]

    input_content = _build_input_content(
        problem_file_ids, answer_file_ids, answer_key_file_ids, notes
    )

    agent = create_grading_agent(container_file_ids=container_fids)
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

        # 解答ファイルを Code Interpreter コンテナに配置（添削対象）
        container_fids = [fid for fid, _, _ in answer_file_ids]

        yield {"event": "status", "data": "AIが採点を開始しました"}

        input_content = _build_input_content(
            problem_file_ids, answer_file_ids, answer_key_file_ids, notes
        )

        agent = create_grading_agent(container_file_ids=container_fids)
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
