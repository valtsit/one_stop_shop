import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.schemas import SkillCreate, SkillUpdate, SkillResponse, SkillStructure
from ..core.auth import get_current_user, require_permission
from ..core.database import get_db
from ..core.config import settings
from ..core.crud import (
    list_skills as crud_list_skills,
    get_skill as crud_get_skill,
    create_skill as crud_create_skill,
    update_skill as crud_update_skill,
    delete_skill as crud_delete_skill,
    create_recycle_item,
)

router = APIRouter(prefix="/api/skills", tags=["skills"])

SUBDIRS = {"references", "scripts", "assets"}


def _get_skill_structure(skill_id: str) -> SkillStructure:
    """Build folder structure info for a skill."""
    skill_dir = settings.SKILLS_DIR / skill_id
    if not skill_dir.exists():
        return SkillStructure()

    data: dict = {"skill_md": (skill_dir / "SKILL.md").exists()}
    for subdir in SUBDIRS:
        subdir_path = skill_dir / subdir
        if subdir_path.exists():
            data[subdir] = sorted(f.name for f in subdir_path.iterdir() if f.is_file())
        else:
            data[subdir] = []
    return SkillStructure(**data)


def _read_skill_content(skill_id: str) -> str:
    """Read SKILL.md + references/*.md and concatenate."""
    skill_dir = settings.SKILLS_DIR / skill_id
    if not skill_dir.exists():
        return ""

    parts = []
    skill_md = skill_dir / "SKILL.md"
    if skill_md.exists():
        parts.append(skill_md.read_text(encoding="utf-8"))

    refs_dir = skill_dir / "references"
    if refs_dir.exists():
        for ref_file in sorted(refs_dir.iterdir()):
            if ref_file.is_file() and ref_file.suffix.lower() == ".md":
                parts.append(ref_file.read_text(encoding="utf-8"))

    return "\n\n".join(parts)


@router.get("/", response_model=list[SkillResponse])
async def list_skills(
    current_user: dict = Depends(require_permission("skill:read")),
    db: AsyncSession = Depends(get_db),
):
    skills = await crud_list_skills(db)
    result = []
    for s in skills:
        resp = SkillResponse(
            id=s["id"],
            name=s["name"],
            description=s.get("description", ""),
            created_at=s.get("created_at", ""),
            updated_at=s.get("updated_at", ""),
            structure=_get_skill_structure(s["id"]),
        )
        result.append(resp)
    return result


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(
    skill_id: str,
    current_user: dict = Depends(require_permission("skill:read")),
    db: AsyncSession = Depends(get_db),
):
    skill = await crud_get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill不存在")
    return SkillResponse(
        id=skill["id"],
        name=skill["name"],
        description=skill.get("description", ""),
        created_at=skill.get("created_at", ""),
        updated_at=skill.get("updated_at", ""),
        structure=_get_skill_structure(skill["id"]),
    )


@router.post("/", response_model=SkillResponse)
async def create_skill(
    skill: SkillCreate,
    current_user: dict = Depends(require_permission("skill:create")),
    db: AsyncSession = Depends(get_db),
):
    skill_id = "skill_" + str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    skill_data = skill.model_dump()
    skill_data["id"] = skill_id
    skill_data["created_at"] = now
    skill_data["updated_at"] = now
    result = await crud_create_skill(db, skill_data)
    await db.commit()
    return SkillResponse(
        id=result["id"],
        name=result["name"],
        description=result.get("description", ""),
        created_at=result["created_at"],
        updated_at=result["updated_at"],
        structure=_get_skill_structure(result["id"]),
    )


@router.put("/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: str,
    data: SkillUpdate,
    current_user: dict = Depends(require_permission("skill:update")),
    db: AsyncSession = Depends(get_db),
):
    existing = await crud_get_skill(db, skill_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Skill不存在")

    update_data = {}
    if data.name:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    update_data["updated_at"] = datetime.now().isoformat()

    result = await crud_update_skill(db, skill_id, update_data)

    # Write SKILL.md if provided
    skill_md = data.skill_md
    if skill_md is not None:
        skill_dir = settings.SKILLS_DIR / skill_id
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")

    await db.commit()
    return SkillResponse(
        id=result["id"],
        name=result["name"],
        description=result.get("description", ""),
        created_at=result["created_at"],
        updated_at=result["updated_at"],
        structure=_get_skill_structure(result["id"]),
    )


@router.delete("/{skill_id}")
async def delete_skill(
    skill_id: str,
    current_user: dict = Depends(require_permission("skill:delete")),
    db: AsyncSession = Depends(get_db),
):
    skill = await crud_get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill不存在")
    await create_recycle_item(db, {
        "entity_type": "skill",
        "entity_id": skill_id,
        "entity_data": skill,
        "deleted_by": current_user.get("id", ""),
    })
    await crud_delete_skill(db, skill_id)
    await db.commit()
    return {"status": "ok"}


# ---- Content resolution ----

@router.post("/batch-content")
async def batch_get_skill_content(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk resolve skill contents by ID list.

    Reads SKILL.md + references/*.md for each skill and concatenates.
    """
    skill_ids = body.get("skill_ids", [])
    contents: dict[str, str] = {}
    for skill_id in skill_ids:
        text = _read_skill_content(skill_id)
        if text:
            contents[skill_id] = text
    return {"contents": contents}


# ---- Import folder ----

@router.post("/import-folder")
async def import_skill_folder(
    name: str = Form(...),
    description: str = Form(""),
    files: list[UploadFile] = File(default_factory=list),
    paths: list[str] = Form(default_factory=list),
    current_user: dict = Depends(require_permission("skill:create")),
    db: AsyncSession = Depends(get_db),
):
    """Import a skill from a folder upload.

    Receives multiple files with their relative paths inside the skill folder.
    Creates a new skill and writes files to the correct subdirectories.
    Must include a SKILL.md file at the root.
    """
    files = files or []
    paths = paths or []
    if not files or not paths:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) != len(paths):
        raise HTTPException(status_code=400, detail="Files and paths count mismatch")

    # Validate SKILL.md exists at root
    has_skill_md = any(p == "SKILL.md" or p.endswith("/SKILL.md") for p in paths)
    if not has_skill_md:
        raise HTTPException(status_code=400, detail="导入失败：文件夹中必须包含 SKILL.md 文件")

    # Create skill record
    skill_id = "skill_" + str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    skill_data = {
        "id": skill_id,
        "name": name,
        "description": description,
        "created_at": now,
        "updated_at": now,
    }
    result = await crud_create_skill(db, skill_data)
    await db.commit()

    # Write files according to paths
    skill_dir = settings.SKILLS_DIR / skill_id
    for file, path in zip(files, paths):
        # Security: normalize and validate path
        safe_path = Path(path).as_posix()
        if safe_path.startswith("..") or "/../" in safe_path:
            continue
        target = skill_dir / safe_path
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            contents = await file.read()
            target.write_bytes(contents)
        except Exception:
            pass

    return SkillResponse(
        id=result["id"],
        name=result["name"],
        description=result.get("description", ""),
        created_at=result["created_at"],
        updated_at=result["updated_at"],
        structure=_get_skill_structure(result["id"]),
    )


# ---- File management within skill folder ----

@router.post("/{skill_id}/upload")
async def upload_skill_file(
    skill_id: str,
    subdir: str = Query(..., description="subdirectory: references | scripts | assets"),
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("skill:update")),
    db: AsyncSession = Depends(get_db),
):
    if subdir not in SUBDIRS:
        raise HTTPException(status_code=400, detail=f"Invalid subdir. Must be one of: {', '.join(SUBDIRS)}")

    skill = await crud_get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill不存在")

    skill_dir = settings.SKILLS_DIR / skill_id
    target_dir = skill_dir / subdir
    target_dir.mkdir(parents=True, exist_ok=True)

    # Sanitize filename
    safe_name = Path(file.filename or "unnamed").name
    if "/" in safe_name or "\\" in safe_name or ".." in safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = target_dir / safe_name
    try:
        contents = await file.read()
        file_path.write_bytes(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    return {"status": "ok", "path": f"{subdir}/{safe_name}"}


@router.delete("/{skill_id}/files")
async def delete_skill_file(
    skill_id: str,
    path: str = Query(..., description="Relative path inside skill folder, e.g. references/foo.md"),
    current_user: dict = Depends(require_permission("skill:delete")),
    db: AsyncSession = Depends(get_db),
):
    skill = await crud_get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill不存在")

    skill_dir = settings.SKILLS_DIR / skill_id
    file_path = skill_dir / path

    # Security: ensure the resolved path is inside the skill directory
    try:
        resolved = file_path.resolve()
        resolved_skill_dir = skill_dir.resolve()
        if not str(resolved).startswith(str(resolved_skill_dir)):
            raise HTTPException(status_code=400, detail="Invalid path")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        file_path.unlink()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")

    return {"status": "ok"}


@router.get("/{skill_id}/files")
async def get_skill_file(
    skill_id: str,
    path: str = Query(..., description="Relative path inside skill folder, e.g. references/foo.md"),
    current_user: dict = Depends(require_permission("skill:read")),
    db: AsyncSession = Depends(get_db),
):
    skill = await crud_get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill不存在")

    skill_dir = settings.SKILLS_DIR / skill_id
    file_path = skill_dir / path

    try:
        resolved = file_path.resolve()
        resolved_skill_dir = skill_dir.resolve()
        if not str(resolved).startswith(str(resolved_skill_dir)):
            raise HTTPException(status_code=400, detail="Invalid path")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception:
        content = file_path.read_bytes().decode("utf-8", errors="replace")

    return {"content": content}


@router.post("/{skill_id}/files")
@router.put("/{skill_id}/files")
async def update_skill_file(
    skill_id: str,
    path: str = Query(..., description="Relative path inside skill folder, e.g. references/foo.md"),
    content: str = Form(...),
    current_user: dict = Depends(require_permission("skill:update")),
    db: AsyncSession = Depends(get_db),
):
    skill = await crud_get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill不存在")

    skill_dir = settings.SKILLS_DIR / skill_id
    file_path = skill_dir / path

    try:
        resolved = file_path.resolve()
        resolved_skill_dir = skill_dir.resolve()
        if not str(resolved).startswith(str(resolved_skill_dir)):
            raise HTTPException(status_code=400, detail="Invalid path")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"保存文件失败: {type(e).__name__}: {e}")

    return {"status": "ok"}
