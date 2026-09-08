# 浏览器推送备用出口

此目录提供可部署到 Cloudflare Workers 的单用途 FCM 加密请求转发器；不连接数据库，不接收通知明文、订阅解密密钥或 VAPID 私钥。它也可由兼容 Fetch API 的托管运行时调用 `handleRelay`，但其他平台需单独验证适配层。

## 部署与配置

需先具备托管账号及对应发布授权。`wrangler.jsonc` 用于 Workers 部署；也可使用 Pages Functions advanced mode，共用同一份转发代码。实际地址和凭据只配置在受保护的运行环境中。

1. 为实例生成独立随机 `RELAY_TOKEN`（至少 32 个 base64url 字符），通过平台 Secret 管理配置，不写入配置文件或命令行参数。
2. 使用平台 CLI 或控制台部署 `worker.mjs`，记录实例的 HTTPS `/push` 地址。生产宜使用验证可达的自定义域名。
3. 在生产后端受保护的 `.env` 配置 `BROWSER_PUSH_RELAYS` JSON 数组，每项包含 `url` 与 `token`，最多两项，按主、备顺序排列。示例仅写结构：`[{"url":"https://relay.example.com/push","token":"<secret>"}]`。
4. API/Worker 运行门禁和重启按 [发布规范](../../docs/release-acceptance.md) 执行。主备最好使用独立故障域；同平台两实例不能避免平台整体故障。

未配置时维持直连。配置后仅 FCM 使用主中转 → 备中转 → 直连，其他厂商保持直连。网络、408、429、5xx 可换路；厂商 403、404、410 等永久错误不换路。中转鉴权失败与上游厂商拒绝分别处理。单次领取最多三路、每路最多 10 秒，低于 90 秒租约；最终失败交还已有有限重试队列，不延长通知有效期。

## Pages Functions 部署

当 `workers.dev` 从业务服务器不可达时，可使用 Pages Functions，不需要购买服务器或迁移主站 DNS。将 `worker.mjs` 复制为独立发布目录的 `_worker.js`，加入最小 `index.html`，通过 `wrangler pages deploy <目录> --project-name <项目> --branch main` 发布。使用 `wrangler pages secret put RELAY_TOKEN --project-name <项目>` 配置相同的鉴权 Secret，并从业务服务器验证稳定的 `https://<项目>.pages.dev/push` 地址。不要上传仓库、环境文件或数据库配置。

Pages Functions 与 Workers 共用账号的免费请求额度；不把免费托管视为可用性承诺。平台限额或暂时失败仍交还既有重试队列。

## 门禁与回退

- 必须分别验证生产服务器到**实际中转域名**、中转到 FCM、真实设备显示及点击定位；平台官网可达不能证明实例可达。
- 自动测试覆盖故障切换、永久错误、目标白名单、凭据检查、正文上限与密文转发，运行 `pnpm --filter server exec vitest run util/browserPushTransport.test.js`。
- 仅转发到精确 `fcm.googleapis.com`，不跟随重定向；不开放给浏览器调用，不开启请求正文/凭据日志。
- 回退时清空 `BROWSER_PUSH_RELAYS` 并刷新进程环境；不要清空队列、轮换 VAPID 密钥或重新打开本地消费者。
- 不会为已被厂商受理的消息再换路发送。超时结果可能不确定，设备继续依靠既有通知 ID 去重；服务端不能据此断言设备已显示。
- 中转不改变客户端通道。Chrome 设备仍需连通 FCM；切换 Safari/Edge 属于用户重新订阅另一浏览器，不是服务器自动把 Chrome 改成其他厂商。
