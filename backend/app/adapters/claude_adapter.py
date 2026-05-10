import json
import httpx
from typing import AsyncIterator
from .base import BaseModelAdapter, estimate_cost
from ..models.schemas import ChatMessage, TokenUsage


class ClaudeAdapter(BaseModelAdapter):
    BASE_URL = "https://api.anthropic.com"

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
        for msg in messages:
            api_messages.append({"role": msg.role, "content": msg.content})

        payload: dict = {
            "model": model,
            "max_tokens": 4096,
            "messages": api_messages,
            "stream": True,
        }
        if system_prompt:
            payload["system"] = system_prompt

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{url}/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as resp:
                resp.raise_for_status()
                input_tokens = 0
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    event_type = data.get("type")
                    if event_type == "message_start":
                        usage_data = data.get("message", {}).get("usage", {})
                        input_tokens = usage_data.get("input_tokens", 0)
                    elif event_type == "content_block_delta":
                        delta = data.get("delta", {})
                        text = delta.get("text", "")
                        if text:
                            yield (text, None)
                    elif event_type == "message_delta":
                        usage_data = data.get("usage", {})
                        output_tokens = usage_data.get("output_tokens", 0)
                        yield ("", TokenUsage(
                            prompt_tokens=input_tokens,
                            completion_tokens=output_tokens,
                            total_tokens=input_tokens + output_tokens,
                            estimated_cost=estimate_cost(model, input_tokens, output_tokens),
                        ))
