from datetime import datetime, timedelta
from functools import wraps

import bcrypt
from fastapi import Depends, HTTPException, Header
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import get_db
from .crud import get_user, get_role


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


async def get_current_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录或 token 无效")
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="token 已过期或无效")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="token 格式错误")
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="用户已被禁用")
    return user


async def _check_permission(user: dict, permission: str, db: AsyncSession) -> bool:
    """Check if a user has a given permission via DB query."""
    role_id = user.get("role_id", "")
    if not role_id:
        return False
    role = await get_role(db, role_id)
    if not role:
        return False
    perms = role.get("permissions", [])
    return "*" in perms or permission in perms


def require_permission(permission: str):
    """依赖工厂：检查当前用户是否拥有指定权限"""
    async def _check(
        current_user: dict = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        if not await _check_permission(current_user, permission, db):
            raise HTTPException(status_code=403, detail="权限不足")
        return current_user
    return _check
