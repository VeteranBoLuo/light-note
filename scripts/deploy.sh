#!/usr/bin/env bash
# 总控:并行部署 web + server(总耗时 ≈ max,非相加)
set -uo pipefail
cd "$(dirname "$0")"

if [ -n "$(git -C .. status --porcelain)" ]; then
  echo "⚠️  工作树有未提交改动 —— 你正在部署未提交/未推送的代码"
fi

echo "🚀  并行部署 web + server…"
bash deploy-web.sh    >/tmp/ln-dep-web.log 2>&1 & WEB=$!
bash deploy-server.sh >/tmp/ln-dep-srv.log 2>&1 & SRV=$!

FAIL=0
wait "$WEB" || { echo "❌ 前端部署失败"; FAIL=1; }
wait "$SRV" || { echo "❌ 后端部署失败"; FAIL=1; }

echo "──────── web ────────";   tail -5 /tmp/ln-dep-web.log
echo "──────── server ─────";   tail -5 /tmp/ln-dep-srv.log
[ "$FAIL" -eq 0 ] && echo "🎉 全部完成" || { echo "⚠️ 有失败,见上方日志"; exit 1; }
