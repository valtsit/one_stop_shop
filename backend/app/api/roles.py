import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import get_current_user, require_permission
from ..core.database import get_db
from ..core.crud import (
    list_roles as crud_list_roles,
    get_role as crud_get_role,
    create_role as crud_create_role,
    update_role as crud_update_role,
    delete_role as crud_delete_role,
    list_users as crud_list_users,
    create_recycle_item,
)
from ..models.schemas import RoleCreate, RoleResponse, RoleUpdate

router = APIRouter(prefix="/api/roles", tags=["roles"])

BUILTIN_ROLES = {"role_super_admin", "role_admin", "role_user"}


@router.get("/", response_model=list[RoleResponse])
async def list_roles(
    current_user: dict = Depends(require_permission("role:read")),
    db: AsyncSession = Depends(get_db),
):
    roles = await crud_list_roles(db)
    return [RoleResponse(**r) for r in roles]


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await crud_get_role(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    return RoleResponse(**role)


@router.post("/", response_model=RoleResponse)
async def create_role(
    body: RoleCreate,
    current_user: dict = Depends(require_permission("role:create")),
    db: AsyncSession = Depends(get_db),
):
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
    result = await crud_create_role(db, role_data)
    await db.commit()
    return RoleResponse(**result)


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    body: RoleUpdate,
    current_user: dict = Depends(require_permission("role:update")),
    db: AsyncSession = Depends(get_db),
):
    role = await crud_get_role(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    now = datetime.now().isoformat()
    if role_id in BUILTIN_ROLES:
        # Built-in roles: only allow editing permissions and description, not name
        update_data = {
            "description": body.description,
            "permissions": body.permissions,
            "updated_at": now,
        }
    else:
        update_data = {
            "name": body.name,
            "description": body.description,
            "permissions": body.permissions,
            "updated_at": now,
        }
    result = await crud_update_role(db, role_id, update_data)
    await db.commit()
    return RoleResponse(**result)


@router.delete("/{role_id}")
async def delete_role(
    role_id: str,
    current_user: dict = Depends(require_permission("role:delete")),
    db: AsyncSession = Depends(get_db),
):
    role = await crud_get_role(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    if role_id in BUILTIN_ROLES:
        raise HTTPException(status_code=400, detail="系统内置角色不可删除")
    # Check if any user is using this role
    users = await crud_list_users(db)
    for u in users:
        if u.get("role_id") == role_id:
            raise HTTPException(
                status_code=400,
                detail=f"角色已被用户「{u.get('username', '')}」使用，无法删除",
            )
    await create_recycle_item(db, {
        "entity_type": "role",
        "entity_id": role_id,
        "entity_data": role,
        "deleted_by": current_user.get("id", ""),
        "deleted_at": datetime.now().isoformat(),
    })
    await crud_delete_role(db, role_id)
    await db.commit()
    return {"status": "ok"}
