from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import get_current_user
from ..core.database import get_db
from ..core.crud import (
    get_recycle_item as crud_get_recycle_item,
    list_recycle_bin as crud_list_recycle_bin,
    delete_recycle_item as crud_delete_recycle_item,
    purge_expired as crud_purge_expired,
    get_role as crud_get_role,
    get_user_by_username as crud_get_user_by_username,
    create_user as crud_create_user,
    create_department as crud_create_department,
    get_agent_include_deleted as crud_get_agent_include_deleted,
    create_agent as crud_create_agent,
    update_agent as crud_update_agent,
    create_skill as crud_create_skill,
    create_knowledge as crud_create_knowledge,
    create_wiki_space as crud_create_wiki_space,
    create_wiki_page as crud_create_wiki_page,
    create_wiki_source as crud_create_wiki_source,
)

router = APIRouter(prefix="/api/recycle-bin", tags=["recycle-bin"])

ENTITY_DELETE_PERMISSIONS = {
    "agent": "agent:delete",
    "skill": "skill:delete",
    "knowledge": "knowledge:delete",
    "role": "role:delete",
    "department": "department:delete",
    "user": "user:delete",
    "wiki": "wiki:delete",
}

ENTITY_LABELS = {
    "agent": "智能体",
    "skill": "Skill",
    "knowledge": "知识库",
    "role": "角色",
    "department": "部门",
    "user": "用户",
    "wiki": "Wiki 知识库",
}


async def _check_perm(db: AsyncSession, current_user: dict, permission: str) -> bool:
    """Check if user has a specific permission."""
    role_id = current_user.get("role_id", "")
    role = await crud_get_role(db, role_id)
    if not role:
        return False
    perms = role.get("permissions", [])
    return "*" in perms or permission in perms


@router.get("/")
async def list_recycle_bin(
    entity_type: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await crud_purge_expired(db)
    await db.commit()
    items = await crud_list_recycle_bin(db, entity_type=entity_type)
    return items


@router.post("/{item_id}/restore")
async def restore_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await crud_get_recycle_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="回收站条目不存在")

    entity_type = item.get("entity_type", "")
    entity_data = item.get("entity_data", {})
    entity_id = item.get("entity_id", "")

    perm = ENTITY_DELETE_PERMISSIONS.get(entity_type)
    if not perm:
        raise HTTPException(status_code=400, detail="未知的实体类型")
    if not await _check_perm(db, current_user, perm):
        raise HTTPException(status_code=403, detail="权限不足")

    # Special handling for user restore: check username uniqueness
    if entity_type == "user":
        existing = await crud_get_user_by_username(db, entity_data.get("username", ""))
        if existing and existing.get("id") != entity_id:
            raise HTTPException(status_code=400, detail=f"用户名「{entity_data['username']}」已存在，无法恢复")

    # Special handling for agent: check if it's a built-in that was soft-deleted
    if entity_type == "agent":
        existing = await crud_get_agent_include_deleted(db, entity_id)
        if existing and existing.get("is_deleted"):
            await crud_update_agent(db, entity_id, {"is_deleted": False})
            await crud_delete_recycle_item(db, item_id)
            await db.commit()
            return {"status": "ok", "entity_id": entity_id, "entity_type": entity_type}

    # Restore by creating the entity back
    if entity_type == "agent":
        await crud_create_agent(db, entity_data)
    elif entity_type == "skill":
        await crud_create_skill(db, entity_data)
    elif entity_type == "knowledge":
        await crud_create_knowledge(db, entity_data)
    elif entity_type == "department":
        await crud_create_department(db, entity_data)
    elif entity_type == "user":
        await crud_create_user(db, entity_data)
    elif entity_type == "wiki":
        subtype = entity_data.get("_wiki_subtype", "space")
        restore_data = {k: v for k, v in entity_data.items() if not k.startswith("_")}

        # Cascade: if restoring a page/source, check if parent space needs restoring too
        if subtype in ("page", "source"):
            space_id = restore_data.get("space_id", "")
            if space_id:
                # Check if the parent space is also in the recycle bin
                recycle_items = await crud_list_recycle_bin(db, entity_type="wiki")
                for ri in recycle_items:
                    ri_data = ri.get("entity_data", {})
                    if ri_data.get("_wiki_subtype") == "space" and ri_data.get("id") == space_id:
                        space_restore = {k: v for k, v in ri_data.items() if not k.startswith("_")}
                        await crud_create_wiki_space(db, space_restore)
                        await crud_delete_recycle_item(db, ri["id"])
                        break

        if subtype == "page":
            await crud_create_wiki_page(db, restore_data)
        elif subtype == "source":
            await crud_create_wiki_source(db, restore_data)
        else:
            await crud_create_wiki_space(db, restore_data)
    # roles cannot be restored (builtin check)

    await crud_delete_recycle_item(db, item_id)
    await db.commit()
    return {"status": "ok", "entity_id": entity_id, "entity_type": entity_type}


@router.delete("/{item_id}")
async def permanent_delete_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await crud_get_recycle_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="回收站条目不存在")

    entity_type = item.get("entity_type", "")
    perm = ENTITY_DELETE_PERMISSIONS.get(entity_type)
    if not perm:
        raise HTTPException(status_code=400, detail="未知的实体类型")
    if not await _check_perm(db, current_user, perm):
        raise HTTPException(status_code=403, detail="权限不足")

    await crud_delete_recycle_item(db, item_id)
    await db.commit()
    return {"status": "ok"}


@router.delete("/")
async def clear_recycle_bin(
    entity_type: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = await crud_list_recycle_bin(db, entity_type=entity_type)

    # Check permissions for entity types present
    entity_types = {item.get("entity_type") for item in items}
    for et in entity_types:
        perm = ENTITY_DELETE_PERMISSIONS.get(et)
        if perm and not await _check_perm(db, current_user, perm):
            raise HTTPException(status_code=403, detail=f"权限不足（{ENTITY_LABELS.get(et, et)}）")

    for item in items:
        await crud_delete_recycle_item(db, item["id"])
    await db.commit()
    return {"status": "ok"}
