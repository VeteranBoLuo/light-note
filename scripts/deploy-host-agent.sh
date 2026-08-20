#!/usr/bin/env bash
# Host Agent 部署：本地打包 → 远端快照 → 安装专用账户、固定 helper、sudoers 与 systemd unit → Socket 健康检查
set -euo pipefail

HOST="${LIGHTNOTE_DEPLOY_HOST:?请设置 LIGHTNOTE_DEPLOY_HOST，例如 deploy-user@example.com}"
KEY="${LIGHTNOTE_DEPLOY_SSH_KEY:?请设置 LIGHTNOTE_DEPLOY_SSH_KEY 为本机 SSH 私钥绝对路径}"
[ -f "$KEY" ] || { echo "SSH 私钥不存在: $KEY" >&2; exit 1; }
REMOTE="/opt/lightnote-host-agent"
AGENT_USER="lightnote-agent"
OUT="/tmp/ln-host-agent-deploy"
TS="$(date +%Y%m%d%H%M%S)"
cd "$(dirname "$0")/.."

echo "📦  打包 Host Agent（仅生产依赖）…"
rm -rf "$OUT"
pnpm --filter host-agent deploy --prod --legacy "$OUT"

echo "🔎  预检 Node、systemd、sudo 与 PM2 运行时…"
ssh -i "$KEY" "$HOST" "set -eu; \
  test -x /usr/bin/node; \
  test -x /usr/bin/systemctl; \
  test -x /usr/bin/sudo; \
  test -x /usr/bin/pm2; \
  test -x /usr/bin/nsenter; \
  major=\$(/usr/bin/node -p 'Number(process.versions.node.split(\".\")[0])'); \
  test \"\$major\" -ge 18; \
  /usr/bin/pm2 ping >/dev/null"

echo "🗄  远端备份现有 Host Agent（滚动保留最近 1 份）…"
ssh -i "$KEY" "$HOST" "{ [ -d '$REMOTE' ] && cp -al '$REMOTE' '${REMOTE}_bak_$TS'; }; \
  ls -1dt ${REMOTE}_bak_* 2>/dev/null | tail -n +2 | xargs -r rm -rf; \
  install -d -o root -g root -m 0755 '$REMOTE'"

echo "🚚  同步 Host Agent 程序包…"
rsync -az --no-owner --no-group --delete -e "ssh -i $KEY" "$OUT"/ "$HOST:$REMOTE/"

echo "🛡  安装专用账户、固定 helper、精确 sudoers 与 systemd unit…"
ssh -i "$KEY" "$HOST" "set -eu; \
  if ! id -u '$AGENT_USER' >/dev/null 2>&1; then \
    useradd --system --home-dir /var/lib/lightnote-host-agent --no-create-home --shell /usr/sbin/nologin '$AGENT_USER'; \
  fi; \
  install -d -o root -g root -m 0755 /usr/local/libexec /etc/lightnote-host-agent; \
  install -o root -g root -m 0755 '$REMOTE/privileged/lightnote-host-helper' /usr/local/libexec/lightnote-host-helper; \
  install -o root -g root -m 0644 '$REMOTE/deploy/lightnote-host-agent@.service' /etc/systemd/system/lightnote-host-agent@.service; \
  sudoers_tmp=\$(mktemp /etc/sudoers.d/lightnote-host-agent.XXXXXX); \
  env_tmp=\$(mktemp /etc/lightnote-host-agent/agent.env.XXXXXX); \
  trap 'rm -f \"\$sudoers_tmp\" \"\$env_tmp\"' EXIT; \
  sed 's/<agent-user>/$AGENT_USER/g' '$REMOTE/deploy/lightnote-host-agent.sudoers.example' > \"\$sudoers_tmp\"; \
  chmod 0440 \"\$sudoers_tmp\"; \
  visudo -cf \"\$sudoers_tmp\" >/dev/null; \
  install -o root -g root -m 0440 \"\$sudoers_tmp\" /etc/sudoers.d/lightnote-host-agent; \
  if [ ! -f /etc/lightnote-host-agent/agent.env ]; then \
    sed \
      -e 's#HOST_AGENT_PM2_HOME=/home/<agent-user>/.pm2#HOST_AGENT_PM2_HOME=/var/lib/lightnote-host-agent/pm2-unused#' \
      -e 's/HOST_AGENT_PM2_ACCESS_MODE=direct/HOST_AGENT_PM2_ACCESS_MODE=helper/' \
      '$REMOTE/deploy/agent.env.example' > \"\$env_tmp\"; \
    install -o root -g '$AGENT_USER' -m 0640 \"\$env_tmp\" /etc/lightnote-host-agent/agent.env; \
  fi; \
  ! grep -q '<agent-user>' /etc/lightnote-host-agent/agent.env; \
  grep -qx 'HOST_AGENT_PM2_ACCESS_MODE=helper' /etc/lightnote-host-agent/agent.env; \
  systemctl daemon-reload; \
  systemctl enable --now 'lightnote-host-agent@$AGENT_USER.service'; \
  systemctl restart 'lightnote-host-agent@$AGENT_USER.service'"

echo "✅  验证 Socket、协议与固定 helper 能力…"
ssh -i "$KEY" "$HOST" "set -eu; \
  systemctl is-active --quiet 'lightnote-host-agent@$AGENT_USER.service'; \
  test -S /run/lightnote-host-agent/agent.sock; \
  curl --fail --silent --show-error --unix-socket /run/lightnote-host-agent/agent.sock http://localhost/v1/health >/dev/null; \
  sudo -u '$AGENT_USER' sudo -n /usr/local/libexec/lightnote-host-helper capabilities >/dev/null; \
  curl --fail --silent --show-error --unix-socket /run/lightnote-host-agent/agent.sock http://localhost/v1/dashboard | \
    /usr/bin/node -e 'let source=\"\"; process.stdin.on(\"data\", chunk => source += chunk).on(\"end\", () => { const payload = JSON.parse(source); const expected = new Set([\"lightnote-api\", \"lightnote-document-worker\", \"lightnote-bookmark-icon-worker\", \"lightnote-resource-governance-worker\"]); const services = payload?.data?.services || []; for (const service of services) { if (expected.has(service.id) && service.state !== \"unknown\") expected.delete(service.id); } if (!payload?.ok || expected.size) process.exit(1); });'; \
  echo 'Host Agent health and fixed helper checks passed'"

echo "🎉  Host Agent 部署完成"
