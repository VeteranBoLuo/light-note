# 轻笺架构文档

## 项目概览

轻笺是一个全栈书签/笔记/文件管理平台。采用 pnpm monorepo 管理前后端代码。

```
light-note/
├── apps/
│   ├── web/          # 前端（Vue 3 + Vite + Pinia）
│   └── server/       # 后端（Express + MySQL + JWT）
├── packages/         # 共享包（预留）
├── scripts/          # 部署/工具脚本
├── pnpm-workspace.yaml
└── package.json
```

## 技术栈

| 层          | 技术                                 | 版本    |
| ----------- | ------------------------------------ | ------- |
| 前端框架    | Vue 3                                | ^3.x    |
| 构建工具    | Vite                                 | ^5.x    |
| 状态管理    | Pinia                                | —       |
| HTTP 客户端 | Axios                                | ^0.24.0 |
| UI 组件     | Ant Design Vue 3.x + 自研 BComponent | —       |
| 多语言      | vue-i18n                             | —       |
| 后端框架    | Express                              | —       |
| 数据库      | MySQL 5.7 / 8.0                      | —       |
| 对象存储    | 华为云 OBS                           | —       |
| 认证        | Cookie Session（express-session）    | —       |

## 后端架构

### 入口与中间件链

```
app.js → helmet → cors → cookie-parser → session → router/
```

### 路由映射

```
apps/server/
├── app.js                 # Express 入口
├── db/index.js            # MySQL 连接池（namedPlaceholders: true）
├── router/
│   ├── common.js          # 通用路由（admin、转化漏斗、帮助中心等）
│   ├── bookmark.js        # 书签路由
│   ├── note.js            # 笔记路由
│   ├── file.js            # 云空间文件路由
│   ├── inbox.js           # 快速添加与待整理路由
│   ├── todo.js            # 待处理中的待办与提醒路由
│   ├── chat.js            # AI Agent、写操作确认与额度路由
│   ├── featureRequest.js  # 共建轻笺公开需求与 Root 管理路由
│   ├── user.js            # 用户路由
│   ├── security.js        # 安全中心路由
│   ├── trash.js           # 回收站路由
│   └── opinion.js         # 反馈路由
├── router_handle/          # 业务处理层
│   ├── commonHandle.js    # Admin API、转化漏斗、SQL 控制台等
│   ├── bookmarkHandle.js  # 书签 CRUD
│   ├── noteLibraryHandle.js # 笔记 CRUD
│   ├── fileHandle.js      # 文件/文件夹 CRUD
│   ├── userHandle.js      # 登录/注册/GitHub OAuth
│   ├── securityHandle.js  # 安全事件
│   ├── trashHandle.js     # 回收站
│   ├── aiDocumentHandle.js # AI 文件上传、挂载与解析状态
│   ├── featureRequestHandle.js # 共建轻笺
│   └── opinionHandle.js   # 反馈
└── util/                   # 工具模块
    ├── auth.js            # Cookie session 认证
    ├── common.js          # insertData、snakeCaseKeys、generateUUID
    ├── request.js         # validateQueryParams（分页参数校验）
    ├── conversion.js      # 转化漏斗记录
    ├── obsClient.js       # 华为 OBS
    ├── resourceTags.js    # 资源-标签关联管理
    ├── log.js             # API 请求日志中间件
    ├── agent/             # 轻笺智域 AI 代理
    ├── aiDocument/       # AI 文档解析、任务、检索与生命周期
    ├── adminContextStore.js # Redis 管理员上下文（actor/subject 分离）
    ├── adminRoutePolicy.js  # 管理员上下文显式路由策略
    ├── resourceInbox.js     # 待整理关系与归属服务
    ├── services/            # 页面 handler 与 Agent 共用的资源写入业务 Service
    └── security/          # 安全攻击检测
```

### 响应格式

所有 API 统一使用 `resultData(data, status, msg)`：

```javascript
res.send(resultData({ id, name }, 200)); // 成功
res.send(resultData(null, 400, "参数错误")); // 客户端错误
res.send(resultData(null, 401, "请先登录")); // 未认证
res.send(resultData(null, 403, "无权限操作")); // 无权限
res.send(resultData(null, 500, "服务器内部错误")); // 服务端错误
```

- `resultData` 会自动将 snake_case key 转为 camelCase
- 非 200 响应自动记录错误日志

### 权限模型

- 角色：`visitor`（游客）、`user`（普通用户）、`root`（管理员）
- 普通权限检查仍通过 `req.user?.role` 判断；管理员预览使用短时 `X-Admin-Context`，鉴权层分离真实操作者 `billingUser` 与资源主体 `resourceUser`
- 管理员上下文所有路由必须在 `adminRoutePolicy.js` 显式声明语义策略，遗漏时默认拒绝
- `readonly` 只允许读取；`maintain` 仅允许可逆内容维护，抑制目标账号成长、转化和权益副作用，并写入 `admin_context_audit`
- 管理员上下文仅以 Token 哈希作为 Redis 键；过期元数据额外保留 24 小时用于审计，审计记录 actor、subject、角色、能力与模式，结果统一为 `allowed/blocked/noop/failed/expired`
- Root 操作使用 `ensureRootRole(req, res)` 检查

## 前端架构

### 路由体系

```
src/
├── App.vue                # 入口，PC/移动端路由分发
├── router/
│   └── modules/
│       ├── admin.ts       # 后台管理路由
│       ├── bookmark.ts    # 书签页面路由
│       └── ...
├── view/                  # 页面组件
│   ├── noteLibrary/       # 笔记库
│   ├── cloudSpace/        # 云空间
│   ├── admin/             # 后台管理
│   │   └── components/    # 后台子组件
│   │       ├── conversion/ # 转化漏斗
│   │       └── ...
│   └── ...
├── components/            # 共享组件
│   ├── base/              # 基础组件（BTable、BModal、BTooltip 等）
│   ├── cloudSpace/        # 云空间专用组件
│   ├── noteLibrary/       # 笔记专用组件
│   └── ...
├── store/                 # Pinia 状态
│   ├── bookmark.ts        # 书签 + 断点
│   ├── useUser.ts         # 用户状态
│   ├── note.ts            # 笔记状态
│   └── cloudSpace.ts      # 云空间状态
├── i18n/locales/
│   ├── zh-CN.ts           # 中文翻译
│   └── en-US.ts           # 英文翻译
├── http/request.ts        # Axios 实例
├── assets/css/
│   └── theme.less         # 主题变量
└── config/
    └── resourceColor.ts   # 资源语义色
```

### 多端适配

- 断点来源：`src/store/bookmark.ts`
- 使用 `bookmark.isMobile` / `isTablet` / `isDesktop` / `isMobileDevice`
- PC 和移动端有各自的路由映射（`phoneReplaceMap` / `deskReplaceMap`）
- 新增页面需同时检查两端路由配置

## 数据库核心表

| 表                                  | 作用                     | 主键类型  |
| ----------------------------------- | ------------------------ | --------- |
| `user`                              | 用户                     | UUID      |
| `bookmark`                          | 书签                     | UUID      |
| `note`                              | 笔记                     | UUID      |
| `files`                             | 云空间文件               | 自增      |
| `folder`                            | 云空间文件夹             | 自增      |
| `tag`                               | 标签                     | UUID      |
| `resource_tag_relations`            | 资源-标签关联            | 无独立 id |
| `resource_inbox`                    | 书签/笔记/文件待整理关系 | UUID      |
| `todo_items`                        | 待处理中的待办事项       | UUID      |
| `todo_reminders`                    | 待办提醒调度记录         | UUID      |
| `tag_relations`                     | 标签-标签关联            | 无独立 id |
| `api_logs`                          | API 请求日志             | UUID      |
| `operation_logs`                    | 操作日志                 | UUID      |
| `security_events`                   | 安全事件                 | 自增      |
| `conversion_events`                 | 游客转化事件             | 自增      |
| `admin_context_audit`               | 管理员预览与内容维护审计 | UUID      |
| `agent_logs`                        | AI 请求、用量和阶段追踪  | UUID      |
| `ai_document_sources`               | AI 文档来源与解析状态    | UUID      |
| `ai_document_chunks`                | AI 文档正文片段与定位    | 自增      |
| `ai_document_jobs`                  | AI 文档异步解析任务      | 自增      |
| `note_template`                     | 用户自存笔记模板         | UUID      |
| `feature_requests`                  | 共建轻笺公开需求         | UUID      |
| `feature_request_votes`             | 共建建议唯一投票         | 复合主键  |
| `feature_request_updates`           | 共建建议公开时间线       | UUID      |
| `opinion`                           | 用户反馈                 | UUID      |
| `help_config` / `help_config_draft` | 帮助中心                 | UUID      |

笔记模板：内置模板（日报/周报/会议纪要/读书笔记/项目计划/复盘/知识卡片）为前端常量（`config/noteTemplates.ts`，含 `{{date}}` 等占位变量的文案不进 i18n 文件）；用户自存模板存 `note_template`（每人上限 20，硬删除不接回收站），`name`（库内显示名）与 `title_template`（新笔记默认标题，可含变量）语义分离。笔记正文图片按引用计数清理：彻底删除笔记后，仅当 URL 既无 `note_images` 残留引用、也无模板正文引用时才删除物理文件；新建笔记与存为模板都会校验图片归属并登记引用。

笔记库支持多条笔记置顶：`note.is_top` 只表达整理状态，不改变 `update_time`；列表按置顶分组、自定义 `sort`、更新时间依次排序，卡片和列表使用笔记绿色标记。桌面端通过右键菜单操作，移动端通过卡片“更多”菜单操作；拖拽只改变组内顺序，置顶组始终位于普通组之前。

书签图标采用 stale-while-revalidate：`bookmark.icon_checked_at` 记录最近一次 favicon 抓取检查时间；已有图标满 30 天后在列表后台静默刷新，抓取失败保留旧图标，无图标记录按 24 小时冷却重试。书签站点主机变化时清空旧图标及检查时间，同站点路径变化以及普通标题、描述、标签编辑不清图标；编辑页支持主动刷新。

书签地址以 `@lightnote/shared` 的 `resolveBookmarkUrlInput` 为前后端共享判定规则，服务端 `util/bookmarkUrl.js` 是最终权限边界。纯网址和裸域名可确定性规范化；分享文案、协议后空格、重复协议或多网址输入只生成候选，必须由用户显式选择；无有效候选、非 HTTP(S)、带账号密码或超长地址直接拒绝。保存前 `/bookmark/resolveUrl` 进行 SSRF 防护下的短时探活：域名不存在及 404/410 仅标“疑似失效”，前端推荐返回修改但允许明确“仍然保存”；超时、反爬、鉴权和内网站点不武断判死。智能识别只在地址确定后运行，AI 只补名称、描述和标签，抓取失败时响应标记 `metadataSource=inferred`，不得伪装成已读取网页；已有名称或描述时先展示新旧逐字段对比，由用户选择要应用的字段。识别期间可由用户主动停止，客户端断开信号会传递到网页抓取与 LLM 请求，并由前后端超时共同兜底，停止或超时后的结果不得回填。

### INSERT 规范

| 主键类型           | 使用函数                                  |
| ------------------ | ----------------------------------------- |
| UUID               | `insertData({ ... })` 或 `generateUUID()` |
| 自增               | 直接用 `snakeCaseKeys()`                  |
| 无 id 列（关系表） | 用 `snakeCaseKeys()`                      |

## 轻笺智域（AI Agent）

- 主力供应商：DeepSeek（`DEEPSEEK_API_KEY`）
- 备用供应商：千问 Qwen（`DASHSCOPE_API_KEY`）
- 通过 `AGENT_LLM_PROVIDER` 环境变量切换
- 配置集中在 `util/agent/deepseekClient.js` 的 `PROVIDERS` 表
- 价格按供应商独立计算
- root 可在 AI 监控页通过 DeepSeek 官方余额接口查看账户可用状态和剩余余额；查询结果短时缓存，上游异常时回退最近一次成功值
- 会话按用户或管理员 actor/subject 组合隔离；前端历史也按账号键隔离
- 每轮按意图筛选不超过 12 个工具，非 root 不下发管理工具，游客与只读上下文不下发写工具
- 七个写工具（含保存附件到云空间、创建图片笔记）使用 Redis 哈希键保存的一次性确认令牌；前端先展示风险、目标和影响范围，确认后按服务端保存参数执行。确认接口原子认领令牌，并以令牌摘要键短期缓存绑定 owner、session 与代管上下文的确定结果；响应丢失后同一令牌只回放原结果，不会重复写入。创建普通笔记和图片笔记还会按“账号 + 会话 + 权威参数”生成稳定业务幂等键，并映射为确定性笔记 UUID（图片同时映射为确定性存储名），所以执行结果不明、确认缓存过期后在同一会话重新确认也只会恢复原实体；新会话仍允许用户有意创建相同内容。执行中或结果待核验时前端仅允许安全重试，不允许取消或改参误消费令牌。已生成的令牌参数不允许就地篡改；“修改参数”会先作废旧令牌，再重新准备一份确认
- 待确认写操作的用户消息与助手消息按整轮标记为瞬态，确认未结算前不写入本地或服务端会话历史；自然语言触发的操作在结算后再成对保留，结构化快捷动作仅在成功后保留，避免刷新留下半截对话或把未执行动作当作后续上下文
- 笔记、书签、标签、文件、回收站恢复和知识库写入必须复用 `util/services/`；Agent 工具不得再直接拼接这些业务 SQL，以保持事务、归属、成长、转化、快照和参数校验一致
- SSE 使用 `start/tool_start/tool_result/interaction_required/tool_confirmation/sources/delta/done` 结构化事件，并保留 `requestId` 关联日志。客户端通过 `clientCapabilities: ['agent_interaction_v1']` 显式声明支持选择卡；未声明的旧页面继续收到原业务错误，避免新事件被静默忽略后卡住
- Agent 工具通过 `util/agent/sourceUtils.js` 统一生成、清洗和去重来源；来源必须携带稳定资源 ID 与显式语义目标，外链仅接受 HTTP(S)。当前语义目标覆盖笔记详情、书签原网页/编辑/快照、云文件精确预览、云文件夹、帮助中心公开文章、Root 内部知识、标签详情、网页和临时文档。普通公开知识只作为回答依据展示，不使用 SEO 页面兜底跳转；知识来源只有在 `category = '帮助中心'` 且 `status = 'public'` 时才进入站内 `/help?article=<id>`。帮助中心、Root 知识库、云空间文件/文件夹和书签快照均把资源 ID 写入查询参数，刷新与浏览器前进后退可恢复同一内容
- 用户可为单条消息选择书签、笔记、文件或标签上下文；后端重新校验归属后读取，不信任前端正文
- AI 输入区通过“上传文件”添加本地临时文件，或通过“添加资源”选择已有云空间文件；两种方式共用解析与引用，当前支持 TXT/Markdown/CSV/PDF/DOCX/PNG/JPG/WebP，单轮最多一个附件
- 附件“原文件已上传”和“已提取文字”是两层独立能力：直传确认后即可发送、保存原文件或插入图片笔记；只有摘要、文本问答和整理文字笔记需要解析结果。OCR 没有识别到文字时，数据库沿用 `ready + NO_TEXT_CONTENT`，接口映射为 `no_text`，不把原文件误判为失败
- 临时附件可经确认式写工具复制到永久云空间；图片附件可经确认式写工具写入本站图片目录、创建 HTML 图片笔记并同步登记 `note_images` 引用。两条链路都重新校验附件归属、有效期、文件类型和容量，不依赖 OCR 成功。AI 保存使用与展示文件名解耦的随机 OBS 对象键，并与普通直传共用账号行锁，避免同名并发覆写对象或产生重复记录
- “保存到云空间”和“创建图片笔记”是确定性直达动作：输入区用结构化编辑器收集最终文件名、目标文件夹、笔记标题和图片说明，再通过白名单接口 `/chat/agent/actions/prepare` 生成确认，不经过 LLM 猜测参数，也不消耗 AI 额度。自然语言请求仍复用同一工具、文件夹解析和确认链路
- Agent 通用交互协议支持 `single_choice`、`multi_choice` 和 `confirmation` 三种展示类型。交互规范、白名单选项和后续 resolver 动作只保存在 Redis，前端仅提交 option ID；`/chat/agent/interactions/respond` 原子认领第一次回答并短期回放结果。普通选择只澄清参数，涉及写入时会把同一随机 token 晋级成标准确认令牌，仍须最终确认，不允许用选择卡绕过写授权
- 保存目标文件夹不存在时，选择卡提供“新建并保存 / 改存根目录 / 选择其他已有文件夹”。`create_if_missing` 在保存事务内重新核验并按需创建文件夹，文件夹记录与文件记录同事务提交；账号行锁、附件归属、容量检查和随机 OBS 对象键仍沿用标准附件保存链路
- Agent 收藏书签复用同一书签地址解析器。自然语言中出现一个或多个候选网址时，服务端把候选白名单保存在交互上下文，前端只回传 `candidate_N`；选择后再次规范化、探活并生成标准写入确认。用户不能通过篡改 option ID 注入其他网址，选择候选也不能绕过最终确认。
- 新会话首屏按当前页面展示高价值固定快捷提问；完成一次正常回答后，服务端以本轮问题、截断回答、来源类型和工具结果为短时上下文，异步生成 3 条相关追问。生成过程不阻塞主回答、不计入用户可见 AI 额度，超时、异常或结果不合格时使用规则/页面问题降级；待确认与待选择操作不会展示普通追问。快捷提问属于“一键提问”，点击后直接发送，并在请求开始前用前端短锁避免快速双击重复发送；附件区的“总结文件”“整理成笔记”等提示词建议只回填并聚焦输入区，已有草稿时追加而不覆盖，发送始终以用户最终文本为准
- 云空间文件工具可按文件夹 ID 或精确名称查询；名称重复时不猜测目标。`query_files` 返回文件与所属文件夹，`query_cloud_folders` 提供当前账号的可选文件夹
- PDF 优先读取原生文字层；没有文字层时由文档 Worker 使用本机 Poppler 逐页渲染，再调用本机 Tesseract（默认 `chi_sim+eng`）OCR。图片附件直接进入相同的本地 OCR 流程，不调用第三方 OCR API
- OCR 默认最多处理 20 页图片型 PDF、单张图片最多 2400 万像素，并对渲染、单页识别和整份文档设置独立超时；所有临时文件使用随机私有目录并在成功或失败后清理
- 文档正文由独立 `documentWorker.js` 从 OBS 拉取并解析，主 HTTP 进程只负责签名、鉴权、任务创建、状态查询和片段检索
- 临时文件使用 `ai-temp/{userId}/{sourceId}/` 独立前缀并在 24 小时后清理；云文件永久删除、覆盖或重命名时同步使解析缓存失效
- Agent 只接收服务端按问题检索出的受控片段，文件内容明确视为不可信资料；来源卡片由服务端生成真实定位
- 笔记正文进入 Agent 前由 `util/noteSemantic.js` 统一解析 HTML/Markdown，保留标题、段落、普通列表、复选任务、表格、引用、代码、链接和图片引用；`[x]`/`[ ]` 状态直接以正文中的复选框为准，普通列表不计入任务统计
- 单篇笔记细读使用 `read_note`，图片文字识别拆为通用只读工具 `analyze_resource_images`。前者只返回结构化正文和图片引用，后者按资源归属按需复用本地 OCR；本站笔记图片还必须命中 `note_images` 登记，单轮最多识别 3 张并使用内容哈希缓存
- 工具调用是结果驱动的有界多轮链路：上一轮失败、空结果或声明存在可选后续能力时，模型才能继续规划；后续仅允许已授权只读工具，默认最多 3 轮工具调用，最后再生成回答

## 共建轻笺

- `/co-build` 和 `/co-build/:id` 对游客开放公开内容；提交、投票和补充要求登录，Root 负责审核、合并、回复、进度和上线关联
- 桌面端游客入口位于顶部导航，登录后入口位于桌面端个人中心；移动端不主动展示入口但允许链接直达
- `source_type=user` 表示真实用户建议，`source_type=official` 表示“轻笺团队”的官方规划，两者在接口和 UI 中始终明确区分
- 私密意见反馈继续使用原 `opinion` 流程，不会被共建轻笺公共接口读取或自动公开
- 投票明细表以 `(request_id, user_id)` 唯一约束，并在事务中重新计数；提交者和支持者可接收进度通知，用户可在设置中关闭

## 快速添加与待整理

- `resource_inbox` 是跨资源关系表，不复制书签、笔记或文件正文；资源本体仍是唯一事实源
- 顶部“快速添加”支持 URL、Markdown 文本、文件和待办；资源创建与加入待整理在同一业务事务或确认链中完成，待办则直接进入待办列表
- 加入操作以 `(user_id, resource_type, resource_id)` 幂等；完成整理只更新关系状态，不修改资源本体
- 列表查询、批量完成与重新加入都必须校验当前资源主体归属；资源删除时清理对应关系
- 资源中心及书签、笔记、云空间现有菜单统一复用 `useInboxEnqueue` 手动入队；接口失败显示可重试错误态，不伪装成空列表
- “快速添加”是登录用户的全局操作；待整理不作为独立一级导航，而作为资源中心的状态视图保留，`/inbox` 路由继续兼容已有入口
- 管理员维护游客工作区时，可维护归属于该游客的书签、笔记、云空间文件、文件夹、标签及待整理关系；仍按目标账号容量校验，并禁止账号权益写入与永久删除

## 待处理与待办

- `/inbox` 页面统一展示待整理资源与待办，产品入口名称为“待处理”，原路由保持兼容
- 待整理资源继续使用 `resource_inbox`；待办独立存入 `todo_items`，不能伪装成笔记或资源关系
- 待办支持标题、说明、简易清单、优先级和截止时间；清单只在“待处理”执行态勾选，创建/编辑态仅负责录入
- 提醒计划存入 `todo_reminders`，支持单次/周期计划及站内/邮箱渠道；周期计划以 `scheduled_at` 保存下一次执行时间，超过 `repeat_end_at` 自动结束
- 待办完成或删除不会修改任何书签、笔记或文件；管理员预览首期只允许读取，不允许代用户写入待办
- 待办提醒由服务端定时扫描 `todo_reminders`，先原子抢占再投递；站内渠道写入统一通知中心，邮件渠道使用服务端 SMTP 配置

## 日志白名单

- 浏览器请求在首个 API 发出前同步生成传统指纹，并同时携带本地生成的稳定 `X-Log-Device-Id`；稳定标识仅用于 root 主动配置的日志排除，不参与认证或权限判断
- 白名单主体继续存于 `log_exclude`，一个白名单可在 `log_exclude_devices` 关联多个稳定设备标识，以兼容正式域名、localhost、不同浏览器配置等独立本地存储来源
- 已有指纹白名单命中携带稳定设备标识的请求时自动完成关联，不提供也不需要单独的“升级”操作
- API 日志、操作日志、转化漏斗以及注册接口的手动日志写入统一调用 `isSelfTraffic`，稳定设备标识优先、浏览器指纹作为兼容和自动关联依据

## 标签智能选图

- 标签新增与编辑共用 `TagIconPicker.vue`，支持中文或英文搜索 Iconify；桌面端和移动端保持同一套能力
- 英文关键词直接检索，中文标签由当前 Agent LLM 转换成 2～4 个英文图标关键词；AI 不生成 SVG
- 搜索阶段只返回 Iconify 图标名称供前端按需预览，选中后后端从固定 Iconify API 拉取 SVG、执行标签与危险属性白名单校验，再编码为 Data URL 写入现有 `tag.icon_url`
- 图标搜索仅允许预设的开源图标集和固定上游域名，并带超时、内存缓存、本地中文关键词降级；上游失败不影响标签正常保存
- Iconify 图标默认保留 SVG 的 `currentColor`；用户选择固定颜色时，将颜色和可恢复默认的标记直接编码进现有 `tag.icon_url`，不增加独立颜色字段

## 关键流程

### 认证流程

```
请求 → Cookie → express-session → req.session.userId
  → 查询 user 表 → req.user { id, role, alias, ... }
```

### 游客转化漏斗

```
page_view（打开站点）→ wall_hit（触发拦截）→ cta_click（点注册）→ register（注册成功）
```

- 仅统计游客（未登录用户）
- 注册成功按 fingerprint 去重，事件由 `conversion_events` 表记录
