#!/bin/bash
# 快速更新脚本：用于代码更新后快速部署

set -e

PROJECT_DIR="/data/one_stop_shop"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
DEPLOY_DIR="$PROJECT_DIR/deploy"

echo "=========================================="
echo "  AI电商工具平台 - 快速更新"
echo "=========================================="

# 构建前端
echo "[1/3] 构建前端..."
cd "$FRONTEND_DIR"
npm run build
echo "前端构建完成"

# 重启后端
echo "[2/3] 重启后端服务..."
systemctl restart ai-shop
echo "后端服务已重启"

# 检查状态
echo "[3/3] 检查服务状态..."
sleep 2
if systemctl is-active --quiet ai-shop; then
    echo ""
    echo "=========================================="
    echo "  更新完成！服务运行正常"
    echo "=========================================="
else
    echo ""
    echo "=========================================="
    echo "  服务启动失败，请查看日志："
    echo "  journalctl -u ai-shop -n 50"
    echo "=========================================="
    exit 1
fi
