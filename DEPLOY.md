# 腾讯云部署方案

## 📋 服务器配置

| 配置项 | 规格 |
|--------|------|
| 服务器 | 腾讯云轻量应用服务器 |
| CPU/内存 | 2核4G |
| 带宽 | 5M峰值 |
| 系统盘 | 60GB SSD |
| 流量 | 500GB/月 |
| 操作系统 | Ubuntu 22.04 LTS |
| 地域 | 广州/上海（选离用户近的） |

## 🏗️ 部署架构

```
                    ┌─────────────────────────────────────────┐
                    │          微信小程序用户                    │
                    └──────────────────┬──────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │              域名 (已备案)                │
                    │         HTTPS (SSL证书)                  │
                    └──────────────────┬──────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           腾讯云轻量服务器                                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           Nginx (反向代理)                          │    │
│  │                     端口 80/443 → 127.0.0.1:8000                    │    │
│  └─────────────────────────────────┬───────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     FastAPI 后端 (uvicorn)                          │    │
│  │                          端口 8000                                  │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │    │
│  │  │   React     │  │   API 路由    │  │   SQLite 数据库           │  │    │
│  │  │   前端      │  │   /api/*     │  │   ./data/app.db          │  │    │
│  │  └─────────────┘  └──────────────┘  └──────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │         腾讯云 COS 对象存储              │
                    │      (存储上传文件、知识库文档)           │
                    └─────────────────────────────────────────┘
```

## 📦 部署步骤

### 第一步：服务器初始化

#### 1.1 连接服务器

```bash
# 使用 SSH 连接（在本地终端执行）
ssh root@你的服务器IP

# 或使用腾讯云控制台的 VNC 登录
```

#### 1.2 系统更新

```bash
# 更新系统包
apt update && apt upgrade -y

# 安装基础工具
apt install -y curl wget git vim unzip
```

#### 1.3 创建部署用户（安全建议）

```bash
# 创建新用户
adduser deploy

# 添加 sudo 权限
usermod -aG sudo deploy

# 切换到新用户
su - deploy
```

---

### 第二步：安装运行环境

#### 2.1 安装 Python 3.11+

```bash
# 安装 Python
sudo apt install -y python3 python3-pip python3-venv

# 验证安装
python3 --version
```

#### 2.2 安装 Node.js 18+（用于构建前端）

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node --version
npm --version
```

#### 2.3 安装 Nginx

```bash
sudo apt install -y nginx

# 启动 Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 验证安装
nginx -v
```

---

### 第三步：部署项目

#### 3.1 上传项目代码

**方式一：使用 Git（推荐）**

```bash
# 进入部署目录
cd /home/deploy

# 克隆项目（替换为你的仓库地址）
git clone your-repo-url one_stop_shop

# 进入项目目录
cd one_stop_shop
```

**方式二：使用 SCP 上传**

```bash
# 在本地执行（替换为你的服务器IP）
scp -r ./one_stop_shop deploy@服务器IP:/home/deploy/
```

#### 3.2 配置后端

```bash
# 进入后端目录
cd /home/deploy/one_stop_shop/backend

# 创建 Python 虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 创建环境配置文件
cp .env.example .env  # 如果有的话，否则手动创建
```

#### 3.3 创建环境配置文件

```bash
# 创建 .env 文件
cat > /home/deploy/one_stop_shop/backend/.env << 'EOF'
# 应用配置
APP_NAME=AI电商工具平台
DEBUG=false

# 数据库配置（默认使用 SQLite）
DATABASE_URL=sqlite:///./data/app.db

# JWT 密钥（请修改为随机字符串）
SECRET_KEY=your-random-secret-key-change-this

# 文件上传配置
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# AI 模型配置（按需填写）
# OPENAI_API_KEY=sk-xxx
# CLAUDE_API_KEY=sk-ant-xxx
# DEEPSEEK_API_KEY=sk-xxx

# COS 配置（腾讯云对象存储，按需填写）
# COS_SECRET_ID=your-secret-id
# COS_SECRET_KEY=your-secret-key
# COS_BUCKET=your-bucket-name
# COS_REGION=ap-guangzhou
EOF

# 生成随机密钥
openssl rand -hex 32
# 将输出的密钥替换 .env 文件中的 SECRET_KEY
```

#### 3.4 构建前端

```bash
# 进入前端目录
cd /home/deploy/one_stop_shop/frontend

# 安装依赖
npm install

# 构建生产版本
npm run build

# 验证构建产物
ls -la dist/
```

#### 3.5 测试后端启动

```bash
# 进入后端目录
cd /home/deploy/one_stop_shop/backend

# 激活虚拟环境
source venv/bin/activate

# 测试启动
python3 main.py

# 如果看到类似以下输出，说明成功：
# INFO:     Uvicorn running on http://0.0.0.0:8000
# 按 Ctrl+C 停止
```

---

### 第四步：配置 Systemd 服务

#### 4.1 创建服务文件

```bash
sudo tee /etc/systemd/system/onestopshop.service << 'EOF'
[Unit]
Description=AI电商工具平台 FastAPI 应用
After=network.target

[Service]
Type=exec
User=deploy
Group=deploy
WorkingDirectory=/home/deploy/one_stop_shop/backend
Environment="PATH=/home/deploy/one_stop_shop/backend/venv/bin"
ExecStart=/home/deploy/one_stop_shop/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

#### 4.2 启动服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start onestopshop

# 设置开机自启
sudo systemctl enable onestopshop

# 查看服务状态
sudo systemctl status onestopshop

# 查看日志
sudo journalctl -u onestopshop -f
```

---

### 第五步：配置 Nginx 反向代理

#### 5.1 创建 Nginx 配置

```bash
sudo tee /etc/nginx/sites-available/onestopshop << 'EOF'
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名

    # 文件上传大小限制
    client_max_body_size 50M;

    # API 请求代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支持（如果需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 上传文件代理
    location /uploads/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 静态资源缓存
    location /assets/ {
        proxy_pass http://127.0.0.1:8000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 前端 SPA 路由
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
    }

    # 日志配置
    access_log /var/log/nginx/onestopshop_access.log;
    error_log /var/log/nginx/onestopshop_error.log;
}
EOF
```

#### 5.2 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/onestopshop /etc/nginx/sites-enabled/

# 删除默认配置（可选）
sudo rm /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重新加载 Nginx
sudo systemctl reload nginx
```

---

### 第六步：配置域名和 SSL

#### 6.1 域名解析配置

在腾讯云控制台 → DNS 解析，添加记录：

| 主机记录 | 记录类型 | 记录值 | 说明 |
|----------|----------|--------|------|
| @ | A | 你的服务器IP | 主域名 |
| www | A | 你的服务器IP | www 域名 |

#### 6.2 申请 SSL 证书（免费方案）

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（替换为你的域名）
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 按照提示操作：
# 1. 输入邮箱
# 2. 同意服务条款
# 3. 选择重定向 HTTP 到 HTTPS

# 测试自动续期
sudo certbot renew --dry-run
```

#### 6.3 或使用购买的 SSL 证书

如果购买了腾讯云 SSL 证书：

1. 在腾讯云控制台下载证书
2. 上传到服务器 `/etc/nginx/ssl/` 目录
3. 修改 Nginx 配置：

```bash
sudo tee /etc/nginx/sites-available/onestopshop << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/your-domain.com_bundle.crt;
    ssl_certificate_key /etc/nginx/ssl/your-domain.com.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # ... 其他配置同上 ...
}
EOF

# 重新加载 Nginx
sudo systemctl reload nginx
```

---

### 第七步：配置防火墙

```bash
# 启用防火墙
sudo ufw enable

# 允许 SSH
sudo ufw allow 22/tcp

# 允许 HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 查看状态
sudo ufw status
```

---

### 第八步：配置腾讯云 COS（对象存储）

#### 8.1 创建存储桶

1. 登录腾讯云控制台
2. 进入 对象存储 COS
3. 创建存储桶：
   - 名称：`your-app-files`
   - 地域：广州
   - 访问权限：私有读写

#### 8.2 获取密钥

1. 进入 访问管理 → API 密钥管理
2. 创建或查看 SecretId 和 SecretKey

#### 8.3 配置项目使用 COS

编辑 `/home/deploy/one_stop_shop/backend/.env`：

```bash
# COS 配置
COS_SECRET_ID=your-secret-id
COS_SECRET_KEY=your-secret-key
COS_BUCKET=your-app-files
COS_REGION=ap-guangzhou
```

#### 8.4 安装 COS SDK（如果项目需要）

```bash
cd /home/deploy/one_stop_shop/backend
source venv/bin/activate
pip install cos-python-sdk-v5
```

---

### 第九步：配置备份策略

#### 9.1 数据库备份脚本

```bash
cat > /home/deploy/backup.sh << 'EOF'
#!/bin/bash

# 备份目录
BACKUP_DIR="/home/deploy/backups"
mkdir -p $BACKUP_DIR

# 日期标记
DATE=$(date +%Y%m%d_%H%M%S)

# 备份 SQLite 数据库
cp /home/deploy/one_stop_shop/backend/data/app.db $BACKUP_DIR/app_$DATE.db

# 备份上传文件
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /home/deploy/one_stop_shop/backend/uploads

# 删除 7 天前的备份
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "备份完成: $DATE"
EOF

# 添加执行权限
chmod +x /home/deploy/backup.sh

# 添加定时任务（每天凌晨 3 点备份）
crontab -e
# 添加以下行：
# 0 3 * * * /home/deploy/backup.sh >> /home/deploy/backup.log 2>&1
```

---

### 第十步：微信小程序配置

#### 10.1 配置合法域名

在微信公众平台 → 开发管理 → 开发设置 → 服务器域名：

| 类型 | 域名 |
|------|------|
| request 合法域名 | https://your-domain.com |
| uploadFile 合法域名 | https://your-domain.com |
| downloadFile 合法域名 | https://your-domain.com |

#### 10.2 小程序代码配置

在小程序代码中配置请求地址：

```javascript
// config.js 或 env.js
export const API_BASE_URL = 'https://your-domain.com/api';
```

---

## 🔧 常用运维命令

### 服务管理

```bash
# 查看应用状态
sudo systemctl status onestopshop

# 重启应用
sudo systemctl restart onestopshop

# 查看应用日志
sudo journalctl -u onestopshop -f

# 查看 Nginx 状态
sudo systemctl status nginx

# 重启 Nginx
sudo systemctl restart nginx
```

### 日志查看

```bash
# 应用日志
sudo journalctl -u onestopshop --since "1 hour ago"

# Nginx 访问日志
tail -f /var/log/nginx/onestopshop_access.log

# Nginx 错误日志
tail -f /var/log/nginx/onestopshop_error.log
```

### 数据库管理

```bash
# 进入项目目录
cd /home/deploy/one_stop_shop/backend

# 激活虚拟环境
source venv/bin/activate

# 使用 SQLite 命令行
sqlite3 data/app.db

# 常用命令
.tables                    # 查看所有表
.schema users              # 查看表结构
SELECT * FROM users LIMIT 10;  # 查询数据
.quit                      # 退出
```

### 磁盘空间检查

```bash
# 查看磁盘使用
df -h

# 查看目录大小
du -sh /home/deploy/one_stop_shop/

# 查找大文件
find /home/deploy -type f -size +100M
```

---

## ⚠️ 安全建议

### 1. 修改 SSH 端口（可选）

```bash
# 编辑 SSH 配置
sudo vim /etc/ssh/sshd_config

# 修改端口
Port 2222

# 重启 SSH
sudo systemctl restart sshd

# 更新防火墙
sudo ufw allow 2222/tcp
sudo ufw delete allow 22/tcp
```

### 2. 禁止 root 登录

```bash
# 编辑 SSH 配置
sudo vim /etc/ssh/sshd_config

# 修改
PermitRootLogin no

# 重启 SSH
sudo systemctl restart sshd
```

### 3. 安装 fail2ban（防暴力破解）

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 4. 定期更新系统

```bash
# 每周更新一次
sudo apt update && sudo apt upgrade -y
```

---

## 📊 监控建议

### 1. 系统资源监控

```bash
# 安装 htop
sudo apt install -y htop

# 查看资源使用
htop
```

### 2. 应用健康检查

```bash
# 创建健康检查脚本
cat > /home/deploy/health_check.sh << 'EOF'
#!/bin/bash

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health)

if [ $RESPONSE != "200" ]; then
    echo "应用异常，状态码: $RESPONSE，正在重启..."
    sudo systemctl restart onestopshop
fi
EOF

chmod +x /home/deploy/health_check.sh

# 添加定时任务（每 5 分钟检查一次）
crontab -e
# 添加：
# */5 * * * * /home/deploy/health_check.sh >> /home/deploy/health.log 2>&1
```

---

## 🚀 部署检查清单

- [ ] 服务器系统更新完成
- [ ] Python 3.11+ 安装完成
- [ ] Node.js 18+ 安装完成
- [ ] Nginx 安装并启动
- [ ] 项目代码上传完成
- [ ] 后端依赖安装完成
- [ ] 前端构建完成
- [ ] 环境变量配置完成
- [ ] Systemd 服务配置完成
- [ ] Nginx 反向代理配置完成
- [ ] 域名解析配置完成
- [ ] SSL 证书配置完成
- [ ] 防火墙配置完成
- [ ] 微信小程序域名白名单配置完成
- [ ] 备份策略配置完成

---

## 📝 部署后验证

### 1. 访问测试

```bash
# 测试 HTTP 访问
curl http://your-domain.com

# 测试 HTTPS 访问
curl https://your-domain.com

# 测试 API
curl https://your-domain.com/api/health
```

### 2. 功能测试

- 访问网站首页
- 测试用户登录
- 测试文件上传
- 测试聊天功能
- 微信小程序连接测试

---

## 💰 成本汇总

| 项目 | 费用 | 周期 |
|------|------|------|
| 轻量服务器 2核4G5M | ¥188 | 年 |
| COS 标准存储 100G | ¥29 | 年 |
| CDN 流量包 100GB | ¥14 | 年 |
| 基础图片处理 | ¥1.1 | 年 |
| SSL 证书 | ¥0-64.6 | 年 |
| 域名 | ¥50-100 | 年 |
| **总计** | **¥282-396/年** | |

**月均：¥23-33**

---

## 📞 故障排查

### 应用无法访问

```bash
# 1. 检查应用状态
sudo systemctl status onestopshop

# 2. 查看应用日志
sudo journalctl -u onestopshop -n 50

# 3. 检查端口是否监听
sudo netstat -tlnp | grep 8000

# 4. 检查 Nginx 配置
sudo nginx -t

# 5. 查看 Nginx 错误日志
tail -f /var/log/nginx/onestopshop_error.log
```

### 数据库问题

```bash
# 检查数据库文件权限
ls -la /home/deploy/one_stop_shop/backend/data/

# 检查磁盘空间
df -h

# 检查数据库完整性
sqlite3 /home/deploy/one_stop_shop/backend/data/app.db "PRAGMA integrity_check;"
```

---

*最后更新：2026-06-22*
