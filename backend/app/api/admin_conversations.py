import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from ..core.auth import get_current_user

router = APIRouter(prefix="/api/admin/conversations", tags=["admin-conversations"])

DATA_DIR = Path("./data")
USERS_FILE = DATA_DIR / "users.json"


def _is_admin(user: dict) -> bool:
    return user.get("role_id") in ("role_super_admin", "role_admin")


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


def _load_users() -> dict[str, dict]:
    if USERS_FILE.exists():
        try:
            return json.loads(USERS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _require_admin(current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user


@router.get("/")
async def admin_list_conversations(
    user_id: str | None = None,
    agent_id: str | None = None,
    keyword: str | None = None,
    current_user: dict = Depends(_require_admin),
):
    conv_dir = _get_memory_dir()
    users = _load_users()
    conversations = []
    for f in sorted(conv_dir.glob("*.json"), reverse=True):
        try:
            conv = json.loads(f.read_text(encoding="utf-8"))
            if user_id and conv.get("user_id") != user_id:
                continue
            if agent_id and conv.get("agent_id") != agent_id:
                continue
            if keyword:
                title = conv.get("title", "")
                has_match = keyword.lower() in title.lower()
                if not has_match:
                    for msg in conv.get("messages", []):
                        if keyword.lower() in msg.get("content", "").lower():
                            has_match = True
                            break
                if not has_match:
                    continue
            owner = users.get(conv.get("user_id", ""), {})
            conversations.append({
                "id": conv["id"],
                "user_id": conv.get("user_id", ""),
                "user_display_name": owner.get("display_name", conv.get("user_id", "未知用户")),
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
async def admin_get_conversation(
    conv_id: str, current_user: dict = Depends(_require_admin)
):
    path = _conv_path(conv_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="对话不存在")
    conv = json.loads(path.read_text(encoding="utf-8"))
    users = _load_users()
    owner = users.get(conv.get("user_id", ""), {})
    conv["user_display_name"] = owner.get("display_name", conv.get("user_id", "未知用户"))
    return conv


@router.delete("/{conv_id}")
async def admin_delete_conversation(
    conv_id: str, current_user: dict = Depends(_require_admin)
):
    path = _conv_path(conv_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="对话不存在")
    path.unlink()
    return {"status": "ok"}


@router.get("/users/list")
async def admin_list_users(current_user: dict = Depends(_require_admin)):
    """Return users who have at least one conversation, for filter dropdown."""
    conv_dir = _get_memory_dir()
    users = _load_users()
    seen_user_ids: set[str] = set()
    for f in conv_dir.glob("*.json"):
        try:
            conv = json.loads(f.read_text(encoding="utf-8"))
            uid = conv.get("user_id")
            if uid:
                seen_user_ids.add(uid)
        except Exception:
            continue
    return [
        {"id": uid, "display_name": users.get(uid, {}).get("display_name", uid)}
        for uid in sorted(seen_user_ids)
    ]
