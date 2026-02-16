"""
ScoGene - 数学採点アプリ バックエンド API

FastAPI + OpenAI Agents SDK + Supabase

アーキテクチャ:
  POST /api/grade/start → ファイル受信、submission 作成、バックグラウンドタスク起動
  GET /api/grade/{id}/stream → SSE ストリーミング（Last-Event-ID によるリプレイ対応）
  GET /api/grade/{id} → 完了後の結果取得
"""

from __future__ import annotations

import asyncio
import json
import time
import traceback

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from starlette.requests import Request

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

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
}

# ── JobState: バックグラウンドタスクと SSE の橋渡し ──

_JOB_TTL_SECONDS = 3600  # 1時間後にメモリから削除


class JobState:
    """
    バックグラウンド採点タスクの状態管理。

    - history: (event_id, event_dict) のリスト。全イベントを保持し、
      EventSource の再接続時に Last-Event-ID 以降をリプレイする。
    - notify: asyncio.Event で SSE コンシューマに新イベントを通知。
    - done: タスク完了フラグ。
    """

    __slots__ = ("history", "notify", "done", "_counter", "task", "created_at")

    def __init__(self) -> None:
        self.history: list[tuple[int, dict]] = []
        self.notify: asyncio.Event = asyncio.Event()
        self.done: bool = False
        self._counter: int = 0
        self.task: asyncio.Task | None = None
        self.created_at: float = time.monotonic()

    def push_event(self, event: dict) -> int:
        """イベントを履歴に追加し、待機中の SSE コンシューマを起こす。"""
        self._counter += 1
        self.history.append((self._counter, event))
        self.notify.set()
        return self._counter

    def mark_done(self) -> None:
        """タスク完了をマーク。"""
        self.done = True
        self.notify.set()


# アクティブジョブ: submission_id → JobState
_jobs: dict[str, JobState] = {}


def _cleanup_old_jobs() -> None:
    """TTL 超過のジョブをメモリから削除。"""
    now = time.monotonic()
    expired = [
        sid for sid, job in _jobs.items()
        if job.done and (now - job.created_at) > _JOB_TTL_SECONDS
    ]
    for sid in expired:
        del _jobs[sid]


# ── バックグラウンド採点タスク ──


async def _run_grading_job(
    job: JobState,
    submission_id: str,
    file_data: dict,
) -> None:
    """
    バックグラウンドで採点エージェントを実行し、イベントを JobState に push する。
    POST 時点で起動し、SSE 接続前でもイベントが蓄積される。
    """
    supabase = get_supabase_client()
    await update_submission_status(supabase, submission_id, "grading")

    try:
        annotated_image_data: list[bytes] = []

        async for ev in grade_submission_stream(
            problem_files=file_data["problem"],
            answer_files=file_data["answer"],
            answer_key_files=file_data["answer_key"],
            notes=file_data["notes"],
        ):
            event_type = ev["event"]

            # 内部イベント: 注釈画像バイナリ（SSE には送らない）
            if event_type == "_images":
                annotated_image_data = ev["data"]
                continue

            if event_type == "result":
                grading_data = ev["data"]["grading"]

                # 注釈画像を Supabase Storage にアップロード
                annotated_urls: list[str] = []
                for i, img_bytes in enumerate(annotated_image_data):
                    try:
                        url = await upload_annotated_image(
                            supabase, submission_id, img_bytes, i
                        )
                        annotated_urls.append(url)
                    except Exception:
                        traceback.print_exc()

                grading_data["annotated_image_urls"] = annotated_urls
                ev["data"]["annotated_image_urls"] = annotated_urls

                await update_submission_status(
                    supabase, submission_id, "completed", grading_data
                )
                job.push_event(ev)

            elif event_type == "error":
                await update_submission_status(
                    supabase, submission_id, "error", {"error": ev["data"]}
                )
                job.push_event(ev)

            else:
                job.push_event(ev)

        # done センチネル
        job.push_event({"event": "done", "data": ""})

    except Exception as e:
        traceback.print_exc()
        try:
            await update_submission_status(
                supabase, submission_id, "error", {"error": str(e)}
            )
        except Exception:
            traceback.print_exc()
        job.push_event({"event": "error", "data": str(e)})
        job.push_event({"event": "done", "data": ""})

    finally:
        job.mark_done()


# ── ヘルパー ──


def _validate_files(
    files: list[UploadFile], label: str, *, image_only: bool = False
) -> None:
    if not files:
        raise HTTPException(status_code=400, detail=f"{label}ファイルが必要です")
    allowed = ALLOWED_IMAGE_TYPES if image_only else ALLOWED_MIME_TYPES
    for f in files:
        if f.content_type not in allowed:
            msg = (
                f"{label}: 画像ファイルのみ対応しています（JPEG, PNG, WebP）"
                if image_only
                else f"{label}: 非対応のファイル形式です ({f.content_type})"
            )
            raise HTTPException(status_code=400, detail=msg)


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


# ── エンドポイント ──


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "model": settings.OPENAI_MODEL}


# ── Step 1: ファイルアップロード → バックグラウンドタスク起動 → ID 即返却 ──


@app.post("/api/grade/start", response_model=SubmissionResponse)
async def start_grading(
    problem_files: list[UploadFile] = File(..., description="問題ファイル"),
    answer_files: list[UploadFile] = File(..., description="解答ファイル"),
    answer_key_files: list[UploadFile] | None = File(
        default=None, description="模範解答ファイル（任意）"
    ),
    notes: str | None = Form(default=None, description="追加の指示"),
):
    """ファイルを受け取り、submission を作成、バックグラウンド採点を開始して ID を即返却"""
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

    # 古いジョブのクリーンアップ
    _cleanup_old_jobs()

    # JobState を作成し、バックグラウンドタスクを起動
    job = JobState()
    file_data = {
        "problem": problem_data,
        "answer": answer_data,
        "answer_key": answer_key_data,
        "notes": notes,
    }
    job.task = asyncio.create_task(
        _run_grading_job(job, submission_id, file_data)
    )
    _jobs[submission_id] = job

    return SubmissionResponse(
        id=submission_id,
        status="pending",
        message="採点を開始しました。",
    )


# ── Step 2: SSE ストリーミング（Last-Event-ID リプレイ対応） ──


@app.get("/api/grade/{submission_id}/stream")
async def stream_grading(submission_id: str, request: Request):
    """
    採点の進捗を SSE でストリーミング。

    - JobState が存在する場合: 履歴からイベントをリプレイし、新しいイベントを待機
    - Last-Event-ID ヘッダ: 再接続時にそれ以降のイベントのみ送信
    - ジョブが存在しない場合: DB を確認し、完了済みならそのまま返却
    """
    job = _jobs.get(submission_id)

    if not job:
        # ジョブがメモリにない → DB を確認
        supabase = get_supabase_client()
        sub = await get_submission(supabase, submission_id)

        if sub and sub.get("status") == "completed":
            raw = sub.get("result")
            if isinstance(raw, str):
                raw = json.loads(raw)
            annotated_urls = raw.pop("annotated_image_urls", [])

            async def already_done():
                yield {
                    "event": "status",
                    "data": "既に採点完了",
                    "id": "1",
                }
                yield {
                    "event": "result",
                    "data": json.dumps(
                        {
                            "grading": raw,
                            "annotated_image_urls": annotated_urls,
                        },
                        ensure_ascii=False,
                    ),
                    "id": "2",
                }
                yield {"event": "done", "data": "", "id": "3"}

            return EventSourceResponse(already_done())

        raise HTTPException(status_code=404, detail="提出が見つかりません")

    # Last-Event-ID からカーソル位置を決定
    last_event_id = 0
    raw_id = request.headers.get("last-event-id")
    if raw_id:
        try:
            last_event_id = int(raw_id)
        except ValueError:
            pass

    async def event_generator():
        cursor = last_event_id

        while True:
            # 利用可能なイベントを全てドレイン
            while cursor < len(job.history):
                event_id, ev = job.history[cursor]
                cursor += 1

                event_type = ev["event"]
                data = ev["data"]

                yield {
                    "event": event_type,
                    "data": data
                    if isinstance(data, str)
                    else json.dumps(data, ensure_ascii=False),
                    "id": str(event_id),
                }

                # done イベントで終了
                if event_type == "done":
                    return

            # タスク完了済みで全イベント送信完了
            if job.done:
                return

            # 新しいイベントを待機
            job.notify.clear()
            # クリア後に再チェック（race condition 防止）
            if cursor < len(job.history):
                continue
            try:
                await asyncio.wait_for(job.notify.wait(), timeout=30.0)
            except asyncio.TimeoutError:
                # キープアライブ（接続維持）
                yield {"comment": "keepalive"}

    return EventSourceResponse(event_generator())


# ── 結果取得（完了後の閲覧用） ──


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
