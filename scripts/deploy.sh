#!/usr/bin/env bash
# 总控：按共享协议兼容顺序部署 Host Agent → server → web
set -euo pipefail
cd "$(dirname "$0")"
RELEASE_SHA="$(bash check-deploy-release.sh)"

echo "🚀  部署 Host Agent…"
bash deploy-host-agent.sh "$RELEASE_SHA"

echo "🚀  部署后端…"
bash deploy-server.sh "$RELEASE_SHA"

echo "🚀  部署前端…"
bash deploy-web.sh "$RELEASE_SHA"

echo "🎉 全部完成"
