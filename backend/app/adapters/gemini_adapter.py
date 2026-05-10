import json
import httpx
from typing import AsyncIterator
from .base import BaseModelAdapter, estimate_cost
from ..models.schemas import ChatMessage, TokenUsage


class GeminiAdapter(BaseModelAdapter):
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    async def chat_stream(
        self,
        messages: list[ChatMessage],
        model: str,
        api_key: str,
        system_prompt: str | None = None,
        base_url: str | None = None,
    ) -> AsyncIterator[tuple[str, TokenUsage | None]]:
        url = (base_url or self.BASE_URL).rstrip("/")
        contents = []
        for msg in messages:
            role = "user" if msg.role == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg.content}],
            })

        payload: dict = {"contents": contents}
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}

        api_url = f"{url}/models/{model}:streamGenerateContent?key={api_key}&alt=sse"

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                api_url,
                headers={"Content-Type": "application/json"},
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    candidates = data.get("candidates", [])
                    if candidates:
                        content = candidates[0].get("content", {})
                        parts = content.get("parts", [])
                        for part in parts:
                            text = part.get("text", "")
                            if text:
                                yield (text, None)

                    usage = data.get("usageMetadata")
                    if usage:
                        prompt_t = usage.get("promptTokenCount", 0)
                        completion_t = usage.get("candidatesTokenCount", 0)
                        yield ("", TokenUsage(
                            prompt_tokens=prompt_t,
                            completion_tokens=completion_t,
                            total_tokens=prompt_t + completion_t,
                            estimated_cost=estimate_cost(model, prompt_t, completion_t),
                        ))
