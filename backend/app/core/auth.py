import json
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

import bcrypt
from fastapi import Depends, HTTPException, Header
from jose import JWTError, jwt

from .config import settings

DATA_DIR = Path(__file__).parent.parent.parent / "data"
USERS_FILE = DATA_DIR / "users.json"
ROLES_FILE = DATA_DIR / "roles.json"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None


async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录或 token 无效")
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="token 已过期或无效")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="token 格式错误")
    if not USERS_FILE.exists():
        raise HTTPException(status_code=401, detail="用户数据不存在")
    users = json.loads(USERS_FILE.read_text(encoding="utf-8"))
    user = users.get(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="用户已被禁用")
    return user


def require_permission(permission: str):
    """依赖工厂：检查当前用户是否拥有指定权限"""
    async def _check(current_user: dict = Depends(get_current_user)):
        role_id = current_user.get("role_id", "")
        if not ROLES_FILE.exists():
            raise HTTPException(status_code=403, detail="权限不足")
        roles = json.loads(ROLES_FILE.read_text(encoding="utf-8"))
        role = roles.get(role_id)
        if not role:
            raise HTTPException(status_code=403, detail="权限不足")
        perms = role.get("permissions", [])
        if "*" not in perms and permission not in perms:
            raise HTTPException(status_code=403, detail="权限不足")
        return current_user
    return _check
