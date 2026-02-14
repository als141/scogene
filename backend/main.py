"""
ScoGene - 数学採点アプリ バックエンド API

FastAPI + OpenAI Agents SDK + Supabase
"""

from __future__ import annotations

import asyncio
import json
import traceback

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from config import settings
from models import (
    GradeResultResponse,
    GradingResult,
    SubmissionListItem,
    SubmissionResponse,
)
from agent import grade_submission, grade_submission_stream
from supabase_client import (
    get_supabase_client,
    create_submission,
    update_submission_status,
    get_submission,
    list_submissions,
    upload_annotated_image,
)

app = FastAPI(
    title="ScoGene API",
    description="AI数学採点アプリ",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
}


def _validate_files(files: list[UploadFile], label: str) -> None:
    """アップロードされたファイルのバリデーション"""
    if not files:
        raise HTTPException(status_code=400, detail=f"{label}ファイルが必要です")
    for f in files:
        if f.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"{label}: 非対応のファイル形式です ({f.content_type})。"
                f"対応形式: JPEG, PNG, WebP, GIF, PDF",
            )


async def _read_upload_files(
    files: list[UploadFile],
) -> list[tuple[bytes, str, str]]:
    """UploadFile リストをバイトデータに変換"""
    result = []
    for f in files:
        content = await f.read()
        result.append(
            (content, f.filename or "file.jpg", f.content_type or "image/jpeg")
        )
    return result


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "model": settings.OPENAI_MODEL}


@app.post("/api/grade", response_model=SubmissionResponse)
async def submit_for_grading(
    problem_files: list[UploadFile] = File(..., description="問題ファイル"),
    answer_files: list[UploadFile] = File(..., description="解答ファイル"),
    answer_key_files: list[UploadFile] | None = File(
        default=None, description="模範解答ファイル（任意）"
    ),
    notes: str | None = Form(default=None, description="追加の指示"),
):
    """採点リクエストを送信（同期）"""
    _validate_files(problem_files, "問題")
    _validate_files(answer_files, "解答")
    if answer_key_files:
        _validate_files(answer_key_files, "模範解答")

    supabase = get_supabase_client()
    submission = await create_submission(supabase)
    submission_id = submission["id"]

    try:
        await update_submission_status(supabase, submission_id, "grading")

        problem_data = await _read_upload_files(problem_files)
        answer_data = await _read_upload_files(answer_files)
        answer_key_data = (
            await _read_upload_files(answer_key_files) if answer_key_files else None
        )

        grading_result, annotated_images = await grade_submission(
            problem_files=problem_data,
            answer_files=answer_data,
            answer_key_files=answer_key_data,
            notes=notes,
        )

        annotated_urls = []
        for i, img_bytes in enumerate(annotated_images):
            url = await upload_annotated_image(supabase, submission_id, img_bytes, i)
            annotated_urls.append(url)

        result_data = grading_result.model_dump()
        result_data["annotated_image_urls"] = annotated_urls
        await update_submission_status(
            supabase, submission_id, "completed", result_data
        )

        return SubmissionResponse(
            id=submission_id,
            status="completed",
            message="採点が完了しました",
        )

    except Exception as e:
        traceback.print_exc()
        await update_submission_status(
            supabase, submission_id, "error", {"error": str(e)}
        )
        return SubmissionResponse(
            id=submission_id,
            status="error",
            message=f"採点中にエラーが発生しました: {str(e)}",
        )


@app.post("/api/grade/stream")
async def submit_for_grading_stream(
    problem_files: list[UploadFile] = File(..., description="問題ファイル"),
    answer_files: list[UploadFile] = File(..., description="解答ファイル"),
    answer_key_files: list[UploadFile] | None = File(
        default=None, description="模範解答ファイル（任意）"
    ),
    notes: str | None = Form(default=None, description="追加の指示"),
):
    """採点リクエストを送信（SSE ストリーミング）"""
    _validate_files(problem_files, "問題")
    _validate_files(answer_files, "解答")
    if answer_key_files:
        _validate_files(answer_key_files, "模範解答")

    # ファイルを先に読み込み（SSE generator 内ではリクエストが閉じるため）
    problem_data = await _read_upload_files(problem_files)
    answer_data = await _read_upload_files(answer_files)
    answer_key_data = (
        await _read_upload_files(answer_key_files) if answer_key_files else None
    )

    supabase = get_supabase_client()
    submission = await create_submission(supabase)
    submission_id = submission["id"]
    await update_submission_status(supabase, submission_id, "grading")

    async def event_generator():
        # 開始イベント
        yield {
            "event": "submission",
            "data": json.dumps({"id": submission_id}, ensure_ascii=False),
        }

        try:
            async for ev in grade_submission_stream(
                problem_files=problem_data,
                answer_files=answer_data,
                answer_key_files=answer_key_data,
                notes=notes,
            ):
                event_type = ev["event"]
                data = ev["data"]

                if event_type == "result":
                    # 最終結果 → DB に保存
                    grading_data = data["grading"]
                    grading_data["annotated_image_urls"] = []
                    await update_submission_status(
                        supabase, submission_id, "completed", grading_data
                    )
                    yield {
                        "event": event_type,
                        "data": json.dumps(data, ensure_ascii=False),
                    }
                elif event_type == "error":
                    await update_submission_status(
                        supabase, submission_id, "error", {"error": data}
                    )
                    yield {
                        "event": event_type,
                        "data": json.dumps({"error": data}, ensure_ascii=False),
                    }
                else:
                    yield {
                        "event": event_type,
                        "data": data if isinstance(data, str) else json.dumps(data, ensure_ascii=False),
                    }

            yield {"event": "done", "data": ""}

        except Exception as e:
            traceback.print_exc()
            await update_submission_status(
                supabase, submission_id, "error", {"error": str(e)}
            )
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}, ensure_ascii=False),
            }

    return EventSourceResponse(event_generator())


@app.get("/api/grade/{submission_id}", response_model=GradeResultResponse)
async def get_grading_result(submission_id: str):
    """採点結果を取得"""
    supabase = get_supabase_client()
    submission = await get_submission(supabase, submission_id)

    if not submission:
        raise HTTPException(status_code=404, detail="提出が見つかりません")

    result_data = None
    annotated_urls: list[str] = []
    error = None

    if submission.get("result"):
        raw_result = submission["result"]
        if isinstance(raw_result, str):
            raw_result = json.loads(raw_result)
        annotated_urls = raw_result.pop("annotated_image_urls", [])
        if "error" in raw_result:
            error = raw_result["error"]
        else:
            result_data = GradingResult(**raw_result)

    return GradeResultResponse(
        id=submission_id,
        status=submission["status"],
        result=result_data,
        annotated_image_urls=annotated_urls,
        error=error,
    )


@app.get("/api/submissions", response_model=list[SubmissionListItem])
async def get_submissions():
    """提出一覧を取得"""
    supabase = get_supabase_client()
    submissions = await list_submissions(supabase)

    items = []
    for s in submissions:
        total_score = None
        max_total_score = None
        percentage = None

        if s.get("result") and s["status"] == "completed":
            raw = s["result"]
            if isinstance(raw, str):
                raw = json.loads(raw)
            total_score = raw.get("total_score")
            max_total_score = raw.get("max_total_score")
            percentage = raw.get("percentage")

        items.append(
            SubmissionListItem(
                id=s["id"],
                created_at=s["created_at"],
                status=s["status"],
                total_score=total_score,
                max_total_score=max_total_score,
                percentage=percentage,
            )
        )

    return items


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
