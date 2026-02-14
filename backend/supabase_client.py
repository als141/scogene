from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from supabase import create_client, Client

from config import settings


def get_supabase_client() -> Client:
    """Supabase クライアントを取得"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


# --- Submissions ---

async def create_submission(supabase: Client) -> dict:
    """新しい提出レコードを作成"""
    submission_id = str(uuid.uuid4())
    data = {
        "id": submission_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("submissions").insert(data).execute()
    return result.data[0] if result.data else data


async def update_submission_status(
    supabase: Client, submission_id: str, status: str, result_data: dict | None = None
) -> None:
    """提出のステータスを更新"""
    update = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if result_data:
        update["result"] = json.dumps(result_data, ensure_ascii=False)
    supabase.table("submissions").update(update).eq("id", submission_id).execute()


async def get_submission(supabase: Client, submission_id: str) -> dict | None:
    """提出レコードを取得"""
    result = (
        supabase.table("submissions")
        .select("*")
        .eq("id", submission_id)
        .single()
        .execute()
    )
    return result.data


async def list_submissions(supabase: Client, limit: int = 50) -> list[dict]:
    """提出一覧を取得"""
    result = (
        supabase.table("submissions")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


# --- Storage ---

async def upload_file(
    supabase: Client,
    bucket: str,
    file_path: str,
    file_bytes: bytes,
    content_type: str,
) -> str:
    """ファイルをSupabase Storageにアップロード"""
    supabase.storage.from_(bucket).upload(
        file_path,
        file_bytes,
        file_options={"content-type": content_type},
    )
    return supabase.storage.from_(bucket).get_public_url(file_path)


async def upload_annotated_image(
    supabase: Client,
    submission_id: str,
    image_bytes: bytes,
    index: int = 0,
) -> str:
    """採点済み画像をアップロード"""
    file_path = f"{submission_id}/annotated_{index}.png"
    return await upload_file(
        supabase, "annotations", file_path, image_bytes, "image/png"
    )
