"""
数学採点エージェント

OpenAI Agents SDK v0.9.0 を使用した単一エージェント設計。
Code Interpreter で数式検証・画像注釈を行う。
ストリーミング対応。
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from agents import Agent, CodeInterpreterTool, ModelSettings, Runner
from openai import AsyncOpenAI
from openai.types.responses import ResponseTextDeltaEvent
from openai.types.shared import Reasoning

from config import settings
from models import GradingResult

# OpenAI クライアント
_openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# --- 採点エージェントの指示 ---

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

## 画像注釈について
Code Interpreter を使用して、生徒の解答画像に赤ペンで注釈を入れてください：
- ✓ マーク（正解部分）を緑色で
- ✗ マーク（間違い部分）を赤色で
- 波線（注意が必要な箇所）を黄色で
- コメントを赤色テキストで
- 得点を右上に大きく表示

Code Interpreter でPythonの PIL/Pillow を使って画像に書き込みを行ってください。
フォントが利用できない場合はデフォルトフォントを使用してください。

## 配点について
- 問題に配点が明示されている場合はそれに従う
- 配点が不明な場合は、問題の難易度と分量から適切に推定する（デフォルト各問10点）
- 回答用紙に模範解答が提供されている場合はそれを参照する

## 出力形式
必ず指定された JSON 構造で結果を返してください。日本語で回答してください。
"""


def create_grading_agent() -> Agent:
    """採点エージェントを作成"""
    return Agent(
        name="数学採点教師",
        model=settings.OPENAI_MODEL,
        instructions=GRADING_INSTRUCTIONS,
        tools=[
            CodeInterpreterTool(
                tool_config={
                    "type": "code_interpreter",
                    "container": {"type": "auto"},
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


def _build_input_content(
    problem_file_ids: list[tuple[str, str]],
    answer_file_ids: list[tuple[str, str]],
    answer_key_file_ids: list[tuple[str, str]] | None = None,
    notes: str | None = None,
) -> list[dict]:
    """エージェント入力コンテンツを構築"""
    content: list[dict] = []

    # 問題文
    content.append({
        "type": "input_text",
        "text": "【問題】以下が問題文です：",
    })
    for file_id, mime_type in problem_file_ids:
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

    # 生徒の解答
    content.append({
        "type": "input_text",
        "text": "【生徒の解答】以下が生徒の解答です：",
    })
    for file_id, mime_type in answer_file_ids:
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

    # 模範解答（任意）
    if answer_key_file_ids:
        content.append({
            "type": "input_text",
            "text": "【模範解答】以下が模範解答です。これを参考に採点してください：",
        })
        for file_id, mime_type in answer_key_file_ids:
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

    # 追加指示
    instructions = "上記の問題と解答を確認し、詳細な採点を行ってください。"
    if notes:
        instructions += f"\n\n追加の指示: {notes}"
    instructions += (
        "\n\n生徒の解答画像がある場合は、Code Interpreter を使って"
        "赤ペン注釈付きの画像も生成してください。"
    )

    content.append({"type": "input_text", "text": instructions})

    return content


async def _prepare_file_ids(
    files: list[tuple[bytes, str, str]],
) -> list[tuple[str, str]]:
    """ファイル群を OpenAI にアップロードし (file_id, mime_type) のリストを返す"""
    results = []
    for file_bytes, filename, mime_type in files:
        file_id = await upload_file_to_openai(file_bytes, filename)
        results.append((file_id, mime_type))
    return results


async def _extract_annotated_images(new_items: list[Any]) -> list[bytes]:
    """Code Interpreter 出力から注釈付き画像を抽出"""
    annotated_images: list[bytes] = []
    for item in new_items:
        if not hasattr(item, "raw_item"):
            continue
        raw = item.raw_item
        if not hasattr(raw, "type"):
            continue
        if raw.type == "code_interpreter_call":
            for ci_result in getattr(raw, "results", []):
                for f in getattr(ci_result, "files", []):
                    file_content = await _openai_client.files.content(f.file_id)
                    annotated_images.append(file_content.content)
    return annotated_images


# --- 通常実行（非ストリーミング） ---

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

    input_content = _build_input_content(
        problem_file_ids, answer_file_ids, answer_key_file_ids, notes
    )

    agent = create_grading_agent()
    result = await Runner.run(
        agent,
        input=[{"role": "user", "content": input_content}],
    )

    annotated_images = await _extract_annotated_images(result.new_items)
    grading_result: GradingResult = result.final_output
    return grading_result, annotated_images


# --- ストリーミング実行 ---

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

        yield {"event": "status", "data": "AIが採点を開始しました"}

        input_content = _build_input_content(
            problem_file_ids, answer_file_ids, answer_key_file_ids, notes
        )

        agent = create_grading_agent()
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
                # 推論サマリーイベント（gpt-5.2 の reasoning 出力）
                elif hasattr(data, "type") and data.type == "response.reasoning_summary_text.delta":
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
        yield {"event": "error", "data": str(e)}


async def get_annotated_images_from_result(
    problem_files: list[tuple[bytes, str, str]],
    answer_files: list[tuple[bytes, str, str]],
    answer_key_files: list[tuple[bytes, str, str]] | None = None,
    notes: str | None = None,
) -> tuple[GradingResult, list[bytes]]:
    """ストリーミング後に注釈画像も含めた完全な結果を取得する（フォールバック用）"""
    return await grade_submission(problem_files, answer_files, answer_key_files, notes)
