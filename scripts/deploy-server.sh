#!/usr/bin/env bash
# 后端部署:本地 pnpm deploy(--legacy)打平自包含 node_modules → rsync 增量 → pm2 restart
set -euo pipefail
HOST="root@139.9.83.16"
KEY="$HOME/.ssh/hermes_server"
REMOTE="/www/wwwroot/light-note-back"
PM2="app"                     # pm2 进程名(实测,非 light-note-back)
OUT="/tmp/ln-server-deploy"
cd "$(dirname "$0")/.."

echo "📦  pnpm deploy(--legacy,含 @lightnote/shared)…"
rm -rf "$OUT"
pnpm --filter server deploy --prod --legacy "$OUT"

echo "🚚  rsync 增量(保留软链;不传 owner/group;保护服务器专属文件)…"
rsync -az --no-owner --no-group --delete \
  --exclude '.env' \
  --exclude 'light_note_back_start.sh' \
  --exclude 'sql/' \
  -e "ssh -i $KEY" "$OUT"/ "$HOST:$REMOTE/"

echo "♻️  pm2 restart $PM2…"
ssh -i "$KEY" "$HOST" "pm2 restart $PM2 --update-env"

echo "⏳  等待后端重启就绪并健康检查(重启窗口会短暂 502,属正常)…"
code=000
for i in 1 2 3 4 5 6; do
  sleep 2
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 https://boluo66.top/api/user/me || echo 000)"
  [ "$code" = "200" ] && break
done
if [ "$code" = "200" ]; then
  echo "✅  后端健康检查 HTTP 200"
else
  echo "⚠️  后端健康检查 HTTP $code —— 请查 pm2 logs app;必要时回滚"
fi
