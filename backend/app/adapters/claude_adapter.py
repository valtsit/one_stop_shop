import json
import httpx
from typing import AsyncIterator
from .base import BaseModelAdapter, estimate_cost, strip_images_from_messages
from ..models.schemas import TokenUsage

# URL patterns for Claude-compatible APIs that don't support vision
_NON_VISION_URLS = ("kimi.com", "moonshot.")


class ClaudeAdapter(BaseModelAdapter):
    BASE_URL = "https://api.anthropic.com"

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
        # Strip images for Claude-compatible APIs that don't support vision
        if any(p in url.lower() for p in _NON_VISION_URLS):
            api_messages = strip_images_from_messages(api_messages)
        messages = []
        for msg in api_messages:
            content = msg.get("content", "")
            if isinstance(content, list):
                # Convert OpenAI image format to Claude format
                claude_content = []
                for part in content:
                    if part.get("type") == "image_url":
                        img_url = part.get("image_url", {}).get("url", "")
                        if img_url.startswith("data:"):
                            # data:image/jpeg;base64,...
                            header, b64data = img_url.split(",", 1)
                            media_type = header.split(":")[1].split(";")[0]
                            claude_content.append({
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": b64data,
                                },
                            })
                        else:
                            claude_content.append({
                                "type": "image",
                                "source": {"type": "url", "url": img_url},
                            })
                    else:
                        claude_content.append(part)
                messages.append({"role": msg["role"], "content": claude_content})
            else:
                messages.append({"role": msg["role"], "content": content})

        payload: dict = {
            "model": model,
            "max_tokens": 4096,
            "messages": messages,
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
                in_thinking = False
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    event_type = data.get("type")
                    if event_type == "message_start":
                        usage_data = data.get("message", {}).get("usage", {})
                        input_tokens = usage_data.get("input_tokens", 0)
                    elif event_type == "content_block_start":
                        block = data.get("content_block", {})
                        if block.get("type") == "thinking":
                            in_thinking = True
                    elif event_type == "content_block_delta":
                        delta = data.get("delta", {})
                        if delta.get("type") == "thinking_delta":
                            thinking_text = delta.get("thinking", "")
                            if thinking_text:
                                yield (thinking_text, None, True)
                        else:
                            text = delta.get("text", "")
                            if text:
                                yield (text, None, False)
                    elif event_type == "content_block_stop":
                        in_thinking = False
                    elif event_type == "message_delta":
                        usage_data = data.get("usage", {})
                        output_tokens = usage_data.get("output_tokens", 0)
                        yield ("", TokenUsage(
                            prompt_tokens=input_tokens,
                            completion_tokens=output_tokens,
                            total_tokens=input_tokens + output_tokens,
                            estimated_cost=estimate_cost(model, input_tokens, output_tokens),
                        ), False)
