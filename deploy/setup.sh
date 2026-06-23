#!/bin/bash
# 阿里云服务器初始化脚本

set -e

echo "=========================================="
echo "  AI电商工具平台 - 服务器初始化"
echo "=========================================="

# 更新系统
echo "[1/5] 更新系统包..."
apt update && apt upgrade -y

# 安装必要软件
echo "[2/5] 安装必要软件..."
apt install -y python3 python3-pip python3-venv nginx curl

# 安装 Node.js 18.x（用于构建前端）
echo "[3/5] 安装 Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 验证安装
echo "Python: $(python3 --version)"
echo "pip: $(pip3 --version)"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "Nginx: $(nginx -v 2>&1)"

# 创建 Python 虚拟环境
echo "[4/5] 创建 Python 虚拟环境..."
cd /data/one_stop_shop/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 复制环境变量示例文件
echo "[5/5] 配置环境变量..."
if [ ! -f .env ]; then
    cp ../deploy/.env.example .env
    echo "已创建 .env 文件，请编辑填入 API Key："
    echo "  nano /data/one_stop_shop/backend/.env"
fi

# 设置权限
chmod 600 .env

echo ""
echo "=========================================="
echo "  初始化完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 编辑环境变量：nano /data/one_stop_shop/backend/.env"
echo "2. 运行部署脚本：cd /data/one_stop_shop/deploy && sudo ./deploy.sh"
echo ""
