from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import get_current_user, hash_password, verify_password, require_permission
from ..core.crud import update_user, get_role, get_department
from ..core.database import get_db
from ..models.schemas import ChangePasswordRequest, UserResponse

router = APIRouter(prefix="/api/auth", tags=["profile"])


@router.get("/profile")
async def get_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = {k: v for k, v in current_user.items() if k != "password_hash"}
    # Enrich with role and department names
    role = await get_role(db, current_user.get("role_id", ""))
    dept = await get_department(db, current_user.get("department_id", ""))
    user["role_name"] = (role or {}).get("name", "")
    user["department_name"] = (dept or {}).get("name", "")
    return user


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user.get("id")
    # Only allow updating own display_name, email, phone
    update_data = {}
    for field in ("display_name", "email", "phone"):
        if field in body:
            update_data[field] = body[field]
    update_data["updated_at"] = datetime.now().isoformat()
    user = await update_user(db, user_id, update_data)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    await db.commit()
    return UserResponse(**{k: v for k, v in user.items() if k != "password_hash"})


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(require_permission("password:change")),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.old_password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="旧密码不正确")
    user_id = current_user.get("id")
    user = await update_user(db, user_id, {
        "password_hash": hash_password(body.new_password),
        "updated_at": datetime.now().isoformat(),
    })
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    await db.commit()
    return {"status": "ok"}
