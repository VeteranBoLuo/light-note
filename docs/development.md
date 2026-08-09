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
- API 日志中的操作系统与运行环境必须分字段记录：`system.os` 只保存 `macOS`、`iOS`、`Android` 等系统名，`system.runtime` 只使用 `browser`、`pwa-standalone`、`android-app`、`unknown`。读取历史数据时兼容并归一 `iOSapp`、`iOS(app)`、`iOS（app）` 等旧拼接格式，禁止继续产生新的拼接值。
- 用户管理、API 日志、操作日志与 AI 调用监控使用稳定键游标增量加载；时间排序必须追加 `id` 作为同时间记录的确定性次序。前端虚拟列表不得以一次性全量查询代替服务端分批，筛选或排序变化必须清空旧游标并回到顶部。
- 用户管理的“最近活跃”以 `user.last_active_time` 为权威字段，由认证会话链路节流更新；列表排序由后端完成，禁止只对当前已加载批次做前端排序。
- 安全事件的“误报”和“授权测试”只排除 IP/账号风险影响，不删除日志或绕过检测；改回“未处理/已处理”时必须可重建并重新计入风险。

### 日志白名单

- 首个 API 请求必须同时携带浏览器指纹、稳定 `X-Log-Device-Id` 和同值的 `X-Device-Id`，不得把指纹初始化延后到页面 `onMounted` 后才执行。前者用于日志白名单，后者只用于同账号登录设备的会话归并；两者都不是认证、权限或设备信任凭据。
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

#### PC / 移动端页面命名与目录边界

- `Xxx.vue` 表示路由入口、共享编排组件，或 PC / 移动端真正共用的响应式组件；不得默认把无端标名称理解为 PC 专属。
- 当同一功能的 PC 与移动端在页面结构或交互上明显不同，需要拆分视图时，使用成对后缀命名：`XxxDesktop.vue`、`XxxMobile.vue`。路由入口继续由 `Xxx.vue` 承担，并负责选择视图、注入共享状态。
- 只服务于移动端且跨业务复用的壳层组件使用 `Mobile` 前缀，例如 `MobileAppShell.vue`、`MobileTopBar.vue`、`MobileBottomNav.vue`；这类组件统一放在 `apps/web/src/components/mobile/`。
- 功能专属的 PC / 移动端视图应留在对应功能目录内，避免建立一套与业务目录平行的全局页面副本。例如：

```text
view/search/
├── SearchCenter.vue
├── SearchCenterDesktop.vue
├── SearchCenterMobile.vue
└── useSearchCenter.ts
```

- API 请求、权限判断、状态管理和业务操作必须优先提取到 store、composable 或共享服务中，PC / 移动端视图只负责各自的展示和交互，禁止复制两套业务逻辑。
- 仅有间距、字号、列数和排列方式差异时，继续使用共享组件与统一响应式断点，不为轻微样式差异拆分文件。
- 现有 `P*.vue` 等含义不明确的移动端命名按“改到哪、整理到哪”的方式逐步迁移为显式 `Mobile` 命名，不进行无业务收益的全量搬迁。
- 移动浏览器、移动 PWA 与 Android APK 共用 `apps/web` 中的移动端 Web UI；不得把 Vue 页面或移动布局迁入 `apps/android`。`apps/android` 只维护 WebView 容器和文件选择、下载、系统返回等原生能力。
- 移动端 `BModal`、`BDrawer` 和全屏预览必须统一接入 `utils/mobileOverlayHistory.ts`，禁止组件自行 `history.pushState()` 或注册互不识别的 `popstate` 占位。
- 从移动端弹框、抽屉或全屏预览发起路由跳转、打开外链时，统一使用 `closeCurrentMobileOverlayThen(closeOverlay, next)`；禁止在同一事件轮中直接写 `visible = false` 后立刻 `router.push()`，否则关闭浮层触发的 `history.back()` 会与新路由竞争，出现首次无响应、二次闪回。
- **浮层交给浮层或路由同样适用这条规则**：关闭一个占 history 的浮层、同时打开另一个浮层或路由（如快速添加抽屉里点「完善详情」进入待办新建页），必须走同一个 `closeCurrentMobileOverlayThen`，等上一层占位真正出栈后再导航。释放占位的 `history.back()` 是异步的、新页面压栈是同步的，写在同一轮里 back() 最终弹掉的是新页面刚压入的那一格，表现为首次点击无响应或刚打开就闪回。`releaseMobileOverlayHistory` 里「当前占位不是自己就不 back」的保护不能替代显式交接。
- 因此两个浮层的可见性不要互相推导（`const aVisible = computed(() => x && !bVisible.value)`）：这种写法把「关 A」和「开 B」绑成一次赋值，无法插入等待占位出栈的时机，且 watch 执行顺序由组件挂载顺序决定，正好落进上面那个陷阱。用独立状态分别控制。
- `BPopover` / `BDropdown` 不占 history 占位，从它们切换到弹框不受此限制。
- 新增“弹层内跳转”交互时必须覆盖移动端回归：首次点击即可进入目标页、系统返回只关闭最上层浮层、关闭后不会闪回原页；相关公共机制需补 `mobileOverlayHistory` 单元测试。

### 后端规范

#### 更新日志与 OBS 图片

- 更新日志正文保存 Markdown 源文本，展示前必须经过 `marked + DOMPurify`，不得直接把数据库内容交给 `v-html`。
- 更新日志编辑器以 Markdown 为唯一正文输入；历史 `highlights` 在首次编辑时转换为有序 Markdown，保存时再从 Markdown 自动生成兼容摘要，不再提供独立的“重点更新”输入框。
- 更新日志图片只能由 Root 上传，支持的 MIME 类型与大小由 `util/updateLog.js` 统一校验；禁止 SVG，避免公开页面引入脚本型图片内容。
- 更新日志图片显示尺寸使用受控的 `data-ln-size` 档位（原始、小、中、大、通栏），OBS 只保存一份原图；所有档位必须保留 `max-width: 100%` 的窄屏保护。
- 数据库只保存 OBS object key，不保存会过期的签名 URL。公开页面使用 `/api/updateLog/image/:logId/:fileName` 稳定地址，后端仅允许读取已登记且已发布日志拥有的对象；Root 可预览草稿图片。
- `image_keys` 与 Markdown 引用同属 `update_logs` 一条记录。保存或删除时先提交数据库事务，再清理不再引用的 OBS 对象；上传失败和登记失败必须清理临时文件及已上传对象。
- 旧 `config_json` 更新日志只作为迁移与回滚来源，新功能不得继续写入原始 JSON 配置。

#### 笔记编辑与正文安全

- 当前 Web 客户端更新笔记标题、正文或类型时必须提交 `note.revision`；服务端必须在同一事务内锁定 owner 记录、比较 revision、保存必要快照、更新正文和同步资源引用。冲突返回稳定的 `NOTE_VERSION_CONFLICT`，不得先写正文或关系表。
- 浏览器未保存草稿以 IndexedDB `lightnote-note-drafts-v1/noteDrafts` 为权威本地存储，键必须包含 actor、subject、角色、游客工作区、管理员 context 与 noteId；写入按 250ms 合并，每身份域最多 20 条、30 天过期。localStorage 只允许作为 IndexedDB 失败时的应急副本，IndexedDB 恢复后须自动迁移并删除副本。
- HTML/Markdown 正式转换必须调用 `POST /api/note/convertMode`，提交 `baseRevision + targetType + convertedContent + analysisHash`。服务端必须先复核预览指纹，再在同一事务内强制保存转换前版本、写正文与类型、递增 revision 并同步 `note_resource_refs`；禁止依赖两次普通自动保存拼接出转换语义。
- HTML 正文的创建、更新、AI 写入、导入、模板保存、新用户示例、历史恢复均必须调用 `sanitizePersistedNoteContent()`；旧 HTML 在详情、模板和历史版本读取时也走同一白名单。日志只允许记录稳定场景、净化类别、计数和前后长度，不得记录正文、URL、用户或属性值。Markdown 必须保持源码，只做既有的 blockquote 实体规范化。
- HTML/Markdown 格式转换、AI 修改/撤销和历史恢复属于高风险低频写入，必须在业务事务内强制保存 `note_versions` 还原点并填写 `source_revision/reason`；普通自动保存才允许使用时间合并窗口。新增写入口时要同时审计主表 revision、历史快照、正文净化、图片引用与 `note_resource_refs`。
- 移动端编辑器不得用自定义长按、`contextmenu`、划词 AI 或选区工具条拦截系统复制、粘贴和全选；格式能力从固定六入口工具栏的底部操作面板进入。Markdown 编辑器扩展不得把解析后的语法树或 HTML 回写成正文，外部同步更新不得污染 CodeMirror 撤销历史。新增或调整编辑器快捷键时，必须同步更新统一快捷键弹窗、工具栏提示和回归测试；富文本与 Markdown 的重做都要兼容 `Ctrl/⌘ + Shift + Z` 与 `Ctrl + Y`。“重复上一步”必须使用独立状态与快捷键，仅记录可安全复用的格式功能及其参数（例如渐变配置），不得复用撤销/重做历史栈，也不得重复插入、删除、上传等副作用操作。
- 富文本图文并排必须使用 `section.ln-media-text` 受控结构，一张图片对应一个 `figure` 和一个 `figcaption`；禁止用连续图片加 `float` 猜测文字归属。保存前须清理 TinyMCE 临时属性以及图片的浮动、固定宽高和 `data-ln-size`，HTML/Markdown 转换、服务端净化与离线导出必须保留 `data-ln-media-position/data-ln-media-width`。
- 富文本渐变文字必须保存为 `.ln-text-gradient[data-ln-text-gradient="true"]`，只允许 `--ln-gradient-from`、`--ln-gradient-to` 两个十六进制颜色和枚举角度 `--ln-gradient-angle`；禁止为了渐变重新开放任意 `background`、`background-clip`、阴影或动画内联样式。HTML/Markdown 往返时保留这段受控 raw HTML，服务端净化、站内预览和离线导出必须使用同一协议。

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

**系统邮件：**

- 系统邮件必须通过 `util/emailDelivery.js` 的 `sendTrackedEmail()` 发送，禁止业务入口直接新增 `nodeMail.sendMail()`。
- 投递记录只保存排障元数据，不保存验证码、完整正文或 SMTP 凭据；SMTP 成功只能称为“已受理”，不能宣称“已送达”。
- SMTP 已受理后的日志回写失败不得反向让业务重试，以免重复发信；长时间停留在 `sending` 的记录按 `unknown` 展示，只允许人工核查。

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
- 引用材料仍以单条用户消息的不可变 `contextRefs` 为事实记录。AI 上下文允许资料四类与 `todo` 行动对象，但资料搜索、标签和待整理的类型边界不得随之扩大。自由追问只有出现明确承接上一轮的表达时，才可继承最新助手回答中由服务端返回的稳定实体来源；待确认轮和已结算轮都可回退到同轮父消息原始材料。继承后必须写入新用户消息快照并继续由服务端按 owner 校验，禁止把输入区状态、标题或旧正文直接当成可信上下文。待办只读取当前状态、说明、清单和必要时间字段，不进入提醒邮箱；书签网页读取只能使用服务端按引用 ID 查得的当前 URL，并与 `read_url` 参数精确求交。
- 笔记目录范围使用独立 `scopeRefs` 协议，不得伪装成新的 `GlobalSearchType`。客户端只可提交 `{ type: 'note_branch', id }`，title/数量只作展示；后代 ID、路径、正文和缓存页面树严禁进入请求。服务端必须按 subject 重新加载活动笔记树、验证根归属并展开后代；删除、跨账号或失效根失败关闭，不能退化成空 allowlist 后的全库检索。普通问答由 `search_content` 在服务端 allowlist 内取 Top 8～20，模型参数里的 `resourceIds` 不得扩大范围。
- 明确要求覆盖整个目录的任务必须走专用 Map/Reduce：正文按有界片段输入，页面内容一律视为不可信数据，批次协议失败可降级逐页重试；最终覆盖报告以服务端实际成功页面为准。同步硬上限为 30 页或 120,000 个可读字符，超限要求缩小范围；任何截断、缺页、Reduce 失败或 Provider 部分成功都不得标记 `completeAnalysis=true`。普通目录检索的 `matchedPages` 只表示本回答真实引用页数，绝不等价于完整分析。
- 已由能力注册表判定为唯一 `note.create` 的明确“材料 → 生成笔记”请求，是通用 Semantic Planner 的确定性例外：书签、笔记、待办、文件附件、混合引用和用户直接粘贴文本统一进入强制 `submit_note_draft` 草稿协议。所有资源必须先由服务端校验归属；书签优先使用快照，快照不足时才补读其当前 URL。不得把全部业务工具暴露给草稿模型，也不得因通用 Planner 漏调工具而退化为普通文本回答。材料正文和旧草稿均是不可信数据，只有当前用户指令可作为改写要求；查询、教程问题和复合写操作仍走 Semantic Planner。
- 网页正文读取默认并行使用直接 Cheerio 提取和本地 Mozilla Readability 服务，首个有效结果返回后必须中止败余请求；单次正文预算为 12000 字，无敏感查询参数的公开 URL 可缓存 10 分钟。`READABILITY_SERVICE_URL` 默认指向 `http://127.0.0.1:3466/`，可设为 `off`/`false`/`disabled` 关闭；`WEB_READER_EXTERNAL_FALLBACK_TEMPLATE` 只是显式选配的外部最后降级，模板必须含 `{encodedUrl}` 或 `{rawUrl}`，且替换目标后不得改变阅读器 origin。开启外部降级前必须完成隐私评估，因为目标 URL 会发给第三方；带 URL 凭据、fragment 或 token/auth/key/signature/credential/password/session/expires 等敏感参数的链接只允许服务端直连目标站点，不得进入二级 Readability 服务、缓存或外部降级。任一内部路径已判定为内网/非法地址时必须直接失败关闭，禁止交给外部阅读器绕过 SSRF 边界。
- 单条资源“不得参与 AI”是服务端数据政策，不是前端展示偏好。永久排除与单轮临时排除必须在搜索、显式上下文和文件附件读取前统一求并集，并重新校验 subject 归属；偏好表、归属查询或排除查询失败时必须失败关闭，不能继续把材料交给模型。

**SSE 生命周期与终态：**

- Agent 流式响应统一通过 `createAgentSseLifecycle()` 发送，不在旁路自行拼 `data:`、递增 ID 或提前 `res.end()`。
- 每个事件都带协议版本、request ID 和严格单调的 event ID；请求开始后立即发可见阶段，并按约定发送 heartbeat。不得把原始思维链放入阶段或活动事件。
- 每个已开始的流必须且只能形成一次可靠终态：`response.completed + done` 或 `response.failed + error`。HTTP 正常关闭但缺少协议终态在客户端按失败处理，不能把半截答案标成完成。
- 完成事件中的 `answer`、证据、覆盖和 citation audit 是权威快照。流式正文经过最终引用审计或其他清洗后，客户端必须用权威正文替换临时 delta 聚合；断线恢复同样整体替换，不与旧增量合并。
- 完成事件和恢复快照还必须保留服务端重新校验的 `entityRefs`；前端只接受白名单 type 和非空 ID，用于让失败轮、待确认轮与断流恢复轮继续引用原资料，不得将其当作权限凭据。
- 只持久化 completed/failed 终态恢复快照；恢复读取必须按 owner 四维校验并限制 TTL、事件数和 lastEventId。用户主动停止不伪装成可自动恢复的网络错误。
- **⚠️ 状态(2026-07-22):长期记忆已全局关闭**(前端 `memoryMode:'off'` + 后端 `AI_MEMORY_ENABLED=false` 硬开关；账本入口/影响卡片已移除)。以下记忆相关约束为原设计、当前不生效；重做前必须单独立项，并重新定义用户控制、数据清除与验收边界。
- `memory_context` 是面向用户的隐私边界事件，只允许 `status/count/types/scopes/reason` 的有界协议，禁止携带记忆 ID、HMAC、正文、来源、时间或错误详情。`used` 元数据必须和实际注入 Prompt 的已确认记忆来自同一次权威查询；SSE 发送、终态 activity、会话读写、客户端 Store 和恢复链都要重复归一化，不能信任任一中间层保存的任意对象。
- 临时会话必须从请求开始就显式关闭记忆读写并展示稳定的未使用原因；访客、翻译和管理员代管上下文也不得注入目标账号记忆。旧消息没有 `memory_context` 时保持无说明，禁止根据当前账本反推历史使用情况。UI 只解释“上下文是否注入”，不得宣称某段答案由某条记忆因果产生。
- 记忆账本的“需一起复核”只能在当前 owner 内按相同 scope type、规范化 scope、memory type 和不同正文做确定性分组，并限制状态、总读取量与每条展示数；不得把这种重叠分组命名为确定冲突，也不得据此自动覆盖、暂停或删除。真正的语义判冲/取舍必须保留给用户或另行经过可评测的方案评审。

**草稿、确认、回执与撤销：**

- 模型只能生成建议或 Change Set 草稿，不能直接修改笔记、书签、文件、标签、待办或知识库。服务端必须将模型返回的资源 ID、标签 ID、文件夹 ID 和操作类型与 owner 已验证白名单重新求交。
- 预览必须包含目标稳定 ID、前后状态、权威版本/内容哈希、选择项、风险和可撤销性。用户确认后冻结选择与参数；执行阶段不得再次让模型自由改参。
- 真实写入必须复用 `util/services/` 及既有确认/幂等能力，并保存逐项回执。预览后对象变化时返回冲突并要求重新生成，不允许静默覆盖。
- **无服务端执行回执，不得宣称成功。** 用户意图、Planner 文本、历史对话、待确认卡、取消记录和模型生成的“已完成”都不是执行结果。前端只有在确认接口返回与当前 `confirmationId + capabilityId + toolName` 严格绑定的 `status=succeeded` 回执后才显示成功；回执缺失、串卡、执行中或提交结果未知时一律保持待核验，并只允许用同一令牌安全重试。
- “重试 / 重新执行 / 继续刚才操作”必须先由服务端动作控制层解析，禁止直接交给 Final Reply。取消或过期动作只能用会话内保存的公开参数重新执行权限、归属、歧义和版本预检，并生成全新的确认令牌；旧令牌不可复活。上一动作仍待确认、结果未知、已经成功或同轮存在多个候选时返回确定性状态，不得猜测目标或重复写入。
- 待确认的 `create_note` 草稿存在且输入区没有新增材料时，客户端只附带旧 `confirmationId + token` 作为候选，不根据“写长一点/换种语言/重新组织”等固定句式判断用户意图。服务端先校验候选的 owner、session、状态与工具类型，再用封闭枚举的强制工具协议结合最新消息、原始要求、草稿标题、受限草稿摘录和近期对话做语义分类；只有判定为承接当前草稿的修改请求才进入改写链，语义上独立的新问题继续走通用 Agent。分类协议异常必须失败关闭，不得回退为关键词正则主路由。旧草稿以及“原始提问 + 已校验资源稳定引用 + 附件来源 ID”必须从服务端确认存储读取；资源正文不做客户端回传，也不在确认卡公开数据中泄漏。服务端应重新校验归属并重取最新材料后改写。新草稿签发必须原子替换旧令牌，并发送 `tool_confirmation_replaced` 让前端将旧卡结算为已替换；旧卡随后不得再确认或取消。
- `util/agent/capabilityRegistry.js` 是 Agent 写能力的唯一产品声明。新增写工具前先登记唯一 capability ID、`enabled` 状态、风险和确认策略；`planned/forbidden` 能力禁止绑定工具。工具文件中的声明必须与注册表一致，新增未登记写工具应在注册阶段直接失败。
- 自然语言业务意图由 `util/agent/semanticPlanner.js` 的强制 Intent Envelope 统一表达，禁止再以关键词正则作为主路由。模型负责基于完整语义区分查询、用法、修改、混合与歧义，并选择能力 ID；服务端负责验证能力状态、权限、真实工具调用、确认和回执。内嵌 `toolCalls` 必须按 `toolName` 复用注册工具的封闭参数 schema，禁止退化为 `additionalProperties: true` 的自由对象，也不要同时向 Provider 暴露可独立调用的业务工具副本。Intent 与工具不一致、查询未实际执行、写动作没有确认、未知能力、低置信或依赖目标未确定时一律失败关闭。
- Semantic Planner 的恢复不能替用户扩大可执行范围：额外已知只读调用直接丢弃；缺失 read 调用只向模型暴露原计划中尚缺的 read capability，最多两次，并把结果放回原计划重验；计划缺失或自相矛盾只允许一次同权限完整语义重判，重判后的能力仍按正常参数、权限、确认和回执链重新校验。任何额外写调用、未知工具、不可用能力、低置信、歧义或重验失败仍须失败关闭。恢复供应商异常应保留原安全裁决而非升级成通用 500，超时和客户端中止除外。
- 查询→动作依赖必须保留为服务端可验证的拓扑图：依赖只能指向前序 intent，同一能力不得在一张图重复声明，最长三层。只执行当前 ready 调用，未就绪写调用即使带了参数也必须丢弃；下一轮仅暴露依赖已满足的能力，并继续使用同一 `submit_agent_plan` 元协议和真实工具参数 schema。读取工具要从权威原始结果返回结构化 `dependencyRefs`，依赖工具要用 `dependencyBindings` 声明目标参数与引用类型；校验白名单只能来自直接前置 intent，不得从展示标题、摘要、模型正文或所有祖先结果中提取/合并 ID。单目标写工具必须设置 `requireUnique`，前置查询返回多个同类候选时禁止模型自行挑选，即使所选 ID 确实位于结果中也要失败关闭。该规则同时覆盖 read→read 和 read→write。核心依赖轮不能被 `AI_SECOND_ROUND_ENABLED` 关闭；该开关只控制可选的只读失败恢复。写入预检失败后不得让模型换参数或目标自动重试。
- 用户目标本身是动作、读取仅用于定位对象时允许 `data_action` 同时包含 read/write，但每个 read 必须是某个 write 的祖先；用户明确同时要求查看与修改才使用 `mixed`。依赖轮的子计划只描述本轮 ready 能力，服务端已验证的外部依赖统一视为满足，不能要求模型复述旧下标。
- 相对位置表达必须落成确定性查询契约后才能执行动作：“第一条”默认使用产品定义的智能排序并限制一条，“最新/最早”使用显式时间排序；排序语义不可靠时返回澄清，不得依赖 SQL 默认顺序或让模型直接猜目标 ID。
- 最终回答必须经过可观测质量门禁：工具/证据/动作相关的事实回答最高温度为 `0.6`，普通事实、比较和建议类回答最高温度为 `0.7`，只有明确创作请求才保留用户选择的发散温度；回答长度服从问题复杂度，不用固定短输出预算压缩正常内容。事实回答在服务端完整缓冲通过检查后再发送；普通流式回答保留一段尚未验证的尾部并更早检查可验证退化信号，命中后主动取消 Provider 流，异常尾部不得先进入用户可见正文。供应商截断、协议/结束标记泄漏、超长无断句、末尾随机汉字碎片和重复退化只允许进行一次禁用工具的低温重试，重试沿用正常回答预算并保留解决问题所需内容；异常前缀与重试正文不得拼接为用户可见终态，重试仍失败时返回稳定降级文案。质量重试不得补做业务工具、不得绕过引用审计或“无回执，不成功”约束。
- `util/agent/actionIntentPolicy.js` 只允许作为 Provider 缺失结构化计划和完成性文案的高召回安全传感器，不能据此选择或执行工具。禁止为单个事故补特殊正则后把它恢复成业务意图权威；新增能力必须进入统一能力目录、语义规划评测和服务端裁决测试。
- 动作相关的所有模型可见文案必须在发送前检查执行声明，包括 Final Reply、澄清问题和语义阻断文案；没有当前请求匹配的确认或成功回执时，不得把“AI 已帮你完成”的模型文本发送给客户端。事实查询里的“已完成待办”等状态描述不属于执行声明，测试必须覆盖二者边界。
- Change Set 批量 apply/retry 必须保持单事务全有或全无；任一项失败时已经执行的项也要回滚，UI 的 committed 计数保持 0/N，只有 commit 后才变为 N/N。可以显示 validating/applying/revalidating 等阶段，但禁止把 `processedCount` 当作已提交条数。
- 失败快照只保存稳定错误码、阶段、失败项 ID、已尝试数、冻结选择、时间和 preview revision，不保存 raw error/message、before/after 正文或工具参数。失败后必须先按四维 owner + maintain 重新读取权威状态并刷新 before/hash、提升 revision，再让用户二次确认；retry 只接受服务端冻结范围和 expected revision，客户端不得重传/扩大 item IDs。编辑预览必须使旧 retry 失效。
- Change Set 的 apply/undo 属于 AI 安全写闭环，资源写、`ai_content_generations` 推进和 `ai_content_chunks` 清理必须共享事务并失败关闭；提交后只驱逐本机缓存。嵌套的 todo 等域 Service 应允许上层统一失效，避免同一批次重复推进代际。
- 撤销是带版本检查的补偿动作，不承诺无条件回滚。创建新笔记等不能安全自动撤销的动作必须明确说明恢复路径，不能显示虚假的“可撤销”。

**日志、埋点与隐私：**

- `agent_logs` 记录用户在 AI 聊天入口直接提交的提问，便于运营排查；入库前必须 scrub Token、Cookie、Authorization、邮箱、连接串和 URL 凭据。不得记录模型回答、标题、推荐文本、来源摘录、Prompt、工具原始参数或资源正文；系统自动任务也不得把既有会话问题复制进日志。产品事件和普通错误日志仍不记录用户问题、回答、标题、推荐文本、来源摘录、Prompt 或工具原始参数，只记录 intent/任务类型、枚举、数量、耗时、成本、稳定错误码和必要关联 ID。
- AI 产品事件只能接受服务端白名单维度。关联 ID 入库前用独立 `AI_TELEMETRY_HMAC_SECRET` 做 HMAC；错误码折叠为稳定错误类别。禁止把 HMAC 当作权限依据。
- Token、Cookie、Authorization、邮箱、连接串、URL 凭据和 Provider 原始错误先经过 scrubber；日志中不得直接输出数据库/网络异常的 message 或 stack。
- 对象存储内部 key、临时路径和底层 SDK error 也属于内部敏感实现，不得直接进入客户端错误响应或普通日志。file/note/worker/cleanup 等异步边界统一映射稳定错误码；新增 handler 要同时检查成功响应、catch 和 scheduler `.catch()`，不能只修主 Agent。
- 生产环境必须配置独立且稳定的 `AI_TELEMETRY_HMAC_SECRET` 与 `AI_QUOTA_HASH_SECRET`。轮换会切断历史关联或重新分桶，只能按运行手册安排，不能在普通重启时随机变化。

**数据导出、清除与保留：**

- 必须区分调用身份和数据政策：账号 Settings 的全量 JSON 导出按 `subject_user_id` 汇总可移植 AI 数据；普通 self/normal 的“清除全部 AI 数据”也按 subject 清除全部可控 AI 对象，包括管理员授权上下文曾为该主体产生的对象；管理员 `maintain` 清除只限当前 `(actor, subject, mode, contextId)` owner 四维域，`readonly` 禁止调用。接口、确认框、回执和帮助文档必须展示服务端返回的 `scope=subject_user|owner_domain`，不能由前端自行猜测。
- 两种清除范围都必须在单个数据库事务内覆盖会话、记忆、Change Set、产品事件和 SSE 恢复事件；普通 self 还要在该事务内推进 `ai_content_generations` 并删除 `ai_content_chunks`，commit 后只做本进程缓存驱逐，任何代际推进/清理失败都必须回滚全部分域。owner-domain 清除不得推进 subject 级代际。任何必需表或字段缺失时必须以稳定 503 错误失败关闭并回滚，禁止把未检查分域计为删除 0 条。新增 AI 持久表时，必须同步决定它属于 subject 清除、owner 清除、独立安全账本还是不可移植派生数据，并补两种 scope 的回归，不能默认为遗漏。
- `agent_logs`、配额用量和请求级配额占位属于独立安全/运营账本，不随上述清除删除。`ai_provider_balance_snapshots` 属于供应商级运营账本，不关联具体用户，不进入 subject 清除或账号导出；它只用于展示账户余额变化，不能被表述为逐请求精确费用。产品必须在确认前披露保留项和独立保留策略；不得用“永久清除全部记录”掩盖这些例外。subject 级导出包含其中可导出的审计/用量数据，也不意味着 subject 清除会删除它们。
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
- AI 黄金矩阵变更必须同时通过生成器 `--check` 和 `eval:ai-assistant`；确定性 Agent 回放和 AI 关键 UI E2E 同样是 CI 阻断项。以上门禁禁止 `continue-on-error`，且不得调用真实 Provider。DeepSeek 冒烟提供 6 条快速集和 37 条完整集，只能由 Root 在后台手动触发或开发者显式执行 `--live`，不得进入 CI、部署脚本或定时任务；执行层只验证规划，工具执行数恒为 0，不得读写用户业务数据，结果不得保存完整问题/回答，仅可写入独立评测运行记录。
- 引用评测须把“引用键存在/定位成功”和“证据是否支持对应主张”分开记录；语义支持度只能来自完全合成的受控事实或人工标注，不允许用字符串包含、关键词重合或同源 ID 自动判定蕴含。
- AI 数据库迁移、环境变量、schema assertions、灰度和回滚步骤见 `docs/plan/ai-assistant-rollout-runbook.md`。
- 用新唯一索引替换旧唯一索引时，先按新索引的归一化表达式做重复键 preflight，再 `ADD UNIQUE`，确认成功后才 `DROP` 旧索引；顺序不可反转。迁移后 assertion 要同时证明新索引列序/唯一性正确且旧索引已移除，不能只检查脚本退出码。
- 社区客厅必须失败关闭：`COMMUNITY_CHAT_ACCESS_MODE` 缺省或未知时一律是 `closed`；公开聊天使用 `public`，游客只读、登录用户发言，`invite_only` 仅保留给未来私密房间。两种开放模式都必须再显式开启 `COMMUNITY_CHAT_MESSAGING_ENABLED`，realtime 依赖消息开关。冷启动期服务端目录和消息接口只接受 `general`，旧多频道 slug 必须迁移归档而不能仅靠前端隐藏；客户端保留房间数组能力，但单房间时不得渲染桌面侧栏或移动顶部标签。页面不得渲染整页访问状态再跳工作区；首屏只允许单栏同构骨架，失败在工作区内重试。社区写事务只能用同一个 `connection.query`，并在消息落库事务内重新锁定成员限制、`community_chat_runtime_policy` 单行策略、主房间和有效禁言；图片上传在写私有对象存储前必须以账号行锁串行预留配额，最多保留 12 张未绑定的上传中、待发送或待清理图片，不能只靠进程内限流。管理员预览上下文不得代用用户社区身份。Root 切换数据库策略时原因必填，必须与前后状态同事务写入不可变审计；`COMMUNITY_CHAT_EMERGENCY_READ_ONLY` 是更高优先级环境硬开关，生效时后台不得恢复发言。紧急只读拦截新消息以及图片上传/绑定，但不拦截历史与图片查看、已读、举报或屏蔽。客户端只提交房间 slug、公有消息/待发送图片 ID、幂等键、原因枚举和纯文本，不得提交目标 user ID/角色/内部自增 ID 或对象存储 Key；游客不得调用任何社区写接口。历史用不透明公有游标，作者可返回受限公开头像、头像框、等级、段位和称号但不能返回内部账号 ID；头像用户卡必须继续只接受消息公有 ID，由服务端反查作者并只返回公开成就，不接受目标 user ID，也不返回邮箱、经验值、资源统计或私人内容。阅读位置用单调更新防倒退。举报必须保存最小证据快照且重复提交幂等，屏蔽从服务端消息解析作者并同时过滤历史、引用和未读。Root 消息审核只能调用社区管理 API；驳回、隐藏、禁言和封禁都由 Service 事务处理并收集明确原因。通知记录初始化为关闭，设备推送未接入前不得借用 Android 下载通知能力宣称聊天后台推送。
- 社区 realtime 必须挂载现有 HTTP server 的唯一 `/realtime/chat` 路径，不得新增 echo 端口或把 sid 放进 URL。upgrade 先校验同源/显式允许的 `Origin`、IP 频控和显式 realtime 开关，再从 Cookie sid 读取会话并查 `user` 实时角色、账号限制与社区权限；缺失或无效的显式 sid 不能静默提权或降级。订阅协议只允许 `general`，出现 user ID、角色或额外字段立即协议失败关闭。REST/MySQL 是唯一消息真相，WebSocket 只发公有消息 ID 等失效通知；消息、审核、权限和运行策略事件必须在事务提交后发布，Redis/广播失败只记录稳定错误码，不能改变 REST 成功结果。客户端连接正常时仍保留低频权威安全刷新，断线、切网、前台恢复和权限事件都要重新拉取 REST，未知事件忽略、协议版本不兼容则稳定降级，禁止无限快速重连。
- 聊天室通知地址必须使用真实可用的消息深链，不能只拼接页面会忽略的查询参数。历史接口的 `before` 与 `focus` 必须互斥；`focus` 只解析当前房间、当前用户仍可见的 active 消息。前端定位后用实色描边高亮并提供“回到最新消息”，目标失效时清理 `message` 参数、保留其他查询参数并回退最新历史。

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
- 共享 `MobileAppShell` 负责移动文本输入时的键盘视口：只有文本输入获得焦点且 `visualViewport` 相对稳定基线明显收缩时才进入键盘态，隐藏底部一级导航，并用实际可见高度约束应用壳；失焦或视口恢复时重置。业务页面不得按 Android UA 单独补高度，也不得自行复制键盘监听。

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

| 层级       | 值   | 用途                                  |
| ---------- | ---- | ------------------------------------- |
| 局部堆叠   | 0–30 | 组件内部相对定位                      |
| 页面悬浮   | 100  | 目录/粘性头/悬浮球                    |
| 导航层     | 200  | 导航栏/管理横幅                       |
| 浮层       | 300  | 下拉/操作条/分页/筛选                 |
| 引导层     | 400  | 游客引导/周报/缩放提示                |
| 右键菜单   | 500  | RightMenu                             |
| 抽屉       | 600  | BDrawer                               |
| 弹框       | 700  | BModal/登录弹框                       |
| 弹框内浮层 | 800  | 弹框里的下拉/气泡(BPopover/BDropdown) |
| 覆盖层     | 900  | AI 窗口/文件预览/BSelect 下拉         |
| 全局搜索   | 1000 | 顶部搜索下拉                          |
| 提示气泡   | 1100 | BTooltip                              |
| 消息/庆祝  | 1200 | BMessage/升级动画                     |
| 全局确认   | 1300 | BAlert                                |

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

- 桌面端设置页「界面缩放」（小/标准/大）是给 `<html>` 设 CSS `zoom`（0.9 / 1 / 1.1）实现的（全 px 项目里唯一直观有效的可控缩放），**不是浏览器原生缩放**。实现在 `utils/savePreference.ts` 的 `applyDisplaySettings`。
- 手机布局已有独立响应式排版，运行时始终强制标准缩放并隐藏设置入口；这里只忽略当前设备的缩放效果，不回写账号 `uiScale`，因此电脑端偏好会保留。判断必须复用 `bookmark.isMobile`，不得新增 UA 分支。
- 应用挂载节点和内部根容器必须使用父级百分比宽度，禁止在 `<html>` zoom 子树中用 `100vw` 作为整站根宽度；否则小号缩放会把可见页面缩成视口的 90% 并在右侧露白，大号缩放则可能裁切。
- **坑**：CSS `zoom` 下，`getBoundingClientRect()` / `MouseEvent.clientX/Y` 返回「视觉坐标」（已含 zoom），而 `scrollTop` / `offsetTop` / `scrollTo()` 用「布局坐标」（不含 zoom）。二者混用，在缩放 ≠ 1 时会**定位偏移** —— 典型症状：teleport 浮层错位、滚动定位不准（点锚点要点好几次才到）、拖拽/坐标计算偏移，且**距视口左上角越远越明显**。
- **约定（避免再踩）**：
  - 浮层（下拉 / 菜单 / 气泡 / 提示）一律用 B 系列组件（`BSelect`/`BPopover`/`BTooltip`/`BDropdown`/`BPagination`/`RightMenu`）—— 它们已用 `getRootZoom()` 适配。
  - 「滚动到某元素」用 `utils/zoom.ts` 的 `scrollIntoContainer(container, el, offset)`，不要裸写 `getBoundingClientRect + scrollTo`。
  - 任何手动「读坐标 → 定位 / 滚动 / 拖拽」，坐标先 `÷ getRootZoom()`（`utils/zoom.ts`）换算回布局坐标；`offsetWidth/Height`、`clientWidth/Height` 本就是布局像素、无需换算。
  - fixed/absolute 浮层用 `100vw` 定位在 zoom 下会偏移（放大遮挡内容）；改用「视口中心 `left: 50%` + `transform` 偏移」，视口中心与内容同 zoom 上下文等比缩放、相对位置恒定。
  - **排查"只有缩放≠标准时才出现的定位/滚动问题",先怀疑这里。**

**移动浏览器 / Android App 共享渲染基线（重要坑）：**

APK 用系统 WebView 渲染，部分厂商内核会把 `color-mix()` 算错、把中间字重向上匹配成粗体，也可能把低透明度或多层 `box-shadow` 画成实心黑框。过去只给 APK 打补丁，造成电脑移动预览、手机浏览器和 App 出现三套结果。现在统一遵循以下链路：

1. `config/responsive.ts` 是设备断点的唯一来源；`config/renderingProfile.ts` 与 `<head>` 中的 `earlyAppEntryBootstrap.ts` 在首次绘制前同步决定渲染基线。
2. 手机、平板、移动 PWA 和 Android App 都给 `<html>` 加 `light-note-mobile-rendering`，共同加载 `assets/css/mobile-rendering-baseline.less`；桌面基线保留更丰富的混色和中间字重。
3. `light-note-android-webview` 只记录渲染引擎，便于日志和诊断。`android-webview-compat.less` 必须保持无可执行视觉规则，业务组件禁止按 App UA 写字体、颜色或布局分支。
4. 全站 UI 使用 `--app-font-family` 的跨平台系统字体栈并设置 `font-synthesis: none`。PostCSS 插件 `androidFontWeightFallback.ts` 把数字字重包成兼容变量；共享移动基线将 700 以下稳定为 400，只保留真实 700+ 粗体，因此移动浏览器和 App 的普通文字粗细一致。`@font-face` 描述不转换，代码区继续使用等宽字体。
5. `androidColorMixFallback.ts` 把 `color-mix(...)` 包成按语义分类的兼容变量；共享移动基线同时给移动浏览器和 App 定义稳定颜色。语义弱底色保留固定 RGBA，中性边框落到稳定主题边框，混色阴影落到透明。新增语义色时需同步补插件分类、移动基线变量和测试。

- **状态与层级不能只由 `color-mix()` 或阴影承载。** 选中、今天、激活、错误、当前项等状态必须另有实色描边、实心圆点 / 圆底、图标或明确文字色；淡混色只作辅助。
- **禁止用 `@supports (color-mix(...))` 分流。** 问题 WebView 会返回支持但错误渲染，能力探测无效。
- 必要布局不得只依赖旧 WebView 缺失的能力：不使用 `:has()` 决定结构；容器宽度分支使用 `useElementWidthClasses()` 的显式类，保留的容器查询必须有移动基线或媒体查询等价回退；CSS 中的 `dvh/svh/lvh` 由 `dynamicViewportFallback.ts` 自动生成前置 `vh` 声明，内联高度通过 `resolveViewportUnitValue()` 处理。
- 移动端把 `scrollbar-gutter` 统一回 `auto`，避免现代浏览器预留而旧 WebView 不预留；Chrome 87 不支持 `aspect-ratio` 的关键交互元素必须同时给明确尺寸或共享移动高度。
- **电脑自检：** URL 加 `?renderProfile=mobile`（会记入当前标签页会话），或在 DevTools 执行 `document.documentElement.classList.add('light-note-mobile-rendering')`。`?renderProfile=auto` 清除覆盖。Android 引擎类不会改变视觉，不能再用它模拟 App。
- **真机实时联调：** 运行 `pnpm dev:web:device`，让平板浏览器与一次性安装的 Debug APK 同时打开同一个局域网 Vite 地址，之后 Vue / TS / Less 修改均由 HMR 更新，不需要反复部署或重装。完整步骤见 `apps/android/README.md`。
- 新增或修改移动样式后至少检查相同 CSS 视口下的移动浏览器与 Debug App、浅色/深色及横竖屏。若仍有厂商引擎差异，优先在共享移动基线写双方都执行的稳定表达并补回归门禁，禁止恢复 App 专属视觉补丁。

### 笔记页面树灰度与隐私遥测

- 页面树能力由 `util/noteTreeFeatureFlags.js` 统一裁决，前端只消费 `/api/note/getNoteTreeFeatures` 的账号级快照。生产环境未配置时默认全部关闭；本地开发和测试默认开启，便于离线回归。
- 页面树 Schema 同时维护幂等迁移 `migrations/20260806_note_page_tree.sql`、启动保障 `util/noteTreeSchema.js` 与只读断言 `migrations/schema-assertions.sql`；启动保障只补缺失列/索引，发现同名结构不一致时失败关闭，不自动删除或重建未知结构。`note` 的 owner、父节点、删除状态和 ID 均为 `varchar(255) utf8mb4`，复合索引必须使用足以容纳 UUID 的 64/8 字符前缀，禁止用四个全长字段突破 MySQL 5.7 InnoDB 的 3072 字节键长上限。
- 六个开关分别使用 `NOTE_TREE_READ`、`NOTE_TREE_WRITE`、`NOTE_TREE_MOBILE`、`NOTE_TREE_SUBTREE_TRASH`、`AI_NOTE_BRANCH_SCOPE`、`AI_NOTE_BRANCH_ANALYSIS` 前缀，可配置 `<PREFIX>_ENABLED=true|false` 与 `<PREFIX>_ROLLOUT_PERCENT=0..100`。`NOTE_TREE_TEST_USER_IDS` 可声明逗号分隔的测试账号。
- 显式 `false` 是最高优先级事故急停，Root 和测试账号也不能绕过；其余情况下 Root/测试账号先行放行，普通账号按 subject ID 做稳定 SHA-256 分桶。依赖关系固定为：写入依赖读取、移动端依赖读取、子树回收站依赖写入、AI 完整分析依赖 AI 目录范围。
- 灰度顺序保持“Root/测试 → 5% → 20% → 50% → 100%”，并先开读取再开写入。服务端在查询、创建、移动、排序、子树删除、AI 范围解析、AI 指定目录准备/替换/确认等边界重新校验，不能只靠前端隐藏入口。
- 页面树搜索只读取标题元数据；服务端返回当前目录后代中的匹配节点及其完整祖先路径，不返回正文，也不补入无关兄弟或后代。
- 页面树产品事件复用 `ai_product_events` 的无正文协议，只允许事件枚举、`desktop|mobile|ai` surface、深度/子页面数/子树规模/耗时桶和稳定结果枚举。禁止发送或持久化页面标题、路径、正文、搜索词和资源 ID。

## 自检清单

### 代码提交前

- [ ] 列出本次所有新增、修改、删除的文件
- [ ] 逐文件通读改动，检查 import、类型、边界分支、空值处理
- [ ] 新增文件确认已正确接入（路由、引用、导入、菜单配置等）
- [ ] 修改文件反查调用方/被调用方，确认不破坏兼容
- [ ] 删除文件确认无残留引用
- [ ] 前端：检查 PC 端、移动端、深色主题、中英文
- [ ] 前端新增或修改移动端字体、`color-mix()`、阴影或响应式布局 → 用 `?renderProfile=mobile` 复检，并在相同 CSS 视口下对照移动浏览器与 Debug App（见「共享渲染基线」）
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

### 待办重复、提醒与撤销约束

- 新建待办默认采用“单任务”语义：无论提醒一次，还是按间隔、按周、按月重复提醒，都只创建一条 `todo_items`；只有用户明确开启“每次计划都需要单独完成”时，才进入 v2 `todo_series` 多实例计划。快速添加和 Agent 也必须遵守这个默认值。
- 单任务提醒规则存入 `todo_reminder_rules.schedule_json`，规则 `mode = single_schedule`；确定性计算器生成 `todo_reminder_jobs`，不新增第二套投递 Worker。无界站内提醒只预生成未来 60 天并由系列补齐器幂等续窗；邮件重复提醒必须有结束日期或最大次数，单任务理论 Job 上限为 500。
- 默认创建界面的灰度开关为 `TODO_SIMPLE_CREATE_UI`、`TODO_SINGLE_TASK_SCHEDULE`、`TODO_INDEPENDENT_TASK_ADVANCED`、`TODO_QUICK_REMINDER_PRESETS`（同时兼容同名小写键）。关闭 UI 开关只回退入口，不得停止既有提醒调度；结构回滚默认保留 `schedule_json` 数据，避免不可逆丢失。

- 完整编辑器及带计划/提醒的新建待办默认使用 v2；仅标题的快捷收集仍可走 v1 兼容入口：“任务计划”决定实例生成（仅一次 / 按日程重复 / 完成后再次安排），“每项提醒”决定每个实例的通知（不提醒 / 提醒一次 / 多次催办）。两者必须分别保存、分别展示，不能从一个开关推断另一个。
- v1 旧任务不得静默重解释：旧 `recurrence_rule` 继续表示完成触发并按旧截止日期平移，旧 `todo_reminders` 继续运行。任何主动转换必须先展示 v2 权威预览；同一系列禁止被 v1、v2 两套调度器同时处理。
- 日期、次数、DST、月末与提醒时刻只能由 `util/todoPlanCalculator.js` 计算；前端与 Agent 都不得自行心算或用毫秒除以 24 小时。过去首项必须显式选择保留逾期、从今天重启或跳过错过项。
- 固定日程系列使用 `(series_id, occurrence_no)` 唯一约束与滚动窗口幂等补齐；长期系列至少覆盖未来 60 天和 8 个未来实例、单批最多 200 项，补齐器每 10 分钟扫描。完成当前实例只取消本项提醒，不触发或移动其他实例。完成后再次安排必须在完成事务中按实际 `completed_at` 生成下一实例，并在撤销时检测下一项是否已修改。
- v2 提醒以 `todo_reminder_jobs` 为投递事实，每个实例 × 渠道 × 催办序号一行；多 Worker 必须以数据库租约抢占。站内通知按来源幂等，SMTP 结果不确定标为 `unknown` 且禁止自动重发；免打扰延迟后仍基于原始提醒锚点，不级联平移后续催办。
- 灰度与回滚开关默认开启：`TODO_PLAN_V2`（新建入口）、`TODO_PLAN_V2_SCHEDULER`（系列与提醒 Worker）、`TODO_PLAN_V2_AI`（AI 完整计划工具）、`TODO_PLAN_V2_CONVERSION`（旧版转换）。同时兼容方案中的同名小写环境变量。关闭新建入口不会自动关闭调度器，确保既有计划仍可履约。
- 单条及批量完成/删除的撤销必须由后端验证目标仍处于可恢复状态，并与原操作共用事务边界；前端 10 秒倒计时只控制入口可见性。
- Agent 修改待办状态必须复用 `util/services/todoService.js`，不得自行更新 `todo_items.status`，否则会漏掉重复实例、提醒暂停/恢复和个人检索失效。
- Agent 创建复杂计划必须先调用确定性预览并使用一次性确认协议；创建请求与系列修改必须携带幂等键，确认重放不得重复创建。有限系列最多 366 项，多次催办每实例最多 20 次，单计划理论提醒 Job 最多 5,000 个。

## 部署

1. **前端：** 构建后将 `dist/` 上传到服务器（替换旧 `dist`）
2. **后端：** 通过 pm2 启动 `app.js`，配置 `.env` 环境变量
3. **AI 文档 Worker：** 通过 pm2 单独启动 `documentWorker.js`（进程名 `light-note-document-worker`）；本地开发可运行 `pnpm --filter server worker:documents`
4. **书签图标 Worker：** 通过 pm2 单独启动 `bookmarkIconWorker.js`（进程名 `light-note-bookmark-icon-worker`）；本地开发可运行 `pnpm --filter server worker:bookmark-icons`。部署前执行 `pnpm --filter server check:bookmark-icons`，确认任务 Schema、favicon-api 和图标目录可用；favicon 服务地址统一由 `FAVICON_API_BASE_URL` 配置。图标落盘使用完整内容哈希共享文件，删除或替换图标必须在业务事务提交后通过 `cleanupBookmarkIconFiles()` 做活动引用检查，禁止直接拼接 `/www/wwwroot/images` 或在提交前删除文件。
5. **本地 OCR 运行时：** 服务器需安装 Poppler、Tesseract、简体中文和英文语言包；Debian/Ubuntu 可安装 `poppler-utils tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng`，安装后执行 `pnpm --filter server check:ocr` 验证
6. 根用户用 `pm2 restart app --update-env` 刷新环境变量；`scripts/deploy-server.sh` 会同步启动或重启 AI 文档 Worker 与书签图标 Worker

OCR 默认完全在服务器本机执行，不使用 OCR API。可通过 `AI_OCR_MAX_PAGES`、`AI_OCR_MAX_PIXELS`、`AI_OCR_PDF_DPI`、`AI_OCR_LANGUAGES`、`AI_OCR_PDFTOPPM_BIN` 和 `AI_OCR_TESSERACT_BIN` 调整限制或二进制路径；生产环境应保持文档 Worker 单并发，避免 OCR 抢占主 HTTP 进程资源。

⚠️ **部署禁令：** 改完代码后不 build、不部署、只能建议是否提交，但是不能推送，除非用户明确说"部署"或"上线"。
