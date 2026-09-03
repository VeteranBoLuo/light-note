#!/usr/bin/env bash
# 前端部署:本地构建 → staging 解包 → 继承上一版哈希资源 → 原子切换
set -euo pipefail
DEPLOY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/deploy-environment.sh
source "$DEPLOY_SCRIPT_DIR/lib/deploy-environment.sh"

HOST="${LIGHTNOTE_DEPLOY_HOST:?请设置 LIGHTNOTE_DEPLOY_HOST，例如 deploy-user@example.com}"
KEY="$(resolve_deploy_ssh_key "${LIGHTNOTE_DEPLOY_SSH_KEY:?请设置 LIGHTNOTE_DEPLOY_SSH_KEY 为本机 SSH 私钥路径}")"
[ -f "$KEY" ] || { echo "SSH 私钥不存在: $KEY" >&2; exit 1; }
REMOTE="/www/wwwroot"
TS="$(date +%Y%m%d%H%M%S)"
LOCAL_ARCHIVE="$(mktemp -t light-note-web-dist)"
REMOTE_ARCHIVE="/tmp/ln-web-dist-$TS.tgz"
cleanup_local_archive() {
  rm -f "$LOCAL_ARCHIVE"
}
trap cleanup_local_archive EXIT
cd "$(dirname "$0")/.."

echo "🏗  构建前端(增量)…"
pnpm --filter web build
PDF_WORKER_RELATIVE="$(node apps/web/scripts/verify-pdf-worker-artifact.mjs --print-path)"

echo "📦  打包 dist…"
# COPYFILE_DISABLE=1:阻止 macOS tar 往包里塞 ._* AppleDouble 元数据文件(服务器上是纯垃圾)
COPYFILE_DISABLE=1 tar czf "$LOCAL_ARCHIVE" -C apps/web dist

echo "🚀  上传 + 原子切换(兼容上一版已打开页面,滚动保留最近 1 个备份)…"
scp -i "$KEY" "$LOCAL_ARCHIVE" "$HOST:$REMOTE_ARCHIVE"
ssh -i "$KEY" "$HOST" bash -s -- "$REMOTE" "$TS" "$REMOTE_ARCHIVE" \
  < "$DEPLOY_SCRIPT_DIR/lib/install-web-release.sh"

code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 https://boluo66.top || echo 000)"
if [ "$code" = "200" ]; then
  echo "✅  前端健康检查 HTTP 200"
else
  echo "⚠️  前端健康检查 HTTP $code —— 已停止总发布流程，请核对 Nginx 与当前 dist"
  exit 1
fi

pdf_worker_url="https://boluo66.top/$PDF_WORKER_RELATIVE"
pdf_worker_response="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' -m 20 "$pdf_worker_url" || true)"
read -r pdf_worker_code pdf_worker_content_type <<< "$pdf_worker_response"
if [[ "$pdf_worker_code" != "200" || ! "$pdf_worker_content_type" =~ ^(application|text)/javascript ]]; then
  echo "❌  PDF Worker 响应异常：HTTP ${pdf_worker_code:-000}，Content-Type ${pdf_worker_content_type:-缺失}" >&2
  exit 1
fi
echo "✅  PDF Worker 响应检查通过：$pdf_worker_content_type"
