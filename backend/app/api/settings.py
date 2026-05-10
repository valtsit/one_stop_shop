import json
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_FILE = Path("./data/settings.json")

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
}

def _load_settings() -> dict:
    import copy
    defaults = copy.deepcopy(DEFAULT_SETTINGS)
    if SETTINGS_FILE.exists():
        try:
            data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            # Merge with defaults so missing fields get default values
            for key, default_val in defaults.items():
                if key not in data:
                    data[key] = default_val
                elif key == "providers" and isinstance(default_val, dict):
                    for prov, prov_defaults in default_val.items():
                        if prov not in data["providers"]:
                            data["providers"][prov] = prov_defaults
                        elif isinstance(prov_defaults, dict):
                            for field, field_default in prov_defaults.items():
                                if field not in data["providers"][prov]:
                                    data["providers"][prov][field] = field_default
            if "custom_models" not in data:
                data["custom_models"] = []
            return data
        except Exception:
            pass
    return copy.deepcopy(DEFAULT_SETTINGS)


def _save_settings(data: dict):
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


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


class AppSettings(BaseModel):
    providers: dict[str, ProviderSettings] = {}
    default_provider: str = "openai"
    default_model: str = "gpt-4o"
    temperature: float = 0.7
    max_tokens: int = 4096
    custom_models: list[CustomModel] = []
    memory_dir: str = "./data/conversations"


@router.get("")
async def get_settings():
    return _load_settings()


@router.put("")
async def update_settings(body: AppSettings):
    existing = _load_settings()
    data = body.model_dump()
    data["providers"] = {
        k: v.model_dump() if hasattr(v, "model_dump") else v
        for k, v in data["providers"].items()
    }
    # Preserve custom_models if not included in update
    if not data.get("custom_models"):
        data["custom_models"] = existing.get("custom_models", [])
    _save_settings(data)
    return {"status": "ok"}


@router.get("/models")
async def list_models():
    """Return user custom models only."""
    settings = _load_settings()
    custom = settings.get("custom_models", [])
    return [{**m, "builtin": False} for m in custom]


# ---- Custom model CRUD ----

@router.post("/models/custom")
async def add_custom_model(body: CustomModel):
    settings = _load_settings()
    model_id = body.id or uuid.uuid4().hex[:8]
    new_model = body.model_dump()
    new_model["id"] = model_id
    settings.setdefault("custom_models", []).append(new_model)
    _save_settings(settings)
    return new_model


@router.put("/models/custom/{model_id}")
async def update_custom_model(model_id: str, body: CustomModel):
    settings = _load_settings()
    models = settings.get("custom_models", [])
    for i, m in enumerate(models):
        if m.get("id") == model_id:
            updated = body.model_dump()
            updated["id"] = model_id
            models[i] = updated
            _save_settings(settings)
            return updated
    raise HTTPException(status_code=404, detail="模型不存在")


@router.delete("/models/custom/{model_id}")
async def delete_custom_model(model_id: str):
    settings = _load_settings()
    models = settings.get("custom_models", [])
    settings["custom_models"] = [m for m in models if m.get("id") != model_id]
    _save_settings(settings)
    return {"status": "ok"}


@router.post("/models/test")
async def test_model(body: dict):
    """Test if a model config works by sending a minimal request."""
    from ..adapters import get_adapter
    from ..models.schemas import ModelProvider, ChatMessage

    provider = body.get("provider", "openai")
    model = body.get("model", "gpt-4o")
    api_key = body.get("api_key", "")
    base_url = body.get("base_url", "")

    if not api_key:
        # Try from saved settings
        settings = _load_settings()
        provider_conf = settings.get("providers", {}).get(provider, {})
        api_key = provider_conf.get("api_key", "")
        # Also check custom models
        for cm in settings.get("custom_models", []):
            if cm.get("model") == model and cm.get("api_key"):
                api_key = cm["api_key"]
                if cm.get("base_url"):
                    base_url = cm["base_url"]

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

    test_messages = [ChatMessage(role="user", content="Hi, reply with 'OK' only.")]

    try:
        content = ""
        async for chunk, usage in adapter.chat_stream(
            messages=test_messages,
            model=model,
            api_key=api_key,
            base_url=base_url or None,
        ):
            content += chunk
            if content:
                break
        return {"status": "ok", "message": "连接成功", "preview": content[:100]}
    except Exception as e:
        return {"status": "error", "message": str(e)[:200]}
