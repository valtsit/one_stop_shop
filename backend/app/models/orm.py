"""SQLAlchemy ORM models — replaces JSON file storage."""

from sqlalchemy import Column, String, Text, Integer, Float, Boolean, JSON
from ..core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    display_name = Column(String, default="")
    email = Column(String, default="")
    phone = Column(String, default="")
    role_id = Column(String, index=True, default="")
    department_id = Column(String, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(String, default="")
    updated_at = Column(String, default="")


class Role(Base):
    __tablename__ = "roles"

    id = Column(String, primary_key=True)
    name = Column(String)
    description = Column(String, default="")
    permissions = Column(JSON, default=list)
    created_at = Column(String, default="")
    updated_at = Column(String, default="")


class Department(Base):
    __tablename__ = "departments"

    id = Column(String, primary_key=True)
    name = Column(String)
    description = Column(String, default="")
    parent_id = Column(String, index=True, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(String, default="")
    updated_at = Column(String, default="")


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True)
    name = Column(String)
    description = Column(String, default="")
    icon = Column(String, default="🤖")
    icon_bg_color = Column(String, default="#7c6cf014")
    icon_color = Column(String, default="#7c6cf0")
    category = Column(String, default="general")
    system_prompt = Column(Text, default="")
    welcome_message = Column(Text, default="")
    suggestions = Column(JSON, default=list)
    knowledge_files = Column(JSON, default=list)
    default_model = Column(String, default="gpt-4o")
    default_provider = Column(String, default="openai")
    department_id = Column(String, default="")
    skills = Column(JSON, default=list)
    knowledge_ids = Column(JSON, default=list)
    is_default = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(String, default="")
    updated_at = Column(String, default="")


class Skill(Base):
    __tablename__ = "skills"

    id = Column(String, primary_key=True)
    name = Column(String)
    description = Column(String, default="")
    content = Column(Text, default="")
    files = Column(JSON, default=list)
    created_at = Column(String, default="")
    updated_at = Column(String, default="")


class Knowledge(Base):
    __tablename__ = "knowledge"

    id = Column(String, primary_key=True)
    title = Column(String)
    content = Column(Text, default="")
    tags = Column(JSON, default=list)
    format = Column(String, default="text")
    columns = Column(JSON, default=list)
    rows = Column(JSON, default=list)
    skip_review = Column(Boolean, default=False)
    created_at = Column(String, default="")
    updated_at = Column(String, default="")


class KnowledgeSubmission(Base):
    __tablename__ = "knowledge_submissions"

    id = Column(String, primary_key=True)
    selected_text = Column(Text, default="")
    title = Column(String, default="")
    tags = Column(JSON, default=list)
    action_type = Column(String, default="create")
    target_kb_id = Column(String, nullable=True)
    target_row = Column(Integer, default=-1)
    target_column = Column(Integer, default=0)
    row_values = Column(JSON, default=list)
    status = Column(String, default="pending")
    submitted_by = Column(String, index=True, default="")
    submitted_by_name = Column(String, default="")
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(String, nullable=True)
    reject_reason = Column(String, nullable=True)
    created_at = Column(String, default="")
    updated_at = Column(String, default="")


class AppSettings(Base):
    """Singleton table — always id='default'."""
    __tablename__ = "settings"

    id = Column(String, primary_key=True, default="default")
    providers = Column(JSON, default=dict)
    default_provider = Column(String, default="openai")
    default_model = Column(String, default="gpt-4o")
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=4096)
    custom_models = Column(JSON, default=list)
    memory_dir = Column(String, default="./data/conversations")
    recycle_bin_days = Column(Integer, default=30)


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    agent_id = Column(String, index=True)
    title = Column(String, default="")
    model = Column(String, default="")
    provider = Column(String, default="")
    messages = Column(JSON, default=list)
    created_at = Column(String, index=True, default="")
    updated_at = Column(String, default="")


class RecycleBin(Base):
    __tablename__ = "recycle_bin"

    id = Column(String, primary_key=True)
    entity_type = Column(String, index=True)
    entity_id = Column(String)
    entity_data = Column(JSON, default=dict)
    deleted_by = Column(String, default="")
    deleted_at = Column(String, index=True, default="")
    expires_at = Column(String, index=True, default="")


# ============================================================
# Wiki Knowledge Base
# ============================================================

class WikiSpace(Base):
    __tablename__ = "wiki_spaces"

    id = Column(String, primary_key=True)
    name = Column(String)
    description = Column(Text, default="")
    icon = Column(String, default="Wiki")
    created_by = Column(String, index=True, default="")
    created_at = Column(String, default="")
    updated_at = Column(String, default="")


class WikiPage(Base):
    __tablename__ = "wiki_pages"

    id = Column(String, primary_key=True)
    space_id = Column(String, index=True)
    title = Column(String)
    slug = Column(String, default="")
    content = Column(Text, default="")
    page_type = Column(String, default="article")
    tags = Column(JSON, default=list)
    source_ids = Column(JSON, default=list)
    word_count = Column(Integer, default=0)
    created_by = Column(String, index=True, default="")
    created_at = Column(String, default="")
    updated_at = Column(String, default="")


class WikiSource(Base):
    __tablename__ = "wiki_sources"

    id = Column(String, primary_key=True)
    space_id = Column(String, index=True)
    title = Column(String)
    content = Column(Text, default="")
    source_type = Column(String, default="text")
    file_path = Column(String, default="")
    source_metadata = Column(JSON, default=dict)
    created_by = Column(String, index=True, default="")
    created_at = Column(String, default="")


class WikiPageReference(Base):
    __tablename__ = "wiki_page_references"

    id = Column(String, primary_key=True)
    from_page_id = Column(String, index=True)
    to_page_id = Column(String, index=True)
    context = Column(Text, default="")
    created_at = Column(String, default="")


class WikiLog(Base):
    __tablename__ = "wiki_logs"

    id = Column(String, primary_key=True)
    space_id = Column(String, index=True)
    action = Column(String)
    summary = Column(String)
    detail = Column(Text, default="")
    page_ids = Column(JSON, default=list)
    performed_by = Column(String, default="")
    created_at = Column(String, default="")
