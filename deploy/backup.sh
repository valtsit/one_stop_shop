#!/bin/bash
# 备份脚本：备份数据库和上传文件

set -e

PROJECT_DIR="/data/one_stop_shop"
BACKUP_DIR="/data/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ai-shop-backup-$DATE.tar.gz"

echo "=========================================="
echo "  AI电商工具平台 - 备份"
echo "=========================================="

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 备份数据目录（数据库 + 上传文件）
echo "正在备份..."
tar -czf "$BACKUP_FILE" \
    -C "$PROJECT_DIR/backend" \
    data/

echo ""
echo "备份完成：$BACKUP_FILE"
echo "备份大小：$(du -h "$BACKUP_FILE" | cut -f1)"

# 清理 30 天前的备份
echo ""
echo "清理旧备份..."
find "$BACKUP_DIR" -name "ai-shop-backup-*.tar.gz" -mtime +30 -delete
echo "清理完成"

echo ""
echo "=========================================="
echo "  备份完成"
echo "=========================================="
