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

echo -n "✅  后端健康检查 HTTP "
curl -s -o /dev/null -w '%{http_code}\n' -m 10 https://boluo66.top/api/user/me || echo "(curl 失败,手动确认)"
