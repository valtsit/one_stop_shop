import json
import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import require_permission
from ..core.crud import (
    list_conversations, get_conversation, delete_conversation,
    list_users, list_agents, get_settings, create_skill as crud_create_skill,
)
from ..core.database import get_db
from ..models.schemas import (
    ConversationAnalyzeRequest, ConversationAnalyzeSelectedRequest,
    ConversationAnalyzeResponse,
    ConversationCreateSkillRequest, ConversationCreateSkillResponse,
)
from ..adapters import get_adapter
from ..models.schemas import ModelProvider

router = APIRouter(prefix="/api/admin/conversations", tags=["admin-conversations"])

# Map of provider -> env var name for default keys (fallback from .env)
from ..core.config import settings as app_config
ENV_KEYS = {
    "openai": (app_config.OPENAI_API_KEY, app_config.OPENAI_BASE_URL),
    "claude": (app_config.ANTHROPIC_API_KEY, app_config.ANTHROPIC_BASE_URL),
    "gemini": (app_config.GEMINI_API_KEY, ""),
    "deepseek": (app_config.DEEPSEEK_API_KEY, app_config.DEEPSEEK_BASE_URL),
}


ANALYZE_SYSTEM_PROMPT = """你是一名 AI 产品分析师。请分析以下用户与智能体的聊天记录，提炼出 Skill（技能）的更新迭代方向。

分析维度：
1. 高频问题分类 — 用户最常问什么类型的问题
2. 建议新增 Skill — 根据用户需求，建议增加哪些 Skill（含名称、描述、理由）
3. 现有 Skill 问题 — 用户在使用现有 Skill 时遇到了什么问题，如何改进
4. 整体优化方向 — 一句话总结

请严格按以下 JSON 格式输出，不要有多余文字，确保是合法 JSON：
{
  "summary": "总体概述",
  "top_topics": [{"topic": "问题类别", "frequency": "高/中/低", "example_queries": ["示例问题1", "示例问题2"]}],
  "suggested_new_skills": [{"name": "Skill名称", "description": "Skill描述", "rationale": "建议理由"}],
  "existing_skill_issues": [{"skill_name": "Skill名称", "issue": "问题描述", "suggestion": "改进建议"}],
  "overall_direction": "整体优化方向一句话总结"
}"""


def _enrich_conversations(conversations: list[dict], users: dict, agents: dict) -> list[dict]:
    for conv in conversations:
        owner = users.get(conv.get("user_id", ""), {})
        conv["user_display_name"] = owner.get("display_name", conv.get("user_id", "未知用户"))
        agent = agents.get(conv.get("agent_id", ""), {})
        conv["agent_name"] = agent.get("name", conv.get("agent_id", "未知智能体"))
    return conversations


# ============================================================
# Analysis helpers
# ============================================================

async def _aggregate_conversation_texts(db: AsyncSession, conv_ids: list[str]) -> str:
    """Fetch conversations by ID and aggregate their messages into analysis text."""
    MAX_MSGS_PER_CONV = 20
    MAX_TOTAL_CHARS = 30000
    MAX_MSG_LEN = 500

    text_parts = []
    total_chars = 0

    for idx, conv_id in enumerate(conv_ids):
        conv = await get_conversation(db, conv_id)
        if not conv:
            continue
        messages = conv.get("messages", [])
        msgs = [m for m in messages if m.get("role") in ("user", "assistant")][:MAX_MSGS_PER_CONV]
        if not msgs:
            continue
        conv_text = f"--- 对话 {idx + 1} ---\n"
        for m in msgs:
            role_label = "用户" if m.get("role") == "user" else "AI"
            content = (m.get("content") or "")[:MAX_MSG_LEN]
            line = f"{role_label}: {content}\n"
            conv_text += line
        if total_chars + len(conv_text) > MAX_TOTAL_CHARS:
            remaining = MAX_TOTAL_CHARS - total_chars
            if remaining > 100:
                conv_text = conv_text[:remaining]
                text_parts.append(conv_text)
            text_parts.append("\n...[内容已截断，仅分析部分对话]\n")
            break
        text_parts.append(conv_text)
        total_chars += len(conv_text)

    return "".join(text_parts)


async def _resolve_api_key(
    db: AsyncSession,
    provider_str: str,
    model: str,
    request_api_key: str,
    request_base_url: str,
) -> tuple[str, str]:
    """Resolve API key with priority: request > custom model > provider settings > env."""
    api_key = request_api_key or ""
    base_url = request_base_url or ""

    if not api_key:
        saved = await get_settings(db)
        for cm in saved.get("custom_models", []):
            if cm.get("model") == model and cm.get("provider") == provider_str:
                api_key = cm.get("api_key", "")
                if not base_url:
                    base_url = cm.get("base_url", "")
                break
        if not api_key:
            provider_conf = saved.get("providers", {}).get(provider_str, {})
            api_key = provider_conf.get("api_key", "")
            if not base_url:
                base_url = provider_conf.get("base_url", "")
        if not api_key:
            env_key, env_url = ENV_KEYS.get(provider_str.lower(), ("", ""))
            api_key = env_key
            if not base_url:
                base_url = env_url

    return api_key, base_url


async def _run_ai_analysis(
    db: AsyncSession,
    analysis_text: str,
    model: str,
    provider_str: str,
    api_key: str,
    base_url: str,
) -> ConversationAnalyzeResponse:
    """Run AI analysis on aggregated conversation text."""
    if not analysis_text:
        return ConversationAnalyzeResponse(
            summary="暂无足够对话数据进行分析",
            top_topics=[],
            suggested_new_skills=[],
            existing_skill_issues=[],
            overall_direction="",
        )

    provider_map = {
        "openai": ModelProvider.OPENAI,
        "claude": ModelProvider.CLAUDE,
        "gemini": ModelProvider.GEMINI,
        "deepseek": ModelProvider.DEEPSEEK,
    }
    provider = provider_map.get(provider_str.lower(), ModelProvider.OPENAI)

    if not api_key:
        raise HTTPException(status_code=400, detail=f"未配置 {provider_str} 的 API Key，请在设置中添加")

    adapter = get_adapter(provider)
    api_messages = [{"role": "user", "content": f"请分析以下聊天记录：\n\n{analysis_text}"}]

    full_text = ""
    try:
        async for chunk, usage, thinking in adapter.chat_stream(
            api_messages=api_messages,
            model=model,
            api_key=api_key,
            system_prompt=ANALYZE_SYSTEM_PROMPT,
            base_url=base_url or None,
        ):
            if chunk and not thinking:
                full_text += chunk
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 分析请求失败: {str(e)[:200]}")

    result = _parse_analysis_response(full_text)
    return ConversationAnalyzeResponse(**result)


def _parse_analysis_response(text: str) -> dict:
    """Extract JSON from AI response, with fallbacks."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {
        "summary": text[:500] or "AI 返回格式异常，无法解析",
        "top_topics": [],
        "suggested_new_skills": [],
        "existing_skill_issues": [],
        "overall_direction": "",
    }


# ============================================================
# Skill Creator context
# ============================================================

# Load qiuzhi-skill-creator SKILL.md + references as context
_SKILL_CREATOR_PATH = Path(__file__).resolve().parents[2] / "data" / "skills" / "skill_f464215a"


def _load_skill_creator_content() -> str:
    """Load the qiuzhi-skill-creator SKILL.md, truncated to fit system prompt limits."""
    skill_md = _SKILL_CREATOR_PATH / "SKILL.md"
    if skill_md.exists():
        text = skill_md.read_text(encoding="utf-8")
        # Truncate to ~3000 chars to stay within system prompt token limits
        # Keep the frontmatter + core sections (Phase 1-3), skip examples and references
        return text[:3000]
    return ""


_SKILL_CREATOR_CONTEXT = _load_skill_creator_content()


CREATE_SKILL_SYSTEM_PROMPT = f"""你是一名资深 Skill 架构师，擅长将复杂任务转化为高度工程化的 Skill 指令文件。

你已掌握以下 Skill 设计方法论（来自 qiuzhi-skill-creator）：

{_SKILL_CREATOR_CONTEXT}

---

## 当前任务

你正在基于用户与 AI 的历史聊天记录，设计一个新的 Skill。

### 你的角色

你是 Skill 设计专家，需要：
1. 深入分析聊天记录，识别反复出现的主题、用户痛点、解决模式
2. 提炼出一个通用性强、可复用的 Skill 能力
3. 按照上述方法论，编写完整、高质量的 SKILL.md 文件

### 输出要求

- 直接输出 SKILL.md 的完整 Markdown 内容
- 必须包含 YAML frontmatter（name + description）
- 按照上述方法论的 Phase 3 规范编写
- 不要使用代码块包裹整个输出
- 内容要专业、详细、可直接作为系统提示词使用
- 根据对话语言使用中文或英文（优先中文）"""


async def _run_skill_creation(
    db: AsyncSession,
    conversation_text: str,
    user_name: str,
    user_description: str,
    model: str,
    provider_str: str,
    api_key: str,
    base_url: str,
) -> tuple[str, str]:
    """Run AI to generate SKILL.md from conversation text.

    Returns (generated_skill_md, generated_name).
    """
    if not conversation_text:
        skill_md = "# 通用助手\n\n根据对话记录自动生成的 Skill。\n\n## 适用场景\n\n- 日常问答\n\n## 核心能力\n\n1. **通用对话**：回答用户各类问题\n"
        return skill_md, "通用助手"

    provider_map = {
        "openai": ModelProvider.OPENAI,
        "claude": ModelProvider.CLAUDE,
        "gemini": ModelProvider.GEMINI,
        "deepseek": ModelProvider.DEEPSEEK,
    }
    provider = provider_map.get(provider_str.lower(), ModelProvider.OPENAI)

    if not api_key:
        raise HTTPException(status_code=400, detail=f"未配置 {provider_str} 的 API Key，请在设置中添加")

    adapter = get_adapter(provider)
    api_messages = [{"role": "user", "content": f"请根据以下聊天记录设计一个 Skill 指令文件：\n\n{conversation_text}"}]

    full_text = ""
    try:
        async for chunk, usage, thinking in adapter.chat_stream(
            api_messages=api_messages,
            model=model,
            api_key=api_key,
            system_prompt=CREATE_SKILL_SYSTEM_PROMPT,
            base_url=base_url or None,
        ):
            if chunk and not thinking:
                full_text += chunk
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Skill 生成请求失败: {str(e)[:200]}")

    # Extract skill name from first line (should be "# Skill Name")
    skill_md = full_text.strip()
    generated_name = ""
    first_line = skill_md.split("\n")[0] if skill_md else ""
    if first_line.startswith("# "):
        generated_name = first_line[2:].strip()
    else:
        generated_name = "自动生成的 Skill"

    # If user provided a name, use it; otherwise use generated
    final_name = user_name.strip() or generated_name

    # Replace the first line if user provided a custom name
    if user_name.strip() and first_line.startswith("# "):
        skill_md = f"# {final_name}" + skill_md[len(first_line):]

    return skill_md, final_name


# ============================================================
# Routes — static paths MUST come before /{conv_id}
# ============================================================


@router.get("/")
async def admin_list_conversations(
    user_id: str | None = None,
    agent_id: str | None = None,
    keyword: str | None = None,
    current_user: dict = Depends(require_permission("conversation:read")),
    db: AsyncSession = Depends(get_db),
):
    conversations = await list_conversations(db, user_id=user_id, agent_id=agent_id)
    users = {u["id"]: u for u in await list_users(db)}
    agents = {a["id"]: a for a in await list_agents(db)}
    conversations = _enrich_conversations(conversations, users, agents)
    # Keyword filter on title, user display name, and agent name
    if keyword:
        kw = keyword.lower()
        conversations = [
            c for c in conversations
            if kw in c.get("title", "").lower()
            or kw in c.get("user_display_name", "").lower()
            or kw in c.get("agent_name", "").lower()
        ]
    return conversations


@router.get("/users/list")
async def admin_list_users(
    current_user: dict = Depends(require_permission("conversation:read")),
    db: AsyncSession = Depends(get_db),
):
    """Return users who have at least one conversation, for filter dropdown."""
    conversations = await list_conversations(db)
    seen_user_ids: set[str] = set()
    for conv in conversations:
        uid = conv.get("user_id")
        if uid:
            seen_user_ids.add(uid)
    users = {u["id"]: u for u in await list_users(db)}
    return [
        {"id": uid, "display_name": users.get(uid, {}).get("display_name", uid)}
        for uid in sorted(seen_user_ids)
    ]


@router.get("/agents/list")
async def admin_list_agents(
    current_user: dict = Depends(require_permission("conversation:read")),
    db: AsyncSession = Depends(get_db),
):
    """Return agents who have at least one conversation, for filter dropdown."""
    conversations = await list_conversations(db)
    seen_agent_ids: set[str] = set()
    for conv in conversations:
        aid = conv.get("agent_id")
        if aid:
            seen_agent_ids.add(aid)
    agents = {a["id"]: a for a in await list_agents(db)}
    return [
        {"id": aid, "name": agents.get(aid, {}).get("name", aid)}
        for aid in sorted(seen_agent_ids)
    ]


@router.get("/skill-creator-context")
async def get_skill_creator_context(
    current_user: dict = Depends(require_permission("conversation:read")),
):
    """Return the qiuzhi-skill-creator SKILL.md content for sidebar AI context."""
    return {"content": _SKILL_CREATOR_CONTEXT}


@router.post("/analyze")
async def admin_analyze_conversations(
    request: ConversationAnalyzeRequest,
    current_user: dict = Depends(require_permission("conversation:read")),
    db: AsyncSession = Depends(get_db),
):
    """Analyze conversations by user or agent to generate skill iteration report."""
    user_id = None
    agent_id = None
    if request.scope == "user":
        user_id = request.target_id or None
    elif request.scope == "agent":
        agent_id = request.target_id or None

    conversations = await list_conversations(db, user_id=user_id, agent_id=agent_id)
    if not conversations:
        return ConversationAnalyzeResponse(
            summary="暂无足够对话数据进行分析",
            top_topics=[],
            suggested_new_skills=[],
            existing_skill_issues=[],
            overall_direction="",
        )

    conv_ids = [c["id"] for c in conversations[:50]]
    analysis_text = await _aggregate_conversation_texts(db, conv_ids)

    saved = await get_settings(db)
    provider_str = request.provider or saved.get("default_provider", "openai")
    model = request.model or saved.get("default_model", "gpt-4o")

    api_key, base_url = await _resolve_api_key(
        db, provider_str, model, request.api_key, request.base_url
    )

    return await _run_ai_analysis(db, analysis_text, model, provider_str, api_key, base_url)


@router.post("/analyze-selected")
async def admin_analyze_selected_conversations(
    request: ConversationAnalyzeSelectedRequest,
    current_user: dict = Depends(require_permission("conversation:read")),
    db: AsyncSession = Depends(get_db),
):
    """Analyze selected conversations by their IDs."""
    if not request.conversation_ids:
        return ConversationAnalyzeResponse(
            summary="未选择任何对话",
            top_topics=[],
            suggested_new_skills=[],
            existing_skill_issues=[],
            overall_direction="",
        )

    analysis_text = await _aggregate_conversation_texts(db, request.conversation_ids)

    saved = await get_settings(db)
    provider_str = request.provider or saved.get("default_provider", "openai")
    model = request.model or saved.get("default_model", "gpt-4o")

    api_key, base_url = await _resolve_api_key(
        db, provider_str, model, request.api_key, request.base_url
    )

    return await _run_ai_analysis(db, analysis_text, model, provider_str, api_key, base_url)


@router.post("/create-skill", response_model=ConversationCreateSkillResponse)
async def admin_create_skill_from_conversations(
    request: ConversationCreateSkillRequest,
    current_user: dict = Depends(require_permission("skill:create")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Skill by analyzing selected conversations."""
    if not request.conversation_ids:
        raise HTTPException(status_code=400, detail="未选择任何对话")

    # Aggregate conversation texts
    conversation_text = await _aggregate_conversation_texts(db, request.conversation_ids)

    # Resolve model config
    saved = await get_settings(db)
    provider_str = request.provider or saved.get("default_provider", "openai")
    model = request.model or saved.get("default_model", "gpt-4o")
    api_key, base_url = await _resolve_api_key(
        db, provider_str, model, request.api_key, request.base_url
    )

    # Generate SKILL.md via AI
    skill_md, skill_name = await _run_skill_creation(
        db, conversation_text, request.name, request.description,
        model, provider_str, api_key, base_url,
    )

    # Create skill record
    import uuid
    from datetime import datetime
    from ..core.config import settings

    skill_id = "skill_" + str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    skill_data = {
        "id": skill_id,
        "name": skill_name,
        "description": request.description or f"从 {len(request.conversation_ids)} 条对话记录自动生成的 Skill",
        "created_at": now,
        "updated_at": now,
    }
    result = await crud_create_skill(db, skill_data)
    await db.commit()

    # Write generated SKILL.md to file system
    skill_dir = settings.SKILLS_DIR / skill_id
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")

    return ConversationCreateSkillResponse(
        skill_id=result["id"],
        name=skill_name,
        skill_md_preview=skill_md[:500] + ("..." if len(skill_md) > 500 else ""),
    )


# ============================================================
# Dynamic routes — MUST come after all static routes
# ============================================================


@router.get("/{conv_id}")
async def admin_get_conversation(
    conv_id: str,
    current_user: dict = Depends(require_permission("conversation:read")),
    db: AsyncSession = Depends(get_db),
):
    conv = await get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    users = {u["id"]: u for u in await list_users(db)}
    agents = {a["id"]: a for a in await list_agents(db)}
    owner = users.get(conv.get("user_id", ""), {})
    conv["user_display_name"] = owner.get("display_name", conv.get("user_id", "未知用户"))
    agent = agents.get(conv.get("agent_id", ""), {})
    conv["agent_name"] = agent.get("name", conv.get("agent_id", "未知智能体"))
    return conv


@router.delete("/{conv_id}")
async def admin_delete_conversation(
    conv_id: str,
    current_user: dict = Depends(require_permission("conversation:delete")),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_conversation(db, conv_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="对话不存在")
    await db.commit()
    return {"status": "ok"}
