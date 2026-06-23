import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import get_current_user, require_permission
from ..core.crud import get_settings as crud_get_settings, update_settings as crud_update_settings
from ..core.database import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_SETTINGS = {
    "providers": {
        "openai": {
            "api_key": "",
            "base_url": "https://api.openai.com/v1",
            "enabled": True,
        },
        "claude": {
            "api_key": "",
            "base_url": "https://api.anthropic.com",
            "enabled": True,
        },
        "gemini": {
            "api_key": "",
            "base_url": "",
            "enabled": True,
        },
        "deepseek": {
            "api_key": "",
            "base_url": "https://api.deepseek.com",
            "enabled": True,
        },
    },
    "default_provider": "openai",
    "default_model": "gpt-4o",
    "temperature": 0.7,
    "max_tokens": 4096,
    "custom_models": [],
    "memory_dir": "./data/conversations",
    "recycle_bin_days": 30,
}


class ProviderSettings(BaseModel):
    api_key: str = ""
    base_url: str = ""
    enabled: bool = True


class CustomModel(BaseModel):
    id: str = ""
    provider: str = "openai"
    model: str = ""
    label: str = ""
    base_url: str = ""
    api_key: str = ""
    max_tokens: int = 4096
    headers: dict[str, str] = {}


class AppSettings(BaseModel):
    providers: dict[str, ProviderSettings] = {}
    default_provider: str = "openai"
    default_model: str = "gpt-4o"
    temperature: float = 0.7
    max_tokens: int = 4096
    custom_models: list[CustomModel] = []
    memory_dir: str = "./data/conversations"
    recycle_bin_days: int = 30


@router.get("")
async def get_settings(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await crud_get_settings(db)
    # Strip API keys for non-admin users
    role_id = current_user.get("role_id", "")
    is_admin = role_id in ("role_super_admin", "role_admin")
    if not is_admin:
        providers = data.get("providers", {})
        for prov in providers.values():
            if isinstance(prov, dict) and "api_key" in prov:
                prov["api_key"] = ""
    return data


@router.put("")
async def update_settings(
    body: AppSettings,
    current_user: dict = Depends(require_permission("settings:update")),
    db: AsyncSession = Depends(get_db),
):
    existing = await crud_get_settings(db)
    data = body.model_dump()
    data["providers"] = {
        k: v.model_dump() if hasattr(v, "model_dump") else v
        for k, v in data["providers"].items()
    }
    # Preserve custom_models if not included in update
    if not data.get("custom_models"):
        data["custom_models"] = existing.get("custom_models", [])
    await crud_update_settings(db, data)
    await db.commit()
    return {"status": "ok"}


@router.get("/models")
async def list_models(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return user custom models only (api_key stripped)."""
    settings = await crud_get_settings(db)
    custom = settings.get("custom_models", [])
    # Strip api_key from model configs for non-admin
    role_id = current_user.get("role_id", "")
    is_admin = role_id in ("role_super_admin", "role_admin")
    results = []
    for m in custom:
        entry = {**m, "builtin": False}
        if not is_admin and entry.get("api_key"):
            entry["api_key"] = ""
        results.append(entry)
    return results


# ---- Custom model CRUD ----

@router.post("/models/custom")
async def add_custom_model(
    body: CustomModel,
    current_user: dict = Depends(require_permission("settings:update")),
    db: AsyncSession = Depends(get_db),
):
    settings = await crud_get_settings(db)
    model_id = body.id or uuid.uuid4().hex[:8]
    new_model = body.model_dump()
    new_model["id"] = model_id
    settings.setdefault("custom_models", []).append(new_model)
    await crud_update_settings(db, settings)
    await db.commit()
    return new_model


@router.put("/models/custom/{model_id}")
async def update_custom_model(
    model_id: str,
    body: CustomModel,
    current_user: dict = Depends(require_permission("settings:update")),
    db: AsyncSession = Depends(get_db),
):
    settings = await crud_get_settings(db)
    models = settings.get("custom_models", [])
    for i, m in enumerate(models):
        if m.get("id") == model_id:
            updated = body.model_dump()
            updated["id"] = model_id
            models[i] = updated
            await crud_update_settings(db, settings)
            await db.commit()
            return updated
    raise HTTPException(status_code=404, detail="模型不存在")


@router.delete("/models/custom/{model_id}")
async def delete_custom_model(
    model_id: str,
    current_user: dict = Depends(require_permission("settings:update")),
    db: AsyncSession = Depends(get_db),
):
    settings = await crud_get_settings(db)
    models = settings.get("custom_models", [])
    settings["custom_models"] = [m for m in models if m.get("id") != model_id]
    await crud_update_settings(db, settings)
    await db.commit()
    return {"status": "ok"}


@router.post("/models/test")
async def test_model(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Test if a model config works by sending a minimal request."""
    from ..adapters import get_adapter
    from ..models.schemas import ModelProvider

    provider = body.get("provider", "openai")
    model = body.get("model", "gpt-4o")
    api_key = body.get("api_key", "")
    base_url = body.get("base_url", "")
    extra_headers = body.get("headers") or {}

    if not api_key:
        # Try from saved settings
        settings = await crud_get_settings(db)
        provider_conf = settings.get("providers", {}).get(provider, {})
        api_key = provider_conf.get("api_key", "")
        # Also check custom models
        for cm in settings.get("custom_models", []):
            if cm.get("model") == model and cm.get("api_key"):
                api_key = cm["api_key"]
                if cm.get("base_url"):
                    base_url = cm["base_url"]
                if cm.get("headers"):
                    extra_headers.update(cm["headers"])

    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key")

    try:
        provider_enum = ModelProvider(provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的 provider: {provider}")

    # For "compatible" providers (deepseek, gemini), use OpenAI adapter
    # since most third-party proxies speak OpenAI-compatible API
    if provider in ("deepseek", "gemini"):
        provider_enum = ModelProvider.OPENAI

    adapter = get_adapter(provider_enum)

    test_messages = [{"role": "user", "content": "Hi, reply with 'OK' only."}]

    try:
        content = ""
        async for chunk, usage, thinking in adapter.chat_stream(
            api_messages=test_messages,
            model=model,
            api_key=api_key,
            base_url=base_url or None,
            extra_headers=extra_headers or None,
        ):
            content += chunk
            if content:
                break
        return {"status": "ok", "message": "连接成功", "preview": content[:100]}
    except Exception as e:
        return {"status": "error", "message": str(e)[:200]}
