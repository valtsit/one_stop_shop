import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from ..models.schemas import ChatRequest, ModelProvider
from ..adapters import get_adapter
from ..core.config import settings as app_config

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Map of provider -> env var name for default keys (fallback from .env)
ENV_KEYS = {
    ModelProvider.OPENAI: (app_config.OPENAI_API_KEY, app_config.OPENAI_BASE_URL),
    ModelProvider.CLAUDE: (app_config.ANTHROPIC_API_KEY, app_config.ANTHROPIC_BASE_URL),
    ModelProvider.GEMINI: (app_config.GEMINI_API_KEY, ""),
    ModelProvider.DEEPSEEK: (app_config.DEEPSEEK_API_KEY, app_config.DEEPSEEK_BASE_URL),
}


def _load_saved_settings() -> dict:
    from pathlib import Path
    settings_file = Path("./data/settings.json")
    if settings_file.exists():
        try:
            return json.loads(settings_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


@router.post("/completions")
async def chat_completions(request: ChatRequest):
    # For custom models using "compatible" format, use OpenAI adapter
    # since most third-party proxies speak OpenAI-compatible API
    effective_provider = request.provider
    saved = _load_saved_settings()
    for cm in saved.get("custom_models", []):
        if cm.get("model") == request.model and cm.get("provider") == request.provider.value:
            cm_provider = cm.get("provider", "")
            if cm_provider in ("deepseek", "gemini"):
                effective_provider = ModelProvider.OPENAI
            break

    adapter = get_adapter(effective_provider)

    # Resolve API key: request > custom model > provider settings > env
    api_key = request.api_key
    base_url = request.base_url

    # Check custom models for this specific model (match on model + provider)
    if not api_key or not base_url:
        for cm in saved.get("custom_models", []):
            if cm.get("model") == request.model and cm.get("provider") == request.provider.value:
                if not api_key and cm.get("api_key"):
                    api_key = cm["api_key"]
                if not base_url and cm.get("base_url"):
                    base_url = cm["base_url"]
                break

    # Check provider settings
    if not api_key:
        provider_conf = saved.get("providers", {}).get(request.provider.value, {})
        api_key = provider_conf.get("api_key", "")
        if not base_url:
            base_url = provider_conf.get("base_url", "")

    # Fallback to env vars
    if not api_key:
        env_key, env_url = ENV_KEYS.get(effective_provider, ("", ""))
        api_key = env_key
        if not base_url:
            base_url = env_url

    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"未配置 {effective_provider.value} 的 API Key，请在设置中添加",
        )

    model = request.model
    system_prompt = request.system_prompt

    async def event_stream():
        try:
            async for chunk, usage in adapter.chat_stream(
                messages=request.messages,
                model=model,
                api_key=api_key,
                system_prompt=system_prompt,
                base_url=base_url or None,
            ):
                if usage:
                    yield f"data: {json.dumps({'type': 'usage', 'usage': usage.model_dump()}, ensure_ascii=False)}\n\n"
                elif chunk:
                    yield f"data: {json.dumps({'type': 'content', 'content': chunk}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)[:500]}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
