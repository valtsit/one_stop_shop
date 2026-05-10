import json
import httpx
from typing import AsyncIterator
from .base import BaseModelAdapter, estimate_cost
from ..models.schemas import ChatMessage, TokenUsage


class OpenAIAdapter(BaseModelAdapter):
    BASE_URL = "https://api.openai.com/v1"

    async def chat_stream(
        self,
        messages: list[ChatMessage],
        model: str,
        api_key: str,
        system_prompt: str | None = None,
        base_url: str | None = None,
    ) -> AsyncIterator[tuple[str, TokenUsage | None]]:
        url = (base_url or self.BASE_URL).rstrip("/")
        api_messages = []
        if system_prompt:
            api_messages.append({"role": "system", "content": system_prompt})
        for msg in messages:
            api_messages.append({"role": msg.role, "content": msg.content})

        payload = {
            "model": model,
            "messages": api_messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    usage = data.get("usage")
                    if usage:
                        prompt_t = usage.get("prompt_tokens", 0)
                        completion_t = usage.get("completion_tokens", 0)
                        yield ("", TokenUsage(
                            prompt_tokens=prompt_t,
                            completion_tokens=completion_t,
                            total_tokens=prompt_t + completion_t,
                            estimated_cost=estimate_cost(model, prompt_t, completion_t),
                        ))
                        continue

                    choices = data.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield (content, None)
