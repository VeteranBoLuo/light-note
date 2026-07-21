# 轻笺开发文档

## 环境要求

- Node.js 20.x
- pnpm（推荐 v8+）
- MySQL 5.7+

## 快速开始

```bash
# 安装依赖
pnpm install

# 后端开发
cd apps/server
# 确保 .env 已配置数据库连接
node app.js

# 前端开发
cd apps/web
npx vite dev
```

## 项目脚本

```bash
# 前端构建
cd apps/web && npx vite build

# 前端类型检查
cd apps/web && npx vue-tsc --noEmit

# 后端启动
cd apps/server && node app.js
```

### 本地路由与 API 代理

- Vite 的 API 代理必须使用锚定规则 `^/api(?:/|$)`，不能用普通的 `/api` 前缀匹配。
- 移动端后台存在 `/apiLog` 页面路由；普通 `/api` 前缀会误将该页面代理到线上，导致刷新后 HTML 与本地静态资源版本不一致并出现哈希文件 404。

### 请求限流与安全中心

- 全站兜底限流必须按真实操作者分桶：已登录用户使用账号 ID，游客使用规范化 IP；管理员预览时使用管理员 actor，不能使用被预览账号。
- 默认每分钟上限为游客 300、登录用户 600、root 1200，可分别通过 `GLOBAL_RATE_LIMIT_VISITOR_PER_MINUTE`、`GLOBAL_RATE_LIMIT_AUTHENTICATED_PER_MINUTE`、`GLOBAL_RATE_LIMIT_ROOT_PER_MINUTE` 调整。
- 登录、注册等高风险接口继续使用路由级独立限流；不得为了普通页面刷新问题放宽这些安全边界。
- 前端对同一轮并发请求产生的 429 提示必须去重，避免一处限流引发多条重复消息覆盖页面。
- API 日志必须保留请求是否命中业务路由的分类结果；后台总览将有效路由 4xx、未知路径 4xx 和服务端 5xx 分开统计，不得把外部探测 404 统称为业务故障。
- 安全事件的“误报”和“授权测试”只排除 IP/账号风险影响，不删除日志或绕过检测；改回“未处理/已处理”时必须可重建并重新计入风险。

### 日志白名单

- 首个 API 请求必须同时携带浏览器指纹和稳定 `X-Log-Device-Id`，不得把指纹初始化延后到页面 `onMounted` 后才执行。
- 用户只执行一次“加入白名单”；已有指纹白名单命中后，后端自动关联请求携带的稳定设备标识，不设计额外“升级”步骤。
- 一个指纹白名单允许关联多个稳定设备标识，以兼容不同 origin、浏览器配置及本地存储隔离；禁止用单值覆盖造成设备间反复失效。
- 公网出口 IP 不作为日志白名单键，避免动态 IP 或共享网络误过滤其他用户；仅回环地址可直接按 IP 排除。

## 代码规范

### 通用原则

1. **同时考虑 PC 和移动端** — 没有"只有桌面端用"的模块
2. **兼容深浅主题** — 颜色使用主题变量，不硬编码
3. **兼容中英文** — 展示文案走 vue-i18n
4. **优先复用** — store、组件、配置、主题变量，不重复造轮子

### 命名规范

| 类型         | 规范           | 示例                       |
| ------------ | -------------- | -------------------------- |
| 后端 handler | `xxHandle.js`  | `bookmarkHandle.js`        |
| 后端路由     | `router/xx.js` | `router/common.js`         |
| Vue 组件     | PascalCase     | `CloudFolder.vue`          |
| Pinia store  | camelCase      | `bookmark.ts`              |
| 目录         | kebab-case     | `basic-components/`        |
| API 路由路径 | kebab-case     | `/api/common/getDashboard` |

### 后端规范

**响应格式：**

```javascript
// ✅ 统一使用 resultData
res.send(resultData({ id, name }, 200));
res.send(resultData(null, 401, "请先登录"));

// ❌ 不要手动构造
res.json({ code: 0, data: xxx });
```

**状态码约定：**

| 状态码 | 含义           |
| ------ | -------------- |
| 200    | 成功           |
| 400    | 客户端输入错误 |
| 401    | 未登录         |
| 403    | 无权限         |
| 404    | 不存在         |
| 423    | 账号封禁       |
| 500    | 服务端错误     |

**INSERT 规范：**

- 有 UUID 主键的表 → 使用 `insertData()`（自动注入时间戳 UUID v1）
- 自增主键表（files、folder） → 使用 `snakeCaseKeys()`
- 关系表（`resource_tag_relations` 等） → 使用 `snakeCaseKeys()`
- 获取新 ID → 取 `insertData()` 返回值的 `.id`，不用 `SELECT ... LIMIT 1`

**事务：**

```javascript
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  await connection.query("..."); // 必须用 connection.query()
  await connection.commit();
} catch (e) {
  await connection.rollback();
} finally {
  connection.release();
}
```

**SQL 安全：**

- 所有用户输入使用参数化占位符 `?`
- 动态 `IN (...)` 用 `map(() => '?').join(',')`
- 动态表名/列名/排序需白名单校验

**权限检查：**

- 内联在 handler 中，用 `req.user?.role` 判断
- Root 操作用 `ensureRootRole(req, res)`
- 不要用 `requireRole()` 中间件

### AI 助手开发硬约束

**Owner 四维隔离：**

- AI 持久会话、Change Set、记忆和 SSE 恢复等顶层工作区对象统一使用 `(actorUserId, subjectUserId, adminContextMode, adminContextId)` 作为 owner 域；消息、来源、证据和 Change Item 等子表必须经已校验的父对象访问。账号派生索引、日志与配额账本沿用各自明确的主体模型，不能假装存在四维列。
- actor/subject/context 必须从认证后的 `req.billingUser`、`req.resourceUser`、`req.adminContext` 解析，禁止接受请求 body 中的用户 ID 或上下文 ID。
- 普通上下文必须满足 actor 等于 subject 且 `adminContextId = null`；管理员上下文必须有 Root actor、有效 context ID 和明确模式。数据库查询必须同时带四个谓词，并用 `admin_context_id <=> ?` 区分普通 NULL 域，不能用 `COALESCE`、仅 mode 或前三维代替。
- owner 条件必须进入读、写、幂等查询、删除、回执、恢复和最终结果回查。客户端提供的消息/任务 ID 只可作为候选标识，不能通过 `ON DUPLICATE KEY UPDATE` 修改 owner 未确认的行。
- 前端本地会话键和活动请求租约也必须包含 actor、subject、mode 和管理员 context ID。切换任一维度时先中止旧请求，再原子切换草稿、材料、附件、消息、session 和 conversation；旧请求晚到结果不得进入新域。
- 本地持久格式升级时只迁移能证明 owner 等价的状态。旧三维键可以迁移到普通 self 四维域，但不得猜测管理员 context ID 或把旧管理员草稿带入新授权上下文；迁移成功后删除旧键，失败时宁可丢弃管理员临时状态也不能串域。
- 会话谱系读取必须同时约束 owner 四维、live retention 和 root；parent/root/message 关系不能靠标题或正文推断。fresh schema 可要求 root NOT NULL，既有库 additive 升级须允许旧后端滚动写 NULL 独立根，并让新版查询用 `root_conversation_id = ? OR id = ?` 兼容。分支克隆必须单事务、重建 parent message 映射并继承 retention/expire；超过 200 条时明确 409，禁止静默截断或部分写。
- 答案版本只在同 owner、同 conversation、completed assistant 的 `versionGroupId` 内读取；旧答案必须保留。切换器只定位已加载版本，不得隐藏/删除其他版本或把另一个 conversation 的消息拼入组；谱系/版本列表均需有界并披露 truncated/unavailable。

**Readonly 与写策略：**

- 每个管理员上下文路由必须在 `adminRoutePolicy.js` 声明明确语义；未声明继续默认拒绝。
- 列表、详情、导出、状态查询归入 `READ`；会话/变更集持久状态归入 `AI_STATE_WRITE`；记忆归入 `ACCOUNT_WRITE`；真实资源修改归入 `CONTENT_WRITE`。
- `readonly` 只允许 `READ` 和不会产生持久副作用的 AI 使用。写路由除中间件阻断外，Service 入口仍必须独立断言，防止内部调用绕过 HTTP policy。
- 管理员上下文中的 Agent 不读取、不生成目标账号长期记忆。

**上下文入口：**

- 笔记、书签、云文件、标签、搜索结果等内容表面统一调用 `openAiAssistant()` / `AiEntry`，只传受控 `contextRefs`、意图、查询和 surface，不在页面散落自然语言 Prompt、权限判断或持久化逻辑。单项可建议 summarize、多项可建议 compare、标签可建议 find-related，但建议意图不能绕过 Agent Tool Policy。
- 入口只携带后端可重新校验的资源 type/ID；title/name 仅用于本地展示，不能成为资源身份。批量入口有界取前 5 个并向用户明确提示，禁止静默把超限选择扩成全库范围。新增系统分享等入口时要补 owner、0/1/5/>5、移动端和中英文回归。

**SSE 生命周期与终态：**

- Agent 流式响应统一通过 `createAgentSseLifecycle()` 发送，不在旁路自行拼 `data:`、递增 ID 或提前 `res.end()`。
- 每个事件都带协议版本、request ID 和严格单调的 event ID；请求开始后立即发可见阶段，并按约定发送 heartbeat。不得把原始思维链放入阶段或活动事件。
- 每个已开始的流必须且只能形成一次可靠终态：`response.completed + done` 或 `response.failed + error`。HTTP 正常关闭但缺少协议终态在客户端按失败处理，不能把半截答案标成完成。
- 完成事件中的 `answer`、证据、覆盖和 citation audit 是权威快照。流式正文经过最终引用审计或其他清洗后，客户端必须用权威正文替换临时 delta 聚合；断线恢复同样整体替换，不与旧增量合并。
- 只持久化 completed/failed 终态恢复快照；恢复读取必须按 owner 四维校验并限制 TTL、事件数和 lastEventId。用户主动停止不伪装成可自动恢复的网络错误。
- `memory_context` 是面向用户的隐私边界事件，只允许 `status/count/types/scopes/reason` 的有界协议，禁止携带记忆 ID、HMAC、正文、来源、时间或错误详情。`used` 元数据必须和实际注入 Prompt 的已确认记忆来自同一次权威查询；SSE 发送、终态 activity、会话读写、客户端 Store 和恢复链都要重复归一化，不能信任任一中间层保存的任意对象。
- 临时会话必须从请求开始就显式关闭记忆读写并展示稳定的未使用原因；访客、翻译和管理员代管上下文也不得注入目标账号记忆。旧消息没有 `memory_context` 时保持无说明，禁止根据当前账本反推历史使用情况。UI 只解释“上下文是否注入”，不得宣称某段答案由某条记忆因果产生。
- 记忆账本的“需一起复核”只能在当前 owner 内按相同 scope type、规范化 scope、memory type 和不同正文做确定性分组，并限制状态、总读取量与每条展示数；不得把这种重叠分组命名为确定冲突，也不得据此自动覆盖、暂停或删除。真正的语义判冲/取舍必须保留给用户或另行经过可评测的方案评审。

**草稿、确认、回执与撤销：**

- 模型只能生成建议或 Change Set 草稿，不能直接修改笔记、书签、文件、标签、待办或知识库。服务端必须将模型返回的资源 ID、标签 ID、文件夹 ID 和操作类型与 owner 已验证白名单重新求交。
- 预览必须包含目标稳定 ID、前后状态、权威版本/内容哈希、选择项、风险和可撤销性。用户确认后冻结选择与参数；执行阶段不得再次让模型自由改参。
- 真实写入必须复用 `util/services/` 及既有确认/幂等能力，并保存逐项回执。预览后对象变化时返回冲突并要求重新生成，不允许静默覆盖。
- Change Set 批量 apply/retry 必须保持单事务全有或全无；任一项失败时已经执行的项也要回滚，UI 的 committed 计数保持 0/N，只有 commit 后才变为 N/N。可以显示 validating/applying/revalidating 等阶段，但禁止把 `processedCount` 当作已提交条数。
- 失败快照只保存稳定错误码、阶段、失败项 ID、已尝试数、冻结选择、时间和 preview revision，不保存 raw error/message、before/after 正文或工具参数。失败后必须先按四维 owner + maintain 重新读取权威状态并刷新 before/hash、提升 revision，再让用户二次确认；retry 只接受服务端冻结范围和 expected revision，客户端不得重传/扩大 item IDs。编辑预览必须使旧 retry 失效。
- Change Set 的 apply/undo 属于 AI 安全写闭环，资源写、`ai_content_generations` 推进和 `ai_content_chunks` 清理必须共享事务并失败关闭；提交后只驱逐本机缓存。嵌套的 todo 等域 Service 应允许上层统一失效，避免同一批次重复推进代际。
- 撤销是带版本检查的补偿动作，不承诺无条件回滚。创建新笔记等不能安全自动撤销的动作必须明确说明恢复路径，不能显示虚假的“可撤销”。
**日志、埋点与隐私：**

- `agent_logs`、产品事件和普通错误日志默认不记录用户问题、回答、标题、推荐文本、来源摘录、Prompt 或工具原始参数。只记录 intent/任务类型、长度桶、枚举、数量、耗时、成本、稳定错误码和必要关联 ID。
- AI 产品事件只能接受服务端白名单维度。关联 ID 入库前用独立 `AI_TELEMETRY_HMAC_SECRET` 做 HMAC；错误码折叠为稳定错误类别。禁止把 HMAC 当作权限依据。
- Token、Cookie、Authorization、邮箱、连接串、URL 凭据和 Provider 原始错误先经过 scrubber；日志中不得直接输出数据库/网络异常的 message 或 stack。
- 对象存储内部 key、临时路径和底层 SDK error 也属于内部敏感实现，不得直接进入客户端错误响应或普通日志。file/note/worker/cleanup 等异步边界统一映射稳定错误码；新增 handler 要同时检查成功响应、catch 和 scheduler `.catch()`，不能只修主 Agent。
- 生产环境必须配置独立且稳定的 `AI_TELEMETRY_HMAC_SECRET` 与 `AI_QUOTA_HASH_SECRET`。轮换会切断历史关联或重新分桶，只能按运行手册安排，不能在普通重启时随机变化。

**数据导出、清除与保留：**

- 必须区分调用身份和数据政策：账号 Settings 的全量 JSON 导出按 `subject_user_id` 汇总可移植 AI 数据；普通 self/normal 的“清除全部 AI 数据”也按 subject 清除全部可控 AI 对象，包括管理员授权上下文曾为该主体产生的对象；管理员 `maintain` 清除只限当前 `(actor, subject, mode, contextId)` owner 四维域，`readonly` 禁止调用。接口、确认框、回执和帮助文档必须展示服务端返回的 `scope=subject_user|owner_domain`，不能由前端自行猜测。
- 两种清除范围都必须在单个数据库事务内覆盖会话、记忆、Change Set、产品事件和 SSE 恢复事件；普通 self 还要在该事务内推进 `ai_content_generations` 并删除 `ai_content_chunks`，commit 后只做本进程缓存驱逐，任何代际推进/清理失败都必须回滚全部分域。owner-domain 清除不得推进 subject 级代际。任何必需表或字段缺失时必须以稳定 503 错误失败关闭并回滚，禁止把未检查分域计为删除 0 条。新增 AI 持久表时，必须同步决定它属于 subject 清除、owner 清除、独立安全账本还是不可移植派生数据，并补两种 scope 的回归，不能默认为遗漏。
- `agent_logs`、配额用量和请求级配额占位属于独立安全/运营账本，不随上述清除删除。产品必须在确认前披露保留项和独立保留策略；不得用“永久清除全部记录”掩盖这些例外。subject 级导出包含其中可导出的审计/用量数据，也不意味着 subject 清除会删除它们。
- 单条会话删除与“清除全部 AI 数据”语义不同：前者先进入服务端软删除状态并提供短时恢复，后者是用户再次确认后的事务永久清除，不提供伪撤销。撤销期限必须由服务端校验；前端计时器只负责提示。窗口到期后的关联数据清理由事务执行，并有启动/周期调度兜底，不能只依赖单进程 `setTimeout`。
- 账号导出要返回 schema 版本、生成时间、各分域计数、迁移未就绪的不可用分域和排除清单。可重建内容/文档索引、短期 SSE 恢复事件与请求级配额占位不具可移植性，可以排除，但必须用稳定原因码明示。
- `aiCloudHistory` 是账号云同步偏好，也是自动云会话持久化的双门禁：前端关闭后不得 hydrate/create/save，并清当前 cloud conversation ID；服务端 create/save handler 仍须按 subject 权威读取 preferences，明确关闭或主体不可验证时返回稳定 409。缺少偏好字段为兼容既有账号可默认开启，但不能把请求 body 的开关当作权威值。
- 云历史开关只控制自动持久化，不删除既有云记录、不清本地 v3 Store，也不得误伤用户显式触发的 Change Set 成果、分支创建和历史管理。若未来要扩大为服务端全域写策略，必须另行评审语义与迁移，不能在共享 Service 入口直接一刀切。
- 资源写入或删除触发个人检索失效时，要清本地缓存，并在数据库事务内递增 `ai_content_generations` 的 per-subject 代际、物理删除 `ai_content_chunks`。构建前后、缓存命中和持久化事务都要核对该代际；持久化必须锁定代际行并做 CAS，禁止旧实例快照回写。新增资源写入口必须接入同一失效 Service 并补并发回归。
- 上述是新增入口和 AI 安全写闭环的目标不变量，不代表历史入口已经全部迁移。当前仍有 legacy 资源路径在业务 commit 后执行旁路失效；完成逐入口审计前必须在发布文档保留“新内容可能短时漏召回/重建延迟”的边界。返回命中仍须做权威复核，确保已删除、转移归属或旧版本缓存失败关闭，不能用这道返回前防线反过来掩盖写侧时序债务。
- 个人检索结果返回前必须按 subject owner、`del_flag` 和资源版本向权威业务表复核；复核查询失败时返回空证据并记录稳定错误码，禁止失败开放。派生镜像不是事实源，不允许它在原资源删除、转移归属或更新版本后继续作为答案依据。
- 会话、记忆、产品事件、恢复事件和 Change Set 必须逐域定义自动 TTL、用户删除、账号导出、审计保留和级联边界。自动清理采用小批次、幂等、可观测任务；达到单轮批次上限时要返回可观测的 backlog 状态并以无正文稳定告警提示，不能静默积压。安全账本和未结算配额占位不得盲删。
- Change Set 产物 TTL 默认关闭；只有 `AI_CHANGE_SET_RETENTION_DAYS` 为 1～3650 的显式正整数时才启用。清理必须事务锁候选并在 DELETE 前重验：Change Set 仅 applied/undone/expired 且排除 indefinite 会话。任何状态集合或期限变化都需要产品/隐私评审与迁移/回归，不能仅改环境变量扩大删除范围。

**测试与发布门槛：**

- AI 单测在 `NODE_ENV=test` 下不得加载真实 `.env`，不得建立真实 DB/Redis/Provider 或外网连接；通过注入 adapter、mock pool 和受控夹具覆盖失败路径。
- 至少覆盖 owner A → B → A、readonly 写阻断、schema 外参数、并发额度、重复请求、SSE 缺终态/断线恢复、记忆影响元数据去敏与临时会话禁用、假引用、长文档后半部、Change Set 冲突/撤销和临时数据过期。
- 离线黄金集只能使用不可回推真实用户的合成材料。静态 Runner 通过不等于自然语言质量通过；真实发布还需要人工引用蕴含抽检和预发布任务验收。
- AI 黄金矩阵变更必须同时通过生成器 `--check` 和 `eval:ai-assistant`；两步已是 CI 阻断项，禁止改为 `continue-on-error` 或只在本地手工运行。静态 CI 不调用网络、模型或数据库，真实 Agent adapter/回放应作为独立层接入，不能污染确定性门槛。
- AI 数据库迁移、环境变量、schema assertions、灰度和回滚步骤见 `docs/plan/ai-assistant-rollout-runbook.md`。
- 用新唯一索引替换旧唯一索引时，先按新索引的归一化表达式做重复键 preflight，再 `ADD UNIQUE`，确认成功后才 `DROP` 旧索引；顺序不可反转。迁移后 assertion 要同时证明新索引列序/唯一性正确且旧索引已移除，不能只检查脚本退出码。

### 前端规范

**组件选择（铁律：有 B 组件必用 B 组件，禁原生控件，不新增 Ant Design）：**

| 场景     | 使用            | 不要使用                    |
| -------- | --------------- | --------------------------- |
| 表格     | `BTable`        | `a-table`                   |
| 按钮     | `b-button`      | 原生 `<button>`、`a-button` |
| 下拉选择 | `BSelect`       | 原生 `<select>`、`a-select` |
| 输入框   | `BInput`        | 原生 `<input>`、`a-input`   |
| 确认弹窗 | `Alert.alert()` | `Modal.confirm`             |
| 业务弹窗 | `BModal`        | ant-design-vue 的 Modal     |
| 气泡卡片 | `BPopover`      | `a-popover`                 |
| 文字提示 | `BTooltip`      | `a-tooltip`                 |

- 存量 Ant Design（`a-*`）逐步替换为自研 B 组件，不新增；确无对应 B 组件才用原生，并注明原因。

**图标开发规范：**

1. 新增图标前先搜索 `src/config/icon.ts`，语义相同的图标直接复用或更新原有配置，禁止在不同页面复制 SVG。
2. 新增或修改静态 UI 图标时统一写入 `src/config/icon.ts`，页面和组件使用 `SvgIcon` 渲染。
3. 禁止为静态 UI 图标在 `.vue` 模板内直接新增 `<svg>` / `<path>`；禁止创建仅用于保存 SVG 路径的 `XxxIcon.vue`。
4. 只有存在独立且可复用的交互或布局职责时才创建组件，例如统一点击区域、Tooltip、键盘可访问性、紧凑/带文字两种模式。即使创建组件，图标本身仍从 `icon.ts` 读取。
5. 共享单色图标使用 `currentColor`，颜色由 CSS 主题变量或语义组件控制，避免把普通操作色硬编码进 SVG。
6. 多色品牌图标、网站 favicon、用户上传图标和后端返回的动态图标可以保留其自身颜色或 URL，不要求写入 `icon.ts`。
7. 数据可视化、关系图、复杂插画和运行时数据生成的 SVG 不属于静态 UI 图标，按其组件职责实现。

推荐写法：

```vue
<script setup lang="ts">
import SvgIcon from "@/components/base/SvgIcon/src/SvgIcon.vue";
import icon from "@/config/icon.ts";
</script>

<template>
  <SvgIcon :src="icon.table_edit" size="16" />
</template>
```

禁止写法：

```vue
<!-- 不在业务组件内保存静态图标路径 -->
<svg viewBox="0 0 24 24"><path d="..." /></svg>

<!-- 不为一段静态 SVG 单独创建组件 -->
<EditIcon />
```

**国际化：**

- 所有固定展示文案用 `$t()` 或 vue-i18n 的 `t()`
- 新增 key 需同步更新 `zh-CN.ts` 和 `en-US.ts`
- `apps/web/src/i18n/locales/localeParity.test.ts` 会递归校验中英文所有 leaf key 对称；新增/删除/移动 key 必须让该测试通过，不能用空字符串或复制错误命名空间规避。该测试是永久回归门槛，不只覆盖 AI 页面。

**主题：**

- 基于 `data-theme` 属性切换
- 主题变量定义在 `src/assets/css/theme.less`
- 使用 CSS 变量（`var(--text-color)`）而非写死颜色

**z-index 层级（禁止再写几万/几十万的值）：**

全站 z-index 按下面的固定分层，**最大不超过 1300**。新增浮层时选对应层级的值，不要拍脑袋写大数字：

| 层级         | 值    | 用途                                   |
| ------------ | ----- | -------------------------------------- |
| 局部堆叠     | 0–30  | 组件内部相对定位                       |
| 页面悬浮     | 100   | 目录/粘性头/悬浮球                      |
| 导航层       | 200   | 导航栏/管理横幅                        |
| 浮层         | 300   | 下拉/操作条/分页/筛选                   |
| 引导层       | 400   | 游客引导/周报/缩放提示                  |
| 右键菜单     | 500   | RightMenu                              |
| 抽屉         | 600   | BDrawer                                |
| 弹框         | 700   | BModal/登录弹框                        |
| 弹框内浮层   | 800   | 弹框里的下拉/气泡(BPopover/BDropdown)   |
| 覆盖层       | 900   | AI 窗口/文件预览/BSelect 下拉           |
| 全局搜索     | 1000  | 顶部搜索下拉                            |
| 提示气泡     | 1100  | BTooltip                               |
| 消息/庆祝    | 1200  | BMessage/升级动画                      |
| 全局确认     | 1300  | BAlert                                 |

- 相邻层之间留了 100 的间隔，同层内的微小先后用 +1/+2（如操作条 300、其内更高的一层 301）。
- **Tooltip 已固定在 1100（高于所有容器）**，组件内的 tooltip 不要再单独传更高的 z-index 去盖容器——这正是之前 `200001`/`99999999` 军备竞赛的根源。
- 需要新层级时在本表内插入，**禁止**突破 1300 或写 `9999` / `99999` / `200000` 这类值。

**埋点规范：**

| 场景                           | 方式                      |
| ------------------------------ | ------------------------- |
| 简单点击（跳转、弹窗、筛选等） | `v-click-log`             |
| 操作成功（新增、删除、保存等） | `recordOperation()`       |
| 后台管理页面                   | 只记录 API 日志，不加埋点 |

- 功能入口、跳转、弹窗和筛选使用 `v-click-log`；指令基于标准 `click` 事件，同时覆盖鼠标、触摸与键盘激活。
- 新增、保存、删除、导入、导出、领取奖励、AI 生成、批量整理等有明确结果的操作，只在接口或本地导出确认成功后调用 `recordOperation()`，失败和取消不得写成成功日志。
- 批量操作按一次用户意图记录一条汇总日志，写明成功数/失败数；禁止按每条数据重复写日志。
- 后台轮询、自动刷新、列表加载、弹窗关闭、分页等无独立审计价值的行为不写操作日志；自动触发但会消耗 AI 额度的功能应记录并标明“自动”。
- 会导致当前会话立即失效的成功操作（如修改密码）无法依赖前端补记，应在后端成功路径使用服务端操作日志工具记录。
- 新功能交付前需从“入口点击 → 成功业务结果 → PC/移动端共享路径”三层检查日志覆盖；重复入口优先在共享 composable/组件或后端业务成功点记录。

待整理相关的手动入队必须复用 `composables/useInboxEnqueue.ts`，避免各资源模块分别实现游客拦截、幂等提示、角标刷新和操作日志。

**响应式断点：**

- 来源于 `src/store/bookmark.ts`
- 使用 `bookmark.isMobile` / `isTablet` / `isDesktop` / `isMobileDevice`
- 不新增 UA 判断或重复断点

**状态管理：**

- 书签 + 断点 → `src/store/bookmark.ts`
- 用户 → `src/store/useUser.ts`
- 笔记 → `src/store/note.ts`
- 云空间 → `src/store/cloudSpace.ts`

**界面缩放（CSS zoom · 重要坑）：**

- 设置页「界面缩放」（小/标准/大）是给 `<html>` 设 CSS `zoom`（0.9 / 1 / 1.1）实现的（全 px 项目里唯一直观有效的可控缩放），**不是浏览器原生缩放**。实现在 `utils/savePreference.ts` 的 `applyDisplaySettings`。
- **坑**：CSS `zoom` 下，`getBoundingClientRect()` / `MouseEvent.clientX/Y` 返回「视觉坐标」（已含 zoom），而 `scrollTop` / `offsetTop` / `scrollTo()` 用「布局坐标」（不含 zoom）。二者混用，在缩放 ≠ 1 时会**定位偏移** —— 典型症状：teleport 浮层错位、滚动定位不准（点锚点要点好几次才到）、拖拽/坐标计算偏移，且**距视口左上角越远越明显**。
- **约定（避免再踩）**：
  - 浮层（下拉 / 菜单 / 气泡 / 提示）一律用 B 系列组件（`BSelect`/`BPopover`/`BTooltip`/`BDropdown`/`BPagination`/`RightMenu`）—— 它们已用 `getRootZoom()` 适配。
  - 「滚动到某元素」用 `utils/zoom.ts` 的 `scrollIntoContainer(container, el, offset)`，不要裸写 `getBoundingClientRect + scrollTo`。
  - 任何手动「读坐标 → 定位 / 滚动 / 拖拽」，坐标先 `÷ getRootZoom()`（`utils/zoom.ts`）换算回布局坐标；`offsetWidth/Height`、`clientWidth/Height` 本就是布局像素、无需换算。
  - fixed/absolute 浮层用 `100vw` 定位在 zoom 下会偏移（放大遮挡内容）；改用「视口中心 `left: 50%` + `transform` 偏移」，视口中心与内容同 zoom 上下文等比缩放、相对位置恒定。
  - **排查"只有缩放≠标准时才出现的定位/滚动问题",先怀疑这里。**

## 自检清单

### 代码提交前

- [ ] 列出本次所有新增、修改、删除的文件
- [ ] 逐文件通读改动，检查 import、类型、边界分支、空值处理
- [ ] 新增文件确认已正确接入（路由、引用、导入、菜单配置等）
- [ ] 修改文件反查调用方/被调用方，确认不破坏兼容
- [ ] 删除文件确认无残留引用
- [ ] 前端：检查 PC 端、移动端、深色主题、中英文
- [ ] 后端：检查最外层 `try/catch`、`return` 遗漏、事务完整性
- [ ] SQL：确认全部参数化，无字符串拼接
- [ ] 构建通过（`vite build` 或类型检查）
- [ ] **涉及用户可见的新功能 / 功能变更 → 同步更新 AI 知识库（见下方「AI 助手知识库」），否则 AI 助手会答"没有该功能"**

### 后端 handler 自检

- [ ] 最外层有 `try/catch`
- [ ] 所有提前响应后都有 `return`
- [ ] 状态码和 `resultData()` 格式正确
- [ ] 多表写入使用事务
- [ ] 用户输入全部参数化
- [ ] 新增或修改书签入口必须复用共享 URL 解析器与服务端 `util/bookmarkUrl.js`；禁止自行用正则补 `https://`，AI 不得决定最终 URL
- [ ] 权限判断正确（登录态、角色、用户隔离）
- [ ] INSERT 使用正确的函数（insertData / snakeCaseKeys）
- [ ] 笔记、书签、标签、回收站恢复和知识库写入复用 `util/services/`，页面 handler 与 Agent 工具不得各写一套 SQL 和副作用

## AI 助手知识库（功能变更需同步）

AI 助手（轻笺智域）回答"怎么用 / 是什么 / 在哪设置"依赖 `knowledge_base` 表（工具 `search_knowledge_base` → `util/knowledgeService.js`）。**每次上线用户可见的新功能或较大改动，必须同步更新知识库**，否则 AI 会答"没有该功能 / 机制"（例：积分系统上线后未同步，AI 答不出"AI 额度"）。

- **检索机制**：本地 MiniSearch BM25+（不调用第三方检索 API）。完整 HTML/Markdown 正文会按标题与段落切块，中文使用相邻二字词、英文使用单词；`title`、章节标题和正文分级加权，依次执行精确、内置同义词、英文一次编辑距离的保守降级，并过滤低置信度结果。同一知识条目只返回最相关片段一次。索引有 5 分钟安全 TTL，经统一知识库写服务或管理接口增删改后会立即失效重建；异常时自动回退旧算法，也可设置 `KNOWLEDGE_SEARCH_ENGINE=legacy` 主动回滚。
- **字段**：`title` / `content`（html 或 markdown）/ `category`（帮助中心 · 内部知识 · FAQ · 系统行为）/ `status`（`public` 普通用户可搜、`internal` 仅 root）。
- **写入方式**：root 让 AI 用 `write_knowledge_base` 工具；或写 `.mjs` 脚本 `import { generateUUID }` + INSERT `knowledge_base`（title 已存在则 UPDATE，幂等），放服务器 `node` 跑。
- **配套**：若新功能涉及"可查询的实时数据"（如额度、用量），除知识库说明外，考虑给 Agent 加对应查询工具（见 `util/agent/tools/`，如 `get_ai_quota`）。

## 部署

1. **前端：** 构建后将 `dist/` 上传到服务器（替换旧 `dist`）
2. **后端：** 通过 pm2 启动 `app.js`，配置 `.env` 环境变量
3. **AI 文档 Worker：** 通过 pm2 单独启动 `documentWorker.js`（进程名 `light-note-document-worker`）；本地开发可运行 `pnpm --filter server worker:documents`
4. **本地 OCR 运行时：** 服务器需安装 Poppler、Tesseract、简体中文和英文语言包；Debian/Ubuntu 可安装 `poppler-utils tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng`，安装后执行 `pnpm --filter server check:ocr` 验证
5. 根用户用 `pm2 restart app --update-env` 刷新环境变量；`scripts/deploy-server.sh` 会同步启动或重启 AI 文档 Worker

OCR 默认完全在服务器本机执行，不使用 OCR API。可通过 `AI_OCR_MAX_PAGES`、`AI_OCR_MAX_PIXELS`、`AI_OCR_PDF_DPI`、`AI_OCR_LANGUAGES`、`AI_OCR_PDFTOPPM_BIN` 和 `AI_OCR_TESSERACT_BIN` 调整限制或二进制路径；生产环境应保持文档 Worker 单并发，避免 OCR 抢占主 HTTP 进程资源。

⚠️ **部署禁令：** 改完代码后不 build、不部署、只能建议是否提交，但是不能推送，除非用户明确说"部署"或"上线"。
