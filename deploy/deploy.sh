#!/bin/bash
# 部署脚本：构建前端 + 配置 Nginx + 启动后端

set -e

PROJECT_DIR="/data/one_stop_shop"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "=========================================="
echo "  AI电商工具平台 - 部署"
echo "=========================================="

# 构建前端
echo "[1/4] 构建前端..."
cd "$FRONTEND_DIR"
npm install
npm run build
echo "前端构建完成"

# 配置 Nginx
echo "[2/4] 配置 Nginx..."
cat > /etc/nginx/sites-available/ai-shop << 'EOF'
server {
    listen 80;
    server_name _;  # 替换为你的域名

    # 前端静态资源
    root /data/one_stop_shop/frontend/dist;
    index index.html;

    # API 请求代理到后端
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

        # 超时设置（AI 调用可能较慢）
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # 上传文件访问
    location /uploads/ {
        proxy_pass http://127.0.0.1:8000/uploads/;
        proxy_set_header Host $host;
    }

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 上传文件大小限制
    client_max_body_size 20M;
}
EOF

# 启用站点
ln -sf /etc/nginx/sites-available/ai-shop /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试 Nginx 配置
nginx -t
systemctl reload nginx

# 配置 systemd 服务
echo "[3/4] 配置 systemd 服务..."
cat > /etc/systemd/system/ai-shop.service << EOF
[Unit]
Description=AI电商工具平台后端
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$BACKEND_DIR/venv/bin"
ExecStart=$BACKEND_DIR/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5

# 日志
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
echo "[4/4] 启动服务..."
systemctl daemon-reload
systemctl enable ai-shop
systemctl restart ai-shop

# 检查服务状态
sleep 2
if systemctl is-active --quiet ai-shop; then
    echo ""
    echo "=========================================="
    echo "  部署成功！"
    echo "=========================================="
    echo ""
    echo "服务状态："
    systemctl status ai-shop --no-pager -l
    echo ""
    echo "访问地址：http://你的服务器IP"
    echo ""
    echo "常用命令："
    echo "  查看状态: systemctl status ai-shop"
    echo "  重启服务: systemctl restart ai-shop"
    echo "  查看日志: journalctl -u ai-shop -f"
    echo ""
else
    echo ""
    echo "=========================================="
    echo "  服务启动失败，请查看日志："
    echo "  journalctl -u ai-shop -n 50"
    echo "=========================================="
    exit 1
fi
