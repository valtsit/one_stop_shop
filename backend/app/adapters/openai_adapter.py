import json
import httpx
from typing import AsyncIterator
from .base import BaseModelAdapter, estimate_cost, strip_images_from_messages
from ..models.schemas import TokenUsage

# URL patterns for OpenAI-compatible APIs that don't support vision
_NON_VISION_URLS = ("deepseek.com", "xiaomimimo.com")


class OpenAIAdapter(BaseModelAdapter):
    BASE_URL = "https://api.openai.com/v1"

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
        # Strip images for OpenAI-compatible APIs that don't support vision
        if any(p in url.lower() for p in _NON_VISION_URLS):
            has_before = any(isinstance(m.get("content"), list) for m in api_messages)
            api_messages = strip_images_from_messages(api_messages)
            has_after = any(isinstance(m.get("content"), list) for m in api_messages)
            print(f"[OPENAI-ADAPTER] stripped images for {url}: had={has_before} still_has={has_after}")
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.extend(api_messages)

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if extra_headers:
            headers.update(extra_headers)

        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=120.0)) as client:
            async with client.stream(
                "POST",
                f"{url}/chat/completions",
                headers=headers,
                json=payload,
            ) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    detail = body.decode("utf-8", errors="replace")[:500]
                    raise httpx.HTTPStatusError(
                        f"HTTP {resp.status_code} from {url}: {detail}",
                        request=resp.request,
                        response=resp,
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
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
                        ), False)
                        continue

                    choices = data.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        reasoning = delta.get("reasoning_content", "")
                        if reasoning:
                            yield (reasoning, None, True)
                        content = delta.get("content", "")
                        if content:
                            yield (content, None, False)
