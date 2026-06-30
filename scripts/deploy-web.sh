#!/usr/bin/env bash
# 前端部署:本地增量构建 → tar → scp → 服务器原子切换(备份旧 dist,只留最近 5 个)
set -euo pipefail
HOST="root@139.9.83.16"
KEY="$HOME/.ssh/hermes_server"
REMOTE="/www/wwwroot"
TS="$(date +%Y%m%d%H%M%S)"
cd "$(dirname "$0")/.."

echo "🏗  构建前端(增量)…"
pnpm --filter web build

echo "📦  打包 dist…"
tar czf /tmp/ln-web-dist.tgz -C apps/web dist

echo "🚀  上传 + 原子切换(备份旧 dist,清理到最近 5 个)…"
scp -i "$KEY" /tmp/ln-web-dist.tgz "$HOST:/tmp/ln-web-dist.tgz"
ssh -i "$KEY" "$HOST" "cd $REMOTE && { [ -d dist ] && mv dist dist_bak_$TS; }; tar xzf /tmp/ln-web-dist.tgz && rm -f /tmp/ln-web-dist.tgz && ls -1dt dist_bak_* 2>/dev/null | tail -n +6 | xargs -r rm -rf"
rm -f /tmp/ln-web-dist.tgz

echo -n "✅  前端健康检查 HTTP "
curl -s -o /dev/null -w '%{http_code}\n' -m 10 https://boluo66.top || echo "(curl 失败,手动确认)"
