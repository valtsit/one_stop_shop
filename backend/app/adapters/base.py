from abc import ABC, abstractmethod
from typing import AsyncIterator
from ..models.schemas import TokenUsage


# Token pricing per 1M tokens (USD) - approximate values
MODEL_PRICING = {
    # OpenAI
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    # Anthropic
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-haiku-3-5-20241022": {"input": 0.80, "output": 4.00},
    # Google
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.0-pro": {"input": 1.25, "output": 10.00},
    # DeepSeek
    "deepseek-chat": {"input": 0.14, "output": 0.28},
    "deepseek-reasoner": {"input": 0.55, "output": 2.19},
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = MODEL_PRICING.get(model, {"input": 1.0, "output": 2.0})
    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 6)


def strip_images_from_messages(api_messages: list[dict]) -> list[dict]:
    """Remove image content from messages — keep only text."""
    cleaned = []
    for msg in api_messages:
        content = msg.get("content")
        if isinstance(content, list):
            text_parts = [p for p in content if p.get("type") == "text"]
            if text_parts:
                cleaned.append({"role": msg["role"], "content": "\n".join(p["text"] for p in text_parts)})
        else:
            cleaned.append(msg)
    return cleaned


class BaseModelAdapter(ABC):
    """Abstract base for all AI model adapters."""

    @abstractmethod
    async def chat_stream(
        self,
        api_messages: list[dict],
        model: str,
        api_key: str,
        system_prompt: str | None = None,
        base_url: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> AsyncIterator[tuple[str, TokenUsage | None, bool]]:
        """Yield (text_chunk, None, False) during streaming, then ("", final_usage, False) at end.
        For thinking/reasoning content: yield (thinking_text, None, True)."""
        ...
