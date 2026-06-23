# AI 电商工具平台

面向电商从业者的 AI 工具聚合平台，提供 30+ 预置 AI 助手（管理、电商运营、内容创作、财税、小红书营销等），支持 OpenAI / Claude / Gemini / DeepSeek 多模型切换、流式对话、知识库 RAG、联网搜索、文件上传等功能。内置完整的用户管理与 RBAC 权限控制系统。

---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [使用指南](#使用指南)
  - [登录与个人设置](#登录与个人设置)
  - [AI 对话](#ai-对话)
  - [智能体管理](#智能体管理)
  - [Skill 管理](#skill-管理)
  - [知识库](#知识库)
  - [知识库审核](#知识库审核)
  - [部门管理](#部门管理)
  - [用户管理](#用户管理)
  - [角色管理](#角色管理)
  - [聊天记录管理](#聊天记录管理)
  - [模型设置](#模型设置)
- [权限系统](#权限系统)
- [API 接口文档](#api-接口文档)
- [项目结构](#项目结构)
- [常见问题](#常见问题)

---

## 功能概览

| 功能 | 说明 |
|------|------|
| AI 对话 | 支持 4 家 AI 提供商（OpenAI / Claude / Gemini / DeepSeek），SSE 流式响应，实时打字效果 |
| 工具市场 | 30+ 预置 AI 助手，按分类（管理、电商、小红书、财税、设计等）浏览，一键开始对话 |
| 多模型切换 | 对话中随时切换模型和提供商，支持自定义模型接入 |
| 联网搜索 | 对话中可触发 Bing 搜索，搜索结果自动注入 AI 上下文 |
| 知识库 RAG | 支持文本和表格两种格式，关键词匹配检索，对话中自动关联知识库内容 |
| 知识库审核 | 用户可提交内容到知识库，管理员审核通过后生效 |
| 文件上传 | 支持图片（jpg/png/webp/gif）、文档（pdf/docx/txt/md）、表格（xlsx/csv），最大 20MB |
| Skill 系统 | 创建可复用的技能模板，绑定到智能体使用 |
| 用户管理 | JWT 认证、角色权限控制（RBAC）、部门管理 |
| 对话管理 | 用户查看自己的对话历史，管理员可查看/删除所有用户的对话 |
| 主题切换 | 深色 / 浅色模式，偏好自动保存 |
| 响应式布局 | 桌面端为主，兼容移动端 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript 6 |
| 构建工具 | Vite 8 |
| 路由 | React Router 7 |
| 后端框架 | Python / FastAPI + Uvicorn |
| 认证 | JWT（python-jose） + bcrypt 密码加密 |
| 数据存储 | JSON 文件（`backend/data/`） |
| AI 适配 | 统一适配器模式（OpenAI / Claude / Gemini / DeepSeek） |
| 流式传输 | Server-Sent Events (SSE) |

---

## 环境要求

- **Node.js** 18 或更高版本
- **Python** 3.10 或更高版本
- **npm**（随 Node.js 安装）

---

## 快速开始

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd one_stop_shop
```

### 2. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件，填入至少一个 AI 提供商的 API Key：

```env
# 至少配置一个 AI 提供商的 API Key
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GEMINI_API_KEY=AIza-xxx
DEEPSEEK_API_KEY=sk-xxx

# JWT 密钥（生产环境请修改为随机字符串）
JWT_SECRET_KEY=your-random-secret-key

# 调试模式
DEBUG=true
```

### 4. 安装前端依赖

```bash
cd frontend
npm install
```

### 5. 启动项目

**生产模式**（推荐，前后端统一在 8000 端口）：

```
双击 start.bat
```

访问 `http://localhost:8000`

**开发模式**（前后端分离，支持热更新）：

```
双击 start-dev.bat
```

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8000`

### 6. 登录

首次启动会自动创建默认管理员账号：

| 项目 | 值 |
|------|------|
| 用户名 | `admin` |
| 密码 | `admin123` |

**强烈建议首次登录后立即修改密码。**

---

## 配置说明

### 环境变量（`.env`）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `APP_NAME` | AI电商工具平台 | 应用名称 |
| `DEBUG` | true | 调试模式 |
| `OPENAI_API_KEY` | 空 | OpenAI API Key |
| `OPENAI_BASE_URL` | https://api.openai.com/v1 | OpenAI 接口地址（可填代理地址） |
| `ANTHROPIC_API_KEY` | 空 | Anthropic (Claude) API Key |
| `ANTHROPIC_BASE_URL` | https://api.anthropic.com | Anthropic 接口地址 |
| `GEMINI_API_KEY` | 空 | Google Gemini API Key |
| `DEEPSEEK_API_KEY` | 空 | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | https://api.deepseek.com | DeepSeek 接口地址 |
| `JWT_SECRET_KEY` | change-this-... | JWT 签名密钥（**生产环境必须修改**） |
| `JWT_EXPIRE_MINUTES` | 1440 | Token 过期时间（分钟），默认 24 小时 |
| `MAX_UPLOAD_SIZE` | 20971520 | 最大上传文件大小（字节），默认 20MB |
| `UPLOAD_DIR` | ./data/uploads | 文件上传存储目录 |

### 运行时设置（模型设置页面）

在管理后台「模型设置」页面可以配置：

- 各 AI 提供商的 API Key 和接口地址
- 默认使用的提供商和模型
- 生成温度（Temperature）和最大 Token 数
- 自定义模型（支持任何 OpenAI 兼容接口）

运行时设置保存在 `backend/data/settings.json`，优先级高于 `.env`。

### API Key 解析优先级

```
请求中指定 > 自定义模型配置 > 提供商设置（settings.json）> 环境变量（.env）
```

---

## 使用指南

### 登录与个人设置

1. 打开 `http://localhost:8000`，进入登录页面
2. 输入用户名和密码登录
3. 登录后点击右上角用户名进入「个人设置」
4. 可修改显示名称、邮箱、手机号

### AI 对话

1. 在首页「工具市场」中选择一个 AI 助手，点击进入对话
2. 在对话页面顶部可切换：
   - **模型提供商**：OpenAI / Claude / Gemini / DeepSeek
   - **具体模型**：如 GPT-4o、Claude Sonnet、DeepSeek-Chat 等
3. 输入消息后按 Enter 或点击发送按钮，AI 会以流式方式逐字回复
4. 对话中可使用的增强功能：
   - **联网搜索**：点击搜索图标，输入关键词，搜索结果会自动注入 AI 回答上下文
   - **知识库关联**：如果智能体绑定了知识库，相关知识会自动匹配到对话中
5. 支持 Markdown 渲染（代码高亮、表格、列表等）
6. 120 秒无响应自动超时，可手动中断

### 智能体管理

> 需要 `agent:read` 权限

智能体是预置的 AI 助手模板，每个智能体包含：

| 字段 | 说明 |
|------|------|
| 名称 | 显示名称，如"文案大师" |
| 描述 | 功能简介 |
| 图标 | 显示图标 |
| 分类 | management / ecommerce / xiaohongshu / caishui / design 等 |
| 系统提示词 | 定义 AI 的角色和行为 |
| 欢迎消息 | 对话开始时的欢迎语 |
| 建议问题 | 预设的快捷提问按钮 |
| 默认模型 | 对话默认使用的 AI 模型 |
| 部门限制 | 限定只有指定部门的用户可见 |
| 关联 Skill | 绑定的技能 |
| 关联知识库 | 绑定的知识库条目 |

**操作：**
- 点击「新建智能体」创建
- 点击「编辑」修改配置
- 点击「删除」移除（不可恢复）

### Skill 管理

> 需要 `skill:read` 权限

Skill 是可复用的技能模板，可以绑定到智能体上使用。每个 Skill 包含文本内容和可选的附件文件。

**操作：**
- 点击「新建 Skill」创建
- 填写名称、描述、文本内容
- 可上传附件（图片、文档等）
- 编辑 / 删除已有 Skill

### 知识库

> 需要 `knowledge:read` 权限

知识库用于存储公司通用知识，对话时自动检索相关内容注入 AI 上下文（RAG）。

**两种格式：**

| 格式 | 说明 | 适用场景 |
|------|------|----------|
| 文本 | 自由文本内容 | 产品说明、话术、FAQ |
| 表格 | 带列名和行数据的结构化表格 | 产品参数、价格表、对比表 |

**操作：**
- 点击「新建条目」创建知识库条目
- 填写标题、内容、标签（用于检索匹配）
- **双击卡片**可预览完整内容
- 编辑 / 删除已有条目

**检索机制：**
对话时，系统会将用户最后一条消息的关键词与知识库条目的标题和标签进行匹配，命中则自动注入到 AI 的上下文中。

### 知识库审核

> 需要 `knowledge:review` 权限

普通用户可以在对话中选中文本，提交到知识库。提交后需要管理员审核：

- **待审核**：用户提交的内容，等待审核
- **通过**：内容自动写入知识库
- **驳回**：可填写驳回原因

管理员自己提交的内容会自动通过，无需审核。

### 部门管理

> 需要 `department:read` 权限

支持树形部门结构，可用于：

- 组织架构管理
- 智能体可见范围控制（限定部门）
- 用户归属管理

**操作：**
- 创建部门（支持设置上级部门）
- 编辑部门信息
- 删除部门

### 用户管理

> 需要 `user:read` 权限

| 操作 | 所需权限 |
|------|----------|
| 查看用户列表 | `user:read` |
| 创建用户 | `user:create` |
| 编辑用户（角色、部门、状态） | `user:update` |
| 删除用户 | `user:delete` |
| 重置用户密码 | `user:update` |

创建用户时需要指定：
- 用户名（唯一）
- 密码
- 显示名称
- 角色
- 部门

### 角色管理

> 需要 `role:read` 权限（仅管理员可见）

系统内置三个角色：

| 角色 | 说明 | 可编辑 | 可删除 |
|------|------|--------|--------|
| 超级管理员 | 拥有所有权限 | 仅权限和描述 | 否 |
| 管理员 | 拥有大部分管理权限 | 仅权限和描述 | 否 |
| 普通用户 | 基础查看权限 | 仅权限和描述 | 否 |

可以创建自定义角色，自由勾选权限组合。

**全部权限列表：**

| 分类 | 权限 |
|------|------|
| 部门 | `department:create` / `read` / `update` / `delete` |
| 用户 | `user:create` / `read` / `update` / `delete` |
| 智能体 | `agent:create` / `read` / `update` / `delete` |
| Skill | `skill:create` / `read` / `update` / `delete` |
| 知识库 | `knowledge:create` / `read` / `update` / `delete` / `review` |
| 角色 | `role:create` / `read` / `update` / `delete` |
| 设置 | `settings:read` / `update` |
| 聊天记录 | `conversation:read` / `delete` |
| 其他 | `password:change` |

### 聊天记录管理

> 需要 `user:manage` 权限（管理员可见）

管理员可以：
- 查看所有用户的对话记录
- 按用户、智能体、关键词筛选
- 查看对话详情
- 删除对话

### 模型设置

> 需要 `user:manage` 权限（管理员可见）

在管理后台「模型设置」页面配置：

**提供商设置：**
- 为每个 AI 提供商配置 API Key 和接口地址
- 可填代理地址，兼容所有 OpenAI 格式的第三方接口

**全局设置：**
- 默认提供商和模型
- 生成温度（0~2）
- 最大 Token 数

**自定义模型：**
- 添加任何 OpenAI 兼容的模型
- 配置独立的 base_url、api_key、自定义 headers
- 测试连接是否正常

---

## 权限系统

### 架构

```
用户 (User) → 角色 (Role) → 权限列表 (Permissions)
```

- 每个用户绑定一个角色
- 每个角色包含一组权限
- 超级管理员使用通配符 `*` 表示所有权限
- 前端和后端同时进行权限校验

### 内置角色权限对比

| 权限 | 超级管理员 | 管理员 | 普通用户 |
|------|:----------:|:------:|:--------:|
| 部门 CRUD | `*` | ✓ | 仅查看 |
| 用户 CRUD | `*` | ✓ | ✗ |
| 智能体 CRUD | `*` | ✓ | 仅查看 |
| Skill CRUD | `*` | ✓ | 仅查看 |
| 知识库 CRUD | `*` | ✓ | 查看/新增/编辑 |
| 知识库审核 | `*` | ✓ | ✗ |
| 角色管理 | `*` | ✓ | ✗ |
| 模型设置 | `*` | ✓ | ✗ |
| 聊天记录管理 | `*` | ✓ | ✗ |
| 修改密码 | `*` | ✓ | ✗ |

### API 接口权限控制

每个 API 接口通过 `Depends(require_permission("resource:action"))` 进行权限校验，无权限返回 403。

### 前端路由守卫

前端使用 `ProtectedRoute` 组件包裹受保护的路由，无权限自动重定向到首页。侧边栏菜单也根据权限动态显示/隐藏。

---

## API 接口文档

启动后访问 `http://localhost:8000/docs` 查看自动生成的 Swagger API 文档。

### 认证接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | 公开 |
| GET | `/api/auth/me` | 获取当前用户 | 已登录 |
| GET | `/api/auth/profile` | 获取个人资料 | 已登录 |
| PUT | `/api/auth/profile` | 修改个人资料 | 已登录 |
| POST | `/api/auth/change-password` | 修改密码 | `password:change` |

### 对话接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/chat/completions` | AI 流式对话 | 已登录 |
| GET | `/api/conversations/` | 我的对话列表 | 已登录 |
| GET | `/api/conversations/{id}` | 对话详情 | 已登录（本人） |
| POST | `/api/conversations/` | 创建对话 | 已登录 |
| PUT | `/api/conversations/{id}` | 更新对话 | 已登录（本人） |
| DELETE | `/api/conversations/{id}` | 删除对话 | 已登录（本人） |

### 文件上传

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/upload/` | 上传文件 | 已登录 |

### 搜索

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/search/` | Bing 联网搜索 | 已登录 |

### 智能体

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/agents/` | 智能体列表 | `agent:read` |
| GET | `/api/agents/{id}` | 智能体详情 | `agent:read` |
| POST | `/api/agents/` | 创建智能体 | `agent:create` |
| PUT | `/api/agents/{id}` | 更新智能体 | `agent:update` |
| DELETE | `/api/agents/{id}` | 删除智能体 | `agent:delete` |

### Skill

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/skills/` | Skill 列表 | `skill:read` |
| GET | `/api/skills/{id}` | Skill 详情 | `skill:read` |
| POST | `/api/skills/` | 创建 Skill | `skill:create` |
| PUT | `/api/skills/{id}` | 更新 Skill | `skill:update` |
| DELETE | `/api/skills/{id}` | 删除 Skill | `skill:delete` |

### 知识库

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/knowledge/` | 知识库列表 | `knowledge:read` |
| GET | `/api/knowledge/{id}` | 知识库详情 | `knowledge:read` |
| POST | `/api/knowledge/` | 创建条目 | `knowledge:create` |
| PUT | `/api/knowledge/{id}` | 更新条目 | `knowledge:update` |
| DELETE | `/api/knowledge/{id}` | 删除条目 | `knowledge:delete` |

### 知识库审核

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/knowledge-submissions/` | 提交内容 | 已登录 |
| GET | `/api/knowledge-submissions/` | 所有提交 | `knowledge:review` |
| GET | `/api/knowledge-submissions/my` | 我的提交 | 已登录 |
| POST | `.../approve` | 通过 | `knowledge:review` |
| POST | `.../reject` | 驳回 | `knowledge:review` |

### 部门

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/departments/` | 部门列表 | `department:read` |
| GET | `/api/departments/{id}` | 部门详情 | `department:read` |
| POST | `/api/departments/` | 创建部门 | `department:create` |
| PUT | `/api/departments/{id}` | 更新部门 | `department:update` |
| DELETE | `/api/departments/{id}` | 删除部门 | `department:delete` |

### 用户

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/users/` | 用户列表 | `user:read` |
| GET | `/api/users/{id}` | 用户详情 | `user:read` |
| POST | `/api/users/` | 创建用户 | `user:create` |
| PUT | `/api/users/{id}` | 更新用户 | `user:update` |
| DELETE | `/api/users/{id}` | 删除用户 | `user:delete` |
| POST | `.../reset-password` | 重置密码 | `user:update` |

### 角色

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/roles/` | 角色列表 | `role:read` |
| GET | `/api/roles/{id}` | 角色详情 | 已登录 |
| POST | `/api/roles/` | 创建角色 | `role:create` |
| PUT | `/api/roles/{id}` | 更新角色 | `role:update` |
| DELETE | `/api/roles/{id}` | 删除角色 | `role:delete` |

### 管理员对话管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/admin/conversations/` | 所有对话 | `conversation:read` |
| GET | `/api/admin/conversations/{id}` | 对话详情 | `conversation:read` |
| DELETE | `/api/admin/conversations/{id}` | 删除对话 | `conversation:delete` |
| GET | `.../users/list` | 有对话的用户列表 | `conversation:read` |

### 设置

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/settings` | 获取设置 | `settings:read` |
| PUT | `/api/settings` | 更新设置 | `settings:update` |
| GET | `/api/settings/models` | 自定义模型列表 | `settings:read` |
| POST | `/api/settings/models/custom` | 添加自定义模型 | `settings:update` |
| PUT | `.../custom/{id}` | 更新自定义模型 | `settings:update` |
| DELETE | `.../custom/{id}` | 删除自定义模型 | `settings:update` |
| POST | `/api/settings/models/test` | 测试模型连接 | `settings:read` |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/uploads/{filename}` | 静态文件访问 |

---

## 项目结构

```
one_stop_shop/
├── backend/
│   ├── main.py                     # FastAPI 入口，路由注册
│   ├── requirements.txt            # Python 依赖
│   ├── .env.example                # 环境变量模板
│   ├── .env                        # 环境变量（需自行创建）
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py           # 配置加载（pydantic-settings）
│   │   │   ├── auth.py             # JWT 认证 + 权限校验
│   │   │   ├── seed.py             # 初始数据（角色、管理员）
│   │   │   └── database.py         # SQLAlchemy 数据库初始化
│   │   ├── api/                    # API 路由
│   │   │   ├── auth.py             # 登录、个人信息
│   │   │   ├── profile.py          # 个人资料、修改密码
│   │   │   ├── chat.py             # AI 对话（SSE 流式）
│   │   │   ├── agents.py           # 智能体 CRUD
│   │   │   ├── skills.py           # Skill CRUD
│   │   │   ├── knowledge.py        # 知识库 CRUD
│   │   │   ├── knowledge_submissions.py  # 知识库审核
│   │   │   ├── search.py           # 联网搜索
│   │   │   ├── upload.py           # 文件上传
│   │   │   ├── users.py            # 用户 CRUD
│   │   │   ├── roles.py            # 角色 CRUD
│   │   │   ├── departments.py      # 部门 CRUD
│   │   │   ├── conversations.py    # 用户对话
│   │   │   ├── admin_conversations.py  # 管理员对话管理
│   │   │   └── settings.py         # 模型设置
│   │   ├── adapters/               # AI 模型适配器
│   │   │   ├── base.py             # 基类 + Token 定价
│   │   │   ├── openai_adapter.py   # OpenAI
│   │   │   ├── claude_adapter.py   # Claude (Anthropic)
│   │   │   ├── gemini_adapter.py   # Gemini (Google)
│   │   │   ├── deepseek_adapter.py # DeepSeek
│   │   │   └── __init__.py         # 适配器注册表
│   │   └── models/
│   │       └── schemas.py          # Pydantic 数据模型
│   └── data/                       # 数据存储目录（自动创建）
│       ├── users.json              # 用户数据
│       ├── roles.json              # 角色与权限
│       ├── departments.json        # 部门数据
│       ├── agents.json             # 智能体配置
│       ├── skills.json             # Skill 数据
│       ├── knowledge.json          # 知识库
│       ├── knowledge_submissions.json  # 知识库提交记录
│       ├── settings.json           # 运行时设置
│       ├── uploads/                # 上传文件
│       └── conversations/          # 对话记录（每个对话一个 JSON）
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # 路由配置 + 权限守卫
│   │   ├── pages/                  # 页面组件（22 个路由）
│   │   ├── components/             # 公共组件（Sidebar 等）
│   │   ├── contexts/               # React Context（AuthContext）
│   │   ├── services/               # API 客户端（api.ts）
│   │   └── styles/                 # 全局样式
│   ├── package.json
│   ├── vite.config.ts              # Vite 配置（含代理）
│   └── tsconfig.json
├── start.bat                       # 生产启动（构建前端 + 启动后端）
├── start-dev.bat                   # 开发启动（前后端分离）
├── kill_server.ps1                 # 停止服务脚本
├── SPEC.md                         # 项目规格说明
├── CLAUDE.md                       # 开发规范
└── README.md                       # 本文件
```

---

## 常见问题

### Q: 如何添加新的 AI 模型？

在管理后台「模型设置」→「自定义模型」中添加，需要填写：
- 提供商（openai / claude / gemini / deepseek）
- 模型名称（API 调用时使用的 model 参数）
- 显示名称
- Base URL（如使用第三方代理）
- API Key

所有 OpenAI 兼容接口的第三方模型都可以接入。

### Q: 如何配置第三方 API 代理？

在 `.env` 或「模型设置」中修改对应提供商的 Base URL，例如：

```env
OPENAI_BASE_URL=https://your-proxy.com/v1
ANTHROPIC_BASE_URL=https://your-proxy.com
```

### Q: 如何让普通用户也能修改密码？

在角色管理中，给对应角色勾选 `password:change` 权限。

### Q: 数据存储在哪里？

所有数据以 JSON 文件形式存储在 `backend/data/` 目录下，无需配置数据库。对话记录存储在 `backend/data/conversations/` 下，每个对话一个 JSON 文件。

### Q: 如何备份数据？

直接备份 `backend/data/` 整个目录即可。

### Q: 如何重置管理员密码？

直接编辑 `backend/data/users.json`，或者删除该文件重启服务（会重新创建默认 admin 账号，但会丢失所有用户数据）。

### Q: 生性部署注意事项

1. **修改 JWT_SECRET_KEY**：使用随机生成的强密钥
2. **修改默认管理员密码**：首次登录后立即修改
3. **关闭 DEBUG 模式**：`.env` 中设置 `DEBUG=false`
4. **配置 HTTPS**：建议使用 Nginx 反向代理 + SSL 证书
5. **限制访问**：如不需要，可关闭 CORS 或限制 `allow_origins`
