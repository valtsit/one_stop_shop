from .base import BaseModelAdapter
from .openai_adapter import OpenAIAdapter
from .claude_adapter import ClaudeAdapter
from .gemini_adapter import GeminiAdapter
from .deepseek_adapter import DeepSeekAdapter
from ..models.schemas import ModelProvider

ADAPTERS: dict[ModelProvider, BaseModelAdapter] = {
    ModelProvider.OPENAI: OpenAIAdapter(),
    ModelProvider.CLAUDE: ClaudeAdapter(),
    ModelProvider.GEMINI: GeminiAdapter(),
    ModelProvider.DEEPSEEK: DeepSeekAdapter(),
}


def get_adapter(provider: ModelProvider) -> BaseModelAdapter:
    adapter = ADAPTERS.get(provider)
    if not adapter:
        raise ValueError(f"Unknown provider: {provider}")
    return adapter
