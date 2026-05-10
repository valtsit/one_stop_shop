import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import get_current_user, hash_password, require_permission
from ..models.schemas import (
    UserCreate,
    UserResponse,
    UserUpdate,
    ResetPasswordRequest,
)

router = APIRouter(prefix="/api/users", tags=["users"])

DATA_DIR = Path(__file__).parent.parent.parent / "data"
USERS_FILE = DATA_DIR / "users.json"


def _load_users() -> dict[str, dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if USERS_FILE.exists():
        try:
            data = json.loads(USERS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, Exception):
            pass
    return {}


def _save_users(users: dict[str, dict]):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    USERS_FILE.write_text(
        json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _strip_password(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}


@router.get("/", response_model=list[UserResponse])
async def list_users(current_user: dict = Depends(require_permission("user:manage"))):
    users = _load_users()
    return [UserResponse(**_strip_password(u)) for u in users.values()]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str, current_user: dict = Depends(require_permission("user:manage"))
):
    users = _load_users()
    user = users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return UserResponse(**_strip_password(user))


@router.post("/", response_model=UserResponse)
async def create_user(
    body: UserCreate,
    current_user: dict = Depends(require_permission("user:manage")),
):
    users = _load_users()
    # Check username uniqueness
    for u in users.values():
        if u.get("username") == body.username:
            raise HTTPException(status_code=400, detail="用户名已存在")
    user_id = "user_" + str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    user_data = {
        "id": user_id,
        "username": body.username,
        "password_hash": hash_password(body.password),
        "display_name": body.display_name,
        "email": body.email,
        "phone": body.phone,
        "role_id": body.role_id,
        "department_id": body.department_id,
        "is_active": body.is_active,
        "created_at": now,
        "updated_at": now,
    }
    users[user_id] = user_data
    _save_users(users)
    return UserResponse(**_strip_password(user_data))


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: dict = Depends(require_permission("user:manage")),
):
    users = _load_users()
    user = users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user["display_name"] = body.display_name
    user["email"] = body.email
    user["phone"] = body.phone
    user["role_id"] = body.role_id
    user["department_id"] = body.department_id
    user["is_active"] = body.is_active
    user["updated_at"] = datetime.now().isoformat()
    users[user_id] = user
    _save_users(users)
    return UserResponse(**_strip_password(user))


@router.delete("/{user_id}")
async def delete_user(
    user_id: str, current_user: dict = Depends(require_permission("user:manage"))
):
    if user_id == current_user.get("id"):
        raise HTTPException(status_code=400, detail="不能删除自己")
    users = _load_users()
    if user_id not in users:
        raise HTTPException(status_code=404, detail="用户不存在")
    del users[user_id]
    _save_users(users)
    return {"status": "ok"}


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    body: ResetPasswordRequest,
    current_user: dict = Depends(require_permission("user:manage")),
):
    users = _load_users()
    user = users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user["password_hash"] = hash_password(body.new_password)
    user["updated_at"] = datetime.now().isoformat()
    users[user_id] = user
    _save_users(users)
    return {"status": "ok"}
