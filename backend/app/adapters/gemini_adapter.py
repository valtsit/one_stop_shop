import json
import httpx
from typing import AsyncIterator
from .base import BaseModelAdapter, estimate_cost
from ..models.schemas import TokenUsage


class GeminiAdapter(BaseModelAdapter):
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    async def chat_stream(
        self,
        api_messages: list[dict],
        model: str,
        api_key: str,
        system_prompt: str | None = None,
        base_url: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> AsyncIterator[tuple[str, TokenUsage | None, bool]]:
        url = (base_url or self.BASE_URL).rstrip("/")
        contents = []
        for msg in api_messages:
            role = "user" if msg["role"] == "user" else "model"
            content = msg.get("content", "")
            if isinstance(content, list):
                # Convert to Gemini parts format
                parts = []
                for part in content:
                    if part.get("type") == "image_url":
                        img_url = part.get("image_url", {}).get("url", "")
                        if img_url.startswith("data:"):
                            header, b64data = img_url.split(",", 1)
                            mime_type = header.split(":")[1].split(";")[0]
                            parts.append({"inlineData": {"mimeType": mime_type, "data": b64data}})
                        else:
                            parts.append({"text": f"[图片: {img_url}]"})
                    elif part.get("type") == "text":
                        parts.append({"text": part.get("text", "")})
                contents.append({"role": role, "parts": parts})
            else:
                contents.append({"role": role, "parts": [{"text": content}]})

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
                                is_thinking = part.get("thought", False)
                                yield (text, None, bool(is_thinking))

                    usage = data.get("usageMetadata")
                    if usage:
                        prompt_t = usage.get("promptTokenCount", 0)
                        completion_t = usage.get("candidatesTokenCount", 0)
                        yield ("", TokenUsage(
                            prompt_tokens=prompt_t,
                            completion_tokens=completion_t,
                            total_tokens=prompt_t + completion_t,
                            estimated_cost=estimate_cost(model, prompt_t, completion_t),
                        ), False)
