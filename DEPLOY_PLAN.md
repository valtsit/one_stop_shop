# 多公司安全部署方案

> 📌 本文档明确标注每个步骤的执行方式：
> - 🤖 **AI可执行** - 可以让AI生成脚本或指导完成
> - 👨‍💻 **手动操作** - 必须由人工在控制台或终端完成
> - ⚠️ **需确认** - 需要你提供信息后AI才能继续

---

## 📋 目录

1. [部署架构设计](#1-部署架构设计)
2. [安全合规要求](#2-安全合规要求)
3. [购买清单确认](#3-购买清单确认)
4. [服务器配置](#4-服务器配置)
5. [应用部署](#5-应用部署)
6. [域名与SSL](#6-域名与ssl)
7. [数据隔离方案](#7-数据隔离方案)
8. [安全加固](#8-安全加固)
9. [微信小程序配置](#9-微信小程序配置)
10. [运维监控](#10-运维监控)

---

## 1. 部署架构设计

### 1.1 两公司部署方案

**推荐方案：单服务器 + 数据隔离**（成本低，适合初期）

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户访问层                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│    公司A用户                     公司B用户                       │
│        │                             │                          │
│        ▼                             ▼                          │
│   ┌─────────┐                  ┌─────────┐                     │
│   │ 小程序A  │                  │ 小程序B  │                     │
│   └────┬────┘                  └────┬────┘                     │
│        │                             │                          │
└────────┼─────────────────────────────┼──────────────────────────┘
         │                             │
         ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     域名 + SSL (HTTPS)                          │
│                  api-a.company.com                              │
│                  api-b.company.com                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  腾讯云轻量服务器 2核4G5M                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Nginx 反向代理                         │  │
│  │         根据域名分发到不同后端服务                          │  │
│  └─────────────┬─────────────────────┬───────────────────────┘  │
│                │                     │                          │
│                ▼                     ▼                          │
│  ┌─────────────────────┐ ┌─────────────────────┐               │
│  │   FastAPI 实例 A     │ │   FastAPI 实例 B     │               │
│  │   端口: 8001         │ │   端口: 8002         │               │
│  └──────────┬──────────┘ └──────────┬──────────┘               │
│             │                       │                          │
│             ▼                       ▼                          │
│  ┌─────────────────────┐ ┌─────────────────────┐               │
│  │   SQLite 数据库 A    │ │   SQLite 数据库 B    │               │
│  │   data/company_a.db │ │   data/company_b.db │               │
│  └─────────────────────┘ └─────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    腾讯云 COS 对象存储                           │
│                                                                 │
│    ┌─────────────────┐         ┌─────────────────┐             │
│    │  存储桶 A        │         │  存储桶 B        │             │
│    │  company-a-files │         │  company-b-files │             │
│    └─────────────────┘         └─────────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 方案优势

| 优势 | 说明 |
|------|------|
| ✅ 成本低 | 单服务器，月均 ¥23-33 |
| ✅ 数据隔离 | 不同数据库文件，物理隔离 |
| ✅ 维护简单 | 统一管理，统一备份 |
| ✅ 扩展性好 | 后续可拆分为独立服务器 |

---

## 2. 安全合规要求

### 2.1 必须完成的合规事项

| 事项 | 执行方式 | 说明 |
|------|----------|------|
| 域名备案 | 👨‍💻 手动操作 | 必须！否则无法正常使用 |
| SSL证书 | 🤖 AI可执行 | 配置HTTPS加密 |
| 隐私政策 | 🤖 AI可生成 | 用户协议和隐私政策文档 |
| 数据备份 | 🤖 AI可执行 | 自动备份脚本 |
| 访问控制 | 🤖 AI可执行 | 用户权限管理 |

### 2.2 数据安全措施

```
┌─────────────────────────────────────────────────────────┐
│                    安全措施清单                          │
├─────────────────────────────────────────────────────────┤
│  ✅ HTTPS加密传输        - 防止数据被窃听               │
│  ✅ 数据库文件加密       - SQLite支持加密扩展           │
│  ✅ 访问日志记录         - 追踪用户操作                 │
│  ✅ 定期备份             - 防止数据丢失                 │
│  ✅ 防火墙配置           - 限制非法访问                 │
│  ✅ 用户权限隔离         - 不同公司数据完全隔离         │
│  ✅ API访问限制          - 防止接口被滥用               │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 购买清单确认

### 3.1 已确认购买

| 产品 | 价格 | 用途 | 执行方式 |
|------|------|------|----------|
| 轻量服务器 2核4G5M | ¥188/年 | 主服务器 | 👨‍💻 腾讯云控制台购买 |
| COS标准存储 100G | ¥29/年 | 文件存储 | 👨‍💻 腾讯云控制台购买 |
| CDN流量包 100GB | ¥14/年 | 加速访问 | 👨‍💻 腾讯云控制台购买 |
| 基础图片处理 | ¥1.1/年 | AI标识 | 👨‍💻 腾讯云控制台购买 |
| SSL证书 | ¥64.6/年 | HTTPS | 👨‍💻 腾讯云控制台购买 |
| DNS解析专业版 | ¥39.9/年 | 域名解析 | 👨‍💻 腾讯云控制台购买 |
| DDoS高防包 | ¥31/年 | 安全防护 | 👨‍💻 腾讯云控制台购买 |

### 3.2 需要额外购买

| 产品 | 价格 | 说明 | 执行方式 |
|------|------|------|----------|
| 域名 A | ¥50-100/年 | 公司A使用 | 👨‍💻 域名注册商购买 |
| 域名 B | ¥50-100/年 | 公司B使用 | 👨‍💻 域名注册商购买 |

⚠️ **需要你提供**：
- 公司A的域名（如：company-a.com）
- 公司B的域名（如：company-b.com）

---

## 4. 服务器配置

### 4.1 购买服务器

**执行方式：👨‍💻 手动操作（腾讯云控制台）**

```
操作步骤：
1. 登录腾讯云控制台
2. 进入「轻量应用服务器」
3. 点击「创建」
4. 选择配置：
   - 地域：广州/上海（选离用户近的）
   - 镜像：Ubuntu 22.04 LTS
   - 套餐：2核4G5M
   - 设置密码：（记住这个密码）
5. 完成购买
```

⚠️ **需要你提供**：服务器IP地址和root密码

---

### 4.2 服务器初始化

**执行方式：🤖 AI可执行（生成脚本）**

我来生成初始化脚本，你在服务器上执行：

```bash
#!/bin/bash
# server_init.sh - 服务器初始化脚本

echo "=========================================="
echo "  服务器初始化开始"
echo "=========================================="

# 1. 系统更新
echo "[1/6] 更新系统..."
apt update && apt upgrade -y

# 2. 安装基础工具
echo "[2/6] 安装基础工具..."
apt install -y curl wget git vim unzip htop net-tools

# 3. 创建部署用户
echo "[3/6] 创建部署用户..."
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
echo "deploy ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/deploy

# 4. 配置SSH密钥（可选）
echo "[4/6] 配置SSH..."
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh

# 5. 安装Python
echo "[5/6] 安装Python..."
apt install -y python3 python3-pip python3-venv python3-dev

# 6. 安装Node.js
echo "[6/6] 安装Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 7. 安装Nginx
echo "[7/7] 安装Nginx..."
apt install -y nginx
systemctl start nginx
systemctl enable nginx

echo "=========================================="
echo "  初始化完成！"
echo "  Python版本: $(python3 --version)"
echo "  Node版本: $(node --version)"
echo "  Nginx版本: $(nginx -v 2>&1)"
echo "=========================================="
```

**使用方法**：
```bash
# 1. 在服务器上创建脚本
vim server_init.sh

# 2. 粘贴上面的内容

# 3. 执行脚本
chmod +x server_init.sh
./server_init.sh
```

---

## 5. 应用部署

### 5.1 项目代码部署

**执行方式：🤖 AI可执行（生成脚本）**

```bash
#!/bin/bash
# deploy_app.sh - 应用部署脚本

APP_DIR="/home/deploy/one_stop_shop"

echo "=========================================="
echo "  应用部署开始"
echo "=========================================="

# 1. 创建项目目录
echo "[1/5] 创建项目目录..."
sudo -u deploy mkdir -p $APP_DIR

# 2. 上传代码（需要手动执行）
echo "[2/5] 请上传项目代码到 $APP_DIR"
echo "  方法1: git clone your-repo-url $APP_DIR"
echo "  方法2: scp -r ./one_stop_shop deploy@server-ip:/home/deploy/"

# 等待用户确认
read -p "代码上传完成后按回车继续..."

# 3. 配置后端
echo "[3/5] 配置后端..."
cd $APP_DIR/backend
sudo -u deploy python3 -m venv venv
sudo -u deploy ./venv/bin/pip install -r requirements.txt

# 4. 构建前端
echo "[4/5] 构建前端..."
cd $APP_DIR/frontend
sudo -u deploy npm install
sudo -u deploy npm run build

# 5. 创建数据目录
echo "[5/5] 创建数据目录..."
sudo -u deploy mkdir -p $APP_DIR/backend/data
sudo -u deploy mkdir -p $APP_DIR/backend/uploads
sudo -u deploy mkdir -p $APP_DIR/backend/uploads/company_a
sudo -u deploy mkdir -p $APP_DIR/backend/uploads/company_b

echo "=========================================="
echo "  部署完成！"
echo "=========================================="
```

---

### 5.2 环境配置文件

**执行方式：🤖 AI可执行（生成模板）**

需要为两个公司创建不同的配置文件：

**公司A配置** `/home/deploy/one_stop_shop/backend/.env.company_a`：
```bash
# 公司A配置
APP_NAME=AI电商工具平台-公司A
COMPANY_ID=company_a
DEBUG=false

# 数据库
DATABASE_URL=sqlite:///./data/company_a.db

# JWT密钥（请修改为随机字符串）
SECRET_KEY=<需要生成随机密钥>

# 文件上传
UPLOAD_DIR=./uploads/company_a
MAX_FILE_SIZE=10485760

# AI模型配置
# OPENAI_API_KEY=sk-xxx
# CLAUDE_API_KEY=sk-ant-xxx

# COS配置
# COS_SECRET_ID=xxx
# COS_SECRET_KEY=xxx
# COS_BUCKET=company-a-files
# COS_REGION=ap-guangzhou
```

**公司B配置** `/home/deploy/one_stop_shop/backend/.env.company_b`：
```bash
# 公司B配置
APP_NAME=AI电商工具平台-公司B
COMPANY_ID=company_b
DEBUG=false

# 数据库
DATABASE_URL=sqlite:///./data/company_b.db

# JWT密钥（请修改为随机字符串）
SECRET_KEY=<需要生成随机密钥>

# 文件上传
UPLOAD_DIR=./uploads/company_b
MAX_FILE_SIZE=10485760

# AI模型配置
# OPENAI_API_KEY=sk-xxx
# CLAUDE_API_KEY=sk-ant-xxx

# COS配置
# COS_SECRET_ID=xxx
# COS_SECRET_KEY=xxx
# COS_BUCKET=company-b-files
# COS_REGION=ap-guangzhou
```

⚠️ **需要你提供**：
- AI模型的API Key（OpenAI/Claude/DeepSeek等）
- COS的SecretId和SecretKey

---

### 5.3 Systemd服务配置

**执行方式：🤖 AI可执行（生成配置）**

创建两个服务实例：

```bash
#!/bin/bash
# setup_services.sh - 配置系统服务

# 公司A服务
sudo tee /etc/systemd/system/onestopshop-a.service << 'EOF'
[Unit]
Description=AI电商工具平台-公司A
After=network.target

[Service]
Type=exec
User=deploy
Group=deploy
WorkingDirectory=/home/deploy/one_stop_shop/backend
Environment="PATH=/home/deploy/one_stop_shop/backend/venv/bin"
EnvironmentFile=/home/deploy/one_stop_shop/backend/.env.company_a
ExecStart=/home/deploy/one_stop_shop/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 公司B服务
sudo tee /etc/systemd/system/onestopshop-b.service << 'EOF'
[Unit]
Description=AI电商工具平台-公司B
After=network.target

[Service]
Type=exec
User=deploy
Group=deploy
WorkingDirectory=/home/deploy/one_stop_shop/backend
Environment="PATH=/home/deploy/one_stop_shop/backend/venv/bin"
EnvironmentFile=/home/deploy/one_stop_shop/backend/.env.company_b
ExecStart=/home/deploy/one_stop_shop/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8002 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 重新加载并启动
sudo systemctl daemon-reload
sudo systemctl start onestopshop-a
sudo systemctl start onestopshop-b
sudo systemctl enable onestopshop-a
sudo systemctl enable onestopshop-b

echo "服务配置完成！"
echo "查看状态: systemctl status onestopshop-a onestopshop-b"
```

---

## 6. 域名与SSL

### 6.1 域名购买

**执行方式：👨‍💻 手动操作**

```
操作步骤：
1. 选择域名注册商（腾讯云/阿里云/万网等）
2. 搜索并购买域名：
   - 公司A: company-a.com
   - 公司B: company-b.com
3. 完成域名实名认证
4. 进行域名备案（必须！）
```

⚠️ **重要**：
- 域名备案是法律要求，必须完成
- 备案周期约7-20个工作日
- 备案期间域名无法正常使用

---

### 6.2 域名解析配置

**执行方式：👨‍💻 手动操作（DNS控制台）**

```
操作步骤：
1. 登录DNS解析控制台
2. 添加A记录：

公司A域名：
| 主机记录 | 记录类型 | 记录值 |
|----------|----------|--------|
| @        | A        | 服务器IP |
| www      | A        | 服务器IP |
| api      | A        | 服务器IP |

公司B域名：
| 主机记录 | 记录类型 | 记录值 |
|----------|----------|--------|
| @        | A        | 服务器IP |
| www      | A        | 服务器IP |
| api      | A        | 服务器IP |
```

---

### 6.3 SSL证书配置

**执行方式：🤖 AI可执行（生成脚本）**

```bash
#!/bin/bash
# setup_ssl.sh - SSL证书配置脚本

DOMAIN_A="company-a.com"
DOMAIN_B="company-b.com"

echo "=========================================="
echo "  SSL证书配置"
echo "=========================================="

# 安装Certbot
apt install -y certbot python3-certbot-nginx

# 申请公司A证书
echo "申请公司A证书..."
certbot --nginx -d $DOMAIN_A -d www.$DOMAIN_A --non-interactive --agree-tos --email admin@$DOMAIN_A

# 申请公司B证书
echo "申请公司B证书..."
certbot --nginx -d $DOMAIN_B -d www.$DOMAIN_B --non-interactive --agree-tos --email admin@$DOMAIN_B

# 设置自动续期
echo "设置自动续期..."
systemctl enable certbot.timer
systemctl start certbot.timer

echo "=========================================="
echo "  SSL配置完成！"
echo "  测试续期: certbot renew --dry-run"
echo "=========================================="
```

---

### 6.4 Nginx配置

**执行方式：🤖 AI可执行（生成配置）**

```bash
#!/bin/bash
# setup_nginx.sh - Nginx配置脚本

DOMAIN_A="company-a.com"
DOMAIN_B="company-b.com"

echo "=========================================="
echo "  Nginx配置"
echo "=========================================="

# 公司A配置
sudo tee /etc/nginx/sites-available/company-a << EOF
server {
    listen 80;
    server_name $DOMAIN_A www.$DOMAIN_A;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN_A www.$DOMAIN_A;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN_A/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_A/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    access_log /var/log/nginx/company-a-access.log;
    error_log /var/log/nginx/company-a-error.log;
}
EOF

# 公司B配置
sudo tee /etc/nginx/sites-available/company-b << EOF
server {
    listen 80;
    server_name $DOMAIN_B www.$DOMAIN_B;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN_B www.$DOMAIN_B;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN_B/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_B/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    access_log /var/log/nginx/company-b-access.log;
    error_log /var/log/nginx/company-b-error.log;
}
EOF

# 启用配置
ln -sf /etc/nginx/sites-available/company-a /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/company-b /etc/nginx/sites-enabled/

# 删除默认配置
rm -f /etc/nginx/sites-enabled/default

# 测试并重载
nginx -t && systemctl reload nginx

echo "=========================================="
echo "  Nginx配置完成！"
echo "=========================================="
```

---

## 7. 数据隔离方案

### 7.1 数据库隔离

**执行方式：🤖 AI可执行（代码修改）**

需要修改代码支持多数据库：

```python
# backend/app/core/database.py

import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# 获取公司ID
COMPANY_ID = os.getenv("COMPANY_ID", "default")

# 根据公司ID选择数据库
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///./data/{COMPANY_ID}.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

---

### 7.2 文件存储隔离

**目录结构**：
```
/home/deploy/one_stop_shop/backend/uploads/
├── company_a/          # 公司A的文件
│   ├── documents/
│   ├── images/
│   └── temp/
└── company_b/          # 公司B的文件
    ├── documents/
    ├── images/
    └── temp/
```

---

### 7.3 COS存储桶隔离

**执行方式：👨‍💻 手动操作（腾讯云控制台）**

```
操作步骤：
1. 登录腾讯云控制台
2. 进入「对象存储COS」
3. 创建两个存储桶：
   - company-a-files（公司A）
   - company-b-files（公司B）
4. 设置访问权限为「私有读写」
5. 获取每个存储桶的访问密钥
```

⚠️ **需要你提供**：
- 两个存储桶的SecretId和SecretKey

---

## 8. 安全加固

### 8.1 防火墙配置

**执行方式：🤖 AI可执行（生成脚本）**

```bash
#!/bin/bash
# setup_firewall.sh - 防火墙配置

echo "=========================================="
echo "  防火墙配置"
echo "=========================================="

# 启用防火墙
ufw enable

# 允许SSH
ufw allow 22/tcp

# 允许HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# 禁止其他所有入站
ufw default deny incoming

# 允许所有出站
ufw default allow outgoing

# 查看状态
ufw status verbose

echo "=========================================="
echo "  防火墙配置完成！"
echo "=========================================="
```

---

### 8.2 SSH安全加固

**执行方式：🤖 AI可执行（生成脚本）**

```bash
#!/bin/bash
# secure_ssh.sh - SSH安全加固

echo "=========================================="
echo "  SSH安全加固"
echo "=========================================="

# 备份原配置
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

# 修改SSH配置
cat >> /etc/ssh/sshd_config << 'EOF'

# 安全加固配置
Port 2222
PermitRootLogin no
PasswordAuthentication no
MaxAuthTries 3
LoginGraceTime 60
EOF

# 重启SSH服务
systemctl restart sshd

# 更新防火墙
ufw allow 2222/tcp
ufw delete allow 22/tcp

echo "=========================================="
echo "  SSH加固完成！"
echo "  新SSH端口: 2222"
echo "  请使用新端口连接: ssh -p 2222 deploy@server-ip"
echo "=========================================="
```

---

### 8.3 安装安全工具

**执行方式：🤖 AI可执行（生成脚本）**

```bash
#!/bin/bash
# install_security_tools.sh - 安装安全工具

echo "=========================================="
echo "  安装安全工具"
echo "=========================================="

# 安装fail2ban（防暴力破解）
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# 配置fail2ban
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = 2222
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF

# 重启fail2ban
systemctl restart fail2ban

# 安装unattended-upgrades（自动安全更新）
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo "=========================================="
echo "  安全工具安装完成！"
echo "  查看fail2ban状态: fail2ban-client status"
echo "=========================================="
```

---

## 9. 微信小程序配置

### 9.1 小程序注册

**执行方式：👨‍💻 手动操作**

```
操作步骤：
1. 访问 https://mp.weixin.qq.com/
2. 注册小程序账号（每个公司一个）
3. 完成企业认证
4. 获取AppID和AppSecret
```

⚠️ **需要你提供**：
- 公司A的AppID和AppSecret
- 公司B的AppID和AppSecret

---

### 9.2 配置合法域名

**执行方式：👨‍💻 手动操作（微信公众平台）**

```
操作步骤：
1. 登录微信公众平台
2. 进入「开发」→「开发设置」→「服务器域名」
3. 配置域名：

公司A小程序：
| 类型 | 域名 |
|------|------|
| request | https://api.company-a.com |
| uploadFile | https://api.company-a.com |
| downloadFile | https://api.company-a.com |

公司B小程序：
| 类型 | 域名 |
|------|------|
| request | https://api.company-b.com |
| uploadFile | https://api.company-b.com |
| downloadFile | https://api.company-b.com |
```

---

### 9.3 小程序代码配置

**执行方式：🤖 AI可执行（生成配置）**

**公司A配置** `miniprogram/config.js`：
```javascript
// 公司A小程序配置
export const config = {
  // API地址
  apiBaseUrl: 'https://api.company-a.com/api',
  
  // 公司信息
  companyId: 'company_a',
  companyName: '公司A',
  
  // 其他配置
  uploadUrl: 'https://api.company-a.com/api/upload',
  fileUrl: 'https://api.company-a.com/uploads',
};
```

**公司B配置** `miniprogram/config.js`：
```javascript
// 公司B小程序配置
export const config = {
  // API地址
  apiBaseUrl: 'https://api.company-b.com/api',
  
  // 公司信息
  companyId: 'company_b',
  companyName: '公司B',
  
  // 其他配置
  uploadUrl: 'https://api.company-b.com/api/upload',
  fileUrl: 'https://api.company-b.com/uploads',
};
```

---

## 10. 运维监控

### 10.1 备份策略

**执行方式：🤖 AI可执行（生成脚本）**

```bash
#!/bin/bash
# backup.sh - 自动备份脚本

BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "=========================================="
echo "  开始备份: $DATE"
echo "=========================================="

# 创建备份目录
mkdir -p $BACKUP_DIR/company_a
mkdir -p $BACKUP_DIR/company_b

# 备份公司A数据库
echo "备份公司A数据库..."
cp /home/deploy/one_stop_shop/backend/data/company_a.db \
   $BACKUP_DIR/company_a/db_$DATE.db

# 备份公司A文件
echo "备份公司A文件..."
tar -czf $BACKUP_DIR/company_a/files_$DATE.tar.gz \
    /home/deploy/one_stop_shop/backend/uploads/company_a

# 备份公司B数据库
echo "备份公司B数据库..."
cp /home/deploy/one_stop_shop/backend/data/company_b.db \
   $BACKUP_DIR/company_b/db_$DATE.db

# 备份公司B文件
echo "备份公司B文件..."
tar -czf $BACKUP_DIR/company_b/files_$DATE.tar.gz \
    /home/deploy/one_stop_shop/backend/uploads/company_b

# 删除30天前的备份
echo "清理旧备份..."
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

# 显示备份结果
echo "=========================================="
echo "  备份完成！"
echo "  备份位置: $BACKUP_DIR"
echo "  备份大小: $(du -sh $BACKUP_DIR)"
echo "=========================================="
```

**设置定时备份**：
```bash
# 添加到crontab
crontab -e

# 每天凌晨3点备份
0 3 * * * /home/deploy/backup.sh >> /home/deploy/backup.log 2>&1
```

---

### 10.2 健康检查

**执行方式：🤖 AI可执行（生成脚本）**

```bash
#!/bin/bash
# health_check.sh - 健康检查脚本

echo "=========================================="
echo "  系统健康检查"
echo "=========================================="

# 检查服务状态
echo "1. 服务状态:"
systemctl status onestopshop-a --no-pager | grep "Active:"
systemctl status onestopshop-b --no-pager | grep "Active:"
systemctl status nginx --no-pager | grep "Active:"

# 检查端口
echo ""
echo "2. 端口监听:"
netstat -tlnp | grep -E "8001|8002|80|443"

# 检查磁盘
echo ""
echo "3. 磁盘使用:"
df -h | grep -E "/$|/home"

# 检查内存
echo ""
echo "4. 内存使用:"
free -h

# 检查API
echo ""
echo "5. API健康检查:"
curl -s http://localhost:8001/api/health | head -1
curl -s http://localhost:8002/api/health | head -1

# 检查日志错误
echo ""
echo "6. 最近日志错误:"
journalctl -u onestopshop-a --since "1 hour ago" | grep -i "error" | tail -3
journalctl -u onestopshop-b --since "1 hour ago" | grep -i "error" | tail -3

echo ""
echo "=========================================="
echo "  检查完成！"
echo "=========================================="
```

---

## 📋 执行清单汇总

### 第一阶段：购买与准备（👨‍💻 手动操作）

| 序号 | 任务 | 执行方式 | 状态 |
|------|------|----------|------|
| 1 | 购买腾讯云产品 | 👨‍💻 控制台 | ⬜ |
| 2 | 购买域名 | 👨‍💻 注册商 | ⬜ |
| 3 | 域名备案 | 👨‍💻 提交资料 | ⬜ |
| 4 | 服务器初始化 | 🤖 脚本 | ⬜ |

### 第二阶段：环境配置（🤖 AI可执行）

| 序号 | 任务 | 执行方式 | 状态 |
|------|------|----------|------|
| 5 | 安装运行环境 | 🤖 脚本 | ⬜ |
| 6 | 部署项目代码 | 🤖 脚本 | ⬜ |
| 7 | 配置环境变量 | 🤖 模板 | ⬜ |
| 8 | 配置Systemd服务 | 🤖 脚本 | ⬜ |

### 第三阶段：域名与安全（混合）

| 序号 | 任务 | 执行方式 | 状态 |
|------|------|----------|------|
| 9 | 域名解析配置 | 👨‍💻 控制台 | ⬜ |
| 10 | SSL证书配置 | 🤖 脚本 | ⬜ |
| 11 | Nginx配置 | 🤖 脚本 | ⬜ |
| 12 | 防火墙配置 | 🤖 脚本 | ⬜ |

### 第四阶段：小程序对接（👨‍💻 手动操作）

| 序号 | 任务 | 执行方式 | 状态 |
|------|------|----------|------|
| 13 | 注册小程序 | 👨‍💻 微信平台 | ⬜ |
| 14 | 配置合法域名 | 👨‍💻 微信平台 | ⬜ |
| 15 | 小程序代码配置 | 🤖 模板 | ⬜ |

### 第五阶段：运维保障（🤖 AI可执行）

| 序号 | 任务 | 执行方式 | 状态 |
|------|------|----------|------|
| 16 | 配置自动备份 | 🤖 脚本 | ⬜ |
| 17 | 健康检查脚本 | 🤖 脚本 | ⬜ |
| 18 | 安全加固 | 🤖 脚本 | ⬜ |

---

## ⚠️ 需要你提供的信息

| 信息 | 用途 | 状态 |
|------|------|------|
| 服务器IP和密码 | 连接服务器 | ⬜ |
| 公司A域名 | 配置Nginx | ⬜ |
| 公司B域名 | 配置Nginx | ⬜ |
| AI模型API Key | 配置后端 | ⬜ |
| COS密钥 | 配置存储 | ⬜ |
| 小程序AppID | 配置小程序 | ⬜ |
| 小程序AppSecret | 配置小程序 | ⬜ |

---

## 🚀 快速开始

**现在可以开始的步骤**：

1. ✅ 购买腾讯云产品（轻量服务器、COS等）
2. ✅ 购买域名并开始备案
3. ✅ 告诉我服务器信息，我帮你生成所有脚本

**预计部署时间**：
- 域名备案：7-20天（可并行进行其他工作）
- 服务器配置：2-3小时
- 应用部署：1-2小时
- 小程序对接：1-2小时

---

*文档版本：v1.0*
*最后更新：2026-06-22*
