# 本地预览与上线

`pnpm preview` 用于在本机联调“构建产物 + 本地后端”，适合复杂交互验收、问题复现或用户明确要求预览的场景。它不再是每次上线的强制门禁；用户说“上线”或“部署”后，可在自动化检查通过的前提下直接进入提交、推送和部署流程。

## 验收目标

前端必须运行构建后的 `dist`，而不是 Vite 开发服务器；浏览器的 `/api` 请求必须经 Vite preview 代理到本机 `127.0.0.1:9001` 的后端。这样可以同时检查生产构建、预渲染结果和真实接口联调，而不部署任何代码到线上。

链路如下：

```text
浏览器（http://127.0.0.1:4173）
  → 前端构建产物（vite preview）
  → /api 代理
  → 本机后端（127.0.0.1:9001）
  → apps/server/.env 配置的依赖服务（可为本地或远程）
```

## 本地预览命令

无需新增任何环境变量。后端会直接沿用本机私密文件 `apps/server/.env` 中已有的数据库、Redis、对象存储等配置；这些依赖可以是远程开发/测试服务。命令启动的是本机当前代码，不会向远程服务器部署代码。

需要本地生产链路联调时执行：

```bash
pnpm preview
```

它会依次完成以下事项：

1. 检查本机 `9001`（后端）与 `4173`（前端预览）端口未被旧进程占用；若被占用会直接失败，避免误连到过期代码。
2. 启动 `apps/server/app.js` 的本机后端代码；数据库、Redis 等依赖继续使用 `apps/server/.env`。
3. 等待本机后端监听 `127.0.0.1:9001`。
4. 以生产环境构建前端和预渲染页面；预渲染阶段的 API 也会请求本机后端，而不是线上后端。
5. 以本地 API 代理启动 `vite preview`，自动打开 `http://127.0.0.1:4173`。

前端页面、前端构建、后端代码和预渲染 API 均来自本机；仅数据库、Redis 等运行时依赖是否远程，取决于你已有的 `.env` 配置。按 `Ctrl+C` 会同时停止本机后端和前端预览。

若命令提示端口被占用，说明旧的开发或预览进程仍在运行；请在原终端按 `Ctrl+C` 停掉它后重新执行。脚本不会自动杀掉未知进程，以免误停其他本地服务。

后端启动和验收中的用户操作会对 `.env` 指向的数据产生真实读写，因此运行前仍应确认当前配置就是你希望使用的环境。

进行本地验收时至少覆盖本次改动对应的用户流程，并检查桌面端、移动端、深色主题及中英文（适用时）。项目根目录的 `pnpm dev:server`、`pnpm dev:server:watch` 与 `pnpm preview` 已自动托管文档/文件预览 Worker 和资源治理 Worker；仅在绕过这些项目级命令单独启动后端时，涉及 AI 文档解析、OCR、云文件异步预览或资源治理扫描还应额外启动对应 Worker：

```bash
pnpm --filter server worker:documents
pnpm --filter server worker:resource-governance
```

涉及压缩包目录或旧版 Office 在线预览时，应先应用 `20260808_file_preview_artifacts.sql`，并确认当前环境的 7-Zip 与 LibreOffice 可用：

```bash
pnpm --filter server check:file-previews
```

该检查会同时验证预览表、关键索引和已启用的运行时；任一必需项缺失时不得启动依赖新结构的 HTTP/Worker 进程。需要分阶段发布时可显式关闭其中一种预览能力，门禁仍会检查另一种已启用能力。

涉及批量导入书签或后台图标补全时，还应额外启动：

```bash
pnpm --filter server worker:bookmark-icons
```

并在预览前执行 `pnpm --filter server check:bookmark-icons`，确认本次环境已经应用 `bookmark_icon_jobs`、`finished_at` 和增量索引迁移，且 favicon-api 与图标目录可用。

所有后端发布都必须在目标环境重启前执行只读 Schema 门禁：

```bash
pnpm --filter server check:schema
```

任何断言输出都表示基线表、关键列或索引尚未就绪；应先应用待执行 migration 并重新检查，禁止让依赖新结构的应用进程先启动。

涉及 Agent 运行时、语义能力目录、工具参数、确认协议或笔记生成链时，发布前还必须执行 root 真实链路门禁。先用 dry-run 验证注册工具与测试矩阵精确覆盖，再用获授权环境的真实 root 账号、真实 Provider、真实 Handler 和数据库执行完整矩阵：

```bash
pnpm --filter server smoke:ai-root-e2e
pnpm --filter server smoke:ai-root-e2e -- --live --suite full --execute-writes --provider deepseek
```

同一发布基线已经完成完整门禁、后续只修复单一工具链且发布负责人明确要求节省真实模型消耗时，可定点重跑受影响用例，并把长草稿改写轮数临时收窄到 1；该参数只控制本次定点复测，不改变完整门禁默认的 5 轮：

```bash
pnpm --filter server smoke:ai-root-e2e -- --live --execute-writes --provider deepseek --case create-note --artifact-refinement-rounds 1
```

完整门禁必须同时满足：所有注册工具逐项通过；所有写工具返回正确确认卡并在确认后产生可核验结果；同一确认重放不重复写入；笔记材料范围、硬字数下限和续写保持通过；测试夹具清理成功。任一项失败都禁止发布或开启 V2，不能用孤立用例的偶然成功代替完整矩阵。真实报告必须脱敏，不保存问题、回答、工具参数、资源 ID 或账号标识。

涉及积分获取 C5 时，发布前还必须完成以下顺序：

1. 保持 `POINTS_EARNING_C5_ENABLED`、`POINTS_ADMIN_GOVERNANCE_V2_ENABLED` 和 `POINTS_CAMPAIGN_ENABLED` 关闭，在维护窗口执行 `20260814_points_earning_c5.sql` 与 `20260814_points_earning_c5_knowledge.sql`。
2. 运行 `pnpm --filter server check:schema`，确认 C5 表、索引和 `achievement-snapshots / meaningful-activity / baseline` 三个迁移标记均已就绪；任何输出都禁止启用 C5。
3. 先开 `POINTS_POINTS_CENTER_ENABLED` 验证用户只读摘要，再开 Root 治理只读能力；检查 28 天用户查询、7/28/90 天后台查询没有全表/逐用户请求。
4. 为 `POINTS_EARNING_C5_EFFECTIVE_DAY` 配置下一个完整账号自然日，为 `POINTS_EARNING_C5_EFFECTIVE_WEEK` 配置下一个完整 ISO 周，再开启获取写闸。不得在自然日或自然周中途切换。
5. Campaign 最后开启，并在生产环境显式设置正数的 `POINTS_CAMPAIGN_MAX_RECIPIENTS`、`POINTS_CAMPAIGN_MAX_POINTS_PER_USER`、`POINTS_CAMPAIGN_MAX_TOTAL_POINTS`；缺失、负数或零值必须保持失败关闭。
6. 验收两个独立知识事件、稳定周上限 670、旧成就快照、低压力模式、余额对账只报告、Campaign 预览不发积分/冻结后可恢复；同时检查移动端、深色主题与中英文。

C5 回滚只关闭获取写闸或 Campaign，不删除新表、不撤销已发资产、不清空周期版本锁。已经进入 C5 的日/周保持该规则；事故期间暂停发放，禁止临时切回旧规则形成双领。

涉及 C6 每日任务切换时，在 C5 已通过上述门禁并稳定启用的前提下继续执行：

1. 配置 `POINTS_EARNING_C6_EFFECTIVE_DAY` 为下一个完整账号自然日，确认不早于 C5 生效日，再开启 `POINTS_EARNING_C6_ENABLED`；禁止在自然日中途切换。
2. 验证同账号同日跨端任务一致、连续 6 天组合不重复、相邻两天不会出现完全相同的组合，且每天始终从收藏书签、新建笔记、上传文件、创建待办中取两个不同任务。
3. 只完成任一随机任务对应的一个事实时，进度只能从 1/3 到 2/3；领取 ref 必须从 C5 的 `daily:c5` 切换为 C6 的 `daily:c6`，奖励、周挑战和成就保持不变。

C6 的 `EFFECTIVE_DAY` 是一次性版本边界，不是每天滚动的日期：到达该日后，后续账号自然日持续使用 C6，无需定期修改。本地 `apps/server/.env` 与服务器 `.env` 是两份独立私密配置，`deploy:server` 明确排除 `.env`，因此任一环境启用 C6 时都必须分别配置并核对上述两个变量，代码部署不会替另一环境补值。若数据库已为当日固化 C6，而当前进程仍缺少或关闭 C6 开关，获取写入会按安全策略返回 `earning_paused` 并整体回滚；本地预览和生产重启前都应核对“当日锁定版本”和“当前进程写闸”一致。

C6 回滚只关闭 `POINTS_EARNING_C6_ENABLED`，不删除周期锁，也不把已经进入 C6 的自然日回退到 C5。C5 总闸关闭时 C6 同步暂停发放。

如果本地不使用线上默认图标目录，应让预检、Worker 和预览后端继承同一个 `BOOKMARK_ICON_UPLOAD_DIR`。例如分别在两个终端运行：

```bash
FAVICON_API_BASE_URL=http://127.0.0.1:3456/ \
BOOKMARK_ICON_UPLOAD_DIR=/tmp/light-note-bookmark-icons \
pnpm --filter server worker:bookmark-icons
```

```bash
FAVICON_API_BASE_URL=http://127.0.0.1:3456/ \
BOOKMARK_ICON_UPLOAD_DIR=/tmp/light-note-bookmark-icons \
pnpm preview
```

本地预览会把浏览器的 `/uploads` 请求代理到本机后端；本机后端优先从该自定义目录读取图标，再回退到既有上传目录。

## 上线指令与发布流程

用户在当前任务中说“上线”或“部署”，即一次性授权完成与本次项目改动直接相关的自动化检查、提交、推送、必要的分支合并、生产部署和部署后健康检查。无论本轮是否执行过 `pnpm preview`，都不再额外等待“预览通过”或“可以上线”的二次确认。

发布前仍须按改动风险执行构建、类型检查、语法检查或测试，并完成适用的 Schema 与 Worker 门禁。如果检查失败，或 Schema 门禁表明必须执行尚未获授权的线上迁移、批量修复或其他独立高风险操作，应停止发布并报告原因；“上线”不自动授权这些线上数据操作。

分支处理规则：

1. 当前分支是 `main`：审阅并提交本次安全范围内的未提交项目文件，推送 `main`，然后从 `main` 部署。
2. 当前分支不是 `main`：先在当前分支提交并推送；再更新本地 `main`，以普通、非强制方式将当前分支合并到 `main`，推送 `main`，最后从 `main` 部署。
3. 遇到合并冲突、受保护分支限制、来源不明的改动，或无法安全切换/更新 `main` 时，停止并向用户说明，不强推、不覆盖、不用破坏性命令规避问题。

线上部署仍应按生产环境重新构建与发布；本地预览只用于发现问题，不能把本机 preview 进程当作线上服务。
