import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.schemas import AgentCreate, AgentResponse
from ..core.auth import get_current_user, require_permission
from ..core.database import get_db
from ..core.crud import (
    list_agents as crud_list_agents,
    get_agent as crud_get_agent,
    create_agent as crud_create_agent,
    update_agent as crud_update_agent,
    soft_delete_agent,
    create_recycle_item,
)

router = APIRouter(prefix="/api/agents", tags=["agents"])

DEFAULT_AGENTS = [
    {
        "id": "general", "name": "AI 助手", "description": "通用 AI 助手，可以帮你完成各种任务",
        "icon": "✦", "icon_bg_color": "#1a73e814", "icon_color": "#1a73e8", "category": "management",
        "system_prompt": "你是一个专业的AI助手，能够帮助用户完成各种任务。请用中文回答。",
        "welcome_message": "你好！我是AI助手，可以帮你完成各种任务。请告诉我你需要什么帮助。",
        "suggestions": ["帮我写一篇文章", "解释一个概念", "帮我做计划", "翻译一段文字"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "couch", "name": "智能体引导教练", "description": "通过引导式对话帮你理清思路",
        "icon": "🎯", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "management",
        "system_prompt": "你是一位专业的引导教练，通过提问和引导帮助用户理清思路、制定计划。",
        "welcome_message": "你好！我是引导教练，会通过提问帮你理清思路。请告诉我你正在思考的问题。",
        "suggestions": ["帮我理清思路", "制定行动计划", "分析利弊", "找到解决方案"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "ecommerce_consultant", "name": "电商商业顾问", "description": "电商领域的商业策略咨询",
        "icon": "👥", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "management",
        "system_prompt": "你是一位资深的电商商业顾问，精通电商运营、供应链管理、市场营销等领域的知识。",
        "welcome_message": "你好！我是电商商业顾问，精通电商运营策略。请告诉我你的业务情况和问题。",
        "suggestions": ["分析店铺运营", "制定营销策略", "供应链优化", "竞品分析"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "enterprise_diagnosis", "name": "企业卡点自诊系统", "description": "帮你找到拖累利润的管理卡点",
        "icon": "🔍", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "management",
        "system_prompt": "你是一位企业管理诊断专家，帮助企业发现运营中的卡点和瓶颈。",
        "welcome_message": "你好！我是企业诊断专家，可以帮你发现管理中的卡点。请描述你的企业情况。",
        "suggestions": ["诊断管理问题", "分析利润瓶颈", "流程优化建议", "组织架构分析"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "kpi_coach", "name": "KPI教练", "description": "设计薪资结构和考核指标",
        "icon": "📊", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "management",
        "system_prompt": "你是一位KPI设计专家，帮助企业制定合理的绩效考核指标和薪资结构。",
        "welcome_message": "你好！我是KPI教练，可以帮你设计绩效考核体系。请告诉我你的团队情况。",
        "suggestions": ["设计销售KPI", "制定薪资方案", "绩效考核标准", "团队激励机制"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "recruiting_coach", "name": "招聘教练", "description": "制定招聘方案和选人标准",
        "icon": "🔍", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "management",
        "system_prompt": "你是一位招聘专家，帮助企业制定招聘策略、筛选标准和面试方案。",
        "welcome_message": "你好！我是招聘教练，可以帮你优化招聘流程。请告诉我你要招聘什么岗位。",
        "suggestions": ["写招聘JD", "面试问题设计", "筛选标准制定", "招聘渠道建议"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "sop_coach", "name": "SOP梳理AI教练", "description": "帮助电商老板梳理SOP",
        "icon": "🚀", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "management",
        "system_prompt": "你是一位SOP流程梳理专家，帮助企业建立标准化操作流程。",
        "welcome_message": "你好！我是SOP梳理专家，可以帮你建立标准化流程。请告诉我你要梳理哪个环节。",
        "suggestions": ["梳理客服流程", "仓库管理SOP", "新品上架流程", "售后处理流程"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "baokuan", "name": "爆款裂变分析AI教练", "description": "实现原有爆款的人群场景裂变",
        "icon": "📈", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "ecommerce",
        "system_prompt": "你是一位电商爆款分析专家，擅长分析产品爆款逻辑并制定裂变策略。",
        "welcome_message": "你好！我是爆款分析专家，可以帮你分析爆款逻辑并制定裂变策略。请描述你的产品。",
        "suggestions": ["分析爆款逻辑", "裂变策略制定", "人群画像分析", "场景拓展方案"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "selling_point", "name": "卖点教练", "description": "提炼产品核心卖点",
        "icon": "📝", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "ecommerce",
        "system_prompt": "你是一位产品卖点提炼专家，帮助企业挖掘和表达产品核心价值。",
        "welcome_message": "你好！我是卖点教练，可以帮你提炼产品核心卖点。请告诉我你的产品信息。",
        "suggestions": ["提炼产品卖点", "竞品差异化分析", "用户痛点挖掘", "卖点文案优化"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "short_video", "name": "短视频脚本生成", "description": "生成短视频拍摄脚本",
        "icon": "🎬", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "ecommerce",
        "system_prompt": "你是一位短视频脚本创作专家，擅长写出有吸引力的短视频文案和脚本。",
        "welcome_message": "你好！我是短视频脚本专家，可以帮你生成拍摄脚本。请告诉我视频主题和风格。",
        "suggestions": ["写带货视频脚本", "产品展示脚本", "剧情类脚本", "口播文案创作"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "xiaohongshu_title", "name": "小红书爆款标题", "description": "生成小红书爆款标题",
        "icon": "📕", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "xiaohongshu",
        "system_prompt": "你是一位小红书内容运营专家，擅长写出高点击率的爆款标题。",
        "welcome_message": "你好！我是小红书标题专家，可以帮你生成爆款标题。请告诉我你的内容主题。",
        "suggestions": ["生成10个标题", "优化现有标题", "标题风格分析", "热门标题模板"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "tax_model", "name": "降税模型测算", "description": "税务优化方案测算",
        "icon": "💰", "icon_bg_color": "#6366f114", "icon_color": "#6366f1", "category": "caishui",
        "system_prompt": "你是一位税务筹划专家，帮助企业合法合规地优化税务结构。",
        "welcome_message": "你好！我是税务筹划专家，可以帮你优化税务结构。请告诉我你的企业税务情况。",
        "suggestions": ["税务筹划方案", "合规性分析", "税负测算", "优惠政策查询"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "agent_writing", "name": "文案大师", "description": "专业文案撰写，涵盖广告文案、产品描述、品牌故事等",
        "icon": "✍️", "icon_bg_color": "#f59e0b14", "icon_color": "#f59e0b", "category": "design",
        "system_prompt": "你是一位资深文案策划师，擅长撰写各类商业文案。请根据用户需求，输出专业、有创意的文案内容。",
        "welcome_message": "你好！我是文案大师，可以帮你撰写广告文案、产品描述、品牌故事等。请告诉我你的需求。",
        "suggestions": ["写一段产品广告文案", "帮我写品牌故事", "优化这段文案", "生成社交媒体文案"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "agent_coder", "name": "编程助手", "description": "代码编写、调试、重构、技术方案设计",
        "icon": "💻", "icon_bg_color": "#22c55e14", "icon_color": "#22c55e", "category": "management",
        "system_prompt": "你是一位全栈开发工程师，精通多种编程语言和技术栈。请根据用户需求编写高质量代码，并给出清晰的解释。",
        "welcome_message": "你好！我是编程助手，可以帮你写代码、调试问题、设计技术方案。请描述你的开发需求。",
        "suggestions": ["帮我写一个Python脚本", "解释这段代码", "帮我重构这段代码", "推荐技术方案"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
    {
        "id": "agent_data", "name": "数据分析师", "description": "数据分析、可视化、报告生成",
        "icon": "📊", "icon_bg_color": "#ef444414", "icon_color": "#ef4444", "category": "management",
        "system_prompt": "你是一位专业的数据分析师，擅长从数据中挖掘洞察。请帮助用户分析数据、生成报告、提出业务建议。",
        "welcome_message": "你好！我是数据分析师，可以帮你分析数据、生成可视化报告。请分享你的数据或分析需求。",
        "suggestions": ["分析这份销售数据", "生成数据报告", "数据可视化方案", "业务指标分析"],
        "knowledge_files": [], "default_model": "gpt-4o", "default_provider": "openai",
    },
]

DEFAULT_AGENT_IDS = {a["id"] for a in DEFAULT_AGENTS}


@router.get("/", response_model=list[AgentResponse])
async def list_agents(
    category: str | None = None,
    current_user: dict = Depends(require_permission("agent:read")),
    db: AsyncSession = Depends(get_db),
):
    agents = await crud_list_agents(db)
    role_id = current_user.get("role_id", "")
    is_admin = role_id in ("role_super_admin", "role_admin")
    if not is_admin:
        user_dept = current_user.get("department_id", "")
        agents = [a for a in agents if not a.get("department_id") or a.get("department_id") == user_dept]
    if category:
        agents = [a for a in agents if a.get("category") == category]
    return [AgentResponse(**a) for a in agents]


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    current_user: dict = Depends(require_permission("agent:read")),
    db: AsyncSession = Depends(get_db),
):
    agent = await crud_get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="智能体不存在")
    role_id = current_user.get("role_id", "")
    is_admin = role_id in ("role_super_admin", "role_admin")
    if not is_admin:
        user_dept = current_user.get("department_id", "")
        agent_dept = agent.get("department_id", "")
        if agent_dept and agent_dept != user_dept:
            raise HTTPException(status_code=403, detail="无权访问该智能体")
    return AgentResponse(**agent)


@router.post("/", response_model=AgentResponse)
async def create_agent(
    agent: AgentCreate,
    current_user: dict = Depends(require_permission("agent:create")),
    db: AsyncSession = Depends(get_db),
):
    agent_id = "agent_" + str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    agent_data = agent.model_dump()
    agent_data["id"] = agent_id
    agent_data["created_at"] = now
    agent_data["updated_at"] = now
    result = await crud_create_agent(db, agent_data)
    await db.commit()
    return AgentResponse(**result)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    agent: AgentCreate,
    current_user: dict = Depends(require_permission("agent:update")),
    db: AsyncSession = Depends(get_db),
):
    existing = await crud_get_agent(db, agent_id)
    if not existing:
        raise HTTPException(status_code=404, detail="智能体不存在")
    agent_data = agent.model_dump()
    agent_data["id"] = agent_id
    agent_data["created_at"] = existing.get("created_at", datetime.now().isoformat())
    agent_data["updated_at"] = datetime.now().isoformat()
    result = await crud_update_agent(db, agent_id, agent_data)
    await db.commit()
    return AgentResponse(**result)


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    current_user: dict = Depends(require_permission("agent:delete")),
    db: AsyncSession = Depends(get_db),
):
    agent = await crud_get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="智能体不存在")
    await create_recycle_item(db, {
        "entity_type": "agent",
        "entity_id": agent_id,
        "entity_data": agent,
        "deleted_by": current_user.get("id", ""),
    })
    if agent_id in DEFAULT_AGENT_IDS:
        await soft_delete_agent(db, agent_id)
    else:
        from ..core.crud import delete_agent as crud_delete_agent
        await crud_delete_agent(db, agent_id)
    await db.commit()
    return {"status": "ok"}
