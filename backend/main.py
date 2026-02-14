"""
ScoGene - 数学採点アプリ バックエンド API

FastAPI + OpenAI Agents SDK + Supabase
"""

from __future__ import annotations

import json
import traceback
from collections import defaultdict

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
from agent import grade_submission_stream
from supabase_client import (
    get_supabase_client,
    create_submission,
    update_submission_status,
    get_submission,
    list_submissions,
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

# 一時ファイルストレージ（submission_id → ファイルデータ）
_pending_files: dict[str, dict] = {}


def _validate_files(files: list[UploadFile], label: str) -> None:
    if not files:
        raise HTTPException(status_code=400, detail=f"{label}ファイルが必要です")
    for f in files:
        if f.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"{label}: 非対応のファイル形式です ({f.content_type})",
            )


async def _read_upload_files(
    files: list[UploadFile],
) -> list[tuple[bytes, str, str]]:
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


# ── Step 1: ファイルアップロード → ID を即返却 ──

@app.post("/api/grade/start", response_model=SubmissionResponse)
async def start_grading(
    problem_files: list[UploadFile] = File(..., description="問題ファイル"),
    answer_files: list[UploadFile] = File(..., description="解答ファイル"),
    answer_key_files: list[UploadFile] | None = File(
        default=None, description="模範解答ファイル（任意）"
    ),
    notes: str | None = Form(default=None, description="追加の指示"),
):
    """ファイルを受け取り、submission を作成して ID を即返却"""
    _validate_files(problem_files, "問題")
    _validate_files(answer_files, "解答")
    if answer_key_files:
        _validate_files(answer_key_files, "模範解答")

    # ファイルをメモリに読み込み
    problem_data = await _read_upload_files(problem_files)
    answer_data = await _read_upload_files(answer_files)
    answer_key_data = (
        await _read_upload_files(answer_key_files) if answer_key_files else None
    )

    # Supabase に submission 作成
    supabase = get_supabase_client()
    submission = await create_submission(supabase)
    submission_id = submission["id"]
    await update_submission_status(supabase, submission_id, "pending")

    # ファイルを一時保存（stream エンドポイントが取得する）
    _pending_files[submission_id] = {
        "problem": problem_data,
        "answer": answer_data,
        "answer_key": answer_key_data,
        "notes": notes,
    }

    return SubmissionResponse(
        id=submission_id,
        status="pending",
        message="採点準備完了。ストリームに接続してください。",
    )


# ── Step 2: SSE ストリーミング（GET で結果ページから接続） ──

@app.get("/api/grade/{submission_id}/stream")
async def stream_grading(submission_id: str):
    """採点の進捗を SSE でストリーミング"""

    file_data = _pending_files.pop(submission_id, None)
    if not file_data:
        # 既に採点済みか、ファイルが見つからない
        supabase = get_supabase_client()
        sub = await get_submission(supabase, submission_id)
        if sub and sub.get("status") == "completed":
            # 既に完了している → 結果を返す
            async def already_done():
                yield {"event": "status", "data": "既に採点完了"}
                raw = sub.get("result")
                if isinstance(raw, str):
                    raw = json.loads(raw)
                yield {
                    "event": "result",
                    "data": json.dumps(
                        {"grading": raw, "annotated_image_count": 0},
                        ensure_ascii=False,
                    ),
                }
                yield {"event": "done", "data": ""}

            return EventSourceResponse(already_done())

        raise HTTPException(status_code=404, detail="提出が見つかりません")

    supabase = get_supabase_client()
    await update_submission_status(supabase, submission_id, "grading")

    async def event_generator():
        try:
            async for ev in grade_submission_stream(
                problem_files=file_data["problem"],
                answer_files=file_data["answer"],
                answer_key_files=file_data["answer_key"],
                notes=file_data["notes"],
            ):
                event_type = ev["event"]
                data = ev["data"]

                if event_type == "result":
                    grading_data = data["grading"]
                    grading_data["annotated_image_urls"] = []
                    await update_submission_status(
                        supabase, submission_id, "completed", grading_data
                    )
                    yield {
                        "event": "result",
                        "data": json.dumps(data, ensure_ascii=False),
                    }
                elif event_type == "error":
                    await update_submission_status(
                        supabase,
                        submission_id,
                        "error",
                        {"error": data},
                    )
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": data}, ensure_ascii=False),
                    }
                else:
                    yield {
                        "event": event_type,
                        "data": data
                        if isinstance(data, str)
                        else json.dumps(data, ensure_ascii=False),
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


# ── 結果取得（ポーリング用・完了後の閲覧用） ──

@app.get("/api/grade/{submission_id}", response_model=GradeResultResponse)
async def get_grading_result(submission_id: str):
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
