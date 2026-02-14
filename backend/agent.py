"""
数学採点エージェント

OpenAI Agents SDK を使用した単一エージェント設計。
Code Interpreter で数式検証・画像注釈を行う。
"""

from __future__ import annotations

import base64
import os
from pathlib import Path

from agents import Agent, CodeInterpreterTool, ModelSettings, Runner
from openai import AsyncOpenAI

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
        tools=[CodeInterpreterTool()],
        output_type=GradingResult,
        model_settings=ModelSettings(
            temperature=0.1,
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
    instructions += "\n\n生徒の解答画像がある場合は、Code Interpreter を使って赤ペン注釈付きの画像も生成してください。"

    content.append({"type": "input_text", "text": instructions})

    return content


async def grade_submission(
    problem_files: list[tuple[bytes, str, str]],
    answer_files: list[tuple[bytes, str, str]],
    answer_key_files: list[tuple[bytes, str, str]] | None = None,
    notes: str | None = None,
) -> tuple[GradingResult, list[bytes]]:
    """
    採点を実行する

    Args:
        problem_files: [(file_bytes, filename, mime_type), ...]
        answer_files: [(file_bytes, filename, mime_type), ...]
        answer_key_files: [(file_bytes, filename, mime_type), ...] or None
        notes: 追加の指示

    Returns:
        (GradingResult, list[annotated_image_bytes])
    """
    # ファイルを OpenAI にアップロード
    problem_file_ids: list[tuple[str, str]] = []
    for file_bytes, filename, mime_type in problem_files:
        file_id = await upload_file_to_openai(file_bytes, filename)
        problem_file_ids.append((file_id, mime_type))

    answer_file_ids: list[tuple[str, str]] = []
    for file_bytes, filename, mime_type in answer_files:
        file_id = await upload_file_to_openai(file_bytes, filename)
        answer_file_ids.append((file_id, mime_type))

    answer_key_file_ids: list[tuple[str, str]] | None = None
    if answer_key_files:
        answer_key_file_ids = []
        for file_bytes, filename, mime_type in answer_key_files:
            file_id = await upload_file_to_openai(file_bytes, filename)
            answer_key_file_ids.append((file_id, mime_type))

    # 入力コンテンツを構築
    input_content = _build_input_content(
        problem_file_ids, answer_file_ids, answer_key_file_ids, notes
    )

    # エージェントを作成して実行
    agent = create_grading_agent()
    result = await Runner.run(
        agent,
        input=[{"role": "user", "content": input_content}],
    )

    # 注釈付き画像を抽出
    annotated_images: list[bytes] = []
    for item in result.new_items:
        # Code Interpreter の出力からファイルを取得
        if hasattr(item, "raw_item"):
            raw = item.raw_item
            if hasattr(raw, "type") and raw.type == "code_interpreter_call":
                if hasattr(raw, "results"):
                    for ci_result in raw.results:
                        if hasattr(ci_result, "files"):
                            for f in ci_result.files:
                                file_content = await _openai_client.files.content(
                                    f.file_id
                                )
                                annotated_images.append(file_content.content)

    grading_result: GradingResult = result.final_output
    return grading_result, annotated_images
