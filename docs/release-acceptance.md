# 本地预览与上线

本文是本地生产链路预览、发布门禁、分支处理与上线授权的唯一流程。领域数据迁移和产品规则由对应专题文档与 migration 自身说明负责，不在这里保存一次性上线流水。

## 本地开发与生产预览

日常前端开发使用：

```bash
pnpm dev:web
pnpm dev:server
```

真机 HMR 使用：

```bash
VITE_ENV=local pnpm dev:web:device
pnpm dev:server:watch
```

需要验证本地生产构建、预渲染与代理链路时才运行：

```bash
pnpm preview
```

`pnpm preview` 会使用本机代码启动后端、相关 Worker、前端生产构建、预渲染和 Vite preview。它不会自动停止未知占用进程；端口冲突时先在原终端正常结束旧进程。

预览和用户操作会对 `apps/server/.env` 指向的依赖产生真实读写。运行前必须确认：

- `LIGHTNOTE_RUNTIME_ENV=local`；
- 数据库为本地或本次明确授权的环境；
- `ALLOW_REMOTE_DATABASE_WRITES=false`，除非当前任务明确授权一次性远程写入；
- Redis、OBS、邮件和第三方服务均为允许使用的目标。

本地 preview 是可选验收工具，不是所有上线的强制二次确认门槛。

## 变更级验证

按影响范围选择最小充分验证，不无差别运行所有命令。

| 变更 | 最低验证 |
| --- | --- |
| 文档 | 链接/锚点、敏感信息、`git diff --check` |
| Web 逻辑 | 受影响测试 + `pnpm typecheck` 或 `pnpm build:web` |
| 用户可见 UI | Web 最低验证 + 真实浏览器状态矩阵 |
| Server | 受影响测试或语法检查 |
| 共享协议 | 前后端契约测试 + 类型检查 |
| Schema | migration 审阅 + `pnpm --filter server check:schema` |
| AI Skills | `check:ai-model-access` + 协议/Registry/Handler 测试 |
| Android 原生 | Gradle 受影响任务 + 真机/模拟器流程 |
| 浏览器扩展 | Web 测试、类型检查、扩展构建与最终 ZIP 检查 |

用户可见 UI 的浏览器验收至少覆盖受影响端型、浅色/深色和关键状态。移动样式还需对照 `?renderProfile=mobile` 与 Debug App。结构测试、构建和截图像素不能替代交互与视觉验收。

## Schema 与 Worker 门禁

所有后端发布在目标环境重启前运行：

```bash
pnpm --filter server check:schema
```

任何断言输出都表示未就绪；先处理明确获授权的 migration，再重新检查。发布授权不自动扩展为未说明的线上数据迁移、批量修复或破坏性操作。

按变更选择额外门禁：

| 范围 | 检查 |
| --- | --- |
| AI 文档、OCR、文件预览 | `check:ocr`、`check:file-previews` |
| 书签图标 | `check:bookmark-icons` |
| 资源治理 | `check:resource-governance` |
| 模块化 AI | `check:ai-model-access` |

涉及相应异步流程时确认对应 Worker 随项目脚本或 PM2 正常运行。任务状态以领域任务表、租约和错误码为准，不用 API 日志代替 Worker 验收。

真实 Provider 调用不是日常 AI 发布门禁。只有 Provider 协议、模型或生产兼容发生变化且用户明确授权时，才运行最小真实用例；输出必须脱敏。

## 上线授权

用户在当前任务中明确说“上线”或“部署”，即一次性授权：

- 审阅当前工作树中能确认属于本次项目范围的安全改动；
- 执行与风险匹配的测试、类型检查、构建和只读门禁；
- 提交、推送、必要的普通分支合并；
- 部署受影响服务；
- 执行发布后健康与关键功能检查。

该授权不包含来源不明改动、私密文件、证书、构建产物、未说明的线上迁移、批量数据修复或破坏性操作。遇到这些情况必须停止并说明。

没有明确上线/部署指令时，不提交、推送、连接生产环境、写线上数据库或部署。

## 分支流程

1. 先检查 `git status --short`，区分本次改动、用户已有改动和来源不明改动。
2. 当前分支是 `main`：提交并推送安全范围内改动，然后从 `main` 部署。
3. 当前分支不是 `main`：先提交并推送当前分支；更新本地 `main`，以普通非强制方式合并，推送 `main`，再从 `main` 部署。
4. 发生冲突、分支保护拒绝、工作树不安全或无法确认改动归属时停止；禁止强推、硬重置或破坏性覆盖。

## 部署顺序

按依赖从底层到上层发布：

1. 共享协议与 Schema；
2. Host Agent 或领域 Worker；
3. Express API；
4. Web / PWA / 扩展分发产物。

只发布受影响部分，但不能跳过其依赖。例如扩展新增 API 时先发布并验证后端，再提交商店包；Host Agent 协议变化时先保证服务端与 Agent 兼容窗口。

常用部署命令：

```bash
pnpm deploy:web
pnpm deploy:server
pnpm deploy:all
pnpm deploy:host-agent
```

部署脚本以当前 `main` 构建为准，不把本地 preview 进程或旧构建产物直接上传。

## 发布后检查

- 主 API 健康检查返回预期状态；
- PM2/systemd 中受影响进程在线且无重启循环；
- 受影响 Worker 能领取任务并产生可解释终态；
- 关键页面静态资源、SPA 直达和 API 版本一致；
- 实时、Redis、OBS、邮件或第三方依赖按本次范围验证；
- 日志无新错误、敏感信息或请求风暴。

健康检查失败不会自动证明已经回滚。依据部署脚本输出的精确快照和回滚命令处理，不对宽泛目录执行删除，不在原因不明时连续重启掩盖问题。
