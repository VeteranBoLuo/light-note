# GitHub OAuth 专用出口

后端可将换票、个人资料和邮箱读取交给独立 Cloudflare Pages Function。中转不存储授权码、GitHub 应用密钥或访问令牌，不接数据库；平台请求正文、凭据与实时日志必须关闭。与浏览器推送实例分开部署、使用不同鉴权密钥。

## 发布与配置

发布遵守[项目发布流程](../../docs/release-acceptance.md)。将 `worker.mjs` 复制到独立发布目录的 `_worker.js`，加入最小 `index.html`，按 Pages Functions advanced mode 部署；发布目录不得包含仓库、环境文件或凭据。`wrangler.jsonc` 仅用于可选的 Workers 部署。

为实例生成独立的 32 字符以上 base64url 随机 `RELAY_TOKEN`，通过 Cloudflare Secret 管理配置，不放入命令行参数或 Git。在后端受保护环境设置：

```dotenv
GITHUB_OAUTH_RELAY_URL=https://relay.example.com/github
GITHUB_OAUTH_RELAY_TOKEN=<与实例一致的独立鉴权密钥>
```

仅在两个配置均为空时保持原直连；缺一项或格式错误时拒绝换票。配置后所有 GitHub 服务端请求统一走该实例，不自动换路。回退清空两项并按发布流程刷新 API 环境，不更换 GitHub OAuth App 或浏览器推送配置。

## 协议与验收

只接受带服务端 Bearer 鉴权的 `POST /github`，JSON 操作固定为 `probe`、`token`、`user`、`emails`。目标固定为 GitHub 换票及两个 GET 接口，不接收 URL，不转发 Cookie，不跟随重定向；每次请求只访问上游一次。先通过无用户凭据的 POST 探测 GitHub，再提交一次授权码。换票发出后，即使超时或响应无效也只能重新授权；资料 GET 可按后端已有策略有限重试。`state`、PKCE、浏览器 nonce 与账号绑定校验仍由原后端负责。

发布前运行：

```bash
pnpm --filter server exec vitest run util/githubOAuth.test.js util/githubOAuthRelay.test.js router_handle/userHandle.githubBinding.test.js
```

上线前从生产服务器验证实际中转域名、无鉴权拒绝、`probe` 到 GitHub 的完整 POST，以及经授权的真实 GitHub 登录和资料/邮箱读取。探测成功不能替代真实登录验收。中转只返回上游状态、受限响应正文及限流头；后端日志仅使用稳定错误码和 `route=relay`，不得记录中转 Secret、授权码、PKCE verifier、GitHub token 或用户资料。
