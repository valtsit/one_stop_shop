# AI 电商工具平台

面向电商从业者的 AI 工具聚合平台，提供 30+ 预置 AI 助手（管理、电商运营、内容创作、财税等），支持多模型切换和流式对话。

## 功能

- **AI 对话** — 支持 OpenAI / Claude / Gemini / DeepSeek 多模型，SSE 流式响应
- **工具市场** — 30+ 预置 AI 助手，按分类浏览，一键对话
- **文件上传** — 支持图片、文档、表格（最大 20MB）
- **用户管理** — JWT 认证、角色权限、部门管理
- **对话管理** — 历史记录查看与管理
- **主题切换** — 深色/浅色模式

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 8 |
| 后端 | Python / FastAPI + Uvicorn |
| 数据库 | SQLite + JSON 文件 |
| AI 适配 | 统一适配器模式（OpenAI / Claude / Gemini / DeepSeek） |

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.10+

### 安装

```bash
# 克隆项目
git clone <your-repo-url>
cd one_stop_shop

# 安装后端依赖
cd backend
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 安装前端依赖
cd ../frontend
npm install
```

### 启动

**开发模式：**

双击 `start-dev.bat`，或手动启动：

```bash
# 终端 1：启动后端
cd backend
python main.py

# 终端 2：启动前端
cd frontend
npm run dev
```

**生产模式：**

双击 `start.bat`，或手动：

```bash
cd frontend && npm run build
cd ../backend && python main.py
```

生产模式下前后端统一运行在 `http://localhost:8000`。

## 默认账号

首次启动会自动创建默认管理员账号：

- 用户名：`admin`
- 密码：`admin123`

## 项目结构

```
├── backend/
│   ├── main.py                 # FastAPI 入口
│   ├── requirements.txt
│   ├── .env.example            # 环境变量模板
│   └── app/
│       ├── core/               # 配置、数据库、认证
│       ├── api/                # API 路由
│       ├── adapters/           # AI 模型适配器
│       ├── models/             # 数据模型
│       └── services/           # 业务逻辑
├── frontend/
│   ├── src/
│   │   ├── pages/              # 页面组件
│   │   ├── components/         # 公共组件
│   │   ├── contexts/           # React Context
│   │   ├── services/           # API 客户端
│   │   └── styles/             # 全局样式
│   └── package.json
├── start-dev.bat               # 开发启动脚本
├── start.bat                   # 生产启动脚本
└── SPEC.md                     # 项目详细规格说明
```
