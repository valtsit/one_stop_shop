import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import get_current_user
from ..core.database import get_db
from ..core.crud import (
    get_conversation, list_conversations as crud_list_conversations,
    create_conversation, update_conversation, delete_conversation,
)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class ConversationCreate(BaseModel):
    agent_id: str
    title: str = ""
    model: str = ""
    provider: str = ""
    messages: list[dict] = []


class ConversationUpdate(BaseModel):
    title: str | None = None
    messages: list[dict] | None = None
    model: str | None = None
    provider: str | None = None


@router.get("/")
async def list_conversations(
    agent_id: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await crud_list_conversations(db, user_id=current_user["id"], agent_id=agent_id)


@router.get("/{conv_id}")
async def get_conversation_endpoint(
    conv_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    if conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权访问此对话")
    return conv


@router.post("/")
async def create_conversation_endpoint(
    conv: ConversationCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv_id = "conv_" + uuid.uuid4().hex[:8]
    now = datetime.now().isoformat()
    data = {
        "id": conv_id,
        "user_id": current_user["id"],
        "agent_id": conv.agent_id,
        "title": conv.title or _title_from_messages(conv.messages),
        "model": conv.model,
        "provider": conv.provider,
        "messages": conv.messages,
        "created_at": now,
        "updated_at": now,
    }
    await create_conversation(db, data)
    await db.commit()
    return data


@router.put("/{conv_id}")
async def update_conversation_endpoint(
    conv_id: str,
    conv: ConversationUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_conversation(db, conv_id)
    if not existing:
        raise HTTPException(status_code=404, detail="对话不存在")
    if existing.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改此对话")

    update_data = {}
    if conv.title is not None:
        update_data["title"] = conv.title
    if conv.messages is not None:
        update_data["messages"] = conv.messages
        if not existing.get("title"):
            update_data["title"] = _title_from_messages(conv.messages)
    if conv.model is not None:
        update_data["model"] = conv.model
    if conv.provider is not None:
        update_data["provider"] = conv.provider
    update_data["updated_at"] = datetime.now().isoformat()

    result = await update_conversation(db, conv_id, update_data)
    await db.commit()
    return result


@router.delete("/{conv_id}")
async def delete_conversation_endpoint(
    conv_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_conversation(db, conv_id)
    if not existing:
        raise HTTPException(status_code=404, detail="对话不存在")
    if existing.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权删除此对话")
    await delete_conversation(db, conv_id)
    await db.commit()
    return {"status": "ok"}


def _title_from_messages(messages: list[dict]) -> str:
    for msg in messages:
        if msg.get("role") == "user" and msg.get("content"):
            text = msg["content"].strip()
            return text[:30] + ("..." if len(text) > 30 else "")
    return "新对话"
