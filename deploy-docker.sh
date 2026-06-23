#!/bin/bash
# Docker一键部署脚本

set -e

echo "=========================================="
echo "  AI电商工具平台 - Docker部署"
echo "=========================================="

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "[1/4] 安装Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl start docker
    systemctl enable docker
else
    echo "[1/4] Docker已安装"
fi

# 检查Docker Compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "[2/4] 安装Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
else
    echo "[2/4] Docker Compose已安装"
fi

# 检查环境变量文件
echo "[3/4] 检查配置文件..."
if [ ! -f backend/.env ]; then
    cp deploy/.env.example backend/.env
    echo "⚠️  请编辑 backend/.env 填入API密钥："
    echo "   nano backend/.env"
    exit 1
fi

# 构建并启动
echo "[4/4] 构建并启动服务..."
docker-compose up -d --build

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "访问地址: http://你的服务器IP"
echo ""
echo "常用命令："
echo "  查看状态: docker-compose ps"
echo "  查看日志: docker-compose logs -f"
echo "  重启服务: docker-compose restart"
echo "  停止服务: docker-compose down"
echo ""
