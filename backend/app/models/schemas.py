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


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str = "gpt-4o"
    provider: ModelProvider = ModelProvider.OPENAI
    api_key: Optional[str] = None
    base_url: Optional[str] = None  # Custom endpoint URL
    tool_id: Optional[str] = None
    system_prompt: Optional[str] = None


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


class AgentResponse(AgentCreate):
    id: str
    created_at: str
    updated_at: str


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
