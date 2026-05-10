import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import get_current_user, require_permission
from ..models.schemas import RoleCreate, RoleResponse, RoleUpdate

router = APIRouter(prefix="/api/roles", tags=["roles"])

DATA_DIR = Path(__file__).parent.parent.parent / "data"
ROLES_FILE = DATA_DIR / "roles.json"
USERS_FILE = DATA_DIR / "users.json"

BUILTIN_ROLES = {"role_super_admin", "role_admin", "role_user"}


def _load_roles() -> dict[str, dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if ROLES_FILE.exists():
        try:
            data = json.loads(ROLES_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, Exception):
            pass
    return {}


def _save_roles(roles: dict[str, dict]):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ROLES_FILE.write_text(
        json.dumps(roles, ensure_ascii=False, indent=2), encoding="utf-8"
    )


@router.get("/", response_model=list[RoleResponse])
async def list_roles(current_user: dict = Depends(get_current_user)):
    roles = _load_roles()
    return [RoleResponse(**r) for r in roles.values()]


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str, current_user: dict = Depends(require_permission("user:manage"))
):
    roles = _load_roles()
    role = roles.get(role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    return RoleResponse(**role)


@router.post("/", response_model=RoleResponse)
async def create_role(
    body: RoleCreate,
    current_user: dict = Depends(require_permission("user:manage")),
):
    roles = _load_roles()
    role_id = "role_" + str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    role_data = {
        "id": role_id,
        "name": body.name,
        "description": body.description,
        "permissions": body.permissions,
        "created_at": now,
        "updated_at": now,
    }
    roles[role_id] = role_data
    _save_roles(roles)
    return RoleResponse(**role_data)


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    body: RoleUpdate,
    current_user: dict = Depends(require_permission("user:manage")),
):
    roles = _load_roles()
    role = roles.get(role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    if role_id in BUILTIN_ROLES:
        raise HTTPException(status_code=400, detail="系统内置角色不可修改")
    role["name"] = body.name
    role["description"] = body.description
    role["permissions"] = body.permissions
    role["updated_at"] = datetime.now().isoformat()
    roles[role_id] = role
    _save_roles(roles)
    return RoleResponse(**role)


@router.delete("/{role_id}")
async def delete_role(
    role_id: str, current_user: dict = Depends(require_permission("user:manage"))
):
    roles = _load_roles()
    if role_id not in roles:
        raise HTTPException(status_code=404, detail="角色不存在")
    if role_id in BUILTIN_ROLES:
        raise HTTPException(status_code=400, detail="系统内置角色不可删除")
    # Check if any user is using this role
    if USERS_FILE.exists():
        users = json.loads(USERS_FILE.read_text(encoding="utf-8"))
        for u in users.values():
            if u.get("role_id") == role_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"角色已被用户「{u.get('username', '')}」使用，无法删除",
                )
    del roles[role_id]
    _save_roles(roles)
    return {"status": "ok"}
