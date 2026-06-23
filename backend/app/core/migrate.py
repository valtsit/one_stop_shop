"""One-time migration: JSON files → SQLite. Runs on startup, idempotent."""


async def migrate_schema():
    """Apply incremental schema changes for existing databases."""
    from .database import engine

    async with engine.begin() as conn:
        # Add skip_review column to knowledge table
        result = await conn.execute(text("PRAGMA table_info(knowledge)"))
        columns = {row[1] for row in result.fetchall()}
        if "skip_review" not in columns:
            await conn.execute(text("ALTER TABLE knowledge ADD COLUMN skip_review BOOLEAN DEFAULT 0"))
            print("[MIGRATE] knowledge.skip_review column added")

        # Add row_values column to knowledge_submissions table
        result = await conn.execute(text("PRAGMA table_info(knowledge_submissions)"))
        columns = {row[1] for row in result.fetchall()}
        if "row_values" not in columns:
            await conn.execute(text("ALTER TABLE knowledge_submissions ADD COLUMN row_values JSON DEFAULT '[]'"))
            print("[MIGRATE] knowledge_submissions.row_values column added")

import json
import shutil
from pathlib import Path
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import async_session
from ..models.orm import (
    User, Role, Department, Agent, Skill, Knowledge,
    KnowledgeSubmission, AppSettings, Conversation, RecycleBin,
)

DATA_DIR = Path("./data")


async def run_migration() -> bool:
    """Migrate all JSON data to SQLite. Skips if DB already has data.

    Returns True if migration was performed (JSON data existed), False otherwise.
    """
    async with async_session() as session:
        # Check if already migrated
        result = await session.execute(text("SELECT COUNT(*) FROM users"))
        if result.scalar() > 0:
            return False  # Already migrated

        print("[MIGRATE] Starting JSON → SQLite migration...")

        await _migrate_roles(session)
        await _migrate_departments(session)
        await _migrate_users(session)
        await _migrate_agents(session)
        await _migrate_skills(session)
        await _migrate_knowledge(session)
        await _migrate_knowledge_submissions(session)
        await _migrate_settings(session)
        await _migrate_recycle_bin(session)
        await _migrate_conversations(session)

        await session.commit()

    # Rename JSON files to .bak after successful migration
    _backup_json_files()
    print("[MIGRATE] Migration complete.")
    return True


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _read_json_list(path: Path) -> list:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


async def _migrate_roles(session: AsyncSession):
    data = _read_json(DATA_DIR / "roles.json")
    if not data:
        return
    for role_data in data.values():
        session.add(Role(
            id=role_data["id"],
            name=role_data.get("name", ""),
            description=role_data.get("description", ""),
            permissions=role_data.get("permissions", []),
            created_at=role_data.get("created_at", ""),
            updated_at=role_data.get("updated_at", ""),
        ))
    print(f"[MIGRATE] roles: {len(data)}")


async def _migrate_departments(session: AsyncSession):
    data = _read_json(DATA_DIR / "departments.json")
    if not data:
        return
    for dept_data in data.values():
        session.add(Department(
            id=dept_data["id"],
            name=dept_data.get("name", ""),
            description=dept_data.get("description", ""),
            parent_id=dept_data.get("parent_id"),
            sort_order=dept_data.get("sort_order", 0),
            created_at=dept_data.get("created_at", ""),
            updated_at=dept_data.get("updated_at", ""),
        ))
    print(f"[MIGRATE] departments: {len(data)}")


async def _migrate_users(session: AsyncSession):
    data = _read_json(DATA_DIR / "users.json")
    if not data:
        return
    for user_data in data.values():
        session.add(User(
            id=user_data["id"],
            username=user_data.get("username", ""),
            password_hash=user_data.get("password_hash", ""),
            display_name=user_data.get("display_name", ""),
            email=user_data.get("email", ""),
            phone=user_data.get("phone", ""),
            role_id=user_data.get("role_id", ""),
            department_id=user_data.get("department_id", ""),
            is_active=user_data.get("is_active", True),
            created_at=user_data.get("created_at", ""),
            updated_at=user_data.get("updated_at", ""),
        ))
    print(f"[MIGRATE] users: {len(data)}")


async def _migrate_agents(session: AsyncSession):
    # Import DEFAULT_AGENTS from agents module
    from ..api.agents import DEFAULT_AGENTS

    # Start with default agents (marked as is_default=True)
    agents = {}
    for a in DEFAULT_AGENTS:
        agents[a["id"]] = {**a, "is_default": True, "is_deleted": False}

    # Merge user-created agents from JSON
    data = _read_json(DATA_DIR / "agents.json")
    for aid, adata in data.items():
        agents[aid] = {**adata, "is_default": aid in {a["id"] for a in DEFAULT_AGENTS}, "is_deleted": False}

    # Apply deleted_agents
    deleted_ids = set()
    del_file = DATA_DIR / "deleted_agents.json"
    if del_file.exists():
        try:
            deleted_ids = set(json.loads(del_file.read_text(encoding="utf-8")))
        except Exception:
            pass

    for agent_data in agents.values():
        aid = agent_data["id"]
        session.add(Agent(
            id=aid,
            name=agent_data.get("name", ""),
            description=agent_data.get("description", ""),
            icon=agent_data.get("icon", "🤖"),
            icon_bg_color=agent_data.get("icon_bg_color", "#7c6cf014"),
            icon_color=agent_data.get("icon_color", "#7c6cf0"),
            category=agent_data.get("category", "general"),
            system_prompt=agent_data.get("system_prompt", ""),
            welcome_message=agent_data.get("welcome_message", ""),
            suggestions=agent_data.get("suggestions", []),
            knowledge_files=agent_data.get("knowledge_files", []),
            default_model=agent_data.get("default_model", "gpt-4o"),
            default_provider=agent_data.get("default_provider", "openai"),
            department_id=agent_data.get("department_id", ""),
            skills=agent_data.get("skills", []),
            knowledge_ids=agent_data.get("knowledge_ids", []),
            is_default=agent_data.get("is_default", False),
            is_deleted=aid in deleted_ids,
            created_at=agent_data.get("created_at", ""),
            updated_at=agent_data.get("updated_at", ""),
        ))
    print(f"[MIGRATE] agents: {len(agents)} (deleted: {len(deleted_ids & set(agents.keys()))})")


async def _migrate_skills(session: AsyncSession):
    data = _read_json(DATA_DIR / "skills.json")
    if not data:
        return
    for skill_data in data.values():
        session.add(Skill(
            id=skill_data["id"],
            name=skill_data.get("name", ""),
            description=skill_data.get("description", ""),
            content=skill_data.get("content", ""),
            files=skill_data.get("files", []),
            created_at=skill_data.get("created_at", ""),
            updated_at=skill_data.get("updated_at", ""),
        ))
    print(f"[MIGRATE] skills: {len(data)}")


async def _migrate_knowledge(session: AsyncSession):
    data = _read_json(DATA_DIR / "knowledge.json")
    if not data:
        return
    for kb_data in data.values():
        session.add(Knowledge(
            id=kb_data["id"],
            title=kb_data.get("title", ""),
            content=kb_data.get("content", ""),
            tags=kb_data.get("tags", []),
            format=kb_data.get("format", "text"),
            columns=kb_data.get("columns", []),
            rows=kb_data.get("rows", []),
            created_at=kb_data.get("created_at", ""),
            updated_at=kb_data.get("updated_at", ""),
        ))
    print(f"[MIGRATE] knowledge: {len(data)}")


async def _migrate_knowledge_submissions(session: AsyncSession):
    data = _read_json(DATA_DIR / "knowledge_submissions.json")
    if not data:
        return
    for sub_data in data.values():
        session.add(KnowledgeSubmission(
            id=sub_data["id"],
            selected_text=sub_data.get("selected_text", ""),
            title=sub_data.get("title", ""),
            tags=sub_data.get("tags", []),
            action_type=sub_data.get("action_type", "create"),
            target_kb_id=sub_data.get("target_kb_id"),
            target_row=sub_data.get("target_row", -1),
            target_column=sub_data.get("target_column", 0),
            status=sub_data.get("status", "pending"),
            submitted_by=sub_data.get("submitted_by", ""),
            submitted_by_name=sub_data.get("submitted_by_name", ""),
            reviewed_by=sub_data.get("reviewed_by"),
            reviewed_at=sub_data.get("reviewed_at"),
            reject_reason=sub_data.get("reject_reason"),
            created_at=sub_data.get("created_at", ""),
            updated_at=sub_data.get("updated_at", ""),
        ))
    print(f"[MIGRATE] knowledge_submissions: {len(data)}")


async def _migrate_settings(session: AsyncSession):
    data = _read_json(DATA_DIR / "settings.json")
    if not data:
        # Insert default settings
        session.add(AppSettings(id="default"))
        print("[MIGRATE] settings: default")
        return

    session.add(AppSettings(
        id="default",
        providers=data.get("providers", {}),
        default_provider=data.get("default_provider", "openai"),
        default_model=data.get("default_model", "gpt-4o"),
        temperature=data.get("temperature", 0.7),
        max_tokens=data.get("max_tokens", 4096),
        custom_models=data.get("custom_models", []),
        memory_dir=data.get("memory_dir", "./data/conversations"),
        recycle_bin_days=data.get("recycle_bin_days", 30),
    ))
    print("[MIGRATE] settings: 1")


async def _migrate_recycle_bin(session: AsyncSession):
    data = _read_json(DATA_DIR / "recycle_bin.json")
    if not data:
        return
    for rb_data in data.values():
        session.add(RecycleBin(
            id=rb_data["id"],
            entity_type=rb_data.get("entity_type", ""),
            entity_id=rb_data.get("entity_id", ""),
            entity_data=rb_data.get("entity_data", {}),
            deleted_by=rb_data.get("deleted_by", ""),
            deleted_at=rb_data.get("deleted_at", ""),
            expires_at=rb_data.get("expires_at", ""),
        ))
    print(f"[MIGRATE] recycle_bin: {len(data)}")


async def _migrate_conversations(session: AsyncSession):
    conv_dir = DATA_DIR / "conversations"
    if not conv_dir.exists():
        return

    count = 0
    for f in sorted(conv_dir.glob("*.json")):
        try:
            conv = json.loads(f.read_text(encoding="utf-8"))
            session.add(Conversation(
                id=conv["id"],
                user_id=conv.get("user_id", ""),
                agent_id=conv.get("agent_id", ""),
                title=conv.get("title", ""),
                model=conv.get("model", ""),
                provider=conv.get("provider", ""),
                messages=conv.get("messages", []),
                created_at=conv.get("created_at", ""),
                updated_at=conv.get("updated_at", ""),
            ))
            count += 1
        except Exception:
            continue
    print(f"[MIGRATE] conversations: {count}")


def _backup_json_files():
    """Rename .json files to .json.bak after successful migration."""
    backup_names = [
        "roles.json", "departments.json", "users.json", "agents.json",
        "deleted_agents.json", "skills.json", "knowledge.json",
        "knowledge_submissions.json", "settings.json", "recycle_bin.json",
    ]
    for name in backup_names:
        src = DATA_DIR / name
        if src.exists():
            dst = DATA_DIR / f"{name}.bak"
            try:
                shutil.move(str(src), str(dst))
            except Exception:
                pass

    # Backup conversations directory
    conv_dir = DATA_DIR / "conversations"
    conv_bak = DATA_DIR / "conversations.bak"
    if conv_dir.exists() and not conv_bak.exists():
        try:
            shutil.move(str(conv_dir), str(conv_bak))
        except Exception:
            pass


# ============================================================
# Skill folder migration (content/files → directory structure)
# ============================================================

async def migrate_skills_to_folders(session: AsyncSession):
    """Migrate existing skill records from DB content/files to folder structure.

    Idempotent: skips skills that already have a folder.
    """
    from ..core.config import settings
    from ..models.orm import Skill

    skills_dir = settings.SKILLS_DIR
    result = await session.execute(select(Skill))
    skills = result.scalars().all()
    migrated = 0
    for skill in skills:
        skill_dir = skills_dir / skill.id
        if skill_dir.exists():
            continue
        skill_dir.mkdir(parents=True, exist_ok=True)

        # Write SKILL.md from content
        skill_md = skill_dir / "SKILL.md"
        content = (skill.content or "").strip()
        if content:
            skill_md.write_text(content, encoding="utf-8")
        else:
            skill_md.write_text("", encoding="utf-8")

        # Migrate files to references/
        files = skill.files or []
        if files:
            refs_dir = skill_dir / "references"
            refs_dir.mkdir(exist_ok=True)
            for file_path_str in files:
                src = settings.UPLOAD_DIR / Path(file_path_str).name
                if src.exists():
                    dst = refs_dir / src.name
                    try:
                        shutil.copy2(str(src), str(dst))
                    except Exception:
                        pass

        migrated += 1
    if migrated:
        print(f"[MIGRATE] skills → folders: {migrated}")
