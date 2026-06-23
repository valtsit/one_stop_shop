import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import get_current_user, require_permission
from ..core.database import get_db
from ..core.crud import (
    list_departments as crud_list_departments,
    get_department as crud_get_department,
    create_department as crud_create_department,
    update_department as crud_update_department,
    delete_department as crud_delete_department,
    create_recycle_item,
)
from ..models.schemas import DepartmentCreate, DepartmentResponse, DepartmentTree

router = APIRouter(prefix="/api/departments", tags=["departments"])


def _build_tree(dept_list: list[dict]) -> list[dict]:
    dept_map: dict[str, dict] = {}
    roots: list[dict] = []

    for dept in dept_list:
        dept_map[dept["id"]] = {**dept, "children": []}

    for dept in dept_list:
        node = dept_map[dept["id"]]
        parent_id = dept.get("parent_id")
        if parent_id and parent_id in dept_map:
            dept_map[parent_id]["children"].append(node)
        else:
            roots.append(node)

    def sort_children(nodes: list[dict]):
        nodes.sort(key=lambda n: n.get("sort_order", 0))
        for node in nodes:
            sort_children(node["children"])

    sort_children(roots)
    return roots


@router.get("/")
async def list_departments(
    tree: bool = False,
    current_user: dict = Depends(require_permission("department:read")),
    db: AsyncSession = Depends(get_db),
):
    departments = await crud_list_departments(db)
    if tree:
        return _build_tree(departments)
    return departments


@router.get("/{dept_id}")
async def get_department(
    dept_id: str,
    current_user: dict = Depends(require_permission("department:read")),
    db: AsyncSession = Depends(get_db),
):
    dept = await crud_get_department(db, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="部门不存在")
    return dept


@router.post("/", response_model=DepartmentResponse)
async def create_department(
    dept: DepartmentCreate,
    current_user: dict = Depends(require_permission("department:create")),
    db: AsyncSession = Depends(get_db),
):
    dept_id = "dept_" + str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    dept_data = dept.model_dump()
    dept_data["id"] = dept_id
    dept_data["created_at"] = now
    dept_data["updated_at"] = now
    result = await crud_create_department(db, dept_data)
    await db.commit()
    return DepartmentResponse(**result)


@router.put("/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: str,
    dept: DepartmentCreate,
    current_user: dict = Depends(require_permission("department:update")),
    db: AsyncSession = Depends(get_db),
):
    existing = await crud_get_department(db, dept_id)
    if not existing:
        raise HTTPException(status_code=404, detail="部门不存在")
    if dept.parent_id == dept_id:
        raise HTTPException(status_code=400, detail="不能将部门设为自己的上级")
    dept_data = dept.model_dump()
    dept_data["id"] = dept_id
    dept_data["created_at"] = existing.get("created_at", datetime.now().isoformat())
    dept_data["updated_at"] = datetime.now().isoformat()
    result = await crud_update_department(db, dept_id, dept_data)
    await db.commit()
    return DepartmentResponse(**result)


@router.delete("/{dept_id}")
async def delete_department(
    dept_id: str,
    current_user: dict = Depends(require_permission("department:delete")),
    db: AsyncSession = Depends(get_db),
):
    dept = await crud_get_department(db, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="部门不存在")
    await create_recycle_item(db, {
        "entity_type": "department",
        "entity_id": dept_id,
        "entity_data": dept,
        "deleted_by": current_user.get("id", ""),
        "deleted_at": datetime.now().isoformat(),
    })
    # Promote children to root level (set parent_id to None)
    all_depts = await crud_list_departments(db)
    for d in all_depts:
        if d.get("parent_id") == dept_id:
            await crud_update_department(db, d["id"], {"parent_id": None})
    await crud_delete_department(db, dept_id)
    await db.commit()
    return {"status": "ok"}
