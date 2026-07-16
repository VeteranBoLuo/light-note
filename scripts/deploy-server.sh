#!/usr/bin/env bash
# 后端部署:本地 pnpm deploy(--legacy)打平自包含 node_modules → 服务器备份 → rsync 增量(--delete) → pm2 restart
set -euo pipefail
HOST="root@139.9.83.16"
KEY="$HOME/.ssh/hermes_server"
REMOTE="/www/wwwroot/light-note-back"
PM2="app"                     # pm2 进程名(实测,非 light-note-back)
DOCUMENT_WORKER_PM2="light-note-document-worker"
OUT="/tmp/ln-server-deploy"
TS="$(date +%Y%m%d%H%M%S)"
cd "$(dirname "$0")/.."

echo "📦  pnpm deploy(--legacy,含 @lightnote/shared)…"
rm -rf "$OUT"
pnpm --filter server deploy --prod --legacy "$OUT"

# rsync --delete 会把服务器目录完全对齐成本地打包结果,任何只存在于服务器、未提交到 git 的改动
# 都会被无声覆盖且无法找回。这里先在服务器本地做一次硬链接快照(不占用额外磁盘,滚动只保留最新 1 份),
# 万一线上跑的是未提交的补丁,至少能从 ${REMOTE}_bak_* 里翻回来,而不是彻底丢失。
echo "🗄  服务器端备份现有目录(硬链接快照,不占额外磁盘;滚动保留最新 1 份)…"
ssh -i "$KEY" "$HOST" "{ [ -d '$REMOTE' ] && cp -al '$REMOTE' '${REMOTE}_bak_$TS'; }; ls -1dt ${REMOTE}_bak_* 2>/dev/null | tail -n +2 | xargs -r rm -rf"

echo "🚚  rsync 增量(保留软链;不传 owner/group;保护服务器专属文件)…"
rsync -az --no-owner --no-group --delete \
  --exclude '.env' \
  --exclude 'light_note_back_start.sh' \
  --exclude 'sql/' \
  -e "ssh -i $KEY" "$OUT"/ "$HOST:$REMOTE/"

echo "♻️  pm2 restart ${PM2}…"
ssh -i "$KEY" "$HOST" "pm2 restart $PM2 --update-env && if pm2 describe '$DOCUMENT_WORKER_PM2' >/dev/null 2>&1; then pm2 restart '$DOCUMENT_WORKER_PM2' --update-env; else cd '$REMOTE' && pm2 start documentWorker.js --name '$DOCUMENT_WORKER_PM2'; fi && pm2 save"

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
  echo "⚠️  后端健康检查 HTTP $code —— 请查 pm2 logs app;必要时回滚:"
  echo "    ssh -i $KEY $HOST \"rm -rf $REMOTE && mv ${REMOTE}_bak_$TS $REMOTE && pm2 restart $PM2 --update-env\""
fi
