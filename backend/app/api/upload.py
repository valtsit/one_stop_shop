import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, HTTPException, Depends
from ..core.config import settings
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {
    # Images
    ".jpg", ".jpeg", ".png", ".webp", ".gif",
    # Documents
    ".pdf", ".docx", ".doc", ".txt", ".md", ".rtf",
    # Spreadsheets
    ".xlsx", ".csv", ".xlsm",
}


@router.post("/")
async def upload_file(
    file: UploadFile,
    current_user: dict = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="未选择文件")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式: {ext}",
        )

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超出限制（最大 {settings.MAX_UPLOAD_SIZE // (1024*1024)}MB）",
        )

    # Save with unique name
    unique_name = f"{uuid.uuid4().hex[:12]}{ext}"
    file_path = settings.UPLOAD_DIR / unique_name
    file_path.write_bytes(content)

    return {
        "filename": file.filename,
        "path": f"/uploads/{unique_name}",
        "size": len(content),
        "type": ext,
    }
