import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import get_current_user
from ..models.schemas import DepartmentCreate, DepartmentResponse, DepartmentTree

router = APIRouter(prefix="/api/departments", tags=["departments"])

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DEPARTMENTS_FILE = DATA_DIR / "departments.json"


def _load_departments() -> dict[str, dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if DEPARTMENTS_FILE.exists():
        try:
            data = json.loads(DEPARTMENTS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, Exception):
            pass
    return {}


def _save_departments(departments: dict[str, dict]):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DEPARTMENTS_FILE.write_text(
        json.dumps(departments, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _build_tree(departments: dict[str, dict]) -> list[dict]:
    dept_list = list(departments.values())
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
    tree: bool = False, current_user: dict = Depends(get_current_user)
):
    departments = _load_departments()
    if tree:
        return _build_tree(departments)
    return list(departments.values())


@router.get("/{dept_id}")
async def get_department(dept_id: str, current_user: dict = Depends(get_current_user)):
    departments = _load_departments()
    dept = departments.get(dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="部门不存在")
    return dept


@router.post("/", response_model=DepartmentResponse)
async def create_department(
    dept: DepartmentCreate, current_user: dict = Depends(get_current_user)
):
    departments = _load_departments()
    dept_id = "dept_" + str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    dept_data = dept.model_dump()
    dept_data["id"] = dept_id
    dept_data["created_at"] = now
    dept_data["updated_at"] = now
    departments[dept_id] = dept_data
    _save_departments(departments)
    return DepartmentResponse(**dept_data)


@router.put("/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: str,
    dept: DepartmentCreate,
    current_user: dict = Depends(get_current_user),
):
    departments = _load_departments()
    if dept_id not in departments:
        raise HTTPException(status_code=404, detail="部门不存在")
    # Prevent setting parent to self
    if dept.parent_id == dept_id:
        raise HTTPException(status_code=400, detail="不能将部门设为自己的上级")
    dept_data = dept.model_dump()
    dept_data["id"] = dept_id
    dept_data["created_at"] = departments[dept_id].get(
        "created_at", datetime.now().isoformat()
    )
    dept_data["updated_at"] = datetime.now().isoformat()
    departments[dept_id] = dept_data
    _save_departments(departments)
    return DepartmentResponse(**dept_data)


@router.delete("/{dept_id}")
async def delete_department(
    dept_id: str, current_user: dict = Depends(get_current_user)
):
    departments = _load_departments()
    if dept_id not in departments:
        raise HTTPException(status_code=404, detail="部门不存在")
    # Promote children to root level (set parent_id to null)
    for dept in departments.values():
        if dept.get("parent_id") == dept_id:
            dept["parent_id"] = None
    del departments[dept_id]
    _save_departments(departments)
    return {"status": "ok"}
