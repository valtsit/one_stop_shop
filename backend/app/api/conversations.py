import json
import uuid
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.auth import get_current_user

router = APIRouter(prefix="/api/conversations", tags=["conversations"])

DATA_DIR = Path("./data")



def _get_memory_dir() -> Path:
    settings_file = DATA_DIR / "settings.json"
    memory_dir = DATA_DIR / "conversations"
    if settings_file.exists():
        try:
            data = json.loads(settings_file.read_text(encoding="utf-8"))
            if data.get("memory_dir"):
                memory_dir = Path(data["memory_dir"])
        except Exception:
            pass
    memory_dir.mkdir(parents=True, exist_ok=True)
    return memory_dir


def _conv_path(conv_id: str) -> Path:
    return _get_memory_dir() / f"{conv_id}.json"


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
async def list_conversations(agent_id: str | None = None, current_user: dict = Depends(get_current_user)):
    conv_dir = _get_memory_dir()
    user_id = current_user["id"]
    conversations = []
    for f in sorted(conv_dir.glob("*.json"), reverse=True):
        try:
            conv = json.loads(f.read_text(encoding="utf-8"))
            if conv.get("user_id") != user_id:
                continue
            if agent_id and conv.get("agent_id") != agent_id:
                continue
            conversations.append({
                "id": conv["id"],
                "agent_id": conv.get("agent_id", ""),
                "title": conv.get("title", ""),
                "model": conv.get("model", ""),
                "provider": conv.get("provider", ""),
                "message_count": len(conv.get("messages", [])),
                "created_at": conv.get("created_at", ""),
                "updated_at": conv.get("updated_at", ""),
            })
        except Exception:
            continue
    return conversations


@router.get("/{conv_id}")
async def get_conversation(conv_id: str, current_user: dict = Depends(get_current_user)):
    path = _conv_path(conv_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="对话不存在")
    conv = json.loads(path.read_text(encoding="utf-8"))
    if conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权访问此对话")
    return conv


@router.post("/")
async def create_conversation(conv: ConversationCreate, current_user: dict = Depends(get_current_user)):
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
    _conv_path(conv_id).write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return data


@router.put("/{conv_id}")
async def update_conversation(conv_id: str, conv: ConversationUpdate, current_user: dict = Depends(get_current_user)):
    path = _conv_path(conv_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="对话不存在")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改此对话")
    if conv.title is not None:
        data["title"] = conv.title
    if conv.messages is not None:
        data["messages"] = conv.messages
        if not data.get("title"):
            data["title"] = _title_from_messages(conv.messages)
    if conv.model is not None:
        data["model"] = conv.model
    if conv.provider is not None:
        data["provider"] = conv.provider
    data["updated_at"] = datetime.now().isoformat()
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return data


@router.delete("/{conv_id}")
async def delete_conversation(conv_id: str, current_user: dict = Depends(get_current_user)):
    path = _conv_path(conv_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="对话不存在")
    conv = json.loads(path.read_text(encoding="utf-8"))
    if conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权删除此对话")
    path.unlink()
    return {"status": "ok"}


def _title_from_messages(messages: list[dict]) -> str:
    for msg in messages:
        if msg.get("role") == "user" and msg.get("content"):
            text = msg["content"].strip()
            return text[:30] + ("..." if len(text) > 30 else "")
    return "新对话"
