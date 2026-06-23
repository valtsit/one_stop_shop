"""Wiki knowledge base API endpoints."""

import uuid
from datetime import datetime
import httpx
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.schemas import (
    WikiSpaceCreate, WikiSpaceResponse,
    WikiPageCreate, WikiPageResponse, WikiPageBrief,
    WikiSourceCreate, WikiSourceResponse,
    WikiPageReferenceResponse, WikiLogResponse,
    WikiIngestRequest, WikiQueryRequest, WikiQueryResponse,
    WikiLintRequest, WikiLintResponse,
)
from ..core.auth import get_current_user, require_permission
from ..core.database import get_db
from ..core.crud import (
    get_wiki_space, list_wiki_spaces, create_wiki_space,
    update_wiki_space, delete_wiki_space,
    get_wiki_page, list_wiki_pages, create_wiki_page,
    update_wiki_page, delete_wiki_page,
    get_wiki_source, list_wiki_sources, create_wiki_source,
    delete_wiki_source,
    get_references_for_page, delete_references_for_page,
    list_wiki_logs,
    create_recycle_item,
)
from ..services.wiki_service import ai_ingest, ai_query, ai_lint, log_entry

router = APIRouter(prefix="/api/wiki", tags=["wiki"])


def _now() -> str:
    return datetime.now().isoformat()


# ---- Wiki Spaces ----

@router.get("/spaces", response_model=list[WikiSpaceResponse])
async def list_spaces(
    current_user: dict = Depends(require_permission("wiki:read")),
    db: AsyncSession = Depends(get_db),
):
    items = await list_wiki_spaces(db)
    return [WikiSpaceResponse(**i) for i in items]


@router.get("/spaces/{space_id}", response_model=WikiSpaceResponse)
async def get_space(
    space_id: str,
    current_user: dict = Depends(require_permission("wiki:read")),
    db: AsyncSession = Depends(get_db),
):
    item = await get_wiki_space(db, space_id)
    if not item:
        raise HTTPException(status_code=404, detail="知识空间不存在")
    return WikiSpaceResponse(**item)


@router.post("/spaces", response_model=WikiSpaceResponse)
async def create_space(
    body: WikiSpaceCreate,
    current_user: dict = Depends(require_permission("wiki:create")),
    db: AsyncSession = Depends(get_db),
):
    space_id = "wsp_" + uuid.uuid4().hex[:8]
    now = _now()
    data = body.model_dump()
    data["id"] = space_id
    data["created_by"] = current_user.get("id", "")
    data["created_at"] = now
    data["updated_at"] = now
    result = await create_wiki_space(db, data)
    # Create initial index page
    from ..services.wiki_service import rebuild_index_page
    await rebuild_index_page(db, space_id)
    await log_entry(db, space_id, "create", f"创建知识空间：{body.name}", performed_by=current_user.get("id", ""))
    await db.commit()
    return WikiSpaceResponse(**result)


@router.put("/spaces/{space_id}", response_model=WikiSpaceResponse)
async def update_space(
    space_id: str,
    body: WikiSpaceCreate,
    current_user: dict = Depends(require_permission("wiki:update")),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_wiki_space(db, space_id)
    if not existing:
        raise HTTPException(status_code=404, detail="知识空间不存在")
    data = body.model_dump()
    data["updated_at"] = _now()
    result = await update_wiki_space(db, space_id, data)
    await db.commit()
    return WikiSpaceResponse(**result)


@router.delete("/spaces/{space_id}")
async def delete_space(
    space_id: str,
    current_user: dict = Depends(require_permission("wiki:delete")),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_wiki_space(db, space_id)
    if not existing:
        raise HTTPException(status_code=404, detail="知识空间不存在")
    # Add to recycle bin
    entity_data = {**existing, "_wiki_subtype": "space"}
    await create_recycle_item(db, {
        "entity_type": "wiki",
        "entity_id": space_id,
        "entity_data": entity_data,
        "deleted_by": current_user.get("id", ""),
    })
    # Delete all child pages, sources, references, logs
    pages = await list_wiki_pages(db, space_id)
    for p in pages:
        await delete_references_for_page(db, p["id"])
        await delete_wiki_page(db, p["id"])
    sources = await list_wiki_sources(db, space_id)
    for s in sources:
        await delete_wiki_source(db, s["id"])
    await delete_wiki_space(db, space_id)
    await db.commit()
    return {"status": "ok"}


# ---- Wiki Pages ----

@router.get("/spaces/{space_id}/pages", response_model=list[WikiPageBrief])
async def list_space_pages(
    space_id: str,
    current_user: dict = Depends(require_permission("wiki:read")),
    db: AsyncSession = Depends(get_db),
):
    items = await list_wiki_pages(db, space_id)
    return [WikiPageBrief(**{k: v for k, v in i.items() if k != "content" and k != "source_ids"}) for i in items]


@router.get("/pages/{page_id}", response_model=WikiPageResponse)
async def get_page(
    page_id: str,
    current_user: dict = Depends(require_permission("wiki:read")),
    db: AsyncSession = Depends(get_db),
):
    item = await get_wiki_page(db, page_id)
    if not item:
        raise HTTPException(status_code=404, detail="页面不存在")
    return WikiPageResponse(**item)


@router.post("/pages", response_model=WikiPageResponse)
async def create_page(
    body: WikiPageCreate,
    current_user: dict = Depends(require_permission("wiki:create")),
    db: AsyncSession = Depends(get_db),
):
    from ..services.wiki_service import generate_slug, rebuild_index_page
    page_id = "wpg_" + uuid.uuid4().hex[:8]
    now = _now()
    data = body.model_dump()
    data["id"] = page_id
    data["slug"] = generate_slug(body.title)
    data["word_count"] = len(body.content)
    data["created_by"] = current_user.get("id", "")
    data["created_at"] = now
    data["updated_at"] = now
    result = await create_wiki_page(db, data)
    await rebuild_index_page(db, body.space_id)
    await log_entry(db, body.space_id, "create", f"创建页面：{body.title}", page_ids=[page_id], performed_by=current_user.get("id", ""))
    await db.commit()
    return WikiPageResponse(**result)


@router.put("/pages/{page_id}", response_model=WikiPageResponse)
async def update_page(
    page_id: str,
    body: WikiPageCreate,
    current_user: dict = Depends(require_permission("wiki:update")),
    db: AsyncSession = Depends(get_db),
):
    from ..services.wiki_service import generate_slug, rebuild_index_page
    existing = await get_wiki_page(db, page_id)
    if not existing:
        raise HTTPException(status_code=404, detail="页面不存在")
    data = body.model_dump()
    data["slug"] = generate_slug(body.title)
    data["word_count"] = len(body.content)
    data["updated_at"] = _now()
    result = await update_wiki_page(db, page_id, data)
    await rebuild_index_page(db, body.space_id)
    await log_entry(db, body.space_id, "edit", f"编辑页面：{body.title}", page_ids=[page_id], performed_by=current_user.get("id", ""))
    await db.commit()
    return WikiPageResponse(**result)


@router.delete("/pages/{page_id}")
async def delete_page(
    page_id: str,
    current_user: dict = Depends(require_permission("wiki:delete")),
    db: AsyncSession = Depends(get_db),
):
    from ..services.wiki_service import rebuild_index_page
    existing = await get_wiki_page(db, page_id)
    if not existing:
        raise HTTPException(status_code=404, detail="页面不存在")
    space_id = existing.get("space_id", "")
    title = existing.get("title", "")
    # Add to recycle bin
    entity_data = {**existing, "_wiki_subtype": "page"}
    await create_recycle_item(db, {
        "entity_type": "wiki",
        "entity_id": page_id,
        "entity_data": entity_data,
        "deleted_by": current_user.get("id", ""),
    })
    await delete_references_for_page(db, page_id)
    await delete_wiki_page(db, page_id)
    if space_id:
        await rebuild_index_page(db, space_id)
        await log_entry(db, space_id, "delete", f"删除页面：{title}", page_ids=[page_id], performed_by=current_user.get("id", ""))
    await db.commit()
    return {"status": "ok"}


@router.get("/pages/{page_id}/references", response_model=list[WikiPageReferenceResponse])
async def get_page_references(
    page_id: str,
    current_user: dict = Depends(require_permission("wiki:read")),
    db: AsyncSession = Depends(get_db),
):
    refs = await get_references_for_page(db, page_id)
    return [WikiPageReferenceResponse(**r) for r in refs]


# ---- Wiki Sources ----

@router.get("/spaces/{space_id}/sources", response_model=list[WikiSourceResponse])
async def list_space_sources(
    space_id: str,
    current_user: dict = Depends(require_permission("wiki:read")),
    db: AsyncSession = Depends(get_db),
):
    items = await list_wiki_sources(db, space_id)
    return [WikiSourceResponse(**i) for i in items]


@router.post("/sources/upload", response_model=WikiSourceResponse)
async def upload_source(
    file: UploadFile = File(...),
    space_id: str = Form(),
    current_user: dict = Depends(require_permission("wiki:create")),
    db: AsyncSession = Depends(get_db),
):
    from pathlib import Path
    from ..core.config import settings as app_config

    if not file.filename:
        raise HTTPException(status_code=400, detail="未选择文件")

    ext = Path(file.filename).suffix.lower()
    raw = await file.read()

    if len(raw) > app_config.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超出限制")

    unique_name = f"wiki_{uuid.uuid4().hex[:12]}{ext}"
    file_path = app_config.UPLOAD_DIR / unique_name
    file_path.write_bytes(raw)

    TEXT_EXTS = {".txt", ".md", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm", ".log"}
    content = ""
    if ext in TEXT_EXTS:
        for enc in ("utf-8", "gbk", "latin-1"):
            try:
                content = raw.decode(enc)
                break
            except (UnicodeDecodeError, LookupError):
                continue

    source_id = "wsrc_" + uuid.uuid4().hex[:8]
    data = {
        "id": source_id,
        "space_id": space_id,
        "title": file.filename,
        "content": content,
        "source_type": "file",
        "file_path": f"/uploads/{unique_name}",
        "source_metadata": {"filename": file.filename, "size": len(raw), "ext": ext},
        "created_by": current_user.get("id", ""),
        "created_at": _now(),
    }
    result = await create_wiki_source(db, data)
    await log_entry(db, space_id, "create", f"上传资料：{file.filename}", performed_by=current_user.get("id", ""))
    await db.commit()
    return WikiSourceResponse(**result)


@router.post("/sources", response_model=WikiSourceResponse)
async def create_source(
    body: WikiSourceCreate,
    current_user: dict = Depends(require_permission("wiki:create")),
    db: AsyncSession = Depends(get_db),
):
    source_id = "wsrc_" + uuid.uuid4().hex[:8]
    data = body.model_dump()
    data["id"] = source_id
    data["created_by"] = current_user.get("id", "")
    data["created_at"] = _now()
    result = await create_wiki_source(db, data)
    await log_entry(db, body.space_id, "create", f"添加资料：{body.title}", performed_by=current_user.get("id", ""))
    await db.commit()
    return WikiSourceResponse(**result)


@router.get("/sources/{source_id}/download")
async def download_source(
    source_id: str,
    current_user: dict = Depends(require_permission("wiki:create")),
    db: AsyncSession = Depends(get_db),
):
    from pathlib import Path
    from ..core.config import settings as app_config

    existing = await get_wiki_source(db, source_id)
    if not existing:
        raise HTTPException(status_code=404, detail="资料不存在")
    file_path = existing.get("file_path", "")
    if not file_path:
        raise HTTPException(status_code=400, detail="该资料没有可下载的文件")
    # file_path is like "/uploads/wiki_xxx.ext", resolve to disk path
    filename = Path(file_path).name
    disk_path = app_config.UPLOAD_DIR / filename
    if not disk_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    download_name = existing.get("source_metadata", {}).get("filename", filename)
    return FileResponse(str(disk_path), filename=download_name)


@router.delete("/sources/{source_id}")
async def delete_source(
    source_id: str,
    current_user: dict = Depends(require_permission("wiki:delete")),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_wiki_source(db, source_id)
    if not existing:
        raise HTTPException(status_code=404, detail="资料不存在")
    # Add to recycle bin
    entity_data = {**existing, "_wiki_subtype": "source"}
    await create_recycle_item(db, {
        "entity_type": "wiki",
        "entity_id": source_id,
        "entity_data": entity_data,
        "deleted_by": current_user.get("id", ""),
    })
    await delete_wiki_source(db, source_id)
    await db.commit()
    return {"status": "ok"}


# ---- AI Operations ----

@router.post("/ingest")
async def ingest_source(
    body: WikiIngestRequest,
    current_user: dict = Depends(require_permission("wiki:create")),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await ai_ingest(
            session=db,
            space_id=body.space_id,
            content=body.content,
            title=body.title,
            source_id=body.source_id,
            performed_by=current_user.get("id", "ai"),
            model=body.model,
            provider=body.provider,
            api_key=body.api_key,
            base_url=body.base_url,
        )
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        if code >= 500:
            raise HTTPException(status_code=502, detail=f"AI 服务端错误（HTTP {code}），请稍后重试或切换其他模型")
        raise HTTPException(status_code=502, detail=f"AI 服务返回错误（HTTP {code}）：{str(e)[:200]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 导入失败: {str(e)[:200]}")


@router.post("/query", response_model=WikiQueryResponse)
async def query_wiki(
    body: WikiQueryRequest,
    current_user: dict = Depends(require_permission("wiki:read")),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await ai_query(
            session=db,
            space_id=body.space_id,
            question=body.question,
            model=body.model,
            provider=body.provider,
            api_key=body.api_key,
            base_url=body.base_url,
        )
        await db.commit()
        return WikiQueryResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        if code >= 500:
            raise HTTPException(status_code=502, detail=f"AI 服务端错误（HTTP {code}），请稍后重试或切换其他模型")
        raise HTTPException(status_code=502, detail=f"AI 服务返回错误（HTTP {code}）：{str(e)[:200]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 问答失败: {str(e)[:200]}")


@router.post("/lint", response_model=WikiLintResponse)
async def lint_wiki(
    body: WikiLintRequest,
    current_user: dict = Depends(require_permission("wiki:update")),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await ai_lint(
            session=db,
            space_id=body.space_id,
            model=body.model,
            provider=body.provider,
            api_key=body.api_key,
            base_url=body.base_url,
        )
        await db.commit()
        return WikiLintResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        if code >= 500:
            raise HTTPException(status_code=502, detail=f"AI 服务端错误（HTTP {code}），请稍后重试或切换其他模型")
        raise HTTPException(status_code=502, detail=f"AI 服务返回错误（HTTP {code}）：{str(e)[:200]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 检查失败: {str(e)[:200]}")


# ---- Wiki Logs ----

@router.get("/spaces/{space_id}/logs", response_model=list[WikiLogResponse])
async def list_space_logs(
    space_id: str,
    current_user: dict = Depends(require_permission("wiki:read")),
    db: AsyncSession = Depends(get_db),
):
    items = await list_wiki_logs(db, space_id)
    return [WikiLogResponse(**i) for i in items]
