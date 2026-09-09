# 本地预览与上线

本文是本地生产链路预览、发布门禁、分支处理与上线授权的唯一流程。领域数据迁移和产品规则由对应专题文档与 migration 自身说明负责，不在这里保存一次性上线流水。

文件整理涉及队列状态与视觉缓存结构时，发布顺序为停止旧文档／整理 Worker、执行已授权的加法迁移、更新 API 与 Worker、检查 Schema 后启用新任务。结构更新不重跑历史任务、不回填生产内容；文件理解验收需分别记录读取完整性、建议产出、耗时及用量，确定性 Provider 测试不代替真实模型质量评估。

后端部署要求 Node.js 20.19 及以上；独立运行时通过 `LIGHTNOTE_REMOTE_NODE` 指定绝对路径，并由 PM2 保存解释器路径。包含文件理解、图片预览、笔记导入及游客示例结构更新的已授权发布，设置 `LIGHTNOTE_APPLY_FEATURE_MIGRATIONS=1`，部署脚本会在旧文档 Worker 停止后通过 `scripts/migrateFileFeatures.js --apply` 执行固定的幂等迁移，再运行 Schema 与运行时门禁。游客示例内容仍需按下文独立执行维护工具。

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

已获当前任务远程只读授权的 Schema 检查可使用[数据库只读模式](./development.md#数据库环境隔离)，不需要开启远程写入。

任何断言输出都表示未就绪；先处理明确获授权的 migration，再重新检查。发布授权不自动扩展为未说明的线上数据迁移、批量修复或破坏性操作。

待办工作区通过 `node scripts/ensureTodoWorkspaceSchema.js` 显式应用幂等结构迁移；后端发布脚本在 Schema 断言前执行，应用启动不自动建表。帮助正文迁移独立执行，不混入结构门禁。

按变更选择额外门禁：

| 范围 | 检查 |
| --- | --- |
| AI 文档、OCR、文件预览 | `check:ocr`、`check:file-previews`；托管图片另执行 `check:image-previews` |
| 书签图标 | `check:bookmark-icons` |
| 动态网页识别与快照 | `check:web-renderer` |
| 资源治理 | `check:resource-governance` |
| 模块化 AI | `check:ai-model-access` |

浏览器推送需先经授权应用 `apps/server/migrations/20260908_browser_push.sql`，再运行 `pnpm --filter server check:browser-push` 验证 Schema 与 VAPID 配置。API 与 `browserPushWorker.js` 使用同一持久 VAPID 密钥和站点 Origin；默认服务开关关闭，启动本地预览及部署脚本均纳入该 Worker。密钥不由部署过程临时生成，服务开关关闭不影响站内通知。推送凭据不进入日志，测试应区分厂商受理、设备展示及点击定位，不能用模拟推送替代真实网络与设备验收。

FCM 备用出口使用 `scripts/browser-push-relay/worker.mjs`，以独立托管实例配置主、备用地址与各自的服务端凭据（`BROWSER_PUSH_RELAYS`）。实例需设置 `RELAY_TOKEN`，关闭请求正文与凭据日志；示例 `wrangler.jsonc` 只提供部署结构，不含线上地址或密钥。每条出口上线前分别验证生产服务器到实际中转域名、中转到厂商以及真实设备展示；官网可访问或模拟测试不算出口验收。未配置中转保持直连，停用中转清空该配置即可；不得为验证而重开本地队列消费者。

笔记导入需显式应用 `apps/server/migrations/20260909_note_import_tasks.sql`，随后执行 `pnpm --filter server check:note-imports`；API 与 `noteImportWorker.js` 必须共享持久私有暂存目录（`NOTE_IMPORT_STORAGE_DIR`）和笔记图片目录。导入 Worker 已接入本地启动与部署脚本，不能在未安装 Schema 时对外开放入口。帮助内容通过独立的 `20260909_note_transfer_knowledge.sql` 幂等更新；任务入口与删除说明通过 `20260909_note_import_task_help.sql` 更新，不混入应用启动。关闭导入 Worker 可停止领取新任务，已创建笔记保留；恢复后按租约续跑。

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

用户也可以单独授权提交、推送、远程只读检查或指定线上操作，此时只执行对应范围，不要求必须说“上线”才可执行，也不据此扩大为完整发布。普通分析或开发请求不自动授权上述操作；同一任务已明确授予的范围不重复确认。

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

Web 发布先把新产物完整解包到独立 staging 目录，通过基本产物检查后再原子替换 `dist`。构建会在
`.lightnote-release-assets` 记录当前版本自身的哈希资源；切换时仅把上一版本清单中的资源补入新目录，
使发布前已打开的页面仍能完成懒加载。清单不得记录继承资源，确保线上只保留当前版与上一版资源，
不会随发布次数持续累积。`apps/web/deploy.sh` 仅作为兼容入口转发到仓库统一发布脚本。

## 发布后检查

- 主 API 健康检查返回预期状态；
- PM2/systemd 中受影响进程在线且无重启循环；
- 受影响 Worker 能领取任务并产生可解释终态；
- 关键页面静态资源、SPA 直达和 API 版本一致；
- 实时、Redis、OBS、邮件或第三方依赖按本次范围验证；
- 日志无新错误、敏感信息或请求风暴。

健康检查失败不会自动证明已经回滚。依据部署脚本输出的精确快照和回滚命令处理，不对宽泛目录执行删除，不在原因不明时连续重启掩盖问题。

### 托管图片预览迁移

上线前执行图片预览加法迁移与 Schema 门禁；后台 `backfill:image-assets` 默认只读，受授权执行时使用 `--apply --checkpoint=绝对路径` 保存可恢复游标。回填包含上传登记、正文、版本、模板、云文件及书签保留引用，所有阶段完成并对账前不得打开图片清理开关。归属歧义的物理位置保持保留。生成与读取可分模块启用，关闭时卡片显示占位，不回退原图；回滚保留表、对象及待清理账本，详见 [图片预览回滚说明](../apps/server/migrations/20260908_common_image_previews_rollback.md)。

### 图片卡片策略升级与恢复

图片策略 v2 依赖 `20260909_image_preview_metadata.sql` 的加法结构迁移。旧版图片 Worker 不过滤策略版本，禁止和 v2 入队端混跑：先停止所有旧文档 Worker，应用已授权迁移并部署新 API/Worker，再开放新任务。回滚时保留产物和任务表，暂停图片生成，不让旧 Worker 消费新任务。

除常规预览门禁外，发布环境须运行 `pnpm --filter server check:image-previews:large`，实测真彩大图、JPEG 和长图的转换时间、峰值 RSS 与采样磁盘占用。该探针不访问业务数据库或用户原图。大图失败或超过预算时阻止发布，不能仅调整错误提示绕过。ImageMagick 的系统宽高策略须容纳 34,000 像素长图（可配置为 64KP）；变更前保留策略备份，不放开 URL、PDF 等编码器限制，应用仍按 128MiB 内存、256MiB 映射及 2GiB 磁盘预算执行。

历史恢复工具 `pnpm --filter server repair:image-previews` 默认只读，最多列出 500 条候选，可用 `--ids=任务ID列表` 缩小范围。实际执行要求独立授权，以及 `--apply --workers-v2-confirmed --checkpoint=绝对路径 --ids=任务ID列表`；首批默认 5 条，后续 `--batch-size` 不超过 10。仅旧像素限制任务自动具备恢复资格，其他错误需先确认根因已修复，并通过 `--verified-ids=任务ID列表` 明确记录核验范围。工具不清除历史失败事实；按当前资产版本去重创建任务，记录新任务结果，超时保留 pending 检查点供下次继续，同类服务故障连续三次后停止。每批确认产物及实际卡片显示后再推进。

## 游客示例维护

- v2 入口为 `apps/server/scripts/refreshVisitorExamplesV2.mjs`。先显式执行 `apps/server/migrations/20260909_visitor_examples.sql`，再运行维护工具；迁移不自动启用账号。发布前通过 Schema、资源治理 Worker、图片预览检查。普通本地开发不授权生产读取或数据应用。
- 默认 dry-run；`--owner <游客ID>` 选择账号，`--state-dir <受保护目录>` 保存逐项计划和引用核验。唯一匹配的普通单次待办复用，已完成／系列任务及未知文件保留并列入计划。引用失效、对象歧义或事务冲突时停止。
- 数据应用使用 `--apply`，先保存权限为 0600 的快照，再在同一事务写资源与维护登记；回执在提交前保存候选、提交后标为完成。v2 不复用 v1 回执，重复安装不重复创建。三个已托管图片使用内容摘要命名；既有云文件只改分类，ID 不变。
- `--disable` 默认预览，追加 `--apply` 才停止每日日期维护。`--restore` 默认核验本轮回执，追加 `--apply` 才恢复；复核应用后版本（含每日滚动后的版本）及新增引用，遇到之后的人工修改停止。恢复保留笔记版本递增与历史，新增笔记进入回收状态，不物理删除图片。回执与快照不入库、不提交到 Git。
