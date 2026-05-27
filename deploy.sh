#!/bin/bash
set -e

SERVER="root@8.153.87.187"
REMOTE_DIR="/opt/mako-ai-server-trace"

echo "=== 1. 上传项目文件 ==="
rsync -avz --exclude node_modules --exclude dist --exclude .DS_Store --exclude pnpm-lock.yaml \
  -e "ssh -o StrictHostKeyChecking=no" \
  /Users/mako/WebstormProjects/mako-ai-server-trace/ \
  "$SERVER:$REMOTE_DIR/"

echo "=== 2. 安装 Docker (if not installed) ==="
ssh -o StrictHostKeyChecking=no "$SERVER" << 'EOF'
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  apt-get update
  apt-get install -y docker.io docker-compose-v2
  systemctl enable docker
  systemctl start docker
else
  echo "Docker already installed"
  docker --version
fi
EOF

echo "=== 3. 生成环境变量 ==="
ssh -o StrictHostKeyChecking=no "$SERVER" << 'EOF'
cd /opt/mako-ai-server-trace/infra
# 生成随机 API_KEY
API_KEY=$(openssl rand -hex 16)
GRAFANA_PASSWORD=$(openssl rand -hex 8)

cat > .env << ENVEOF
# Grafana
GRAFANA_PASSWORD=$GRAFANA_PASSWORD

# Collector
API_KEY=$API_KEY
PORT=3000
ENVEOF

echo ""
echo "=== 生成的密钥（请保存！）==="
echo "API_KEY: $API_KEY"
echo "GRAFANA_PASSWORD: $GRAFANA_PASSWORD"
EOF

echo "=== 4. 启动所有服务 ==="
ssh -o StrictHostKeyChecking=no "$SERVER" << 'EOF'
cd /opt/mako-ai-server-trace/infra
docker compose up -d --build
echo ""
echo "=== 服务状态 ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
EOF

echo ""
echo "=== 部署完成！==="
echo "Collector: http://8.153.87.187:3002/health"
echo "Grafana: http://8.153.87.187:3003"
