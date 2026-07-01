#!/usr/bin/env bash
# 前端部署:本地增量构建 → tar → scp → 服务器原子切换(滚动保留 1 个旧 dist 备份,可回滚且不累积)
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

echo "🚀  上传 + 原子切换(滚动保留最近 1 个旧 dist 备份)…"
scp -i "$KEY" /tmp/ln-web-dist.tgz "$HOST:/tmp/ln-web-dist.tgz"
# 备份旧 dist → 解包新 dist → 只保留最新 1 个 dist_bak_*(tail -n +2 删除除最新外的全部),既可回滚又不累积
ssh -i "$KEY" "$HOST" "cd $REMOTE && { [ -d dist ] && mv dist dist_bak_$TS; }; tar xzf /tmp/ln-web-dist.tgz && rm -f /tmp/ln-web-dist.tgz && ls -1dt dist_bak_* 2>/dev/null | tail -n +2 | xargs -r rm -rf"
rm -f /tmp/ln-web-dist.tgz

echo -n "✅  前端健康检查 HTTP "
curl -s -o /dev/null -w '%{http_code}\n' -m 10 https://boluo66.top || echo "(curl 失败,手动确认)"
