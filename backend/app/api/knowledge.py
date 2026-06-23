import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.schemas import KnowledgeCreate, KnowledgeResponse
from ..core.auth import get_current_user, require_permission, _check_permission
from ..core.database import get_db
from ..core.crud import (
    list_knowledge as crud_list_knowledge,
    get_knowledge as crud_get_knowledge,
    create_knowledge as crud_create_knowledge,
    update_knowledge as crud_update_knowledge,
    delete_knowledge as crud_delete_knowledge,
    create_recycle_item,
    list_pending_submissions_by_kb,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/", response_model=list[KnowledgeResponse])
async def list_knowledge(
    current_user: dict = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db),
):
    items = await crud_list_knowledge(db)
    return [KnowledgeResponse(**v) for v in items]


@router.get("/{item_id}", response_model=KnowledgeResponse)
async def get_knowledge(
    item_id: str,
    current_user: dict = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db),
):
    item = await crud_get_knowledge(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="知识库条目不存在")
    # Include pending cell submissions for table entries
    pending_cells = []
    if item.get("format") == "table":
        subs = await list_pending_submissions_by_kb(db, item_id)
        print(f"[DEBUG get_knowledge] kb_id={item_id} pending subs count={len(subs)}")
        for sub in subs:
            # Only include cell-fill submissions (no row_values = cell fill, target_row >= 0)
            row_val = sub.get("row_values")
            tr = sub.get("target_row", -1)
            print(f"[DEBUG get_knowledge] sub={sub.get('id')} row_values={row_val!r} target_row={tr} status={sub.get('status')}")
            if (row_val is None or row_val == []) and tr is not None and int(tr) >= 0:
                pending_cells.append({
                    "row": int(tr),
                    "col": int(sub.get("target_column", 0)),
                    "text": sub.get("selected_text", ""),
                    "submitted_by": sub.get("submitted_by", ""),
                    "submitted_by_name": sub.get("submitted_by_name", ""),
                    "created_at": sub.get("created_at", ""),
                })
    print(f"[DEBUG get_knowledge] kb_id={item_id} returning pending_cells={pending_cells}")
    result = dict(item)
    result["pending_cells"] = pending_cells
    return KnowledgeResponse(**result)


@router.post("/", response_model=KnowledgeResponse)
async def create_knowledge(
    item: KnowledgeCreate,
    current_user: dict = Depends(require_permission("knowledge:create")),
    db: AsyncSession = Depends(get_db),
):
    item_id = "kb_" + str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    data = item.model_dump()
    data["id"] = item_id
    data["created_at"] = now
    data["updated_at"] = now
    result = await crud_create_knowledge(db, data)
    await db.commit()
    return KnowledgeResponse(**result)


@router.put("/{item_id}", response_model=KnowledgeResponse)
async def update_knowledge(
    item_id: str,
    item: KnowledgeCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await crud_get_knowledge(db, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="知识库条目不存在")
    has_update_perm = await _check_permission(current_user, "knowledge:update", db)
    print(f"[PUT knowledge] user={current_user.get('username')} has_update_perm={has_update_perm} skip_review={existing.get('skip_review')} format={existing.get('format')}")
    if not has_update_perm:
        # Content-only edit for skip_review entries
        if not existing.get("skip_review"):
            print(f"[PUT knowledge] BLOCKED: no perm and skip_review={existing.get('skip_review')}")
            raise HTTPException(status_code=403, detail="该条目未开启免审核，无法直接编辑")
        update_data: dict = {"updated_at": datetime.now().isoformat()}
        if existing.get("format") == "table":
            update_data["rows"] = item.rows
        else:
            update_data["content"] = item.content
        print(f"[PUT knowledge] content-only update: {list(update_data.keys())}")
        result = await crud_update_knowledge(db, item_id, update_data)
        await db.commit()
        print(f"[PUT knowledge] content-only update SUCCESS")
        return KnowledgeResponse(**result)
    data = item.model_dump()
    data["id"] = item_id
    data["created_at"] = existing.get("created_at", datetime.now().isoformat())
    data["updated_at"] = datetime.now().isoformat()
    result = await crud_update_knowledge(db, item_id, data)
    await db.commit()
    return KnowledgeResponse(**result)


@router.delete("/{item_id}")
async def delete_knowledge(
    item_id: str,
    current_user: dict = Depends(require_permission("knowledge:delete")),
    db: AsyncSession = Depends(get_db),
):
    item = await crud_get_knowledge(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="知识库条目不存在")
    await create_recycle_item(db, {
        "entity_type": "knowledge",
        "entity_id": item_id,
        "entity_data": item,
        "deleted_by": current_user.get("id", ""),
    })
    await crud_delete_knowledge(db, item_id)
    await db.commit()
    return {"status": "ok"}
