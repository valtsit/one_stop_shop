# 阿里云部署指南

## 服务器配置

| 配置项 | 推荐值 |
|--------|--------|
| 规格 | ecs.c7.large（2 核 4G） |
| 系统盘 | 40G ESSD PL0 |
| 数据盘 | 100G ESSD PL1（挂载到 /data） |
| 带宽 | 5 Mbps |
| 系统 | Ubuntu 22.04 LTS |

## 部署步骤

### 1. 购买服务器后，挂载数据盘

```bash
# 查看磁盘
lsblk

# 格式化数据盘（假设是 /dev/vdb）
mkfs.ext4 /dev/vdb

# 创建挂载点
mkdir -p /data

# 挂载
mount /dev/vdb /data

# 写入 fstab 实现开机自动挂载
echo '/dev/vdb /data ext4 defaults 0 2' >> /etc/fstab
```

### 2. 上传项目文件

```bash
# 在本地打包项目（排除 node_modules 和 .git）
cd one_stop_shop
tar --exclude='node_modules' --exclude='.git' --exclude='frontend/dist' \
    -czf one_stop_shop.tar.gz .

# 上传到服务器
scp one_stop_shop.tar.gz root@你的服务器IP:/data/

# 在服务器上解压
cd /data
tar -xzf one_stop_shop.tar.gz
```

### 3. 运行部署脚本

```bash
cd /data/one_stop_shop/deploy
chmod +x setup.sh
sudo ./setup.sh
```

### 4. 配置环境变量

```bash
nano /data/one_stop_shop/backend/.env
```

填入你的 API Key 和其他配置。

### 5. 构建前端并启动

```bash
cd /data/one_stop_shop/deploy
chmod +x deploy.sh
sudo ./deploy.sh
```

## 常用命令

```bash
# 查看后端状态
systemctl status ai-shop

# 重启后端
systemctl restart ai-shop

# 查看后端日志
journalctl -u ai-shop -f

# 重新部署（更新代码后）
cd /data/one_stop_shop/deploy
sudo ./deploy.sh
```

## 目录结构

```
/data/one_stop_shop/
├── backend/          # 后端代码
│   ├── .env          # 环境变量（需要手动配置）
│   └── data/         # 数据库和上传文件
├── frontend/         # 前端代码
│   └── dist/         # 构建产物
└── deploy/           # 部署脚本
```
