#!/usr/bin/env bash
# 前端部署:本地增量构建 → tar → scp → 服务器原子切换(滚动保留 1 个旧 dist 备份,可回滚且不累积)
set -euo pipefail
DEPLOY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/deploy-environment.sh
source "$DEPLOY_SCRIPT_DIR/lib/deploy-environment.sh"

HOST="${LIGHTNOTE_DEPLOY_HOST:?请设置 LIGHTNOTE_DEPLOY_HOST，例如 deploy-user@example.com}"
KEY="$(resolve_deploy_ssh_key "${LIGHTNOTE_DEPLOY_SSH_KEY:?请设置 LIGHTNOTE_DEPLOY_SSH_KEY 为本机 SSH 私钥路径}")"
[ -f "$KEY" ] || { echo "SSH 私钥不存在: $KEY" >&2; exit 1; }
REMOTE="/www/wwwroot"
TS="$(date +%Y%m%d%H%M%S)"
cd "$(dirname "$0")/.."

echo "🏗  构建前端(增量)…"
pnpm --filter web build

echo "📦  打包 dist…"
# COPYFILE_DISABLE=1:阻止 macOS tar 往包里塞 ._* AppleDouble 元数据文件(服务器上是纯垃圾)
COPYFILE_DISABLE=1 tar czf /tmp/ln-web-dist.tgz -C apps/web dist

echo "🚀  上传 + 原子切换(滚动保留最近 1 个旧 dist 备份)…"
scp -i "$KEY" /tmp/ln-web-dist.tgz "$HOST:/tmp/ln-web-dist.tgz"
# 备份旧 dist → 解包新 dist → 只保留最新 1 个 dist_bak_*(tail -n +2 删除除最新外的全部),既可回滚又不累积
ssh -i "$KEY" "$HOST" "cd $REMOTE && { [ -d dist ] && mv dist dist_bak_$TS; }; tar xzf /tmp/ln-web-dist.tgz && rm -f /tmp/ln-web-dist.tgz && ls -1dt dist_bak_* 2>/dev/null | tail -n +2 | xargs -r rm -rf"
rm -f /tmp/ln-web-dist.tgz

code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 https://boluo66.top || echo 000)"
if [ "$code" = "200" ]; then
  echo "✅  前端健康检查 HTTP 200"
else
  echo "⚠️  前端健康检查 HTTP $code —— 已停止总发布流程，请核对 Nginx 与当前 dist"
  exit 1
fi
