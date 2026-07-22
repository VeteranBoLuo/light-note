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
│   ├── aiConversationHandle.js # AI 持久会话、消息、反馈、导出与结果复用
│   ├── aiChangeSetHandle.js # AI 可审阅变更集、执行与撤销
│   ├── aiChangeSetProposalHandle.js # 模型整理建议到受限 Change Set 草稿
│   ├── aiMemoryHandle.js   # AI 候选记忆与记忆账本
│   ├── aiResponseHandle.js # AI SSE 终态恢复
│   ├── aiTelemetryHandle.js # 无正文 AI 产品事件接收
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
    ├── aiConversationService.js # 持久会话、消息、来源、证据、反馈与保留期
    ├── aiChangeSetService.js # 变更预览、乐观锁、回执与撤销
    ├── aiMemoryService.js # 候选记忆、确认、范围与过期控制
    ├── aiResponseRecoveryService.js # SSE 终态短期快照与恢复
    ├── aiProductTelemetry.js # 无正文 AI 产品事件与保留期
    ├── aiArtifactRetention.js # Change Set 可选产物 TTL
    ├── aiUserDataExport.js # 账号级 AI 数据 JSON 导出与排除清单
    ├── personalKnowledgeSearch.js # 个人知识统一词法检索
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

| 表                                             | 作用                          | 主键类型      |
| ---------------------------------------------- | ----------------------------- | ------------- |
| `user`                                         | 用户                          | UUID          |
| `bookmark`                                     | 书签                          | UUID          |
| `note`                                         | 笔记                          | UUID          |
| `files`                                        | 云空间文件                    | 自增          |
| `folder`                                       | 云空间文件夹                  | 自增          |
| `tag`                                          | 标签                          | UUID          |
| `resource_tag_relations`                       | 资源-标签关联                 | 无独立 id     |
| `resource_inbox`                               | 书签/笔记/文件待整理关系      | UUID          |
| `todo_items`                                   | 待处理中的待办事项            | UUID          |
| `todo_reminders`                               | 待办提醒调度记录              | UUID          |
| `tag_relations`                                | 标签-标签关联                 | 无独立 id     |
| `api_logs`                                     | API 请求日志                  | UUID          |
| `operation_logs`                               | 操作日志                      | UUID          |
| `security_events`                              | 安全事件                      | 自增          |
| `conversion_events`                            | 游客转化事件                  | 自增          |
| `admin_context_audit`                          | 管理员预览与内容维护审计      | UUID          |
| `agent_logs`                                   | AI 请求、用量和阶段追踪       | UUID          |
| `ai_token_usage` / `ai_token_reservations`     | AI 日额度账本与请求级原子占位 | 复合键 / 自增 |
| `ai_document_sources`                          | AI 文档来源与解析状态         | UUID          |
| `ai_document_chunks`                           | AI 文档正文片段与定位         | 自增          |
| `ai_document_jobs`                             | AI 文档异步解析任务           | 自增          |
| `ai_conversations` / `ai_messages`             | AI 持久会话与消息快照         | UUID          |
| `ai_message_sources` / `ai_message_evidence`   | 消息来源与不可变证据片段      | 自增          |
| `ai_feedback`                                  | AI 回答反馈与原因             | UUID          |
| `ai_content_chunks`                            | 个人知识统一词法索引元数据    | 自增          |
| `ai_content_generations`                       | 个人知识索引的账号级失效代际  | 账号 ID       |
| `ai_change_sets` / `ai_change_items`           | 可审阅变更集、执行回执与撤销  | UUID          |
| `ai_memories`                                  | 候选、已确认与临时记忆        | UUID          |
| `ai_response_events`                           | SSE 终态短期恢复事件          | 自增          |
| `ai_product_events`                            | 无正文 AI 产品学习事件        | UUID          |
| `note_template`                                | 用户自存笔记模板              | UUID          |
| `feature_requests`                             | 共建轻笺公开需求              | UUID          |
| `feature_request_votes`                        | 共建建议唯一投票              | 复合主键      |
| `feature_request_updates`                      | 共建建议公开时间线            | UUID          |
| `opinion`                                      | 用户反馈                      | UUID          |
| `help_config` / `help_config_draft`            | 帮助中心                      | UUID          |

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
- 产品知识检索完全在服务端本地完成：`util/knowledgeService.js` 使用 MiniSearch BM25+ 对完整 HTML/Markdown 正文分块建索引，按标题、章节标题、正文分级加权，并依次执行精确、同义词和一次编辑距离的保守降级；结果按知识条目去重，只向 Agent 提供实际命中的片段。异常时自动回退旧匹配算法，也可通过 `KNOWLEDGE_SEARCH_ENGINE=legacy` 主动回滚
- 七个写工具（含保存附件到云空间、创建图片笔记）使用 Redis 哈希键保存的一次性确认令牌；前端先展示风险、目标和影响范围，确认后按服务端保存参数执行。确认接口原子认领令牌，并以令牌摘要键短期缓存绑定 owner、session 与代管上下文的确定结果；响应丢失后同一令牌只回放原结果，不会重复写入。创建普通笔记和图片笔记还会按“账号 + 会话 + 权威参数”生成稳定业务幂等键，并映射为确定性笔记 UUID（图片同时映射为确定性存储名），所以执行结果不明、确认缓存过期后在同一会话重新确认也只会恢复原实体；新会话仍允许用户有意创建相同内容。执行中或结果待核验时前端仅允许安全重试，不允许取消或改参误消费令牌。已生成的令牌参数不允许就地篡改；“修改参数”会先作废旧令牌，再重新准备一份确认
- 待确认写操作的用户消息与助手消息按整轮标记为瞬态，确认未结算前不写入本地或服务端会话历史；自然语言触发的操作在结算后再成对保留，结构化快捷动作仅在成功后保留，避免刷新留下半截对话或把未执行动作当作后续上下文
- 笔记、书签、标签、文件、回收站恢复和知识库写入必须复用 `util/services/`；Agent 工具不得再直接拼接这些业务 SQL，以保持事务、归属、成长、转化、快照和参数校验一致
- SSE 使用 `start/tool_start/tool_result/interaction_required/tool_confirmation/sources/delta/done` 结构化事件，并保留 `requestId` 关联日志。客户端通过 `clientCapabilities: ['agent_interaction_v1']` 显式声明支持选择卡；未声明的旧页面继续收到原业务错误，避免新事件被静默忽略后卡住
- Agent 工具通过 `util/agent/sourceUtils.js` 统一生成、清洗和去重来源；来源必须携带稳定资源 ID 与显式语义目标，外链仅接受 HTTP(S)。当前语义目标覆盖笔记详情、书签原网页/编辑/快照、云文件精确预览、云文件夹、帮助中心公开文章、Root 内部知识、标签详情、网页和临时文档。普通公开知识只作为回答依据展示，不使用 SEO 页面兜底跳转；知识来源只有在 `category = '帮助中心'` 且 `status = 'public'` 时才进入站内 `/help?article=<id>`。帮助中心、Root 知识库、云空间文件/文件夹和书签快照均把资源 ID 写入查询参数，刷新与浏览器前进后退可恢复同一内容。来源打开全屏文件预览时会注册顶层 Escape 锁：第一次按键只关闭当前预览，释放后下一次按键才关闭 AI 抽屉；长按产生的重复事件不会穿透到下一层
- 用户可为单条消息选择书签、笔记、文件或标签上下文；后端重新校验归属后读取，不信任前端正文
- AI 输入区通过“上传文件”添加本地临时文件，或通过“添加资源”选择已有云空间文件；两种方式共用解析与引用，当前支持 TXT/Markdown/CSV/PDF/DOCX/PNG/JPG/WebP，单轮最多一个附件
- 附件“原文件已上传”和“已提取文字”是两层独立能力：直传确认后即可发送、保存原文件或插入图片笔记；只有摘要、文本问答和整理文字笔记需要解析结果。输入区把文件大小、原文件可用性、文字提取状态和云空间保存状态分开呈现；仅 `queued/parsing` 使用轻量动态反馈，`ready/no_text/failed` 使用稳定的成功、提醒或错误语义，并遵守系统减少动态效果设置。OCR 没有识别到文字时，数据库沿用 `ready + NO_TEXT_CONTENT`，接口映射为 `no_text`，不把原文件误判为失败
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

### AI 工作区与持久对象

AI 前端由 `useAiAssistantStore` 承担会话域、草稿、材料、附件、滚动位置和活动请求租约，`AiWorkspaceShell` 承载问答产品界面。Store v3 的持久键与运行时 lease 都包含 actor、subject、mode、context ID 四维；切换同一 subject/mode 的管理员授权 context 也会中止旧请求并进入全新本地域。旧 v2 三维状态只允许普通 self 账号一次性安全迁移，管理员旧状态不复用。普通桌面问答使用无蒙层、可调宽且关闭不销毁的 `BDrawer`，移动端继续使用全屏容器。笔记详情、笔记库、全局搜索、书签管理、云空间和标签详情通过统一的 `AiEntry` 事件传递受控 `contextRefs`、建议意图和查询：书签/云文件单项入口默认 summarize，批量入口默认 compare，一次只带前 5 个权威 type/ID/title 并明确提示截断；标签详情携带当前 tag 的权威 ID/name 并建议 find-related；既有专用书签整理弹窗继续保留。服务端仍重新校验资源归属，不能把入口 payload、title 或前端选择状态当作权限依据。系统分享尚未接入统一入口。

所有需要按会话身份隔离的 AI 工作区顶层对象使用四维 owner 域：

```text
(actor_user_id, subject_user_id, admin_context_mode, admin_context_id)
```

- 普通上下文要求 actor 等于 subject，且 `admin_context_id IS NULL`；管理员上下文要求 Root、有效上下文 ID 和明确的 `readonly` / `maintain` 模式。
- SQL 查询使用 `admin_context_id <=> ?` 做 NULL-safe 精确匹配，不能只按 actor、subject 或 mode 查询。
- 消息、来源、证据和 Change Item 等子表通过已经完成四维校验的父对象访问；`ai_content_chunks` 等账号派生索引按 subject 隔离，`agent_logs` 与配额账本按各自安全主体模型隔离。不能为了复用四维模板而伪造不存在的列，也不能因子表没有重复 owner 列就绕过父对象校验。
- `readonly` 只允许读取已存在的会话、变更集和记忆；创建、更新、删除、反馈等持久状态写入由独立 `AI_STATE_WRITE` / `ACCOUNT_WRITE` / `CONTENT_WRITE` 策略阻断。

持久会话链路包括：

- `ai_conversations` 保存标题、范围、归档状态、保留策略和分支谱系；`ai_messages` 保存消息、请求/追踪 ID、材料快照、活动、覆盖度和答案版本组。
- 来源和证据分别进入 `ai_message_sources` 与 `ai_message_evidence`；客户端提交的消息 ID 不被信任，服务端生成 UUID，并仅以 `(conversation_id, request_id, role)` 做 owner 内幂等。
- 会话中心支持列表、搜索、重命名、归档、单条删除/撤销、导出和“清除全部 AI 数据”。单条删除先在服务端改为隐藏状态，默认提供 15 秒（可配置 5 秒～2 分钟）的权威撤销窗口；窗口结束后定时器会事务清理关联记忆、Change Set 与会话子表，应用重启或定时器丢失时由会话保留调度器兜底。UI 用 `BCard` 展示撤销条，但是否可恢复最终由服务端状态与时间判断。总清除是无撤销事务：普通 self/normal 账号按 `subject_user_id` 清除该主体全部可控 AI 对象，包含曾由管理员授权上下文为该主体产生的对象，响应 `scope=subject_user`；管理员 `maintain` 调用只清当前 actor + subject + mode + context 四维域，响应 `scope=owner_domain`，`readonly` 不能调用。两种范围都覆盖会话、记忆、Change Set、产品事件与 SSE 恢复事件；普通 self 还会在同一事务推进 `ai_content_generations` 并删除 `ai_content_chunks`，提交后只驱逐本进程缓存，代际/schema 失败会让整个清除回滚；owner-domain 清除不触碰 subject 级索引代际。`agent_logs`、配额用量和请求占位账本按独立安全/运营保留策略保留。任何必需 AI 表或字段缺失时，总清除返回 `AI_DATA_CLEAR_SCHEMA_UNAVAILABLE`（503）、回滚整个事务，不会把“未检查”误报为“已清空”。
- 会话谱系以 `root_conversation_id / parent_conversation_id / branch_from_message_id` 保存，并由 owner 四维 + live retention 查询；从指定消息创建分支会在同一事务克隆截至该点的消息与 parent 映射，继承 retention/expire 后立即打开，超过 200 条安全上限则返回 `CONVERSATION_BRANCH_TOO_LARGE`（409）且不部分写。fresh schema 的 root 为 NOT NULL；既有库增量迁移保持 nullable，使滚动/回滚旧后端可继续插入 NULL 独立根，新版查询同时按 root ID 或自身 ID 兼容。UI 用 B 组件展示最多 200 节点的分支树和前后导航；遗留会话只回填 `root=id`，不从标题/正文推断历史关系。
- 重新生成保留全部旧答案，并用 `versionGroupId` 形成同会话版本组；版本 API 只读取 owner 内同 conversation 的 completed assistant 消息，最多 50 个。回答下方切换器只滚动/聚焦已保存版本，不隐藏、覆盖或删除旧答案；目标不在当前最多 200 条已加载消息时明确提示不可定位。`aiCloudHistory=false` 仍阻断自动 hydrate/create/save，但不误伤用户显式打开历史、谱系、分支和版本管理。
- 账号 Settings 的“全量数据” JSON 导出同样按 `subject_user_id` 覆盖该账号的会话/消息/来源/证据/反馈、记忆、Change Set、产品事件、`agent_logs` 和配额用量，并返回 schema 版本、分域计数、不可用分域和排除清单。可重建内容/文档索引、10 分钟 SSE 恢复事件与请求级配额占位不具可移植性，因此显式列为排除项。普通 self 总清除和导出虽然都是 subject 级，包含/排除与保留政策仍不同；管理员 maintain 清除则是更窄的 owner 域。接口和产品文案必须以返回的 scope 与 retained/exclusions 解释，不能混用。
- 会话中心已用 `BSelect` 提供逐会话 `standard` / `temporary` / `indefinite` 保留策略；temporary 可选 1、7、30 天，显示权威到期时间及自动级联会话、消息、来源/证据、记忆、Change Set 的范围。服务端严格校验 patch，回显时只映射最近合法档位；temporary 由启动/周期调度器物理删除，同一调度器也收口超过撤销窗口的软删除会话。standard/indefinite 的长期产品政策仍需验收。
- 登录账号的 Settings AI 区提供 `aiCloudHistory` 云端会话历史开关，使用账号 preferences 同步。关闭后 `ChatContainer` 不再自动 hydrate/create/save 云会话并清除当前 `cloudConversationId`；服务端 create/save 自动持久化 handler 也会按 subject 权威读取偏好，关闭或主体不可验证时失败关闭并返回 `AI_CLOUD_HISTORY_DISABLED`（409）。缺少该偏好字段默认开启，以兼容既有账号。本地 v3 Store 历史继续保留，既有云端历史不会因切换而删除；Change Set 等显式后台成果的直接 Service 写入、分支创建和历史管理不被自动持久化门禁误伤。仍需真实账号和多设备偏好传播验证。草稿和尚未发送的材料始终是本地窗口状态，不能被当作长期记忆。

### 证据与检索

- Agent 将资源级 `sourceId` 与本轮不可变的 `evidenceRef` 分开；证据包含资源版本、locator、短摘录及摘要哈希，正文只把真实存在的 citation key 渲染成可交互引用。
- Final 完成后会审计引用编号，移除不存在的编号，并把权威正文、证据、覆盖度和审计结果放入终态事件。该检查证明“引用存在”，不等同于自然语言蕴含正确；蕴含质量仍需人工标注和抽检。
- `personalKnowledgeSearch.js` 从笔记、书签快照、已解析文件/OCR、待办和标签关系建立按用户隔离的 MiniSearch 词法索引；标题、标签、章节和正文分级加权，每个资源限制命中片段数。`ai_content_chunks` 是可审计的持久分块镜像，运行时索引仍从权威业务表重建；资源更新通过共享 Service 主动失效，3 分钟 TTL 只作为进程内缓存寿命，不承担跨实例正确性。
- 个人索引失效协议支持在业务事务中递增 `ai_content_generations` 的 per-subject 代际并物理删除该账号持久 chunk；总清除已使用强原子路径，Change Set 等 AI 安全写闭环也必须复用该路径。缓存命中、构建前后和 chunk 持久化都会核对数据库代际；持久化事务对代际行 `FOR UPDATE` 并执行 CAS，旧实例构建出的快照不能覆盖新状态。候选命中返回前还会按 owner、`del_flag` 与 `resourceVersion` 重新查询权威业务表，校验不可用时失败关闭，不把已删除、转移归属或旧版本缓存正文作为证据。跨实例旧快照回写和已删除资源命中已有回归测试；但部分 legacy 笔记、书签、文件、快照和创建后副作用仍在业务提交后才旁路推进代际，尚未证明所有入口与资源写同事务。这些入口的剩余风险主要是新内容短时漏召回或缓存重建延迟；上线前仍要逐入口审计/迁移并验证 MySQL 5.7 锁竞争、故障恢复和大账号性能，不能把现有机制表述成全局强一致。

### Change Set 与记忆

- 整理模式先读取并校验用户拥有的笔记、书签和文件，再让模型只生成白名单草稿；模型返回的资源、标签和文件夹 ID 会与服务端允许集合再次求交，不能借 Prompt 注入新增目标。
- `ai_change_sets` / `ai_change_items` 支持设置标签、移动文件、更新笔记元信息/正文、更新书签元信息和创建待办。执行前比较权威状态哈希；冲突时拒绝写入。执行后保存逐项回执，可在资源未再次变化时执行补偿撤销。
- Change Set 的首次 apply 和失败后 retry 都是整批单事务：任何一项或最终提交失败都会回滚全部资源写，变更集保持 `draft`，UI 只能显示阶段与“已提交 0/N”；成功 commit 后才显示 N/N 并保存逐项回执，不能把事务内已尝试数量伪装成部分成功。失败诊断只保存稳定错误码、阶段、失败项 ID、已尝试数量（明确均已回滚）、冻结选择、时间和 `previewRevision`，不保存 raw message 或正文。用户必须先触发四维 owner + maintain 约束下的 revalidate，服务端重读权威资源、刷新 before/hash 并递增 revision，仍冻结原选择；再次二次确认后，retry 只采用服务端快照中的 item IDs 和客户端提交的 expected revision。任何预览编辑都会清掉旧 retry 并递增 revision。apply/undo 还会在资源事务内严格推进个人索引 generation 并清 chunk，失败返回稳定 503 且整体回滚；commit 后只驱逐本进程缓存。
- 回答可保存为新笔记，或以追加、智能合并、选段应用三种方式生成 `update_note_content` Change Set；正文保留来源与证据。选段清单由服务端从 owner 校验后的已持久化完成回答解析，块 ID 同时绑定顺序与内容摘要；客户端只提交 ID，服务端重新解析并拒绝伪造/过期选择，再进行目标笔记版本校验、预览、确认、回执与安全撤销。这里的“选段”是选择 AI 回答结构块追加到目标笔记，编辑器光标位置、指定章节以及原文选区的就地 Apply/Reject 仍未统一接入。
- **⚠️ 状态(2026-07-22):长期记忆已全局关闭。** 前端普通会话发送 `memoryMode:'off'`,后端 `agentHandle.js` 有 `AI_MEMORY_ENABLED=false` 硬开关,强制不读取记忆、不注入 Prompt、不推断/写入候选;前端记忆账本入口与回答下方"影响卡片"已移除。以下两条为记忆子系统**原设计**,当前版本不生效;记忆若日后重做成完整可控功能再恢复。详见 `docs/fix/codex-review-fix.md` 的 P1-2。
- `ai_memories` 使用“候选 → 用户确认 → 生效”流程，区分全局、会话和资源范围，支持暂停、更正、过期、删除和全部清除；临时会话请求显式关闭记忆读写。管理员代管上下文不把目标账号记忆注入 Agent。
- 正常 Agent 轮次会发送经过白名单收敛的 `memory_context` 透明度事件：只披露 `used/not_used`、0～20 的使用数量、有限类型/范围枚举和未使用原因，不含记忆 ID/HMAC、正文、来源、时间或底层错误。`used` 元数据与实际注入 Prompt 的 `getActiveAiMemoriesForPrompt` 结果来自同一份快照，后者只含当前四维 owner 下已确认、active、未过期、可信来源且范围匹配的记忆；访客、翻译、管理员代管和临时会话不注入。事件会在 SSE、会话 activity 持久化、客户端 Store 与恢复链分别再次归一化，回答下方用 `BButton` 和 `icon.ai.memory` 展示并可键盘进入记忆账本；旧历史缺少元数据时不补造说明。它证明“哪些已确认记忆进入本轮上下文”，不证明模型答案一定受其因果影响，也不替代记忆冲突检测。
- `AiMemoryLedger` 还会在当前 owner 的最多 100 条 live 记忆内提供基础重叠复核：仅把 `candidate/active/paused` 中 scope type、结构化 scope 与 memory type 相同、规范化正文不同的记录列为 peers，并展示其正文和状态。UI 明示这些内容“不一定冲突”、系统不会自动覆盖，最终更正、暂停或删除仍由用户决定；这是可解释的同范围分组，不是语义判冲、自动解冲或质量结论。

### SSE 终态恢复、产品事件与评测

- Agent SSE 协议版本为 `2.0`。所有事件带单调递增 `eventId`、`requestId` 和 `protocolVersion`，包括开始、阶段、heartbeat、工具、增量、来源/引用、完成与失败；前端收到权威 `response.completed.answer` 后替换流式临时正文。
- `ai_response_events` 只在形成 `completed` / `failed` 终态后保存本轮事件与权威快照，TTL 为 10 分钟。客户端在连接异常且没有可靠终态时只尝试一次 `/chat/agent/recover`，恢复结果按 owner 四维精确校验并整体替换本地聚合状态，不与半截 delta 叠加。应用启动链已注册恢复事件批量清理，运行时是否按期执行仍要由预发布日志和 TTL 数据验证。
- `ai_product_events` 只接受事件名和白名单枚举、布尔值、数量与标识维度；标识使用 `AI_TELEMETRY_HMAC_SECRET` 做 HMAC，错误只保留稳定类别，不保存问题、回答、标题或摘录。默认保留期为 180 天（可在 30～730 天内配置），应用启动链已注册受控多批清理：默认每轮最多 25 批、每批 10000 行，代码上限 100 批，并返回 `batches` / `backlogRemaining`；启动或周期清理达到上限仍有积压时只输出无正文警告。预发布仍需用到期数据和数据库指标证明调度真实执行且批量删除不会影响请求链。
- `aiArtifactRetention.js` 提供 Change Set 单域可选 TTL，天数变量必须显式配置 1～3650 的正整数才启用，默认关闭；共享调度默认每日一次、限制 10 分钟～7 天。每批在事务内 `FOR UPDATE`、删除前重验状态并有界处理，支持多实例竞争、幂等、缺表跳过和 backlog。Change Set 只清 `applied/undone/expired`，在选择和删除时排除 indefinite 会话。清理器已接启动链，但具体天数未经产品/隐私批准，不能默认启用。
- 文档 Worker、标签图标、路由装载、文件与笔记库等本轮 AI 可达错误路径已移除 raw `error.message/stack` 输出；file/note AI 相关读写路由也不再把对象存储 key 或原始异常返回客户端，Conversation/Recovery 调度日志统一为稳定错误码。这次代码扫描不能替代预发布合成 canary 和真实进程日志采集，新增路径仍须遵守同一 scrub 规则。
- `evaluation/ai-assistant/` 的 schema v2 提供 267 条完全合成任务、49 个合成来源和六维确定性评分器，覆盖 10 个能力域且每域至少 20 条；owner 四维、请求 lifecycle、反凑数校验和生成器 `--check` 都进入数据契约。它不加载 `.env`、不连接数据库/Redis/模型、也不访问网络；`.github/workflows/ci.yml` 已在测试后运行生成器一致性检查与 `eval:ai-assistant`，本地结构化数量和静态 CI 门槛已经达到。仍缺真实 Agent adapter/回放、自然语言有用性评测和人工引用蕴含标注。

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

- 浏览器请求在首个 API 发出前同步生成传统指纹，并同时携带本地生成的稳定 `X-Log-Device-Id` 与同值 `X-Device-Id`；前者用于 root 主动配置的日志排除，后者只用于同账号登录设备会话归并，均不参与认证、权限或设备信任判断
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

登录设备页展示的是“设备组”而不是原始 session 行。浏览器请求会携带本地持久的随机设备标识；服务端只保存其 SHA-256 `user_sessions.device_key` 摘要，并在同一账号、同一浏览器再次登录时事务性轮换为一条会话，避免重复登录堆积为多台设备。该标识不参与认证、权限或设备信任判断。升级前没有设备摘要的历史会话不会根据 IP 或 UA 猜测归属，而是逐条独立展示和撤销，避免共享网络或浏览器升级造成远端会话误并入当前设备；“下线设备”会撤销该设备组包含的全部 session。

### 游客转化漏斗

```
page_view（打开站点）→ wall_hit（触发拦截）→ cta_click（点注册）→ register（注册成功）
```

- 仅统计游客（未登录用户）
- 注册成功按 fingerprint 去重，事件由 `conversion_events` 表记录

## 部署与 Schema 现状 · 易踩坑

> 本节记录几条不看代码就不会知道、但一踩就是坑的隐性约束，接手前务必先读。

### 部署机制：本地打包 → rsync 上传

- `deploy:server` = 本地 `pnpm deploy --legacy` 打平自包含 `node_modules` → rsync 增量（`--delete`）上传 → `pm2 restart app`（含 `documentWorker`）；`deploy:web` 同理传 `dist`。
- **因此不能引入平台相关的 native node 库**（如 sharp）：本地装的是当前平台（mac）二进制，rsync 到 linux 服务器会崩。项目一贯用系统 CLI（`tesseract` / `convert`(ImageMagick) / `pdftoppm`，走 `execFile`）做图像/OCR，正是为规避这一点。
- 部署脚本健康检查**不 gate 部署、失败不自动回滚**；非 200 需手动执行脚本末尾的回滚命令（切回服务器上的 `${REMOTE}_bak_*` 硬链接快照）。

### Schema 现状：migrations 只是冰山一角

- **建表 schema 是双轨,两条并存,排查时都要看**：
  - **轨道 A — 手工 `migrations/*.sql`**（现约 57 个 dated 文件）：**没有自动迁移 runner**,靠人工/DBA 执行(如 `rename_admin_to_user`、`conversion_events_ip`),deploy 脚本不跑迁移;建表直接用 `CREATE TABLE IF NOT EXISTS`(MySQL 5.7 支持)。已有 `migrations/schema-assertions.sql` 做启动/发布期 schema 断言(约定"有输出=失败",目前主要覆盖 AI 工作区表)。
  - **轨道 B — app 启动时 `ensure*()` 运行时建表/补列**：`app.js` 启动依次调 7 个——`ensureSecurityTables` / `ensureNotificationTable`（`notification` + `batch_id`/`recalled` 列）/ `ensurePointsSchema`（建 `points_log` / `user_cosmetics` / `user_item` / `ai_daily_bonus` + `ALTER user_growth` 补 `points`/`equipped_title`/`equipped_frame`/`storage_bonus_mb`/`lottery_*` 列）/ `ensureBookmarkSnapshotTable` / `ensureBookmarkHealthTable` / `ensureFeatureRequestTables` / `ensureAiDocumentSchema`。运行时**加列**因 MySQL 5.7 不支持 `ADD COLUMN IF NOT EXISTS`,才先查 `information_schema` 再条件 `ALTER`(这是加列的手法,不是 A 轨 CREATE TABLE 的)。
  - 同一张表可能被两轨分建:如 `growth_events` 主表在迁移 `20260708_growth.sql`,而 `user_growth` 的积分/装扮/抽奖列由 `ensurePointsSchema` 运行时补。**只读 `migrations/` 会漏掉 B 轨的表;只 grep 代码里的 `CREATE TABLE` 又会漏掉 A 轨迁移建的表——两边都要查,别信任何一侧的"未命中"。**
- **Schema 漂移（两轨都没有的）**：整张 `note_versions`、`files.share_token` 被代码大量使用,却在 `migrations/`、`tag_db.sql`、`ensure*()` 里都无任何 DDL(应为生产手工应用或基线 dump 过期)。**全新环境按仓库建库会缺表/缺列报错,以线上真实库为准。**（原漂移列 `note.type`、`bookmark.is_top` 已于 2026-07-17 补进 migration,如 `20260717_note_pin.sql`,不再漂移。）
- 基线 `tag_db.sql` 可能已过期，仍含 `note_tags` / `tag_bookmark_relations` 等旧表；现行代码走 `tag` + `resource_tag_relations` 统一多态关联。

### 安全模块会自动封 IP —— 密集运维流量小心

- `attackMonitor` 中间件：敏感路径探测（`.env`/`.git`/`wp-admin` 等）判 **SCANNER**、高频判 FLOOD，风险分累积到阈值（`SECURITY_IP_AUTO_BAN_RISK_SCORE`，默认 80）即自动封该 IP 30 分钟。
- 密集的 dev / 运维 / 预渲染（prerender、build）流量踩过这个雷；自救：清 `security_ip_reputation` 对应行。白名单 IP / 内网回环 / root 用户豁免。

### 成长系统是全站横切依赖

- 段位特权（`util/growth.js` 的 `RANKS[].perks`）被多个模块读取：**AI 每日 token 额度**（`aiQuota`）、**回收站保留天数**（`trashHandle`）、**云空间容量**、**每日抽奖次数**。改等级阈值或特权表会牵连这些模块，不是孤立改动。

### 分享链接安全 —— 明确未完成

- 文件分享 `files.share_token` 由 `crypto.randomBytes(16)` 生成，**永久有效、无有效期、无提取码、无失效/撤销机制**；token 与文件名明文在 URL path。"有效期 / 提取码 / 失效" 是已知待办，需新增列或独立 share 表 + 撤销接口，勿误以为已完善。
