"""Async CRUD operations — replaces all _load_* / _save_* JSON patterns."""

import json
from datetime import datetime
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.orm import (
    User, Role, Department, Agent, Skill, Knowledge,
    KnowledgeSubmission, AppSettings, Conversation, RecycleBin,
    WikiSpace, WikiPage, WikiSource, WikiPageReference, WikiLog,
)


# ============================================================
# Helpers
# ============================================================

def _model_to_dict(obj) -> dict:
    """Convert a SQLAlchemy model instance to a plain dict."""
    if obj is None:
        return None
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def _now() -> str:
    return datetime.now().isoformat()


# ============================================================
# Users
# ============================================================

async def get_user(session: AsyncSession, user_id: str) -> dict | None:
    user = await session.get(User, user_id)
    return _model_to_dict(user)


async def get_user_by_username(session: AsyncSession, username: str) -> dict | None:
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    return _model_to_dict(user)


async def list_users(session: AsyncSession) -> list[dict]:
    result = await session.execute(select(User))
    return [_model_to_dict(u) for u in result.scalars().all()]


async def create_user(session: AsyncSession, data: dict) -> dict:
    user = User(**data)
    session.add(user)
    await session.flush()
    return _model_to_dict(user)


async def update_user(session: AsyncSession, user_id: str, data: dict) -> dict | None:
    user = await session.get(User, user_id)
    if not user:
        return None
    for key, value in data.items():
        setattr(user, key, value)
    await session.flush()
    return _model_to_dict(user)


async def delete_user(session: AsyncSession, user_id: str) -> bool:
    user = await session.get(User, user_id)
    if not user:
        return False
    await session.delete(user)
    await session.flush()
    return True


# ============================================================
# Roles
# ============================================================

async def get_role(session: AsyncSession, role_id: str) -> dict | None:
    role = await session.get(Role, role_id)
    return _model_to_dict(role)


async def list_roles(session: AsyncSession) -> list[dict]:
    result = await session.execute(select(Role))
    return [_model_to_dict(r) for r in result.scalars().all()]


async def create_role(session: AsyncSession, data: dict) -> dict:
    role = Role(**data)
    session.add(role)
    await session.flush()
    return _model_to_dict(role)


async def update_role(session: AsyncSession, role_id: str, data: dict) -> dict | None:
    role = await session.get(Role, role_id)
    if not role:
        return None
    for key, value in data.items():
        setattr(role, key, value)
    await session.flush()
    return _model_to_dict(role)


async def delete_role(session: AsyncSession, role_id: str) -> bool:
    role = await session.get(Role, role_id)
    if not role:
        return False
    await session.delete(role)
    await session.flush()
    return True


# ============================================================
# Departments
# ============================================================

async def get_department(session: AsyncSession, dept_id: str) -> dict | None:
    dept = await session.get(Department, dept_id)
    return _model_to_dict(dept)


async def list_departments(session: AsyncSession) -> list[dict]:
    result = await session.execute(select(Department))
    return [_model_to_dict(d) for d in result.scalars().all()]


async def create_department(session: AsyncSession, data: dict) -> dict:
    dept = Department(**data)
    session.add(dept)
    await session.flush()
    return _model_to_dict(dept)


async def update_department(session: AsyncSession, dept_id: str, data: dict) -> dict | None:
    dept = await session.get(Department, dept_id)
    if not dept:
        return None
    for key, value in data.items():
        setattr(dept, key, value)
    await session.flush()
    return _model_to_dict(dept)


async def delete_department(session: AsyncSession, dept_id: str) -> bool:
    dept = await session.get(Department, dept_id)
    if not dept:
        return False
    await session.delete(dept)
    await session.flush()
    return True


# ============================================================
# Agents
# ============================================================

async def get_agent(session: AsyncSession, agent_id: str) -> dict | None:
    agent = await session.get(Agent, agent_id)
    if agent and agent.is_deleted:
        return None
    return _model_to_dict(agent)


async def list_agents(session: AsyncSession) -> list[dict]:
    result = await session.execute(
        select(Agent).where(Agent.is_deleted == False)
    )
    return [_model_to_dict(a) for a in result.scalars().all()]


async def create_agent(session: AsyncSession, data: dict) -> dict:
    agent = Agent(**data)
    session.add(agent)
    await session.flush()
    return _model_to_dict(agent)


async def update_agent(session: AsyncSession, agent_id: str, data: dict) -> dict | None:
    agent = await session.get(Agent, agent_id)
    if not agent:
        return None
    for key, value in data.items():
        setattr(agent, key, value)
    await session.flush()
    return _model_to_dict(agent)


async def soft_delete_agent(session: AsyncSession, agent_id: str) -> bool:
    agent = await session.get(Agent, agent_id)
    if not agent:
        return False
    agent.is_deleted = True
    await session.flush()
    return True


async def delete_agent(session: AsyncSession, agent_id: str) -> bool:
    agent = await session.get(Agent, agent_id)
    if not agent:
        return False
    await session.delete(agent)
    await session.flush()
    return True


async def restore_agent(session: AsyncSession, agent_id: str) -> bool:
    agent = await session.get(Agent, agent_id)
    if not agent:
        return False
    agent.is_deleted = False
    await session.flush()
    return True


async def get_agent_include_deleted(session: AsyncSession, agent_id: str) -> dict | None:
    """Get agent regardless of is_deleted flag — for recycle bin restore."""
    agent = await session.get(Agent, agent_id)
    return _model_to_dict(agent)


# ============================================================
# Skills
# ============================================================

async def get_skill(session: AsyncSession, skill_id: str) -> dict | None:
    skill = await session.get(Skill, skill_id)
    return _model_to_dict(skill)


async def list_skills(session: AsyncSession) -> list[dict]:
    result = await session.execute(select(Skill))
    return [_model_to_dict(s) for s in result.scalars().all()]


async def create_skill(session: AsyncSession, data: dict) -> dict:
    skill = Skill(**data)
    session.add(skill)
    await session.flush()
    # Create folder structure
    from ..core.config import settings
    skill_dir = settings.SKILLS_DIR / skill.id
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text("", encoding="utf-8")
    return _model_to_dict(skill)


async def update_skill(session: AsyncSession, skill_id: str, data: dict) -> dict | None:
    skill = await session.get(Skill, skill_id)
    if not skill:
        return None
    for key, value in data.items():
        setattr(skill, key, value)
    await session.flush()
    return _model_to_dict(skill)


async def delete_skill(session: AsyncSession, skill_id: str) -> bool:
    import shutil
    from ..core.config import settings
    skill = await session.get(Skill, skill_id)
    if not skill:
        return False
    await session.delete(skill)
    await session.flush()
    # Delete folder
    skill_dir = settings.SKILLS_DIR / skill_id
    if skill_dir.exists():
        try:
            shutil.rmtree(str(skill_dir))
        except Exception:
            pass
    return True


# ============================================================
# Knowledge
# ============================================================

async def get_knowledge(session: AsyncSession, kb_id: str) -> dict | None:
    kb = await session.get(Knowledge, kb_id)
    return _model_to_dict(kb)


async def list_knowledge(session: AsyncSession) -> list[dict]:
    result = await session.execute(select(Knowledge))
    return [_model_to_dict(k) for k in result.scalars().all()]


async def list_knowledge_by_ids(session: AsyncSession, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    result = await session.execute(select(Knowledge).where(Knowledge.id.in_(ids)))
    return [_model_to_dict(k) for k in result.scalars().all()]


async def create_knowledge(session: AsyncSession, data: dict) -> dict:
    kb = Knowledge(**data)
    session.add(kb)
    await session.flush()
    return _model_to_dict(kb)


async def update_knowledge(session: AsyncSession, kb_id: str, data: dict) -> dict | None:
    kb = await session.get(Knowledge, kb_id)
    if not kb:
        return None
    for key, value in data.items():
        setattr(kb, key, value)
    await session.flush()
    return _model_to_dict(kb)


async def delete_knowledge(session: AsyncSession, kb_id: str) -> bool:
    kb = await session.get(Knowledge, kb_id)
    if not kb:
        return False
    await session.delete(kb)
    await session.flush()
    return True


# ============================================================
# Knowledge Submissions
# ============================================================

async def get_submission(session: AsyncSession, sub_id: str) -> dict | None:
    sub = await session.get(KnowledgeSubmission, sub_id)
    return _model_to_dict(sub)


async def count_pending_submissions(session: AsyncSession) -> int:
    result = await session.execute(
        select(func.count()).select_from(KnowledgeSubmission).where(KnowledgeSubmission.status == "pending")
    )
    return result.scalar() or 0


async def list_submissions(session: AsyncSession, status: str | None = None) -> list[dict]:
    stmt = select(KnowledgeSubmission)
    if status:
        stmt = stmt.where(KnowledgeSubmission.status == status)
    result = await session.execute(stmt.order_by(KnowledgeSubmission.created_at.desc()))
    return [_model_to_dict(s) for s in result.scalars().all()]


async def list_submissions_by_user(session: AsyncSession, user_id: str) -> list[dict]:
    result = await session.execute(
        select(KnowledgeSubmission)
        .where(KnowledgeSubmission.submitted_by == user_id)
        .order_by(KnowledgeSubmission.created_at.desc())
    )
    return [_model_to_dict(s) for s in result.scalars().all()]


async def list_pending_submissions_by_kb(session: AsyncSession, kb_id: str) -> list[dict]:
    """List pending append submissions targeting a specific knowledge base entry."""
    from sqlalchemy import and_
    result = await session.execute(
        select(KnowledgeSubmission)
        .where(
            and_(
                KnowledgeSubmission.target_kb_id == kb_id,
                KnowledgeSubmission.status == "pending",
                KnowledgeSubmission.action_type == "append",
            )
        )
        .order_by(KnowledgeSubmission.created_at.desc())
    )
    return [_model_to_dict(s) for s in result.scalars().all()]


async def find_pending_cell_submission(session: AsyncSession, kb_id: str, target_row: int, target_column: int, exclude_user_id: str | None = None) -> dict | None:
    """Find a pending cell-fill submission for a specific cell. Optionally exclude a user's own submission."""
    from sqlalchemy import and_
    stmt = select(KnowledgeSubmission).where(
        and_(
            KnowledgeSubmission.target_kb_id == kb_id,
            KnowledgeSubmission.status == "pending",
            KnowledgeSubmission.action_type == "append",
            KnowledgeSubmission.target_row == target_row,
            KnowledgeSubmission.target_column == target_column,
        )
    )
    if exclude_user_id:
        stmt = stmt.where(KnowledgeSubmission.submitted_by != exclude_user_id)
    result = await session.execute(stmt.order_by(KnowledgeSubmission.created_at.desc()))
    row = result.scalars().first()
    return _model_to_dict(row) if row else None


async def create_submission(session: AsyncSession, data: dict) -> dict:
    sub = KnowledgeSubmission(**data)
    session.add(sub)
    await session.flush()
    return _model_to_dict(sub)


async def update_submission(session: AsyncSession, sub_id: str, data: dict) -> dict | None:
    sub = await session.get(KnowledgeSubmission, sub_id)
    if not sub:
        return None
    for key, value in data.items():
        setattr(sub, key, value)
    await session.flush()
    return _model_to_dict(sub)


# ============================================================
# Settings (singleton)
# ============================================================

DEFAULT_SETTINGS = {
    "providers": {
        "openai": {"api_key": "", "base_url": "https://api.openai.com/v1", "enabled": True},
        "claude": {"api_key": "", "base_url": "https://api.anthropic.com", "enabled": True},
        "gemini": {"api_key": "", "base_url": "", "enabled": True},
        "deepseek": {"api_key": "", "base_url": "https://api.deepseek.com", "enabled": True},
    },
    "default_provider": "openai",
    "default_model": "gpt-4o",
    "temperature": 0.7,
    "max_tokens": 4096,
    "custom_models": [],
    "memory_dir": "./data/conversations",
    "recycle_bin_days": 30,
}


async def get_settings(session: AsyncSession) -> dict:
    settings = await session.get(AppSettings, "default")
    if not settings:
        # Create defaults
        settings = AppSettings(id="default")
        session.add(settings)
        await session.flush()
    result = _model_to_dict(settings)
    # Merge with defaults for any missing keys
    import copy
    defaults = copy.deepcopy(DEFAULT_SETTINGS)
    for key, default_val in defaults.items():
        if key not in result or result[key] is None:
            result[key] = default_val
        elif key == "providers" and isinstance(default_val, dict):
            for prov, prov_defaults in default_val.items():
                if prov not in result["providers"]:
                    result["providers"][prov] = prov_defaults
                elif isinstance(prov_defaults, dict):
                    for field, field_default in prov_defaults.items():
                        if field not in result["providers"][prov]:
                            result["providers"][prov][field] = field_default
    return result


async def update_settings(session: AsyncSession, data: dict) -> dict:
    settings = await session.get(AppSettings, "default")
    if not settings:
        settings = AppSettings(id="default")
        session.add(settings)
    for key, value in data.items():
        if key != "id":
            setattr(settings, key, value)
    await session.flush()
    return _model_to_dict(settings)


# ============================================================
# Conversations
# ============================================================

async def get_conversation(session: AsyncSession, conv_id: str) -> dict | None:
    conv = await session.get(Conversation, conv_id)
    return _model_to_dict(conv)


async def list_conversations(session: AsyncSession, user_id: str | None = None, agent_id: str | None = None) -> list[dict]:
    stmt = select(Conversation)
    if user_id:
        stmt = stmt.where(Conversation.user_id == user_id)
    if agent_id:
        stmt = stmt.where(Conversation.agent_id == agent_id)
    stmt = stmt.order_by(Conversation.created_at.desc())
    result = await session.execute(stmt)
    convs = []
    for conv in result.scalars().all():
        d = _model_to_dict(conv)
        d["message_count"] = len(d.get("messages", []))
        del d["messages"]
        convs.append(d)
    return convs


async def create_conversation(session: AsyncSession, data: dict) -> dict:
    conv = Conversation(**data)
    session.add(conv)
    await session.flush()
    return _model_to_dict(conv)


async def update_conversation(session: AsyncSession, conv_id: str, data: dict) -> dict | None:
    conv = await session.get(Conversation, conv_id)
    if not conv:
        return None
    for key, value in data.items():
        setattr(conv, key, value)
    await session.flush()
    return _model_to_dict(conv)


async def delete_conversation(session: AsyncSession, conv_id: str) -> bool:
    conv = await session.get(Conversation, conv_id)
    if not conv:
        return False
    await session.delete(conv)
    await session.flush()
    return True


# ============================================================
# Recycle Bin
# ============================================================

async def get_recycle_item(session: AsyncSession, rb_id: str) -> dict | None:
    item = await session.get(RecycleBin, rb_id)
    return _model_to_dict(item)


async def list_recycle_bin(session: AsyncSession, entity_type: str | None = None) -> list[dict]:
    stmt = select(RecycleBin)
    if entity_type:
        stmt = stmt.where(RecycleBin.entity_type == entity_type)
    stmt = stmt.order_by(RecycleBin.deleted_at.desc())
    result = await session.execute(stmt)
    items = []
    for item in result.scalars().all():
        d = _model_to_dict(item)
        entity_data = d.get("entity_data", {})
        d["entity_name"] = entity_data.get("name") or entity_data.get("title") or entity_data.get("username") or ""
        items.append(d)
    return items


async def create_recycle_item(session: AsyncSession, data: dict) -> dict:
    import uuid
    from datetime import timedelta
    if "id" not in data:
        data["id"] = "rb_" + uuid.uuid4().hex[:12]
    if "deleted_at" not in data:
        data["deleted_at"] = _now()
    if "expires_at" not in data:
        expire_days = 30
        s = await get_settings(session)
        expire_days = s.get("recycle_bin_days", 30)
        expires = datetime.fromisoformat(data["deleted_at"]) + timedelta(days=expire_days)
        data["expires_at"] = expires.isoformat()
    item = RecycleBin(**data)
    session.add(item)
    await session.flush()
    return _model_to_dict(item)


async def delete_recycle_item(session: AsyncSession, rb_id: str) -> bool:
    item = await session.get(RecycleBin, rb_id)
    if not item:
        return False
    await session.delete(item)
    await session.flush()
    return True


async def purge_expired(session: AsyncSession) -> int:
    now = _now()
    result = await session.execute(
        select(RecycleBin).where(RecycleBin.expires_at <= now)
    )
    expired = result.scalars().all()
    for item in expired:
        await session.delete(item)
    if expired:
        await session.flush()
    return len(expired)


# ============================================================
# Wiki Spaces
# ============================================================

async def get_wiki_space(session: AsyncSession, space_id: str) -> dict | None:
    obj = await session.get(WikiSpace, space_id)
    return _model_to_dict(obj)


async def list_wiki_spaces(session: AsyncSession) -> list[dict]:
    result = await session.execute(select(WikiSpace).order_by(WikiSpace.created_at.desc()))
    return [_model_to_dict(o) for o in result.scalars().all()]


async def create_wiki_space(session: AsyncSession, data: dict) -> dict:
    obj = WikiSpace(**data)
    session.add(obj)
    await session.flush()
    return _model_to_dict(obj)


async def update_wiki_space(session: AsyncSession, space_id: str, data: dict) -> dict | None:
    obj = await session.get(WikiSpace, space_id)
    if not obj:
        return None
    for key, value in data.items():
        setattr(obj, key, value)
    await session.flush()
    return _model_to_dict(obj)


async def delete_wiki_space(session: AsyncSession, space_id: str) -> bool:
    obj = await session.get(WikiSpace, space_id)
    if not obj:
        return False
    await session.delete(obj)
    await session.flush()
    return True


# ============================================================
# Wiki Pages
# ============================================================

async def get_wiki_page(session: AsyncSession, page_id: str) -> dict | None:
    obj = await session.get(WikiPage, page_id)
    return _model_to_dict(obj)


async def list_wiki_pages(session: AsyncSession, space_id: str) -> list[dict]:
    result = await session.execute(
        select(WikiPage).where(WikiPage.space_id == space_id).order_by(WikiPage.updated_at.desc())
    )
    return [_model_to_dict(o) for o in result.scalars().all()]


async def list_wiki_pages_by_ids(session: AsyncSession, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    result = await session.execute(select(WikiPage).where(WikiPage.id.in_(ids)))
    return [_model_to_dict(o) for o in result.scalars().all()]


async def create_wiki_page(session: AsyncSession, data: dict) -> dict:
    obj = WikiPage(**data)
    session.add(obj)
    await session.flush()
    return _model_to_dict(obj)


async def update_wiki_page(session: AsyncSession, page_id: str, data: dict) -> dict | None:
    obj = await session.get(WikiPage, page_id)
    if not obj:
        return None
    for key, value in data.items():
        setattr(obj, key, value)
    await session.flush()
    return _model_to_dict(obj)


async def delete_wiki_page(session: AsyncSession, page_id: str) -> bool:
    obj = await session.get(WikiPage, page_id)
    if not obj:
        return False
    await session.delete(obj)
    await session.flush()
    return True


async def search_wiki_pages(session: AsyncSession, space_id: str, query: str) -> list[dict]:
    pattern = f"%{query}%"
    result = await session.execute(
        select(WikiPage)
        .where(WikiPage.space_id == space_id)
        .where(or_(WikiPage.title.like(pattern), WikiPage.content.like(pattern)))
        .order_by(WikiPage.updated_at.desc())
    )
    return [_model_to_dict(o) for o in result.scalars().all()]


# ============================================================
# Wiki Sources
# ============================================================

async def get_wiki_source(session: AsyncSession, source_id: str) -> dict | None:
    obj = await session.get(WikiSource, source_id)
    return _model_to_dict(obj)


async def list_wiki_sources(session: AsyncSession, space_id: str) -> list[dict]:
    result = await session.execute(
        select(WikiSource).where(WikiSource.space_id == space_id).order_by(WikiSource.created_at.desc())
    )
    return [_model_to_dict(o) for o in result.scalars().all()]


async def create_wiki_source(session: AsyncSession, data: dict) -> dict:
    obj = WikiSource(**data)
    session.add(obj)
    await session.flush()
    return _model_to_dict(obj)


async def delete_wiki_source(session: AsyncSession, source_id: str) -> bool:
    obj = await session.get(WikiSource, source_id)
    if not obj:
        return False
    await session.delete(obj)
    await session.flush()
    return True


# ============================================================
# Wiki Page References
# ============================================================

async def get_references_for_page(session: AsyncSession, page_id: str) -> list[dict]:
    result = await session.execute(
        select(WikiPageReference).where(
            or_(WikiPageReference.from_page_id == page_id, WikiPageReference.to_page_id == page_id)
        )
    )
    return [_model_to_dict(o) for o in result.scalars().all()]


async def create_wiki_reference(session: AsyncSession, data: dict) -> dict:
    obj = WikiPageReference(**data)
    session.add(obj)
    await session.flush()
    return _model_to_dict(obj)


async def delete_references_for_page(session: AsyncSession, page_id: str) -> int:
    result = await session.execute(
        select(WikiPageReference).where(
            or_(WikiPageReference.from_page_id == page_id, WikiPageReference.to_page_id == page_id)
        )
    )
    refs = result.scalars().all()
    for ref in refs:
        await session.delete(ref)
    if refs:
        await session.flush()
    return len(refs)


# ============================================================
# Wiki Logs
# ============================================================

async def list_wiki_logs(session: AsyncSession, space_id: str) -> list[dict]:
    result = await session.execute(
        select(WikiLog).where(WikiLog.space_id == space_id).order_by(WikiLog.created_at.desc())
    )
    return [_model_to_dict(o) for o in result.scalars().all()]


async def create_wiki_log(session: AsyncSession, data: dict) -> dict:
    obj = WikiLog(**data)
    session.add(obj)
    await session.flush()
    return _model_to_dict(obj)
