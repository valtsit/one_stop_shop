"""Wiki knowledge base service — AI-powered ingest, query, and lint."""

import asyncio
import json
import re
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters import get_adapter
from ..core.crud import (
    get_wiki_space,
    list_wiki_pages,
    list_wiki_pages_by_ids,
    create_wiki_page,
    update_wiki_page,
    get_wiki_source,
    list_wiki_sources,
    create_wiki_reference,
    delete_references_for_page,
    create_wiki_log,
    get_settings,
)
from ..models.schemas import ModelProvider
from .rag_service import rag_service


def generate_slug(title: str) -> str:
    """Generate a URL-friendly slug from a title."""
    slug = re.sub(r'[^\w一-鿿-]', '-', title).strip('-').lower()
    slug = re.sub(r'-+', '-', slug)
    if len(slug) > 50:
        slug = slug[:50].rstrip('-')
    return slug or uuid.uuid4().hex[:8]


def _now() -> str:
    return datetime.now().isoformat()


async def _call_llm(
    system_prompt: str,
    user_content: str,
    model: str,
    provider: str,
    api_key: str,
    base_url: str = "",
) -> str:
    """Non-streaming LLM call. Returns full text response.
    Retries once on 5xx server errors."""
    import httpx

    provider_enum = ModelProvider(provider)
    adapter = get_adapter(provider_enum)
    api_messages = [{"role": "user", "content": user_content}]

    last_error = None
    for attempt in range(2):
        if attempt > 0:
            await asyncio.sleep(2)
        try:
            chunks = []
            async for chunk, usage, thinking in adapter.chat_stream(
                api_messages=api_messages,
                model=model,
                api_key=api_key,
                system_prompt=system_prompt,
                base_url=base_url or None,
            ):
                if chunk:
                    chunks.append(chunk)
            return "".join(chunks)
        except httpx.HTTPStatusError as e:
            last_error = e
            if e.response.status_code < 500:
                raise
            # 5xx errors get retried
        except Exception:
            raise

    raise last_error  # type: ignore[misc]


def _resolve_llm_config(saved_settings: dict) -> tuple[str, str, str, str]:
    """Resolve model, provider, api_key, base_url from settings.

    Priority: custom_models > provider config > env vars.
    """
    from ..core.config import settings as app_config

    provider = saved_settings.get("default_provider", "openai")
    model = saved_settings.get("default_model", "gpt-4o")

    # 1) Check custom models first (user-configured third-party APIs)
    custom_models = saved_settings.get("custom_models", [])
    if custom_models:
        cm = custom_models[0]
        if cm.get("api_key"):
            return (
                cm.get("model") or model,
                cm.get("provider") or provider,
                cm["api_key"],
                cm.get("base_url", ""),
            )

    # 2) Built-in provider config
    provider_conf = saved_settings.get("providers", {}).get(provider, {})
    api_key = provider_conf.get("api_key", "")
    base_url = provider_conf.get("base_url", "")
    if api_key:
        return model, provider, api_key, base_url

    # 3) Env vars
    env_map = {
        "openai": (app_config.OPENAI_API_KEY, app_config.OPENAI_BASE_URL),
        "claude": (app_config.ANTHROPIC_API_KEY, app_config.ANTHROPIC_BASE_URL),
        "gemini": (app_config.GEMINI_API_KEY, ""),
        "deepseek": (app_config.DEEPSEEK_API_KEY, app_config.DEEPSEEK_BASE_URL),
    }
    env_key, env_url = env_map.get(provider, ("", ""))
    return model, provider, env_key or api_key, env_url or base_url


async def log_entry(
    session: AsyncSession,
    space_id: str,
    action: str,
    summary: str,
    detail: str = "",
    page_ids: list[str] | None = None,
    performed_by: str = "system",
):
    """Create a wiki log entry."""
    await create_wiki_log(session, {
        "id": "wlog_" + uuid.uuid4().hex[:8],
        "space_id": space_id,
        "action": action,
        "summary": summary,
        "detail": detail,
        "page_ids": page_ids or [],
        "performed_by": performed_by,
        "created_at": _now(),
    })


async def rebuild_index_page(session: AsyncSession, space_id: str):
    """Rebuild the index page for a wiki space."""
    pages = await list_wiki_pages(session, space_id)
    non_index = [p for p in pages if p.get("page_type") != "index" and p.get("page_type") != "log"]

    # Group by page_type
    groups: dict[str, list[dict]] = {}
    for p in non_index:
        pt = p.get("page_type", "article")
        groups.setdefault(pt, []).append(p)

    type_labels = {
        "article": "文章",
        "entity": "实体",
        "concept": "概念",
        "comparison": "对比",
    }

    lines = ["# 知识库索引\n"]
    lines.append(f"最后更新: {_now()}\n")
    lines.append(f"共 {len(non_index)} 个页面\n")

    for pt in ["entity", "concept", "comparison", "article"]:
        items = groups.get(pt, [])
        if not items:
            continue
        label = type_labels.get(pt, pt)
        lines.append(f"\n## {label} ({len(items)})\n")
        for p in items:
            tags_str = ", ".join(p.get("tags", [])) if p.get("tags") else ""
            tag_suffix = f" `{tags_str}`" if tags_str else ""
            lines.append(f"- [{p['title']}](/wiki/{space_id}/page/{p['id']}){tag_suffix}")

    content = "\n".join(lines)

    # Find existing index page
    index_page = None
    for p in pages:
        if p.get("page_type") == "index":
            index_page = p
            break

    if index_page:
        await update_wiki_page(session, index_page["id"], {
            "content": content,
            "word_count": len(content),
            "updated_at": _now(),
        })
    else:
        await create_wiki_page(session, {
            "id": "wpg_" + uuid.uuid4().hex[:8],
            "space_id": space_id,
            "title": "索引",
            "slug": "index",
            "content": content,
            "page_type": "index",
            "tags": [],
            "source_ids": [],
            "word_count": len(content),
            "created_by": "system",
            "created_at": _now(),
            "updated_at": _now(),
        })


async def ai_ingest(
    session: AsyncSession,
    space_id: str,
    content: str,
    title: str = "",
    source_id: str = "",
    performed_by: str = "ai",
    model: str = "",
    provider: str = "",
    api_key: str = "",
    base_url: str = "",
) -> dict:
    """AI-powered source ingestion. Reads content, extracts structured wiki pages."""
    # Load context
    pages = await list_wiki_pages(session, space_id)
    existing_titles = [p["title"] for p in pages if p.get("page_type") not in ("index", "log")]

    if not api_key:
        model, provider, api_key, base_url = _resolve_llm_config(await get_settings(session))
    if not provider:
        provider = "openai"

    if not api_key:
        raise ValueError("未配置 AI 模型 API Key，请在设置中添加")

    source_title = title
    if source_id:
        source = await get_wiki_source(session, source_id)
        if source:
            content = source.get("content", "") or content
            source_title = source.get("title", "") or source_title

    if not content.strip():
        raise ValueError("内容为空，无法导入")

    system_prompt = """你是一个专业的知识库整理助手。你的任务是阅读原始资料，从中提取结构化的知识页面。

你需要：
1. 识别资料中的关键实体、概念、对比关系
2. 为每个识别出的知识点创建一个独立的 Markdown 页面
3. 标注页面之间的交叉引用关系
4. 每个页面内容要结构清晰、信息完整

请以 JSON 格式输出，结构如下：
```json
{
  "pages": [
    {
      "title": "页面标题",
      "page_type": "entity|concept|comparison|article",
      "content": "Markdown 格式的页面内容",
      "tags": ["标签1", "标签2"],
      "references": ["其他页面标题1", "其他页面标题2"]
    }
  ],
  "summary": "本次导入的简要说明"
}
```

页面类型说明：
- entity: 具体的实体（人物、产品、公司、技术等）
- concept: 概念或理论
- comparison: 对比或比较
- article: 一般性文章或综述

页面内容应使用 Markdown 格式，包含标题、段落、列表等。每个页面应完整独立，同时通过交叉引用建立联系。"""

    existing_context = ""
    if existing_titles:
        existing_context = f"\n\n知识库中已有的页面：{', '.join(existing_titles[:30])}"

    user_content = f"资料标题：{source_title or '未命名资料'}\n\n资料内容：\n{content[:15000]}{existing_context}"

    response_text = await _call_llm(system_prompt, user_content, model, provider, api_key, base_url)

    # Parse JSON from response
    json_match = re.search(r'\{[\s\S]*\}', response_text)
    if not json_match:
        raise ValueError("AI 返回格式异常，无法解析结果")

    result = json.loads(json_match.group())
    pages_data = result.get("pages", [])
    summary = result.get("summary", "")

    if not pages_data:
        raise ValueError("AI 未能从资料中提取到有效内容")

    # Create pages
    created_pages = []
    title_to_id = {}

    # First pass: create all pages
    for pd in pages_data:
        page_id = "wpg_" + uuid.uuid4().hex[:8]
        page_content = pd.get("content", "")
        page_title = pd.get("title", "未命名页面")
        slug = generate_slug(page_title)
        word_count = len(page_content)
        source_ids = [source_id] if source_id else []

        page_data = {
            "id": page_id,
            "space_id": space_id,
            "title": page_title,
            "slug": slug,
            "content": page_content,
            "page_type": pd.get("page_type", "article"),
            "tags": pd.get("tags", []),
            "source_ids": source_ids,
            "word_count": word_count,
            "created_by": performed_by,
            "created_at": _now(),
            "updated_at": _now(),
        }
        await create_wiki_page(session, page_data)
        title_to_id[page_title] = page_id
        created_pages.append({"id": page_id, "title": page_title, "page_type": pd.get("page_type", "article")})

    # Also map existing page titles to IDs
    for p in pages:
        if p.get("page_type") not in ("index", "log"):
            title_to_id[p["title"]] = p["id"]

    # Second pass: create cross-references
    ref_count = 0
    for pd in pages_data:
        from_title = pd.get("title", "")
        from_id = title_to_id.get(from_title)
        if not from_id:
            continue
        for ref_title in pd.get("references", []):
            to_id = title_to_id.get(ref_title)
            if to_id and to_id != from_id:
                await create_wiki_reference(session, {
                    "id": "wref_" + uuid.uuid4().hex[:8],
                    "from_page_id": from_id,
                    "to_page_id": to_id,
                    "context": f"从「{from_title}」引用「{ref_title}」",
                    "created_at": _now(),
                })
                ref_count += 1

    # Rebuild index
    await rebuild_index_page(session, space_id)

    # Log
    await log_entry(
        session, space_id, "ingest",
        f"智能导入：{source_title or '粘贴内容'}，创建 {len(created_pages)} 个页面",
        summary,
        [p["id"] for p in created_pages],
        performed_by,
    )

    return {
        "pages": created_pages,
        "references_created": ref_count,
        "summary": summary,
    }


async def ai_query(
    session: AsyncSession,
    space_id: str,
    question: str,
    model: str = "",
    provider: str = "",
    api_key: str = "",
    base_url: str = "",
) -> dict:
    """AI-powered Q&A against wiki content."""
    pages = await list_wiki_pages(session, space_id)
    if not pages:
        return {"answer": "知识库中还没有内容。", "citations": []}

    if not api_key:
        model, provider, api_key, base_url = _resolve_llm_config(await get_settings(session))
    if not provider:
        provider = "openai"

    if not api_key:
        raise ValueError("未配置 AI 模型 API Key，请在设置中添加")

    # Use RAG to find relevant pages
    rag_entries = []
    for p in pages:
        rag_entries.append({
            "id": p["id"],
            "title": p["title"],
            "content": p.get("content", ""),
            "tags": p.get("tags", []),
            "format": "text",
            "columns": [],
            "rows": [],
        })

    rag_results = rag_service.search(question, rag_entries, top_k=5, max_chars_per_entry=3000)

    if not rag_results:
        return {"answer": "在知识库中未找到与问题相关的内容。", "citations": []}

    # Build context
    context_parts = []
    citations = []
    for r in rag_results:
        context_parts.append(f"【{r['entry_title']}】\n{r['text']}")
        citations.append({
            "page_id": r["entry_id"],
            "title": r["entry_title"],
            "excerpt": r["text"][:200],
        })

    context_text = "\n\n---\n\n".join(context_parts)
    if len(context_text) > 10000:
        context_text = context_text[:10000] + "\n[...已截断]"

    system_prompt = """你是一个专业的知识库问答助手。基于提供的知识库内容回答用户问题。

要求：
1. 回答要准确、全面，基于知识库内容
2. 引用具体的知识库页面作为依据
3. 如果知识库内容不足以完全回答问题，明确说明
4. 使用中文回答"""

    user_content = f"知识库内容：\n{context_text}\n\n用户问题：{question}"

    answer = await _call_llm(system_prompt, user_content, model, provider, api_key, base_url)

    # Log
    await log_entry(
        session, space_id, "query",
        f"问答：{question[:50]}",
        f"引用了 {len(citations)} 个页面",
        [c["page_id"] for c in citations],
        "ai",
    )

    return {"answer": answer, "citations": citations}


async def ai_lint(
    session: AsyncSession,
    space_id: str,
    model: str = "",
    provider: str = "",
    api_key: str = "",
    base_url: str = "",
) -> dict:
    """AI-powered lint check for wiki content quality."""
    pages = await list_wiki_pages(session, space_id)
    if not pages:
        return {"issues": [], "summary": "知识库为空，无需检查。"}

    non_special = [p for p in pages if p.get("page_type") not in ("index", "log")]

    # Check for orphan pages (no references)
    from ..core.crud import get_references_for_page
    orphan_ids = set()
    for p in non_special:
        refs = await get_references_for_page(session, p["id"])
        if not refs:
            orphan_ids.add(p["id"])

    # Build base issues from structural checks
    base_issues = []
    for oid in orphan_ids:
        title = next((p["title"] for p in non_special if p["id"] == oid), oid)
        base_issues.append({
            "type": "orphan",
            "page_ids": [oid],
            "description": f"「{title}」没有任何交叉引用，是一个孤岛页面",
            "severity": "medium",
        })

    # Check for thin content
    for p in non_special:
        content = (p.get("content", "") or "").strip()
        if 0 < len(content) < 50:
            base_issues.append({
                "type": "thin_content",
                "page_ids": [p["id"]],
                "description": f"「{p['title']}」内容过短（{len(content)} 字）",
                "severity": "low",
            })

    # Try AI analysis
    if not api_key:
        model, provider, api_key, base_url = _resolve_llm_config(await get_settings(session))
    if not provider:
        provider = "openai"

    if not api_key:
        summary = f"基础检查完成（未配置 AI Key，跳过深度分析）。发现 {len(base_issues)} 个问题。"
        await log_entry(session, space_id, "lint", f"知识库检查：发现 {len(base_issues)} 个问题（基础检查）", performed_by="system")
        return {"issues": base_issues, "summary": summary}

    page_summaries = []
    for p in non_special:
        content_preview = (p.get("content", "") or "")[:500]
        page_summaries.append(
            f"- [{p['id']}] {p['title']} (类型: {p.get('page_type', 'article')}, "
            f"标签: {', '.join(p.get('tags', []))}, 更新: {p.get('updated_at', '')})\n"
            f"  内容预览: {content_preview}"
        )

    pages_text = "\n".join(page_summaries)
    orphan_text = ""
    if orphan_ids:
        orphan_titles = [p["title"] for p in non_special if p["id"] in orphan_ids]
        orphan_text = f"\n\n以下页面没有任何交叉引用（孤岛页面）：{', '.join(orphan_titles)}"

    system_prompt = """你是一个知识库质量检查助手。请检查知识库中的页面，找出以下问题：

1. 矛盾：不同页面之间存在矛盾或不一致的陈述
2. 过时：内容明显过时或需要更新
3. 缺失引用：页面内容提到了其他实体但没有建立交叉引用
4. 内容薄弱：页面内容过于简短或不完整

请以 JSON 格式输出：
```json
{
  "issues": [
    {
      "type": "contradiction|stale|missing_reference|thin_content",
      "page_ids": ["涉及的页面ID"],
      "description": "问题描述",
      "severity": "high|medium|low"
    }
  ],
  "summary": "检查结果总结"
}
```"""

    user_content = f"知识库页面列表：\n{pages_text}{orphan_text}"

    try:
        response_text = await _call_llm(system_prompt, user_content, model, provider, api_key, base_url)

        # Parse JSON
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if not json_match:
            summary = f"AI 返回格式异常，基础检查发现 {len(base_issues)} 个问题"
            await log_entry(session, space_id, "lint", f"知识库检查：{summary}", performed_by="ai")
            return {"issues": base_issues, "summary": summary}

        result = json.loads(json_match.group())
        issues = result.get("issues", [])
        summary = result.get("summary", "")

        # Merge base issues (orphan/thin) with AI issues, dedup by page_ids
        ai_page_ids = set()
        for issue in issues:
            for pid in issue.get("page_ids", []):
                ai_page_ids.add(pid)

        for base_issue in base_issues:
            if not any(pid in ai_page_ids for pid in base_issue.get("page_ids", [])):
                issues.append(base_issue)

        await log_entry(
            session, space_id, "lint",
            f"知识库检查：发现 {len(issues)} 个问题",
            summary,
            [],
            "ai",
        )

        return {"issues": issues, "summary": summary}

    except Exception as e:
        # LLM call failed, return base issues with error context
        error_msg = str(e)[:100]
        summary = f"AI 检查失败（{error_msg}），基础检查发现 {len(base_issues)} 个问题"
        await log_entry(session, space_id, "lint", f"知识库检查：{summary}", performed_by="system")
        return {"issues": base_issues, "summary": summary}
