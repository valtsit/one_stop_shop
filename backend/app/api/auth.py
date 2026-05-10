import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import create_access_token, get_current_user, verify_password
from ..models.schemas import LoginRequest, LoginResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

DATA_DIR = Path(__file__).parent.parent.parent / "data"
USERS_FILE = DATA_DIR / "users.json"


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    if not USERS_FILE.exists():
        raise HTTPException(status_code=500, detail="用户数据不存在")
    users = json.loads(USERS_FILE.read_text(encoding="utf-8"))
    user = None
    for u in users.values():
        if u["username"] == req.username:
            user = u
            break
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
