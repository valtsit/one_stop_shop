from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import create_access_token, get_current_user, verify_password
from ..core.database import get_db
from ..core.crud import get_user_by_username
from ..models.schemas import LoginRequest, LoginResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_username(db, req.username)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="用户已被禁用")
    token = create_access_token(user["id"])
    user_response = {k: v for k, v in user.items() if k != "password_hash"}
    return LoginResponse(access_token=token, user=UserResponse(**user_response))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**{k: v for k, v in current_user.items() if k != "password_hash"})
