#!/usr/bin/env bash
# 总控：按共享协议兼容顺序部署 Host Agent → server → web
set -euo pipefail
cd "$(dirname "$0")"

if [ -n "$(git -C .. status --porcelain)" ]; then
  echo "⚠️  工作树有未提交改动 —— 你正在部署未提交/未推送的代码"
fi

echo "🚀  部署 Host Agent…"
bash deploy-host-agent.sh

echo "🚀  部署后端…"
bash deploy-server.sh

echo "🚀  部署前端…"
bash deploy-web.sh

echo "🎉 全部完成"
