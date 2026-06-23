import json
import re
import base64
from datetime import datetime
from pathlib import Path

def _dbg_log(msg: str):
    """Write debug log to file (print() may be swallowed by uvicorn)."""
    try:
        with open("chat_debug.log", "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.schemas import ChatRequest, ModelProvider
from ..adapters import get_adapter
from ..core.config import settings as app_config
from ..core.auth import get_current_user
from ..core.database import get_db
from ..core.crud import get_settings, list_knowledge_by_ids

router = APIRouter(prefix="/api/chat", tags=["chat"])

UPLOAD_DIR = Path("./data/uploads")

# Map of provider -> env var name for default keys (fallback from .env)
ENV_KEYS = {
    ModelProvider.OPENAI: (app_config.OPENAI_API_KEY, app_config.OPENAI_BASE_URL),
    ModelProvider.CLAUDE: (app_config.ANTHROPIC_API_KEY, app_config.ANTHROPIC_BASE_URL),
    ModelProvider.GEMINI: (app_config.GEMINI_API_KEY, ""),
    ModelProvider.DEEPSEEK: (app_config.DEEPSEEK_API_KEY, app_config.DEEPSEEK_BASE_URL),
}

# Regex to match [附件: filename.ext] at the end of content
ATTACH_RE = re.compile(r"\[附件:\s*([^\]]+)\]")

# URL patterns for third-party APIs that don't support vision
NON_VISION_URL_PATTERNS = ("deepseek.com", "xiaomimimo.com", "kimi.com", "moonshot.")


def _supports_vision(provider: ModelProvider, base_url: str) -> bool:
    """Check if the target API actually supports vision/image content."""
    if base_url:
        url_lower = base_url.lower()
        if any(p in url_lower for p in NON_VISION_URL_PATTERNS):
            return False
        if "anthropic.com" in url_lower:
            return True
        if "openai.com" in url_lower:
            return True
    if provider in (ModelProvider.OPENAI, ModelProvider.GEMINI, ModelProvider.CLAUDE):
        return True
    return False


def _strip_images_from_messages(api_messages: list[dict]) -> list[dict]:
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


# Regex for XML tool-call tags that some models emit (e.g. <search>, <function>, <invoke>)
_TOOL_TAG_RE = re.compile(r"</?(?:search|function|invoke|tool_call|parameter|query|api_call)[^>]*>", re.DOTALL)


def _strip_tool_tags(text: str) -> str:
    """Strip XML tool-call tags from model output."""
    return _TOOL_TAG_RE.sub("", text).strip()


class _ToolTagFilter:
    """Streaming filter that buffers and strips XML tool-call tags.

    Some models emit <search>, <function>, etc. as tool invocations.
    These tags can span multiple chunks, so we buffer suspected tag content.
    """

    _TAG_START = re.compile(r"<(?:search|function|invoke|tool_call|parameter|query|api_call)\b", re.IGNORECASE)

    def __init__(self):
        self._buf = ""       # buffered suspected tag content
        self._in_tag = False  # whether we're inside a suspected tag

    _MAX_BUF = 500  # safety limit for buffered tag content

    def feed(self, chunk: str) -> str:
        """Process a chunk, return clean text (may be empty)."""
        if not chunk:
            return ""

        if self._in_tag:
            self._buf += chunk
            if ">" in chunk or len(self._buf) > self._MAX_BUF:
                # Tag is complete or buffer overflow — discard
                self._buf = ""
                self._in_tag = False
            return ""

        # Check if chunk starts or contains a tag
        if "<" in chunk:
            match = self._TAG_START.search(chunk)
            if match:
                before = chunk[:match.start()]
                self._buf = chunk[match.start():]
                self._in_tag = True
                if ">" in self._buf:
                    self._buf = ""
                    self._in_tag = False
                return before
            # Regular < (e.g. in markdown text), pass through
            return chunk

        return chunk

    def flush(self) -> str:
        """Flush any remaining buffered content (incomplete tag)."""
        buf = self._buf
        self._buf = ""
        self._in_tag = False
        # If the buffer looks like an incomplete tag, discard it
        if buf.startswith("<"):
            return ""
        return buf


def _is_clean_text(text: str) -> bool:
    """Check if extracted text is readable (not garbled encoding)."""
    if not text or not text.strip():
        return False
    printable = sum(1 for c in text if c.isprintable() or c in '\n\r\t')
    ratio = printable / len(text)
    if ratio < 0.7:
        return False
    # Detect mojibake: sequences like � (replacement char) or weird byte pairs
    bad = sum(1 for c in text if c == '�' or (ord(c) > 0x0250 and ord(c) < 0x2e80 and c not in '。，、；：！？（）【】《》""''…—·'))
    return bad / len(text) < 0.1


def _extract_pdf_text(file_path: Path, max_pages: int = 50) -> str | None:
    """Extract text from a PDF file. Returns None if text is garbled or empty."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        _dbg_log("[BUILD_MSG] PyMuPDF not installed")
        return None
    try:
        doc = fitz.open(str(file_path))
        pages = []
        for i, page in enumerate(doc):
            if i >= max_pages:
                pages.append(f"\n... (已截断，共 {len(doc)} 页，仅显示前 {max_pages} 页)")
                break
            page_text = page.get_text().strip()
            if page_text:
                pages.append(f"--- 第 {i + 1} 页 ---\n{page_text}")
        doc.close()
        result = "\n\n".join(pages)
        if _is_clean_text(result):
            _dbg_log(f"[BUILD_MSG] PDF text OK: {file_path.name} pages={len(pages)} chars={len(result)}")
            return result
        _dbg_log(f"[BUILD_MSG] PDF text garbled: {file_path.name} len={len(result)} — fallback to image")
        return None
    except Exception as e:
        _dbg_log(f"[BUILD_MSG] error extracting PDF text {file_path.name}: {e}")
        return None


def _pdf_to_images(file_path: Path, max_pages: int = 10) -> list[dict]:
    """Render PDF pages as images and return image_url parts for multimodal API."""
    try:
        import fitz
    except ImportError:
        _dbg_log("[BUILD_MSG] PyMuPDF not installed, cannot render PDF to images")
        return []
    try:
        doc = fitz.open(str(file_path))
        parts = []
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            pix = page.get_pixmap(dpi=150)
            img_data = pix.tobytes("png")
            if len(img_data) > 5 * 1024 * 1024:
                _dbg_log(f"[BUILD_MSG] skipping large PDF page {i+1}: {len(img_data)} bytes")
                continue
            b64 = base64.b64encode(img_data).decode()
            parts.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"},
            })
        doc.close()
        _dbg_log(f"[BUILD_MSG] PDF rendered as {len(parts)} image(s): {file_path.name}")
        return parts
    except Exception as e:
        _dbg_log(f"[BUILD_MSG] error rendering PDF {file_path.name}: {e}")
        return []


def _build_api_messages(messages: list) -> list[dict]:
    """Convert ChatMessage list to API-ready dicts, resolving uploaded images to base64."""
    _dbg_log("[BUILD_MSG] === v3 PDF+image extraction active ===")
    api_messages = []
    for msg in messages:
        content = msg.content
        attachments = ATTACH_RE.findall(content)
        text = ATTACH_RE.sub("", content).strip()
        text = re.sub(r'\n?\[知识库:[^\]]+\]', '', text).strip()

        if attachments:
            dir_str = str(UPLOAD_DIR.resolve()).encode('ascii', errors='replace').decode('ascii')
            _dbg_log(f"[BUILD_MSG] role={msg.role} attachments={attachments} upload_dir={dir_str}")

        image_parts = []
        for filename in attachments:
            filename = filename.strip()
            # Path traversal protection
            if "/" in filename or "\\" in filename or ".." in filename:
                continue
            ext = Path(filename).suffix.lower()
            if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"):
                file_path = UPLOAD_DIR / filename
                exists = file_path.exists()
                _dbg_log(f"[BUILD_MSG] checking image: {filename} exists={exists}")
                if exists:
                    try:
                        img_data = file_path.read_bytes()
                        _dbg_log(f"[BUILD_MSG] image loaded: {filename} size={len(img_data)}")
                        if len(img_data) > 5 * 1024 * 1024:
                            _dbg_log(f"[BUILD_MSG] skipping large image: {filename} ({len(img_data)} bytes)")
                            continue
                        b64 = base64.b64encode(img_data).decode()
                        mime = f"image/{ext.lstrip('.').replace('jpg', 'jpeg')}"
                        image_parts.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64}"},
                        })
                        _dbg_log(f"[BUILD_MSG] image encoded: {filename} mime={mime} b64_len={len(b64)}")
                    except Exception as e:
                        _dbg_log(f"[BUILD_MSG] error reading image {filename}: {e}")
            else:
                _dbg_log(f"[BUILD_MSG] non-image attachment: {filename} (ext={ext})")
                file_path = UPLOAD_DIR / filename
                extracted = None
                if ext == ".pdf" and file_path.exists():
                    extracted = _extract_pdf_text(file_path)
                    if not extracted:
                        # Text extraction failed or garbled — render PDF as images
                        pdf_images = _pdf_to_images(file_path)
                        image_parts.extend(pdf_images)
                elif ext in (".txt", ".md") and file_path.exists():
                    try:
                        extracted = file_path.read_text(encoding="utf-8", errors="replace")
                    except Exception as e:
                        _dbg_log(f"[BUILD_MSG] error reading text file {filename}: {e}")
                if extracted and extracted.strip():
                    label = f"[文件内容: {filename}]"
                    block = f"{label}\n{extracted.strip()}\n{label}"
                else:
                    block = f"[文件: {filename}]"
                if not text:
                    text = block
                else:
                    text += f"\n{block}"

        if image_parts:
            parts = []
            if text:
                parts.append({"type": "text", "text": text})
            parts.extend(image_parts)
            api_messages.append({"role": msg.role, "content": parts})
            _dbg_log(f"[BUILD_MSG] multimodal message: text + {len(image_parts)} image(s)")
        else:
            api_messages.append({"role": msg.role, "content": text})

    return api_messages


@router.get("/debug-kb")
async def debug_kb(
    ids: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Debug endpoint: check if knowledge entries exist and have content."""
    kb_ids = [x.strip() for x in ids.split(",") if x.strip()]
    if not kb_ids:
        return {"error": "provide ?ids=kb_xxx,kb_yyy"}
    entries = await list_knowledge_by_ids(db, kb_ids)
    results = []
    for entry in entries:
        results.append({
            "id": entry.get("id"),
            "title": entry.get("title"),
            "format": entry.get("format"),
            "content_length": len(entry.get("content", "") or ""),
            "content_preview": (entry.get("content", "") or "")[:200],
            "has_rows": bool(entry.get("rows")),
            "rows_count": len(entry.get("rows") or []),
        })
    return {"requested": kb_ids, "found": len(entries), "entries": results}


@router.post("/completions")
async def chat_completions(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Load settings from DB
    saved = await get_settings(db)

    # For custom models using "compatible" format, use OpenAI adapter
    effective_provider = request.provider
    for cm in saved.get("custom_models", []):
        if cm.get("model") == request.model and cm.get("provider") == request.provider.value:
            cm_provider = cm.get("provider", "")
            if cm_provider in ("deepseek", "gemini"):
                effective_provider = ModelProvider.OPENAI
            break

    _dbg_log(f"[CHAT] === ENDPOINT HIT === selected_kb_ids={request.selected_kb_ids} knowledge_ids={request.knowledge_ids}")
    print(f"[CHAT] selected_kb_ids={request.selected_kb_ids} knowledge_ids={request.knowledge_ids}")
    _dbg_log(f"[CHAT] model={request.model} provider={request.provider.value}")
    for i, msg in enumerate(request.messages):
        preview = msg.content[:120].replace('\n', '\\n').encode('ascii', errors='replace').decode('ascii')
        _dbg_log(f"[CHAT] msg[{i}] role={msg.role} content={preview}")
    adapter = get_adapter(effective_provider)

    # Resolve API key: request > custom model > provider settings > env
    api_key = request.api_key
    base_url = request.base_url
    extra_headers = request.headers or {}

    # Check custom models for this specific model (match on model + provider)
    for cm in saved.get("custom_models", []):
        if cm.get("model") == request.model and cm.get("provider") == request.provider.value:
            if not api_key and cm.get("api_key"):
                api_key = cm["api_key"]
            if not base_url and cm.get("base_url"):
                base_url = cm["base_url"]
            if cm.get("headers"):
                extra_headers.update(cm["headers"])
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

    # ================================================================
    # Build system prompt with priority-based assembly
    # Priority: date > knowledge > search > system_prompt/skills
    # Lower-priority sections get truncated first, never the KB.
    # ================================================================
    _PROMPT_BUDGET = 8000  # safe limit across all providers
    now = datetime.now()
    date_text = f"当前日期时间：{now.strftime('%Y年%m月%d日 %A %H:%M')}"

    # --- Priority 1: Knowledge base (user @-selected or agent-linked) ---
    kb_parts = []

    # 1a) @-selected entries — inject directly (user explicitly chose these)
    if request.selected_kb_ids:
        selected_entries = await list_knowledge_by_ids(db, request.selected_kb_ids)
        _dbg_log(f"[CHAT] @KB selected_kb_ids={request.selected_kb_ids} found={len(selected_entries)}")
        for entry in selected_entries:
            title = entry.get("title", "")
            fmt = entry.get("format", "text")
            raw_content = entry.get("content", "")
            raw_rows = entry.get("rows")
            _dbg_log(f"[CHAT] @KB entry id={entry.get('id')} title={title!r} format={fmt} content_len={len(raw_content) if raw_content else 0}")
            if fmt == "table" and raw_rows:
                content = " | ".join(entry.get("columns", [])) + "\n"
                content += "\n".join(" | ".join(str(c) for c in row) for row in raw_rows)
            else:
                content = raw_content
            if content:
                kb_parts.append(f"【{title}】\n{content}")
                _dbg_log(f"[CHAT] @KB INJECTED title={title!r} content_len={len(content)}")
            else:
                _dbg_log(f"[CHAT] @KB SKIPPED title={title!r} — content is empty!")

    # 1b) Agent-level entries — use RAG to filter by relevance
    if request.knowledge_ids:
        from ..services.rag_service import rag_service
        agent_entries = await list_knowledge_by_ids(db, request.knowledge_ids)
        _dbg_log(f"[CHAT] knowledge_ids={request.knowledge_ids} found={len(agent_entries)}")
        if agent_entries:
            user_query = ""
            for msg in reversed(request.messages):
                if msg.role == "user":
                    user_query = re.sub(r'\n?\[知识库:[^\]]+\]', '', msg.content).strip()
                    break
            if user_query:
                rag_results = rag_service.search(user_query, agent_entries, top_k=5, max_chars_per_entry=2000)
                print(f"[CHAT] RAG query={user_query[:80]!r} results={len(rag_results)}")
                for r in rag_results:
                    kb_parts.append(f"【{r['entry_title']}】\n{r['text']}")

    kb_text = ""
    if kb_parts:
        kb_raw = "\n\n".join(kb_parts)
        kb_text = (
            f"\n\n[以下为用户引用的知识库内容。用户主动 @引用了这些资料，请你立即将其融入你的回答中，"
            f"不要等待额外信息，直接基于这些内容为用户服务。]\n"
            f"{kb_raw}\n"
            f"[知识库内容结束]"
        )
        _dbg_log(f"[CHAT] KB assembled, parts={len(kb_parts)} raw_len={len(kb_raw)} full_len={len(kb_text)}")
    else:
        _dbg_log(f"[CHAT] KB NOT injected — kb_parts is empty! selected_kb_ids={request.selected_kb_ids} knowledge_ids={request.knowledge_ids}")

    # --- Priority 2: Search results ---
    search_text = ""
    if request.search_results:
        print(f"[CHAT] search_results count={len(request.search_results)}")
        search_raw = "\n".join(
            f"- {r.get('title', '')}: {r.get('snippet', '')} ({r.get('url', '')})"
            for r in request.search_results
            if r.get("snippet")
        )
        if search_raw:
            search_text = f"\n\n[以下为联网搜索结果，仅供参考，请结合你的知识回答]\n{search_raw}"

    # --- Priority 3: System prompt / skills (truncated first if needed) ---
    user_system = request.system_prompt or ""

    # --- Assemble: fixed parts first, then fit skills into remaining budget ---
    fixed_parts = date_text + kb_text + search_text
    fixed_len = len(fixed_parts)
    remaining = _PROMPT_BUDGET - fixed_len

    if remaining < 0:
        # KB alone exceeds budget — truncate KB as last resort
        _dbg_log(f"[CHAT] WARNING: fixed parts ({fixed_len}) exceed budget ({_PROMPT_BUDGET}), truncating")
        system_prompt = fixed_parts[:_PROMPT_BUDGET]
    elif remaining > 0 and user_system:
        if len(user_system) > remaining:
            system_prompt = fixed_parts + user_system[:remaining - 50] + "\n[...指令已截断]"
        else:
            system_prompt = fixed_parts + user_system
    else:
        system_prompt = fixed_parts

    _dbg_log(f"[CHAT] FINAL system_prompt len={len(system_prompt)} (budget={_PROMPT_BUDGET} fixed={fixed_len} user_system={len(user_system)})")
    print(f"[CHAT] system_prompt len={len(system_prompt)}, KB={'yes' if kb_text else 'no'}, search={'yes' if search_text else 'no'}")

    # Build API messages with image support
    api_messages = _build_api_messages(request.messages)
    has_images = any(
        isinstance(m.get("content"), list)
        for m in api_messages
    )
    print(f"[CHAT-FIX-v2] provider={request.provider.value} base_url={base_url} has_images={has_images}")
    if has_images:
        sv = _supports_vision(request.provider, base_url or "")
        print(f"[CHAT-FIX-v2] supports_vision={sv}")
        if not sv:
            api_messages = _strip_images_from_messages(api_messages)
            still_has = any(isinstance(m.get("content"), list) for m in api_messages)
            print(f"[CHAT-FIX-v2] stripped! still_has_images={still_has} msg_count={len(api_messages)}")
        else:
            print(f"[CHAT-FIX-v2] WARNING: vision supported but API may not handle images")

    async def event_stream():
        tag_filter = _ToolTagFilter()
        try:
            _dbg_log(f"[CHAT] >>> TO ADAPTER system_prompt_len={len(system_prompt) if system_prompt else 0}")
            if system_prompt:
                _dbg_log(f"[CHAT] >>> SYSTEM PROMPT FULL:\n{system_prompt[:2000]}")
            async for chunk, usage, thinking in adapter.chat_stream(
                api_messages=api_messages,
                model=model,
                api_key=api_key,
                system_prompt=system_prompt,
                base_url=base_url or None,
                extra_headers=extra_headers or None,
            ):
                if usage:
                    yield f"data: {json.dumps({'type': 'usage', 'usage': usage.model_dump()}, ensure_ascii=False)}\n\n"
                elif chunk:
                    if thinking:
                        yield f"data: {json.dumps({'type': 'thinking', 'content': chunk}, ensure_ascii=False)}\n\n"
                    else:
                        clean = tag_filter.feed(chunk)
                        if clean:
                            yield f"data: {json.dumps({'type': 'content', 'content': clean}, ensure_ascii=False)}\n\n"
        except Exception as e:
            import httpx
            print(f"[CHAT-ERROR] {e!r}")
            if isinstance(e, httpx.TimeoutException):
                err_msg = "模型 API 响应超时，请稍后重试"
            elif isinstance(e, httpx.NetworkError):
                err_msg = f"无法连接到模型 API，请检查网络或 API 地址配置"
            elif isinstance(e, httpx.HTTPStatusError):
                err_msg = f"模型 API 返回错误: {str(e)[:300]}"
            else:
                err_msg = f"请求失败: {str(e)[:300]}"
            yield f"data: {json.dumps({'type': 'error', 'content': err_msg}, ensure_ascii=False)}\n\n"
        # Flush any remaining buffered content from tag filter
        tail = tag_filter.flush()
        if tail:
            yield f"data: {json.dumps({'type': 'content', 'content': tail}, ensure_ascii=False)}\n\n"
        print("[CHAT] sending [DONE]")
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
