from pydantic import BaseModel
from typing import Optional
from enum import Enum


class ModelProvider(str, Enum):
    OPENAI = "openai"
    CLAUDE = "claude"
    GEMINI = "gemini"
    DEEPSEEK = "deepseek"


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str
    files: Optional[list[dict]] = None  # [{filename, path}] for user uploads


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str = "gpt-4o"
    provider: ModelProvider = ModelProvider.OPENAI
    api_key: Optional[str] = None
    base_url: Optional[str] = None  # Custom endpoint URL
    headers: Optional[dict[str, str]] = None  # Custom request headers
    tool_id: Optional[str] = None
    system_prompt: Optional[str] = None
    search_results: Optional[list[dict]] = None
    knowledge_ids: Optional[list[str]] = None
    selected_kb_ids: Optional[list[str]] = None  # @-selected entries — inject directly


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost: float = 0.0  # in USD


class ChatResponse(BaseModel):
    content: str
    usage: TokenUsage
    model: str


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    icon: str = "🤖"
    icon_bg_color: str = "#7c6cf014"
    icon_color: str = "#7c6cf0"
    category: str = "general"
    system_prompt: str = ""
    welcome_message: str = ""
    suggestions: list[str] = []
    knowledge_files: list[str] = []
    default_model: str = "gpt-4o"
    default_provider: str = "openai"
    department_id: str = ""
    skills: list[str] = []
    knowledge_ids: list[str] = []


class AgentResponse(AgentCreate):
    id: str
    created_at: str
    updated_at: str


class SkillCreate(BaseModel):
    name: str
    description: str = ""


class SkillUpdate(BaseModel):
    name: str = ""
    description: str = ""
    skill_md: str = ""


class SkillStructure(BaseModel):
    skill_md: bool = False
    references: list[str] = []
    scripts: list[str] = []
    assets: list[str] = []


class SkillResponse(BaseModel):
    id: str
    name: str
    description: str = ""
    created_at: str
    updated_at: str
    structure: SkillStructure = SkillStructure()


# ---- RBAC / Auth Models ----


class UserCreate(BaseModel):
    username: str
    password: str
    display_name: str = ""
    email: str = ""
    phone: str = ""
    role_id: str = ""
    department_id: str = ""
    is_active: bool = True


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    email: str
    phone: str
    role_id: str
    department_id: str
    is_active: bool
    created_at: str
    updated_at: str


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RoleCreate(BaseModel):
    name: str
    description: str = ""
    permissions: list[str] = []


class RoleResponse(RoleCreate):
    id: str
    created_at: str
    updated_at: str


class DepartmentCreate(BaseModel):
    name: str
    description: str = ""
    parent_id: str | None = None
    sort_order: int = 0


class DepartmentResponse(DepartmentCreate):
    id: str
    created_at: str
    updated_at: str


class DepartmentTree(DepartmentResponse):
    children: list["DepartmentTree"] = []


class UserUpdate(BaseModel):
    display_name: str = ""
    email: str = ""
    phone: str = ""
    role_id: str = ""
    department_id: str = ""
    is_active: bool = True


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class ResetPasswordRequest(BaseModel):
    new_password: str


class RoleUpdate(BaseModel):
    name: str
    description: str = ""
    permissions: list[str] = []


class KnowledgeCreate(BaseModel):
    title: str
    content: str = ""
    tags: list[str] = []
    format: str = "text"  # "text" | "table"
    columns: list[str] = []
    rows: list[list[str]] = []
    skip_review: bool = False


class PendingCellInfo(BaseModel):
    row: int
    col: int
    text: str
    submitted_by: str
    submitted_by_name: str
    created_at: str


class KnowledgeResponse(KnowledgeCreate):
    id: str
    created_at: str
    updated_at: str
    pending_cells: list[PendingCellInfo] = []


class KnowledgeSubmissionCreate(BaseModel):
    selected_text: str
    title: str = ""
    tags: list[str] = []
    action_type: str = "create"  # "create" | "append"
    target_kb_id: str | None = None
    target_row: int = -1  # -1 = new row
    target_column: int = 0
    row_values: list[str] = []


class KnowledgeSubmissionResponse(BaseModel):
    id: str
    selected_text: str
    title: str
    tags: list[str]
    action_type: str
    target_kb_id: str | None
    target_row: int = -1
    target_column: int = 0
    row_values: list[str] = []
    status: str  # "pending" | "approved" | "rejected"
    submitted_by: str
    submitted_by_name: str
    reviewed_by: str | None = None
    reviewed_at: str | None = None
    reject_reason: str | None = None
    created_at: str
    updated_at: str


class KnowledgeRejectRequest(BaseModel):
    reason: str = ""


# ============================================================
# Conversation Analysis
# ============================================================


class ConversationAnalyzeRequest(BaseModel):
    scope: str  # "user" | "agent" | "all"
    target_id: str = ""  # user_id or agent_id, empty when scope="all"
    model: str = ""
    provider: str = ""
    api_key: str = ""
    base_url: str = ""


class ConversationAnalyzeSelectedRequest(BaseModel):
    conversation_ids: list[str]
    model: str = ""
    provider: str = ""
    api_key: str = ""
    base_url: str = ""


class TopTopic(BaseModel):
    topic: str
    frequency: str
    example_queries: list[str]


class SuggestedNewSkill(BaseModel):
    name: str
    description: str
    rationale: str


class ExistingSkillIssue(BaseModel):
    skill_name: str
    issue: str
    suggestion: str


class ConversationAnalyzeResponse(BaseModel):
    summary: str
    top_topics: list[TopTopic]
    suggested_new_skills: list[SuggestedNewSkill]
    existing_skill_issues: list[ExistingSkillIssue]
    overall_direction: str


class ConversationCreateSkillRequest(BaseModel):
    conversation_ids: list[str]
    name: str = ""
    description: str = ""
    model: str = ""
    provider: str = ""
    api_key: str = ""
    base_url: str = ""


class ConversationCreateSkillResponse(BaseModel):
    skill_id: str
    name: str
    skill_md_preview: str


# ============================================================
# Wiki Knowledge Base
# ============================================================

class WikiSpaceCreate(BaseModel):
    name: str
    description: str = ""
    icon: str = "Wiki"


class WikiSpaceResponse(WikiSpaceCreate):
    id: str
    created_by: str
    created_at: str
    updated_at: str


class WikiPageCreate(BaseModel):
    space_id: str
    title: str
    content: str = ""
    page_type: str = "article"
    tags: list[str] = []
    source_ids: list[str] = []


class WikiPageResponse(WikiPageCreate):
    id: str
    slug: str
    word_count: int
    created_by: str
    created_at: str
    updated_at: str


class WikiPageBrief(BaseModel):
    id: str
    space_id: str
    title: str
    slug: str
    page_type: str
    tags: list[str]
    word_count: int
    created_at: str
    updated_at: str


class WikiSourceCreate(BaseModel):
    space_id: str
    title: str
    content: str = ""
    source_type: str = "text"
    file_path: str = ""
    source_metadata: dict = {}


class WikiSourceResponse(WikiSourceCreate):
    id: str
    created_by: str
    created_at: str


class WikiPageReferenceResponse(BaseModel):
    id: str
    from_page_id: str
    to_page_id: str
    context: str
    created_at: str


class WikiLogResponse(BaseModel):
    id: str
    space_id: str
    action: str
    summary: str
    detail: str
    page_ids: list[str]
    performed_by: str
    created_at: str


class WikiIngestRequest(BaseModel):
    space_id: str
    source_id: str = ""
    content: str = ""
    title: str = ""
    model: str = ""
    provider: str = ""
    api_key: str = ""
    base_url: str = ""


class WikiQueryRequest(BaseModel):
    space_id: str
    question: str
    model: str = ""
    provider: str = ""
    api_key: str = ""
    base_url: str = ""


class WikiQueryResponse(BaseModel):
    answer: str
    citations: list[dict]


class WikiLintRequest(BaseModel):
    space_id: str
    model: str = ""
    provider: str = ""
    api_key: str = ""
    base_url: str = ""


class WikiLintResponse(BaseModel):
    issues: list[dict]
    summary: str
