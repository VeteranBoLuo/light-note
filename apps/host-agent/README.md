# Light Note Host Agent

Host Agent 是服务器管理页的本机执行端，不是 AI Agent。它只监听 Unix Domain Socket，负责采集本机指标、读取受限日志，并执行极少量白名单运维动作。

## 边界

- 不监听 TCP 端口，不接受浏览器直连；只有 `apps/server` 通过本机 Socket 调用。
- 不读取 `apps/server/.env`，不需要数据库、Redis、对象存储、SSH、Cookie 或任何业务凭据。
- 不提供终端、任意命令、任意文件、任意 systemd unit 或任意 PM2 进程参数。
- `lightnote-api`、MySQL、Redis 仅观察，不能从页面重启。
- 可写动作只有：Nginx 配置校验通过后重载，以及三个固定 Worker 的 PM2 重启。生产机仍由 root PM2 托管时，状态、日志和重启只经 root 所有 helper 的精确参数进入；helper 在输出 PM2 状态前会删除全部环境字段，日志会先脱敏。
- 命令均使用绝对路径、参数数组和 `shell: false`，并受超时、输出大小、日志脱敏和持久化幂等回执保护。Agent 在执行命令前先原子落「结果未知」占位；即使进程中途崩溃，相同 job ID 也只会返回原回执，不会自动重放。

## 运行账户与 PM2

优先让 Host Agent 与现有 PM2 daemon 使用同一个专用、非 root 应用账户，并设置 `HOST_AGENT_PM2_ACCESS_MODE=direct`。`HOST_AGENT_PM2_HOME` 必须指向该账户真实的 PM2 home；安装前先用该账户运行 `pm2 ping` 和 `pm2 jlist` 验证。systemd unit 默认只把该账户的 `~/.pm2` 以只读方式映射进隔离环境，Agent 自己只能写 `/run/lightnote-host-agent` 与 `/var/lib/lightnote-host-agent`。

如果当前 PM2 仍由 root 托管，使用独立 `lightnote-agent` 账户并设置 `HOST_AGENT_PM2_ACCESS_MODE=helper`。兼容模式不共享 `/root/.pm2`、不把 Agent 加入 root 组，也不开放 `pm2 *`：sudoers 只列出固定状态、七个固定服务日志和三个固定 Worker 重启命令，helper 内部再次按服务 ID 映射，并以固定 `nsenter` 参数读取被 systemd 隔离的宿主 PM2。长期仍建议单独规划 PM2 迁移到非 root 应用账户；迁移后切回 `direct` 并删除兼容授权。

## 一次性安装

以下命令需要运维人员在服务器上执行；把 `<agent-user>` 替换为实际的专用应用账户，并按服务器上的 Node、PM2 路径调整 `agent.env`。不要把真实环境文件提交到 Git。

```bash
pnpm --filter host-agent deploy --prod --legacy /tmp/lightnote-host-agent-package
sudo install -d -o root -g root -m 0755 /opt/lightnote-host-agent
sudo rsync -a --delete /tmp/lightnote-host-agent-package/ /opt/lightnote-host-agent/

sudo install -o root -g root -m 0755 \
  apps/host-agent/privileged/lightnote-host-helper.mjs \
  /usr/local/libexec/lightnote-host-helper.mjs
sudo install -o root -g root -m 0644 \
  apps/host-agent/deploy/lightnote-host-agent@.service \
  /etc/systemd/system/lightnote-host-agent@.service
sudo install -d -o root -g root -m 0755 /etc/lightnote-host-agent
sudo install -o root -g root -m 0640 \
  apps/host-agent/deploy/agent.env.example \
  /etc/lightnote-host-agent/agent.env
```

复制后立即编辑 `/etc/lightnote-host-agent/agent.env`，替换其中的 `<agent-user>` 并核对 Node/PM2 绝对路径；保留占位符时禁止启动 unit。

启用 Nginx 重载或 root PM2 兼容模式时安装 sudoers。用 `visudo` 创建文件并把 `<agent-user>` 替换为实际账户；不要把仍含占位符的示例直接放进 `/etc/sudoers.d`。示例中的每一条命令参数都必须保持精确，不得合并成通配规则。helper 必须保持 root 所有且应用账户不可写。

```bash
sudo visudo -f /etc/sudoers.d/lightnote-host-agent
sudo visudo -cf /etc/sudoers.d/lightnote-host-agent
```

文件内容应与 `deploy/lightnote-host-agent.sudoers.example` 一致，只替换账户占位符，不增加通配命令。

确认配置后启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lightnote-host-agent@<agent-user>.service
sudo systemctl status lightnote-host-agent@<agent-user>.service
curl --unix-socket /run/lightnote-host-agent/agent.sock http://localhost/v1/health
```

`apps/server` 只需非敏感配置：

```dotenv
HOST_AGENT_SOCKET_PATH=/run/lightnote-host-agent/agent.sock
```

部署目标和 SSH 私钥只从本机环境读取，不进入 Git：

```bash
export LIGHTNOTE_DEPLOY_HOST='deploy-user@example.com'
export LIGHTNOTE_DEPLOY_SSH_KEY='/absolute/path/to/private-key'
pnpm deploy:all
```

仓库只保存变量名和示例格式，不保存真实服务器地址、登录账号、密码或私钥内容。当前生产拓扑运行 `pnpm deploy:host-agent` 后，脚本会创建无登录权限的专用账户、生成 `helper` 模式的非敏感配置、校验 sudoers、启动 systemd unit，并完成 Socket 与 helper 能力检查。它不会修改现有 PM2 进程账户或加载业务 `.env`。

「结果未知」占位不会被 TTL 自动清理，也不会自动重放。页面会在当前浏览器标签页保留幂等键；必须先通过服务状态、Agent 日志和管理员审计完成人工核验，才能把后续操作视为新的运维意图。未核验前不得删除对应回执文件或通过新标签页绕过。

## 更新与回滚

更新时先部署共享协议、Host Agent 和后端，再部署前端；协议不一致时页面会失败关闭。Agent 文件更新后执行 `systemctl restart lightnote-host-agent@<agent-user>`，并通过 Socket 健康检查和服务器管理页确认版本、指标、服务状态。回滚时恢复上一份 `/opt/lightnote-host-agent` 包并重启该 unit；持久化回执可保留，避免同一幂等操作被重复执行。

## 排障

```bash
journalctl -u lightnote-host-agent@<agent-user>.service -n 120 --no-pager
sudo -u <agent-user> env PM2_HOME=<pm2-home> <pm2-bin> jlist
namei -l /run/lightnote-host-agent/agent.sock
```

常见原因是 Node/PM2 绝对路径不一致、`PM2_HOME` 指错、API 与 Agent 不是同一 Socket 访问组、系统日志读取权限不足，或 Nginx helper/sudoers 未按 root 所有安装。不要通过放宽 Socket 到 `0666`、给应用账户通配 sudo、关闭命令白名单来绕过问题。
