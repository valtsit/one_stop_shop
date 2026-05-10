import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import get_current_user, hash_password, verify_password
from ..models.schemas import ChangePasswordRequest, UserResponse

router = APIRouter(prefix="/api/auth", tags=["profile"])

DATA_DIR = Path(__file__).parent.parent.parent / "data"
USERS_FILE = DATA_DIR / "users.json"
ROLES_FILE = DATA_DIR / "roles.json"
DEPARTMENTS_FILE = DATA_DIR / "departments.json"


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
    USERS_FILE.write_text(
        json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _load_json_file(path: Path) -> dict[str, dict]:
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, Exception):
            pass
    return {}


@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    user = {k: v for k, v in current_user.items() if k != "password_hash"}
    # Enrich with role and department names
    roles = _load_json_file(ROLES_FILE)
    departments = _load_json_file(DEPARTMENTS_FILE)
    role = roles.get(current_user.get("role_id", ""), {})
    dept = departments.get(current_user.get("department_id", ""), {})
    user["role_name"] = role.get("name", "")
    user["department_name"] = dept.get("name", "")
    return user


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    users = _load_users()
    user_id = current_user.get("id")
    user = users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    # Only allow updating own display_name, email, phone
    for field in ("display_name", "email", "phone"):
        if field in body:
            user[field] = body[field]
    user["updated_at"] = datetime.now().isoformat()
    users[user_id] = user
    _save_users(users)
    return UserResponse(**{k: v for k, v in user.items() if k != "password_hash"})


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    role_id = current_user.get("role_id", "")
    if role_id not in ("role_super_admin", "role_admin"):
        raise HTTPException(status_code=403, detail="无权限修改密码")
    if not verify_password(body.old_password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="旧密码不正确")
    users = _load_users()
    user_id = current_user.get("id")
    user = users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user["password_hash"] = hash_password(body.new_password)
    user["updated_at"] = datetime.now().isoformat()
    users[user_id] = user
    _save_users(users)
    return {"status": "ok"}
