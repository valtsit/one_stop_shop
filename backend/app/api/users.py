import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import get_current_user, hash_password, require_permission
from ..core.database import get_db
from ..core.crud import (
    list_users as crud_list_users,
    get_user as crud_get_user,
    create_user as crud_create_user,
    update_user as crud_update_user,
    delete_user as crud_delete_user,
    get_user_by_username,
    create_recycle_item,
)
from ..models.schemas import (
    UserCreate,
    UserResponse,
    UserUpdate,
    ResetPasswordRequest,
)

router = APIRouter(prefix="/api/users", tags=["users"])


def _strip_password(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}


@router.get("/", response_model=list[UserResponse])
async def list_users(
    current_user: dict = Depends(require_permission("user:read")),
    db: AsyncSession = Depends(get_db),
):
    users = await crud_list_users(db)
    return [UserResponse(**_strip_password(u)) for u in users]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: dict = Depends(require_permission("user:read")),
    db: AsyncSession = Depends(get_db),
):
    user = await crud_get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return UserResponse(**_strip_password(user))


@router.post("/", response_model=UserResponse)
async def create_user(
    body: UserCreate,
    current_user: dict = Depends(require_permission("user:create")),
    db: AsyncSession = Depends(get_db),
):
    # Check username uniqueness
    existing = await get_user_by_username(db, body.username)
    if existing:
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
    result = await crud_create_user(db, user_data)
    await db.commit()
    return UserResponse(**_strip_password(result))


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: dict = Depends(require_permission("user:update")),
    db: AsyncSession = Depends(get_db),
):
    user = await crud_get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    update_data = {
        "display_name": body.display_name,
        "email": body.email,
        "phone": body.phone,
        "role_id": body.role_id,
        "department_id": body.department_id,
        "is_active": body.is_active,
        "updated_at": datetime.now().isoformat(),
    }
    result = await crud_update_user(db, user_id, update_data)
    await db.commit()
    return UserResponse(**_strip_password(result))


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_permission("user:delete")),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.get("id"):
        raise HTTPException(status_code=400, detail="不能删除自己")
    user = await crud_get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    await create_recycle_item(db, {
        "entity_type": "user",
        "entity_id": user_id,
        "entity_data": user,
        "deleted_by": current_user.get("id", ""),
        "deleted_at": datetime.now().isoformat(),
    })
    await crud_delete_user(db, user_id)
    await db.commit()
    return {"status": "ok"}


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    body: ResetPasswordRequest,
    current_user: dict = Depends(require_permission("user:update")),
    db: AsyncSession = Depends(get_db),
):
    user = await crud_get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    await crud_update_user(db, user_id, {
        "password_hash": hash_password(body.new_password),
        "updated_at": datetime.now().isoformat(),
    })
    await db.commit()
    return {"status": "ok"}
