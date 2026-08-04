# 轻笺架构文档

## 项目概览

轻笺是一个全栈书签/笔记/文件管理平台。采用 pnpm monorepo 管理前后端代码。

```
light-note/
├── apps/
│   ├── android/      # Android WebView 原生壳
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
│   ├── updateLog.js       # 更新日志公开读取、Root 编辑与 OBS 图片
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
│   ├── updateLogHandle.js # 更新日志 CRUD 与图片生命周期
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
    ├── accountDeletion.js # 账号注销验证码、去标识化与可重试物理清理
    ├── personalKnowledgeSearch.js # 个人知识统一词法检索
    ├── adminContextStore.js # Redis 管理员上下文（actor/subject 分离）
    ├── adminRoutePolicy.js  # 管理员上下文显式路由策略
    ├── resourceInbox.js     # 待整理关系与归属服务
    ├── updateLog.js         # 更新日志校验、旧数据兼容与图片引用解析
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

### Android 客户端

- Android 工程位于 `apps/android`，使用 Java、Android Gradle Plugin 8.7.3、Gradle 8.9、JDK 17 和 Android WebView。

### 移动端首页规则（唯一事实源）

移动端不存在「默认首页」设置项：所有默认落点固定为「今日」，只有第一次访问的手机浏览器才会看到官网。

| 场景                                        | 落点                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| 手机浏览器**第一次**访问根路径 `/`          | 官网（APK 与移动 PWA 永远不展示官网）                                     |
| 手机浏览器回访、APK / PWA 启动、`/app` 入口 | 今日 `/workbenches`                                                       |
| 新注册成功后第一次进入                      | 今日（桌面端仍固定书签 `/home`）                                          |
| 已有用户登录成功                            | 今日                                                                      |
| 点击顶栏 Logo                               | 今日                                                                      |
| 点击底部「资料」                            | 当前会话内回到上次打开的资料页签；新会话（重开 App / 新标签页）重置为书签 |

实现要点：

- `utils/appEntry.ts` 的四个入口函数（`getRuntimeApplicationEntryPath` / `getRuntimeApplicationHomePath` / `getRuntimePostRegistrationPath` / `getRuntimeGuestEntryPath`）在移动布局或 `android-app` 运行时统一返回 `MOBILE_TODAY_PATH`，不读账号首页偏好，也不恢复最近资料页签。
- 「资料」页签记忆存 **sessionStorage** 而非 localStorage，这是「重开 App 重置为书签」的实现方式；早期版本的 localStorage 残留会在读取时顺带清除。
- 首访分流由 `vite/earlyAppEntryBootstrap.ts` 在首次绘制前完成，判定顺序为：APK → 视口宽度 → PWA standalone → 本地首访/身份记录 → 展示官网。该守卫只作用于根路径 `/`，不改变 HTTP 响应与索引产物。
- 「默认首页」偏好只在桌面端作为设置项出现；移动端隐藏该项，因为移动端不存在可由它改变的落点。

- 正式包名为 `top.boluo66.lightnote`，Debug 使用 `.preview` 后缀，可与正式版同时安装；Release 应用入口固定为 `https://boluo66.top/app`，Debug 才允许用显式 Gradle 参数覆盖本地地址。`/app` 始终是应用入口，不能返回官网：手机布局、Android APK 与移动 PWA 统一进入「今日」（见上节移动端首页规则）；桌面浏览器与桌面 PWA 按账号默认应用首页进入，无账号偏好时回退书签 `/home`。根路径 `/` 始终保留官网；桌面应用内 Logo 进入 `/app`，移动端品牌 Logo 回到「今日」。普通移动浏览器首次访问 `/` 展示完整响应式官网并写入本地首访记录，后续访问由 `<head>` 守卫在首次绘制前进入 `/app`，既有登录/记住身份记录作为升级兼容信号；Android APK 与移动 PWA 不展示官网。
- 邮箱注册与 GitHub 首次注册成功后，移动端进入「今日」、桌面端固定书签 `/home`，都不继承设备上一个账号的最近资料模块；普通登录及 `/app` 入口仍按各自运行环境恢复最近资料或账号默认首页。
- PC 浏览器、移动浏览器、PWA 与 Android APK 的被动身份变化遵循同一规则：冷启动、刷新、自动入口分流、初始化发现游客、历史会话失效和手动退出都不能自动打开登录/注册弹窗。历史登录记录只用于移动入口兼容，不代表当前登录意图；运行中的真实会话过期仅显示非阻塞提示并降级到游客资料页。认证弹窗只由用户主动点击登录/注册，或在受保护操作的软引导中再次主动确认后打开。
- 原生壳只负责 WebView 容器、安全导航、文件选择、下载、系统返回和版本标识，书签、笔记、云空间等业务继续由 Web 端统一维护。
- Android 以 `MainActivity` 作为唯一桌面入口和 `singleTask` 任务根；隐私同意页只在未授权时由主入口内部打开。同意后重建以主页面为根的任务，Android 13+ 预测返回与旧版返回键统一走同一原生回调。底部一级导航使用替换历史而不是压栈；一级页没有浮层时，系统返回手势把整个任务移到后台但不结束 WebView 进程，再次点桌面图标恢复同一实例。详情页仍正常回退，带 history 占位的弹框/抽屉优先消费返回并关闭浮层。
- 冷启动开屏由三段接力构成，三者必须是同一套视觉，否则首帧会露出「无标识纯色」而被看成黑屏：`Theme.LightNote.Launcher` 的 `windowBackground`（`splash_window_background.xml`，Android 12 以下系统在 Activity 创建前唯一能画的东西）→ Android 12+ 的 `windowSplashScreenBackground` + `windowSplashScreenAnimatedIcon` → `MainActivity#createLaunchOverlay` 的原生等待层（等 Web 端 `app.ready` 或超时后淡出）。改动任一处的底色、标识资源或尺寸（当前为 288dp 居中）必须同步其余两处。带标识的窗口背景只给启动入口 Activity，应用内浏览器、法律文档和隐私同意页保持纯色，避免内容未铺满时透出标识。
- Android「今日」支持在列表顶部下拉刷新今日摘要、行动项和成长任务；普通移动浏览器不接管系统页面回弹，继续使用页面内刷新入口。
- Web 端通过受信消息通道或 `LightNoteAndroid/<version>` UA 识别轻笺原生环境；通用 Android `wv` 标记只用于旧 WebView 渲染兼容，不能作为轻笺 APK 身份或入口分流依据。原生 App 隐藏 PWA 安装入口，并停用 PWA 安装监听与 Service Worker 注册，避免已经安装的 APK 再次提示安装。
- SEO 只以无本地访问记录的普通浏览器语义为准：根官网始终返回同一份预渲染 HTML，保留 `index, follow`、自引用 canonical、完整标题与正文；Googlebot Smartphone、百度等窄视口爬虫和普通手机首访获得同一份完整响应式官网，不强制伪装成 PC 视口。回访分流只发生在客户端本地记录存在时，不改变 HTTP 响应与索引产物；`/app` 与业务页面继续 `noindex`。不得按搜索引擎 UA 提供不同内容。
- 隐私政策和用户协议在浏览器与 App 设置中都长期可访问；App 设置优先通过受信消息通道打开 APK 内置的离线同源文档，通道不可用时回退到网站公开文档。首次启动同意页仍由原生层负责，不能被设置入口替代。
- Release 只允许 HTTPS、关闭 WebView 调试、拒绝 SSL 错误，不使用 JavaScript Interface；文件访问和内容访问默认关闭。
- Android 源码、Gradle Wrapper 和资源进入 Git；`local.properties`、`.gradle`、`build`、APK/AAB、签名密钥及密码配置必须忽略。
- PWA 与 Android APK 并行保留。App 备案通过前 APK 仅用于受控测试，不在官网公开下载；正式签名、备案特征和 Android 开发者身份登记必须保持一致。

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

### PWA 安装

- `usePwaInstall.ts` 在应用挂载前监听 `beforeinstallprompt`；该事件是“一键安装”的必要条件，但不是充分条件。部分鸿蒙内核和套壳浏览器会下发事件却无法真正调起安装，因此还需通过可信平台/浏览器矩阵复核。
- 安装教程按“当前系统 × 当前浏览器”选择操作路径，覆盖 Chrome、Edge、华为、夸克、Firefox、360、QQ/腾讯、微信内置浏览器、Safari 等；切换查看其他设备时回退到对应系统的通用步骤。鸿蒙、iOS 以及华为、夸克等已知不可靠环境始终展示手动添加教程；标准 Android/桌面端仅 Chrome、Edge、Opera 在真实下发 `beforeinstallprompt` 时展示一键安装，避免出现按钮短暂加载但系统安装框无法调起。安装页同时说明 Android App 已开发完成、正在备案，备案通过前只提供网页添加到桌面的路径，不展示无效下载入口。
- `light-note-sw.js` 只拦截页面导航，优先走网络并在断网时返回品牌离线页；不缓存登录用户的业务接口或私有数据。Service Worker 和 manifest 均以根路径为 scope，确保从任意业务页面安装后仍进入同一轻笺应用。
- manifest 的 `start_url` 使用 `/app?source=pwa`；首屏脚本会把该来源写入当前窗口的 `sessionStorage`，作为 macOS 等容器未稳定暴露 `display-mode: standalone` 时的 API 日志运行环境兜底。该标记只用于展示与诊断，不参与身份、登录、权限或设备信任判断。
- PWA 安装能力只面向浏览器和 PWA 本身；轻笺 Android APK 内不展示个人中心、设置或官网区域的 PWA 安装入口，也不初始化上述 PWA 运行时。

## 数据库核心表

| 表                                           | 作用                           | 主键类型      |
| -------------------------------------------- | ------------------------------ | ------------- |
| `user`                                       | 用户                           | UUID          |
| `bookmark`                                   | 书签                           | UUID          |
| `note`                                       | 笔记                           | UUID          |
| `files`                                      | 云空间文件                     | 自增          |
| `folders`                                    | 云空间文件夹                   | 自增          |
| `tag`                                        | 标签                           | UUID          |
| `resource_tag_relations`                     | 资源-标签关联                  | 无独立 id     |
| `onboarding_seed_resources`                  | 注册示例资源来源标记           | 复合主键      |
| `resource_inbox`                             | 书签/笔记/文件待整理关系       | UUID          |
| `todo_items`                                 | 待处理中的待办事项             | UUID          |
| `todo_reminders`                             | 待办提醒调度记录               | UUID          |
| `email_delivery_logs`                        | 系统邮件 SMTP 投递记录         | UUID          |
| `account_deletion_requests`                  | 账号注销物理清理重试队列       | UUID          |
| `tag_relations`                              | 标签-标签关联                  | 无独立 id     |
| `api_logs`                                   | API 请求日志                   | UUID          |
| `operation_logs`                             | 操作日志                       | UUID          |
| `security_events`                            | 安全事件                       | 自增          |
| `conversion_events`                          | 游客转化事件                   | 自增          |
| `admin_context_audit`                        | 管理员预览与内容维护审计       | UUID          |
| `agent_logs`                                 | AI 请求、用量和阶段追踪        | UUID          |
| `ai_token_usage` / `ai_token_reservations`   | AI 日额度账本与请求级原子占位  | 复合键 / 自增 |
| `ai_provider_balance_snapshots`              | AI 供应商每日账户余额快照      | 自增          |
| `ai_evaluation_runs`                         | 管理员手动 AI 冒烟结构化结果   | UUID          |
| `ai_document_sources`                        | AI 文档来源与解析状态          | UUID          |
| `ai_document_chunks`                         | AI 文档正文片段与定位          | 自增          |
| `ai_document_jobs`                           | AI 文档异步解析任务            | 自增          |
| `ai_conversations` / `ai_messages`           | AI 持久会话与消息快照          | UUID          |
| `ai_message_sources` / `ai_message_evidence` | 消息来源与不可变证据片段       | 自增          |
| `ai_feedback`                                | AI 回答反馈与原因              | UUID          |
| `ai_content_chunks`                          | 个人知识统一词法索引元数据     | 自增          |
| `ai_content_generations`                     | 个人知识索引的账号级失效代际   | 账号 ID       |
| `ai_change_sets` / `ai_change_items`         | 可审阅变更集、执行回执与撤销   | UUID          |
| `ai_memories`                                | 候选、已确认与临时记忆         | UUID          |
| `ai_response_events`                         | SSE 终态短期恢复事件           | 自增          |
| `ai_product_events`                          | 无正文 AI 产品学习事件         | UUID          |
| `note_template`                              | 用户自存笔记模板               | UUID          |
| `feature_requests`                           | 共建轻笺公开需求               | UUID          |
| `feature_request_votes`                      | 共建建议唯一投票               | 复合主键      |
| `feature_request_updates`                    | 共建建议公开时间线             | UUID          |
| `update_logs`                                | Markdown 更新日志及 OBS 图片键 | UUID          |
| `opinion`                                    | 用户反馈                       | UUID          |
| `help_config` / `help_config_draft`          | 帮助中心                       | UUID          |

更新日志使用 `update_logs` 单表保存标题、发布日期、摘要、兼容摘要、标签、Markdown 正文及该条日志拥有的 OBS object key 集合。编辑器以 Markdown 为唯一正文输入，历史重点更新首次编辑时自动转换为 Markdown，`highlights` 仅作为工作台等旧读模型的自动生成兼容字段。公开正文统一经 `marked + DOMPurify` 渲染；图片存放在 `update-logs/{logId}/` 前缀，页面使用稳定站内地址，由后端为私有 OBS 对象生成短时下载签名。保存正文时按 Markdown 实际引用收敛 `image_keys`，事务提交后清理被移除的对象；删除日志同样先提交业务事务再清理 OBS。旧 `config_json` 数据由幂等迁移导入，迁移前公开读取仍可回退旧格式。

笔记模板：内置模板（日报/周报/会议纪要/读书笔记/项目计划/复盘/知识卡片）为前端常量（`config/noteTemplates.ts`，含 `{{date}}` 等占位变量的文案不进 i18n 文件）；用户自存模板存 `note_template`（每人上限 20，硬删除不接回收站），`name`（库内显示名）与 `title_template`（新笔记默认标题，可含变量）语义分离。笔记正文图片按引用计数清理：彻底删除笔记后，仅当 URL 既无 `note_images` 残留引用、也无模板正文引用时才删除物理文件；新建笔记与存为模板都会校验图片归属并登记引用。

笔记库支持多条笔记置顶：`note.is_top` 只表达整理状态，不改变 `update_time`；列表按置顶分组、自定义 `sort`、更新时间依次排序，卡片和列表使用笔记绿色标记。桌面端通过右键菜单操作，移动端通过卡片“更多”菜单操作；拖拽只改变组内顺序，置顶组始终位于普通组之前。

笔记详情目录按统一响应式断点切换：完整桌面布局显示常驻侧边目录；手机和平板/中等宽度布局在顶栏显示目录按钮，并通过底部 `BDrawer` 打开目录。两种形态复用同一标题数据、当前章节高亮和正文定位逻辑，正文没有标题时不显示入口。

书签、笔记库和云空间主列表采用服务端分页：前端首屏固定请求 48 条，接近滚动容器底部时增量合并下一页，接口同时返回当前筛选条件下的 `total / page / pageSize / hasMore`。关键词、标签、文件夹、无标签和文件分类必须先在 SQL 中完成过滤与总数统计，再应用 `LIMIT / OFFSET`；云文件只为当前页生成签名地址。书签和笔记在“全部视图”中通过前后相邻资源 ID 提交锚点移动，后端在事务内按完整同置顶分组定位并重排，因此已加载前缀可以拖拽、未加载尾部不会被局部编号覆盖；拖到当前已加载末尾只表示插入该锚点之后，只有加载到真实末尾后才能拖到全局最后。书签定位可以按页继续加载直到找到目标。标签编辑、标签详情和管理页等尚未迁移的旧调用显式使用不分页模式并保持原响应结构，后续迁移前不得依赖分页默认值。

资源中心主结果流通过 `/search/global` 的 `ordered` 分页模式，按“书签 → 笔记 → 文件 → 标签”的固定分组顺序连续取数，每批合计最多 40 条；当前类型不足一批时由后续类型补齐，并以 `{ type, offset }` 游标从准确位置续取。首批返回经过关键词、资源类型、标签、无标签、日期和排序条件后的 `typeTotals`、`hasMoreByType` 与标签筛选选项，追加批次不重复执行这些统计查询；页面只为已经加载的类型显示一次分组标题。全局快捷搜索、提及选择器等小型预览调用继续使用按类型限量的兼容模式。前端不再用 `limit=0` 拉取书签、笔记、文件和标签全量后本地筛选；请求版本号负责阻止旧关键词或旧筛选响应覆盖新结果。

资源中心批量选择分为显式 ID 与 `allMatching` 查询范围两种模式。后者只保存关键词、资源类型、标签、无标签和日期条件以及少量排除项，服务端复用搜索过滤构造器解析当前账号的完整资源集合；页面滚动加载数量不再限制“选择全部”。`/search/batchSelectionPreview` 返回权威总数和分类型计数，删除、标签更新与加入待整理分别在服务端按块处理，并继续逐项校验资源归属。AI 材料仍只接受最多 5 个显式资源，不继承全量选择语义。

搜索类型分为 `ResourceSearchType`（书签/笔记/文件/标签）与 `GlobalSearchType`（再加待办），声明在 `utils/globalSearchTypes.ts`。待办是行动对象而非资料对象：它能被全局搜索找到，但不进资料四页签、`@` 资源选择器、标签操作、待整理和资源批量删除。服务端 `normalizeSearchTypes` 只在调用方**显式**声明 `types` 含 `todo` 时才查询 `todo_items`，缺省仍是资源四类，因此资源选择器等既有调用方既不会拿到待办，也不承担额外统计查询。待办检索第一版只覆盖 `title` 与 `description`，按 `user_id + del_flag` 归属过滤，参考资料数量由 `todo_resource_refs` 同样按归属统计；未完成状态只作为同一相关度档位内的弱权重，不会让低相关度的未完成待办压过标题完全匹配的已完成待办。按标签或无标签筛选时待办整体退出结果，不伪装成"无标签资源"。完整模式新增 `todoStatus / todoPriority / todoDue` 条件，仅在选中待办时下发。

完整搜索页（移动端）也不放一排类型 Tab：类型收进底部筛选抽屉做多选，主页面只保留一行「总数 + 各类型数量」。抽屉里的待办状态与待办优先级按条件显示——只有当前选中待办时才出现，取消待办立即隐藏，因为待办不属于标签体系也不该在纯资源筛选里占位。待办条件只在选中待办时随请求下发，避免污染纯资源查询的缓存键。搜索结果里的待办不参与资源批量语义：`selectableVisibleItems` 用 `isResourceSearchType` 过滤，批量加标签、加入待整理和批量删除都取不到待办。

`mode: 'suggest'` 是快捷搜索层专用的轻量模式：只按相关度取少量候选并做类型均衡（总数最多 8 条、单类型最多 3 条，其他类型没有匹配时才用超额类型补足），不返回 `typeTotals`、`tagOptions` 和分页，前端按"账号 + 语言 + 关键词 + 类型"做 30 秒短缓存，资源写操作触发 `clearGlobalSearchCache` 时一并失效。

### 移动端搜索入口

移动端只保留一个文本搜索入口，且它始终是全局搜索，不再按页面变成局部搜索框。入口外形可以因页面空间不同而不同，但能力必须相同——都打开同一个 `MobileGlobalSearchOverlay`、用同一套取数、最近搜索、结果跳转和关闭逻辑：今日、资料、待办用宽搜索框，AI 与我的用放大镜图标（`MobileTopBarBinding.searchMode`）。完整搜索页 `/search` 通过 `ownTopBar` 让共享顶栏整体让位，改用自己的"返回 + 唯一输入框 + 取消"，输入框直接驱动结果，避免同屏出现两个搜索框。各资源页只保留文件夹、标签、状态、排序、视图等结构化筛选；桌面端各页自己的搜索框不受影响。

搜索层不是路由：打开时插入一个 history sentinel，Android 返回键优先关闭搜索而不是退出页面；点击结果时先让 sentinel 出栈再跳目标路由，否则返回键会把新页面一起弹掉。层高按 `visualViewport` 计算，避免软键盘弹出后结果被遮挡。最近搜索按账号 ID 存本机、最多 8 条、不同步服务器，埋点只记录类型和来源页，不记录原始关键词。

通用移动端浮层遵循同一历史栈规则：`BModal`、`BDrawer`、`BAlert` 与图片预览在打开时加入 history sentinel，系统返回键或返回手势优先关闭最上层浮层，不直接切换业务路由；嵌套浮层按后进先出关闭。业务组件不再各自重复实现返回键监听，确有独立路由语义的全屏层除外。

当前页面只影响排序，不改变搜索范围：`MobileTopBarBinding.searchSourceType` 声明本页主资源类型（书签页 `bookmark`、待办页 `todo` 等），服务端按它给同类结果 +3 分。该值必须小于相关度档位间隔（10），否则会退化成事实上的局部搜索——在待办页搜索仍然要能看到相关书签、笔记、文件和标签。来源页会进快捷搜索缓存键。

### 移动端「今日」

`/workbenches` 一个路由两种产品形态：桌面端渲染 `DesktopWorkbenchView`（完整工作台），移动端渲染 `MobileTodayView`（今日）。两端是不同的产品概念而不是同一页面的两种布局，因此不按 `XxxDesktop / XxxMobile` 命名；桌面工作台带图表和大量统计，通过异步组件加载，移动端不为它付出下载成本。

今日只回答「我今天先做什么、有哪些资料还没整理」：日期问候、逾期/今天/待整理摘要、快速记录、今日待办与待整理（复用 `TodayActionSection` 的完成、延期、编辑和整理能力）、继续处理。页面不放「查看全部待办」按钮——底部导航已有待办一级入口，重复入口只会占位。资源总量、增长趋势、文件类型分布、常用标签排行和最近更新只留在桌面工作台，不搬进移动首屏。「每日回顾」暂不纳入。

继续处理取最近编辑的笔记与最近上传的文件，按活跃时间合并后最多 2 条。它不复用桌面工作台的近期列表——那两个查询各取 10 条并 JOIN 标签、生成文件签名地址，而今日页只需要标题和一个可跳转 ID；高频书签依赖 `operation_logs` 的 LIKE 聚合，成本高且语义上属于「常用」而不是「上次做到哪」，第一版不纳入。

数据来自 `POST /api/workbench/today` 轻量聚合，不复用完整工作台接口（后者会额外跑趋势、饼图、排行和最近列表共 8 组查询）。明细按今日页展示上限截断（逾期 3、今天 4、待整理 3），但摘要计数使用权威总数，不能把「最多取 3 条」显示成「只有 3 条逾期」。移动端快速记录覆盖书签、笔记、文件和待办；待办先使用轻量表单，需要时可继续打开完整编辑抽屉。

`workbench` 是移动端默认首页（`MobileHomePreference` 的默认值），设置页在移动端把这一项显示为「今日」并隐藏移动端不支持的资源中心。`getMobileHomePreference` 直接读原始偏好，不经过 `getHomePagePreference` 的桌面兜底——后者会把「没设置过」归一成书签，导致移动端默认值永远生效不了。

「默认首页」只在桌面端作为设置项出现：它影响登录后的落点和桌面 Logo（Logo 进 `/app`，桌面按该偏好解析）。移动端不显示这一项——Logo 与冷启动入口一样回资料区，移动端并不存在一个可由该偏好改变的落点，暴露这个开关只会误导。

同理，移动端还隐藏了几个自身就只对桌面生效的设置：AI「默认全屏打开」（移动端始终全屏）、AI「记住抽屉宽度」（移动端 AI 是全屏容器，没有可拖拽抽屉）、以及需要拖进浏览器书签栏的「收藏按钮」bookmarklet。判断标准是该设置在移动端有没有可操作的对应物，而不是它属于哪个分区。

底部导航为 `今日｜资料｜AI｜待办｜我的`，AI 保持中间强调。`/inbox?tab=todo` 高亮待办，`/inbox?tab=all|bookmark|note|file` 与 `/search` 高亮资料——待整理和资源中心属于资料处理。今日上线后「我的」不再保留工作台入口，也移除了与今日快速记录、书签页顶部按钮重复的快速添加和书签管理；资源中心保留，因为底部搜索位让给今日后，它是「浏览全部资源 / 待整理」除搜索层「查看全部」以外的唯一入口。

书签图标采用 stale-while-revalidate：`bookmark.icon_checked_at` 记录最近一次 favicon 抓取检查时间；已有图标满 30 天后在列表后台静默刷新，抓取失败保留旧图标，无图标记录按 24 小时冷却重试。书签站点主机变化时清空旧图标及检查时间，同站点路径变化以及普通标题、描述、标签编辑不清图标；编辑页支持主动刷新。

批量导入的无图标书签使用 `bookmark_icon_jobs` 持久任务和独立 `bookmarkIconWorker.js` 补全：导入事务提交后按 Origin 建批次，Worker 有界并发调用 `FAVICON_API_BASE_URL`、逐条写回并记录 `finished_at`；前端用 `(finishedAt, jobId)` 游标短轮询增量更新，完成后最终刷新列表。图标文件使用完整 SHA-256 内容哈希作为共享文件名，不同书签和重复导入复用同一份内容；删除或替换书签图标时只在没有活动书签继续引用后清理文件，并兼容旧版按书签 ID 命名的文件。Worker 启动前必须验证任务表、`finished_at`、`idx_icon_job_updates` 和 favicon-api 健康状态；后台链路连续失败或长时间无进度时，前端恢复受限渐进补图，仅剩延时重试时改为低频静态后台状态且不跨页面恢复成“正在补全”。`BOOKMARK_ICON_BACKGROUND_JOBS_ENABLED=false` 可停止创建和领取新任务，但不删除既有任务或图标。

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
- DeepSeek V4 默认会进入思考模式；当前 Planner 为保证强制指定 `submit_agent_plan` 的结构化规划协议，必须显式使用非思考模式，Final Reply 也暂时保持非思考以控制首字延迟与成本。未来如引入复杂任务自适应思考，只能在完成工具执行后的回答阶段按请求开启，不得改变 Planner 的非思考安全默认值
- 调用日志中的 `cost` 仅按供应商静态价表估算，用于内部诊断，不作为财务计量或后台金额主指标
- root 可在 AI 监控页通过 DeepSeek 官方余额接口查看账户可用状态和剩余余额；查询结果短时缓存，上游异常时回退最近一次成功值。服务端按 `Asia/Shanghai` 业务日在 `ai_provider_balance_snapshots` 保留当天 0 点余额，后台展示“当前余额 + 今日账户余额变化”；首次部署、重启或上游异常导致错过 0 点时建立 `bootstrap` 基线并明确标识为部分日。余额变化不是逐请求精确费用，充值、赠金、退款及同账号其他系统调用也会反映在其中
- 会话按用户或管理员 actor/subject 组合隔离；前端历史也按账号键隔离
- 每轮先按角色、代管模式和写入权限过滤工具，再由 `capabilityRegistry.js` 生成当前身份的完整语义能力目录。Agent 主链不再按用户文本关键词预裁剪工具；模型能看到当前身份全部可用能力以及 `planned / forbidden / unavailable` 边界，非 root、游客和只读上下文仍由服务端在模型前移除不可执行工具
- 写能力采用封闭世界注册表：`util/agent/capabilityRegistry.js` 是能力 ID、启用状态、风险等级、确认策略和动作路由的唯一产品声明，状态分为 `enabled / planned / forbidden`。注册写工具必须与一个 `enabled` 能力一一对应；计划中或禁止能力不能绑定工具，契约不一致时启动或测试直接失败
- `util/agent/semanticPlanner.js` 定义强制 `Intent Envelope`。Planner 在同一次模型调用中声明 `conversation / product_help / data_query / data_action / mixed / ambiguous`、read/write 意图、能力 ID、置信度和依赖，并把拟执行的真实工具及参数封装在唯一的 `submit_agent_plan.toolCalls` 中。`toolCalls` 使用按 `toolName` 区分的联合 schema，每个分支直接复用注册工具的封闭参数 schema；Provider 不再收到可独立调用的第二套业务工具定义，既减少协议歧义，也避免在嵌套参数中猜出 `completed` 等不存在字段。服务端展开后仍再次按实际工具 schema、能力和权限校验。该单入口协议不依赖 Provider 同时并行调用“元计划 + 业务工具”，正常路径也不会因为语义识别增加额外模型往返
- 服务端对 Intent Envelope 与能力目录、当前权限和真实工具调用逐项求交：查询必须有匹配的真实读取工具结果，写入必须有匹配的可执行写工具并进入确认链；`planned / forbidden / unavailable / unknown`、语义与工具冲突、缺失必要调用和低置信歧义全部失败关闭。Intent DAG 只允许依赖前序下标、同一计划能力 ID 不重复、最长三层；用户只要求动作但需要先定位目标时可以使用 `data_action` 的 read→write 依赖，read 必须是 write 的真实祖先，不能夹带无关查询
- Provider 协议抖动采用“先隔离、再受限恢复”：计划外的已知只读调用会被丢弃且绝不执行，不会拖垮原计划；已验证读取计划只缺真实调用时，最多两次把目录收窄到缺失 read capability 让 AI 补齐，再与原完整计划重新求交，补全轮不能增加能力或把读取升级为写入；结构化计划缺失或自身冲突时，默认只在原权限和完整能力目录内重判一次。仅当独立高召回动作传感器精确命中当前身份已经启用的动作能力时，允许第二次定向纠偏，用于修复 Provider 漏计划或误选不可用能力；传感器不能直接选择工具，纠偏结果仍须重新通过参数、权限、确认与回执校验。恢复失败时保持原安全裁决。正常请求不增加模型往返，只有异常计划进入恢复
- 依赖目标不再要求用户手工拆成两次对话：服务端只执行 DAG 当前就绪的读取调用，丢弃模型在拿到结果前猜出的延迟写参数；读取成功后只向下一轮暴露已经满足前置条件的能力，继续使用唯一 `submit_agent_plan` 协议，并从真实工具结果重新生成参数。读取工具同时从权威原始结果生成不可伪造的 `dependencyRefs`，后继工具通过 `dependencyBindings` 声明哪个参数必须来自哪类引用；服务端只接受直接前置节点产出的稳定 ID，不解析标题、摘要或模型文本，也不把更早祖先的宽结果并入白名单。要求唯一目标的写工具还会声明 `requireUnique`：直接前置查询只要返回多个同类候选，即使模型选择的 ID 位于结果中也会失败关闭，必须先把查询收敛到唯一对象。该约束同时适用于 read→read 与 read→write，防止模型绕过中间筛选、从内容里的伪造标记取 ID 或修改查询结果之外的对象。依赖轮是原请求的核心路径，不受可选只读恢复开关影响；每轮调用 ID 唯一，写入预检只尝试一次，结果只能是确认卡、选择卡或具体错误，禁止模型换目标自动重试
- “第一条 / 最新一条 / 最早一条”等相对目标必须先转换为可复现的服务端查询排序和 `limit=1`，再由依赖引用绑定到后续动作；没有明确排序语义且无法稳定定义的“最后一条”等表达必须澄清，不能把数据库默认顺序当作用户选择
- `util/agent/actionIntentPolicy.js` 降级为高召回安全传感器，不再选择工具或决定正常业务意图；仅当 Provider 未提交有效语义计划，或最终文本疑似越过执行协议时参与失败关闭。`toolRouter.js` 的关键词评分只保留给兼容调用方，Agent 主链固定使用语义规划模式
- 产品知识检索完全在服务端本地完成：`util/knowledgeService.js` 使用 MiniSearch BM25+ 对完整 HTML/Markdown 正文分块建索引，按标题、章节标题、正文分级加权，并依次执行精确、同义词和一次编辑距离的保守降级；结果按知识条目去重，只向 Agent 提供实际命中的片段。异常时自动回退旧匹配算法，也可通过 `KNOWLEDGE_SEARCH_ENGINE=legacy` 主动回滚
- 所有写工具（含待办状态、保存附件到云空间和创建图片笔记）使用 Redis 哈希键保存的一次性确认令牌；前端先展示风险、目标和影响范围，确认后按服务端保存参数执行。确认接口原子认领令牌，并以令牌摘要键短期缓存绑定 owner、session 与代管上下文的确定结果；响应丢失后同一令牌只回放原结果，不会重复写入。创建普通笔记和图片笔记还会按“账号 + 会话 + 权威参数”生成稳定业务幂等键，并映射为确定性笔记 UUID（图片同时映射为确定性存储名），所以执行结果不明、确认缓存过期后在同一会话重新确认也只会恢复原实体；新会话仍允许用户有意创建相同内容。执行中或结果待核验时前端仅允许安全重试，不允许取消或改参误消费令牌。已生成的令牌参数不允许就地篡改；“修改参数/重写草稿”通过同一段 Redis Lua 在创建新令牌的同时删除旧令牌，不存在两张卡同时可执行的窗口
- 写操作采用“无回执，不成功”硬约束：确认接口只有在工具提交成功后才返回与 `actionId + capabilityId + toolName` 绑定的结构化 `succeeded` 回执，前端只认与当前确认卡严格一致的回执，不认模型文本或 HTTP 200 本身。明确写意图未形成确认/选择卡时，服务端跳过 Final Reply 并确定性提示尚未执行；动作相关文本在发送前统一经过执行声明核验，既包括 Final Reply，也包括 Planner 生成的澄清和阻断文案，无回执却声称“已创建/已删除/已完成”的文本会被替换为确定性未执行说明
- Final Reply 还经过供应商无关的质量门禁：有工具结果、引用证据或动作语义的事实回答会把最终温度限制在 `0.6` 以内，普通事实、比较和建议类回答限制在 `0.7` 以内，只有明确创作请求保留发散温度；回答长度按问题复杂度决定，不用固定短预算压缩内容。事实回答先完整缓冲、校验后再一次性发给客户端；普通流式回答保留一段尚未验证的尾部，更早检查长中文无断句、随机汉字碎片、循环重复和协议泄漏等明确退化信号，命中后主动取消上游流，避免异常尾部先进入界面。`finish_reason=length/max_tokens/content_filter` 或上述退化会触发一次禁用工具、低温但不缩短正常回答预算的重试，重试正文只通过权威终态整体替换异常前缀；重试仍不合格时只返回稳定错误文案。该门禁只判断可验证的生成退化信号，不替代工具事实、引用和执行回执校验
- 会话短期保存最近的结构化动作批次及公开重试参数，不把它们注入模型 Prompt。“重试 / 重新执行”由动作控制层直接处理：取消、确定失败或过期时重新执行当前权限、归属、歧义和版本预检并签发新令牌；待确认、结果未知、已成功或多候选时失败关闭，禁止复活旧令牌、猜测目标或生成完成性文案
- 待确认写操作的用户消息与助手消息按整轮标记为瞬态，确认未结算前不写入服务端或云端会话历史；本机浏览器仅按服务端绝对过期时间短暂保存仍有效的确认卡及其同轮提问，使刷新或同一浏览器标签切换后可以继续确认，过期后立即丢弃。确认令牌不做账号级跨设备同步，避免把短时执行授权扩散到其他浏览器。自然语言触发的操作结算后移除可操作卡，只把不含令牌和参数的终态回执随助手消息写入本地与云端历史；结构化快捷动作仅在成功后保留，不把未执行动作当作长期上下文
- 笔记、书签、标签、文件、回收站恢复和知识库写入必须复用 `util/services/`；Agent 工具不得再直接拼接这些业务 SQL，以保持事务、归属、成长、转化、快照和参数校验一致
- SSE 使用 `start/tool_start/tool_result/interaction_required/tool_confirmation/tool_confirmation_replaced/sources/delta/done` 结构化事件，并保留 `requestId` 关联日志。客户端通过 `clientCapabilities: ['agent_interaction_v1']` 显式声明支持选择卡；未声明的旧页面继续收到原业务错误，避免新事件被静默忽略后卡住。权威终态和 10 分钟断流恢复快照都携带服务端验证的 `entityRefs`，确保失败轮、待确认轮和恢复轮仍能承接原始资料
- Agent 工具通过 `util/agent/sourceUtils.js` 统一生成、清洗和去重来源；来源必须携带稳定资源 ID 与显式语义目标，外链仅接受 HTTP(S)。当前语义目标覆盖笔记详情、书签原网页/编辑/快照、云文件精确预览、云文件夹、帮助中心公开文章、Root 内部知识、标签详情、网页和临时文档。普通公开知识只作为回答依据展示，不使用 SEO 页面兜底跳转；知识来源只有在 `category = '帮助中心'` 且 `status = 'public'` 时才进入站内 `/help?article=<id>`。帮助中心、Root 知识库、云空间文件/文件夹和书签快照均把资源 ID 写入查询参数，刷新与浏览器前进后退可恢复同一内容。来源打开全屏文件预览时会注册顶层 Escape 锁：第一次按键只关闭当前预览，释放后下一次按键才关闭 AI 抽屉；长按产生的重复事件不会穿透到下一层
- 用户可为单条消息选择书签、笔记、文件或标签上下文；AI 专用入口还可携带待办行动对象，但不会因此把待办混入资料选择器、标签、待整理等资源能力。后端统一按稳定 `type + id` 重新校验归属，不信任前端正文。材料默认仍按单条消息消费，但用户使用“这个、刚才、继续、重新生成”等明确承接表达时，前端会把最新回答中由服务端返回的书签、笔记、文件、标签或待办来源转换为新的可见消息锚点；待确认轮和已结算轮都允许回退到同轮父消息原始材料。待办锚点按当前 owner 重新读取最新状态、说明和清单，不携带提醒邮箱；书签锚点重新读取最新地址，并把该精确 URL 加入本轮 `read_url` 白名单，不能授权模型改读其他地址
- 用户明确要求“根据材料生成笔记”，且能力注册表确认本轮唯一写目标为 `note.create` 时，请求在通用 Semantic Planner 之前进入统一材料草稿链路。服务端可聚合书签、笔记、待办、已解析文件附件、混合引用与直接粘贴文本；书签先使用权威快照，缺少快照时并发受限地补读当前 URL。草稿模型只能调用强制 `submit_note_draft` 协议；格式不完整、有较长资料却过度简略，或用户明确要求扩写后没有真正扩写时只允许一次同权限修复。待确认草稿存在且输入区没有新增材料时，前端不解释用户句式，只附带当前卡片的候选 ID 与令牌；服务端校验 owner/session/状态后，通过强制 `classify_pending_note_draft_intent` 封闭协议结合近期对话判断本轮是承接草稿修改还是独立请求，不以关键词正则作为主路由。只有语义分类为修改才重取原材料并替换草稿，独立请求继续通用 Agent，分类协议异常则失败关闭。确认存储的私有区只保存原始提问、稳定资源引用和附件来源 ID，改写时按 owner/session 重新校验并重取材料，公开确认卡永不包含该私有上下文。该链路只准备 `create_note` 确认卡，未确认前不写入笔记；查询、教程问题和复合写操作仍由 Semantic Planner 处理
- `read_url` 将直接 Cheerio 正文提取与本地 Mozilla Readability 服务并行竞速，首个得到有效正文的结果胜出，并中止另一路；每次最多向 Agent 提供 12000 字正文，公开且无敏感查询参数的 URL 可在 Redis 缓存 10 分钟。`READABILITY_SERVICE_URL` 默认为本机 `http://127.0.0.1:3466/`，可设为 `off` 禁用。内部两路都失败后只有在运维明确配置 `WEB_READER_EXTERNAL_FALLBACK_TEMPLATE` 时才调用外部增强阅读器；该配置会把目标公开 URL 发给第三方，因此不得默认开启。带凭据、fragment 或 token/auth/key/signature/session 等敏感查询参数的 URL 只允许服务端直连目标站点，始终禁止进入二级 Readability 服务、外部降级和缓存；内网或非法地址也不得借外部阅读器绕过 SSRF 阻断
- AI 输入区通过“上传文件”添加本地临时文件，或通过“添加资源”选择已有云空间文件；两种方式共用解析与引用，当前支持 TXT/Markdown/CSV/PDF/DOCX/PNG/JPG/WebP，单轮最多一个附件
- 附件“原文件已上传”和“已提取文字”是两层独立能力：直传确认后即可发送、保存原文件或插入图片笔记；只有摘要、文本问答和整理文字笔记需要解析结果。输入区把文件大小、原文件可用性、文字提取状态和云空间保存状态分开呈现；仅 `queued/parsing` 使用轻量动态反馈，`ready/no_text/failed` 使用稳定的成功、提醒或错误语义，并遵守系统减少动态效果设置。OCR 没有识别到文字时，数据库沿用 `ready + NO_TEXT_CONTENT`，接口映射为 `no_text`，不把原文件误判为失败
- 临时附件可经确认式写工具复制到永久云空间；图片附件可经确认式写工具写入本站图片目录、创建 HTML 图片笔记并同步登记 `note_images` 引用。两条链路都重新校验附件归属、有效期、文件类型和容量，不依赖 OCR 成功。AI 保存使用与展示文件名解耦的随机 OBS 对象键，并与普通直传共用账号行锁，避免同名并发覆写对象或产生重复记录
- “保存到云空间”和“创建图片笔记”是确定性直达动作：输入区用结构化编辑器收集最终文件名、目标文件夹、笔记标题和图片说明，再通过白名单接口 `/chat/agent/actions/prepare` 生成确认，不经过 LLM 猜测参数，也不消耗 AI 额度。自然语言请求仍复用同一工具、文件夹解析和确认链路
- Agent 通用交互协议支持 `single_choice`、`multi_choice` 和 `confirmation` 三种展示类型。交互规范、白名单选项和后续 resolver 动作只保存在 Redis，前端仅提交 option ID；`/chat/agent/interactions/respond` 原子认领第一次回答并短期回放结果。普通选择只澄清参数，涉及写入时会把同一随机 token 晋级成标准确认令牌，仍须最终确认，不允许用选择卡绕过写授权
- 保存目标文件夹不存在时，选择卡提供“新建并保存 / 改存根目录 / 选择其他已有文件夹”。`create_if_missing` 在保存事务内重新核验并按需创建文件夹，文件夹记录与文件记录同事务提交；账号行锁、附件归属、容量检查和随机 OBS 对象键仍沿用标准附件保存链路
- Agent 收藏书签复用同一书签地址解析器。自然语言中出现一个或多个候选网址时，服务端把候选白名单保存在交互上下文，前端只回传 `candidate_N`；选择后再次规范化、探活并生成标准写入确认。用户不能通过篡改 option ID 注入其他网址，选择候选也不能绕过最终确认。
- 新会话首屏按当前页面展示高价值固定快捷提问；完成一次正常回答后，服务端以本轮问题、截断回答、来源类型和工具结果为短时上下文，异步生成 3 条相关追问。生成过程不阻塞主回答、不计入用户可见 AI 额度，超时、异常或结果不合格时使用规则/页面问题降级；待确认与待选择操作不会展示普通追问。快捷提问属于“一键提问”，点击后直接发送，并在请求开始前用前端短锁避免快速双击重复发送；附件区的“总结文件”“整理成笔记”等提示词建议只回填并聚焦输入区，已有草稿时追加而不覆盖，发送始终以用户最终文本为准
- 云空间文件工具可按文件夹 ID 或精确名称查询；名称重复时不猜测目标。`query_files` 返回文件与所属文件夹，`query_cloud_folders` 提供当前账号的可选文件夹
- Root 的资源新增排行由 `get_resource_creation_ranking` 直接按业务表创建时间汇总书签、笔记和云空间文件，不依赖操作日志；默认排除逻辑删除资源、新手引导资源以及 root/test 内部账号，并可用用户注册时间进一步限定统计人群
- Root 的签到排行由 `get_checkin_ranking` 直接读取有效 `growth_events` 签到账本，支持累计/指定周期签到天数、历史最长连签和当前未断连签；默认排除逻辑删除与 root/test 内部账号，补签按产品规则计入，并返回最近签到日和补签审计摘要。当前连签不能直接按 `user_growth.streak` 快照排序，必须结合最近签到日判定是否已断签
- PDF 优先读取原生文字层；没有文字层时由文档 Worker 使用本机 Poppler 逐页渲染，再调用本机 Tesseract（默认 `chi_sim+eng`）OCR。图片附件直接进入相同的本地 OCR 流程，不调用第三方 OCR API
- OCR 默认最多处理 20 页图片型 PDF、单张图片最多 2400 万像素，并对渲染、单页识别和整份文档设置独立超时；所有临时文件使用随机私有目录并在成功或失败后清理
- 文档正文由独立 `documentWorker.js` 从 OBS 拉取并解析，主 HTTP 进程只负责签名、鉴权、任务创建、状态查询和片段检索
- 临时文件使用 `ai-temp/{userId}/{sourceId}/` 独立前缀并在 24 小时后清理；云文件永久删除、覆盖或重命名时同步使解析缓存失效
- Agent 只接收服务端按问题检索出的受控片段，文件内容明确视为不可信资料；来源卡片由服务端生成真实定位
- 笔记正文进入 Agent 前由 `util/noteSemantic.js` 统一解析 HTML/Markdown，保留标题、段落、普通列表、复选任务、表格、引用、代码、链接和图片引用；`[x]`/`[ ]` 状态直接以正文中的复选框为准，普通列表不计入任务统计
- 单篇笔记细读使用 `read_note`，图片文字识别拆为通用只读工具 `analyze_resource_images`。前者只返回结构化正文和图片引用，后者按资源归属按需复用本地 OCR；本站笔记图片还必须命中 `note_images` 登记，单轮最多识别 3 张并使用内容哈希缓存
- 工具调用是结果驱动的有界多轮链路：上一轮失败、空结果或声明存在可选后续能力时，模型才能继续规划；后续仅允许已授权只读工具，默认最多 3 轮工具调用，最后再生成回答

### AI 工作区与持久对象

AI 前端由 `useAiAssistantStore` 承担会话域、草稿、材料、附件、滚动位置和活动请求租约，`AiWorkspaceShell` 承载问答产品界面。Store v3 的持久键与运行时 lease 都包含 actor、subject、mode、context ID 四维；切换同一 subject/mode 的管理员授权 context 也会中止旧请求并进入全新本地域。旧 v2 三维状态只允许普通 self 账号一次性安全迁移，管理员旧状态不复用。普通桌面问答使用无蒙层、可调宽且关闭不销毁的 `BDrawer`，移动端继续使用全屏容器；移动端侧边浮标只在笔记详情展示，其他页面仍可通过各自的显式 AI 入口打开工作区。笔记详情、笔记库、全局搜索、书签管理、云空间和标签详情通过统一的 `AiEntry` 事件传递受控 `contextRefs`、建议意图和查询：书签/云文件单项入口默认 summarize，批量入口默认 compare，一次只带前 5 个权威 type/ID/title 并明确提示截断；标签详情携带当前 tag 的权威 ID/name 并建议 find-related；既有专用书签整理弹窗继续保留。服务端仍重新校验资源归属，不能把入口 payload、title 或前端选择状态当作权限依据。系统分享尚未接入统一入口。

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
- 会话中心支持列表、搜索、重命名、归档、单条删除/撤销、导出和“清除全部 AI 数据”。单条删除先在服务端改为隐藏状态，默认提供 15 秒（可配置 5 秒～2 分钟）的权威撤销窗口；窗口结束后定时器会事务清理关联记忆、Change Set 与会话子表，应用重启或定时器丢失时由会话保留调度器兜底。UI 用 `BCard` 展示撤销条，但是否可恢复最终由服务端状态与时间判断。总清除是无撤销事务：普通 self/normal 账号按 `subject_user_id` 清除该主体全部可控 AI 对象，包含曾由管理员授权上下文为该主体产生的对象，响应 `scope=subject_user`；管理员 `maintain` 调用只清当前 actor + subject + mode + context 四维域，响应 `scope=owner_domain`，`readonly` 不能调用。两种范围都覆盖会话、记忆、Change Set、产品事件与 SSE 恢复事件；普通 self 还会在同一事务推进 `ai_content_generations` 并删除 `ai_content_chunks`，提交后只驱逐本进程缓存，代际/schema 失败会让整个清除回滚；owner-domain 清除不触碰 subject 级索引代际。`agent_logs`、配额用量和请求占位账本按独立安全/运营保留策略保留；`ai_provider_balance_snapshots` 是供应商级运营账本，不归属任何用户，也不随用户清除删除。任何必需 AI 表或字段缺失时，总清除返回 `AI_DATA_CLEAR_SCHEMA_UNAVAILABLE`（503）、回滚整个事务，不会把“未检查”误报为“已清空”。
- 会话谱系以 `root_conversation_id / parent_conversation_id / branch_from_message_id` 保存，并由 owner 四维 + live retention 查询；从指定消息创建分支会在同一事务克隆截至该点的消息与 parent 映射，继承 retention/expire 后立即打开，超过 200 条安全上限则返回 `CONVERSATION_BRANCH_TOO_LARGE`（409）且不部分写。fresh schema 的 root 为 NOT NULL；既有库增量迁移保持 nullable，使滚动/回滚旧后端可继续插入 NULL 独立根，新版查询同时按 root ID 或自身 ID 兼容。UI 用 B 组件展示最多 200 节点的分支树和前后导航；遗留会话只回填 `root=id`，不从标题/正文推断历史关系。
- 重新生成保留全部旧答案，并用 `versionGroupId` 形成同会话版本组；版本 API 只读取 owner 内同 conversation 的 completed assistant 消息，最多 50 个。回答下方切换器只滚动/聚焦已保存版本，不隐藏、覆盖或删除旧答案；目标不在当前最多 200 条已加载消息时明确提示不可定位。`aiCloudHistory=false` 仍阻断自动 hydrate/create/save，但不误伤用户显式打开历史、谱系、分支和版本管理。
- 账号 Settings 的“全量数据” JSON 导出同样按 `subject_user_id` 覆盖该账号的会话/消息/来源/证据/反馈、记忆、Change Set、产品事件、`agent_logs` 和配额用量，并返回 schema 版本、分域计数、不可用分域和排除清单。可重建内容/文档索引、10 分钟 SSE 恢复事件、请求级配额占位和供应商级 `ai_provider_balance_snapshots` 不具单用户可移植性，因此显式列为排除项。普通 self 总清除和导出虽然都是 subject 级，包含/排除与保留政策仍不同；管理员 maintain 清除则是更窄的 owner 域。接口和产品文案必须以返回的 scope 与 retained/exclusions 解释，不能混用。
- 会话中心已用 `BSelect` 提供逐会话 `standard` / `temporary` / `indefinite` 保留策略；temporary 可选 1、7、30 天，显示权威到期时间及自动级联会话、消息、来源/证据、记忆、Change Set 的范围。服务端严格校验 patch，回显时只映射最近合法档位；temporary 由启动/周期调度器物理删除，同一调度器也收口超过撤销窗口的软删除会话。standard/indefinite 的长期产品政策仍需验收。
- 登录账号的 Settings AI 区提供 `aiCloudHistory` 云端会话历史开关，使用账号 preferences 同步。关闭后 `ChatContainer` 不再自动 hydrate/create/save 云会话并清除当前 `cloudConversationId`；服务端 create/save 自动持久化 handler 也会按 subject 权威读取偏好，关闭或主体不可验证时失败关闭并返回 `AI_CLOUD_HISTORY_DISABLED`（409）。缺少该偏好字段默认开启，以兼容既有账号。本地 v3 Store 历史继续保留，既有云端历史不会因切换而删除；Change Set 等显式后台成果的直接 Service 写入、分支创建和历史管理不被自动持久化门禁误伤。仍需真实账号和多设备偏好传播验证。草稿和尚未发送的材料始终是本地窗口状态，不能被当作长期记忆。
- 云历史开启时，新设备没有本地会话 ID 会自动加载云端最近活跃会话；已有设备继续恢复本机最后选择的会话。AI 抽屉关闭时不销毁，因此每次重新打开都主动拉取当前会话：同一 ID 直接同步新消息；若另一个会话在本设备上次云端检查后成为最新，则使用 `Alert.alert()` 询问是否切换。用户选择留在当前或明确从会话中心打开任一会话后，Store v3 记录已确认的最新 `(lastMessageAt, id)` 检查点，避免同一更新重复打扰；检查点只表示本设备已经见过该云端位置，不作为消息顺序或并发写入的权威版本。

### 证据与检索

- Agent 将资源级 `sourceId` 与本轮不可变的 `evidenceRef` 分开；证据包含资源版本、locator、短摘录及摘要哈希，正文只把真实存在的 citation key 渲染成可交互引用。
- Final 完成后会审计引用编号，移除不存在的编号，并把权威正文、证据、覆盖度和审计结果放入终态事件。离线评测除引用存在性外，还接受受控夹具或人工标注的 claim/evidence 语义支持度并单独评分；它不把关键词重合伪装成自动蕴含，线上发布仍需人工抽检。
- `personalKnowledgeSearch.js` 从笔记、书签快照、已解析文件/OCR、待办和标签关系建立按用户隔离的 MiniSearch 词法索引；标题、标签、章节和正文分级加权，每个资源限制命中片段数。`ai_content_chunks` 是可审计的持久分块镜像，运行时索引仍从权威业务表重建；资源更新通过共享 Service 主动失效，3 分钟 TTL 只作为进程内缓存寿命，不承担跨实例正确性。
- 个人索引失效协议支持在业务事务中递增 `ai_content_generations` 的 per-subject 代际并物理删除该账号持久 chunk；总清除已使用强原子路径，Change Set 等 AI 安全写闭环也必须复用该路径。缓存命中、构建前后和 chunk 持久化都会核对数据库代际；持久化事务对代际行 `FOR UPDATE` 并执行 CAS，旧实例构建出的快照不能覆盖新状态。候选命中返回前还会按 owner、`del_flag` 与 `resourceVersion` 重新查询权威业务表，校验不可用时失败关闭，不把已删除、转移归属或旧版本缓存正文作为证据。跨实例旧快照回写和已删除资源命中已有回归测试；但部分 legacy 笔记、书签、文件、快照和创建后副作用仍在业务提交后才旁路推进代际，尚未证明所有入口与资源写同事务。这些入口的剩余风险主要是新内容短时漏召回或缓存重建延迟；上线前仍要逐入口审计/迁移并验证 MySQL 5.7 锁竞争、故障恢复和大账号性能，不能把现有机制表述成全局强一致。

### Change Set 与记忆

- 整理模式先读取并校验用户拥有的笔记、书签和文件，再让模型只生成白名单草稿；模型返回的资源、标签和文件夹 ID 会与服务端允许集合再次求交，不能借 Prompt 注入新增目标。
- `ai_change_sets` / `ai_change_items` 支持设置标签、移动文件、更新笔记元信息/正文、更新书签元信息和创建待办。执行前比较权威状态哈希；冲突时拒绝写入。执行后保存逐项回执，可在资源未再次变化时执行补偿撤销。
- Change Set 的首次 apply 和失败后 retry 都是整批单事务：任何一项或最终提交失败都会回滚全部资源写，变更集保持 `draft`，UI 只能显示阶段与“已提交 0/N”；成功 commit 后才显示 N/N 并保存逐项回执，不能把事务内已尝试数量伪装成部分成功。失败诊断只保存稳定错误码、阶段、失败项 ID、已尝试数量（明确均已回滚）、冻结选择、时间和 `previewRevision`，不保存 raw message 或正文。用户必须先触发四维 owner + maintain 约束下的 revalidate，服务端重读权威资源、刷新 before/hash 并递增 revision，仍冻结原选择；再次二次确认后，retry 只采用服务端快照中的 item IDs 和客户端提交的 expected revision。任何预览编辑都会清掉旧 retry 并递增 revision。apply/undo 还会在资源事务内严格推进个人索引 generation 并清 chunk，失败返回稳定 503 且整体回滚；commit 后只驱逐本进程缓存。
- 回答可保存为新笔记，或以追加、智能合并、选段应用三种方式生成 `update_note_content` Change Set；正文保留来源与证据。选段清单由服务端从 owner 校验后的已持久化完成回答解析，块 ID 同时绑定顺序与内容摘要；客户端只提交 ID，服务端重新解析并拒绝伪造/过期选择，再进行目标笔记版本校验、预览、确认、回执与安全撤销。这里的“选段”是选择 AI 回答结构块追加到目标笔记，编辑器光标位置、指定章节以及原文选区的就地 Apply/Reject 仍未统一接入。
- **⚠️ 状态(2026-07-22):长期记忆已全局关闭。** 前端普通会话发送 `memoryMode:'off'`，后端 `agentHandle.js` 有 `AI_MEMORY_ENABLED=false` 硬开关，强制不读取记忆、不注入 Prompt、不推断/写入候选；前端记忆账本入口与回答下方“影响卡片”已移除。以下两条为记忆子系统原设计、当前版本不生效；若日后重做，必须作为完整可控功能重新立项并验收。
- `ai_memories` 使用“候选 → 用户确认 → 生效”流程，区分全局、会话和资源范围，支持暂停、更正、过期、删除和全部清除；临时会话请求显式关闭记忆读写。管理员代管上下文不把目标账号记忆注入 Agent。
- 正常 Agent 轮次会发送经过白名单收敛的 `memory_context` 透明度事件：只披露 `used/not_used`、0～20 的使用数量、有限类型/范围枚举和未使用原因，不含记忆 ID/HMAC、正文、来源、时间或底层错误。`used` 元数据与实际注入 Prompt 的 `getActiveAiMemoriesForPrompt` 结果来自同一份快照，后者只含当前四维 owner 下已确认、active、未过期、可信来源且范围匹配的记忆；访客、翻译、管理员代管和临时会话不注入。事件会在 SSE、会话 activity 持久化、客户端 Store 与恢复链分别再次归一化，回答下方用 `BButton` 和 `icon.ai.memory` 展示并可键盘进入记忆账本；旧历史缺少元数据时不补造说明。它证明“哪些已确认记忆进入本轮上下文”，不证明模型答案一定受其因果影响，也不替代记忆冲突检测。
- `AiMemoryLedger` 还会在当前 owner 的最多 100 条 live 记忆内提供基础重叠复核：仅把 `candidate/active/paused` 中 scope type、结构化 scope 与 memory type 相同、规范化正文不同的记录列为 peers，并展示其正文和状态。UI 明示这些内容“不一定冲突”、系统不会自动覆盖，最终更正、暂停或删除仍由用户决定；这是可解释的同范围分组，不是语义判冲、自动解冲或质量结论。

### SSE 终态恢复、产品事件与评测

- Agent SSE 协议版本为 `2.0`。所有事件带单调递增 `eventId`、`requestId` 和 `protocolVersion`，包括开始、阶段、heartbeat、工具、增量、来源/引用、完成与失败；前端收到权威 `response.completed.answer` 后替换流式临时正文。
- `ai_response_events` 只在形成 `completed` / `failed` 终态后保存本轮事件与权威快照，TTL 为 10 分钟。客户端在连接异常且没有可靠终态时只尝试一次 `/chat/agent/recover`，恢复结果按 owner 四维精确校验并整体替换本地聚合状态，不与半截 delta 叠加。应用启动链已注册恢复事件批量清理，运行时是否按期执行仍要由预发布日志和 TTL 数据验证。
- `ai_product_events` 只接受事件名和白名单枚举、布尔值、数量与标识维度；标识使用 `AI_TELEMETRY_HMAC_SECRET` 做 HMAC，错误只保留稳定类别，不保存问题、回答、标题或摘录。默认保留期为 180 天（可在 30～730 天内配置），应用启动链已注册受控多批清理：默认每轮最多 25 批、每批 10000 行，代码上限 100 批，并返回 `batches` / `backlogRemaining`；启动或周期清理达到上限仍有积压时只输出无正文警告。预发布仍需用到期数据和数据库指标证明调度真实执行且批量删除不会影响请求链。
- `aiArtifactRetention.js` 提供 Change Set 单域可选 TTL，天数变量必须显式配置 1～3650 的正整数才启用，默认关闭；共享调度默认每日一次、限制 10 分钟～7 天。每批在事务内 `FOR UPDATE`、删除前重验状态并有界处理，支持多实例竞争、幂等、缺表跳过和 backlog。Change Set 只清 `applied/undone/expired`，在选择和删除时排除 indefinite 会话。清理器已接启动链，但具体天数未经产品/隐私批准，不能默认启用。
- 文档 Worker、标签图标、路由装载、文件与笔记库等本轮 AI 可达错误路径已移除 raw `error.message/stack` 输出；file/note AI 相关读写路由也不再把对象存储 key 或原始异常返回客户端，Conversation/Recovery 调度日志统一为稳定错误码。这次代码扫描不能替代预发布合成 canary 和真实进程日志采集，新增路径仍须遵守同一 scrub 规则。
- `evaluation/ai-assistant/` 的 schema v2 提供 268 条完全合成任务、49 个合成来源和六维确定性评分器，覆盖 10 个能力域且每域至少 20 条；owner 四维、请求 lifecycle、反凑数校验和生成器 `--check` 都进入数据契约。确定性回放适配器已把 3 条合成 Provider 轨迹接到真实 `agentChat` 主链，覆盖统一笔记草稿协议修复、确认和显式 URL 读取；关键 UI E2E 在 Chrome 覆盖 `@ + Enter`、确认卡刷新恢复和材料生成笔记入口。这些 CI 门禁均不加载真实 Provider。DeepSeek Planner 冒烟分为 6 条快速集和 37 条完整集，完整集覆盖全部 34 个普通用户工具及关键边界；只允许 Root 在后台选择并二次确认后手动执行。运行只生成与评分语义计划，工具执行数恒为 0，不访问用户业务数据；互斥运行并把无正文结构化结果写入 `ai_evaluation_runs`，终态记录保留 90 天，不跟随提交、上线或定时任务。自然语言有用性评测和人工引用蕴含标注仍需独立建设。

## 共建轻笺

- `/co-build` 和 `/co-build/:id` 对游客开放公开内容；提交、投票和补充要求登录，Root 负责审核、合并、回复、进度和上线关联
- 桌面端游客入口位于顶部导航，登录后入口位于桌面端个人中心；移动端不主动展示入口但允许链接直达
- `source_type=user` 表示真实用户建议，`source_type=official` 表示“轻笺团队”的官方规划，两者在接口和 UI 中始终明确区分
- 私密意见反馈继续使用原 `opinion` 流程，不会被共建轻笺公共接口读取或自动公开
- 投票明细表以 `(request_id, user_id)` 唯一约束，并在事务中重新计数；提交者和支持者可接收进度通知，用户可在设置中关闭

## 快速添加与待整理

- `resource_inbox` 是跨资源关系表，不复制书签、笔记或文件正文；资源本体仍是唯一事实源
- 桌面端与移动端“快速添加”都支持 URL、Markdown 文本、文件和待办。资源创建与加入待整理在同一业务事务或确认链中完成。快速待办只填写标题、日期预设和优先级即可直接进入待办列表，“完善详情”再携带当前草稿打开完整编辑器；完整待办编辑器在桌面端使用右侧抽屉、移动端使用底部抽屉，避免长表单挤在居中弹框中
- 加入操作以 `(user_id, resource_type, resource_id)` 幂等；完成整理只更新关系状态，不修改资源本体
- 列表查询、批量完成与重新加入都必须校验当前资源主体归属；资源删除时清理对应关系
- 资源中心及书签、笔记、云空间现有菜单统一复用 `useInboxEnqueue` 手动入队；接口失败显示可重试错误态，不伪装成空列表
- “快速添加”是登录用户的全局操作；待整理不作为独立一级导航，而作为资源中心的状态视图保留，`/inbox` 路由继续兼容已有入口
- 管理员维护游客工作区时，可维护归属于该游客的书签、笔记、云空间文件、文件夹、标签及待整理关系；仍按目标账号容量校验，并禁止账号权益写入与永久删除

## 待整理与待办

- 桌面端和移动端均严格分域：资源中心包含“全部资源 / 待整理”，顶部“待办”包含“列表 / 议程 / 日历”；`/inbox` 只承载待办工作区，待整理继续通过资源中心状态视图进入
- 顶部全局搜索仍可搜索待办，但资源中心的类型、数量、筛选和批量操作只允许书签、笔记、文件与标签
- 待整理资源继续使用 `resource_inbox`；待办独立存入 `todo_items`，不能伪装成笔记或资源关系
- 待办可被全局搜索找到并通过 `/inbox?tab=todo&todoId=` 定位，但不进资料四页签、`@` 资源选择器、标签体系和待整理；新增待办能力时不得因为"搜索里已经有了"就默认它继承资源能力
- 待办支持标题、说明、简易清单、优先级、截止时间和稳定自定义顺序；列表按逾期、今天、即将到来、以后、无日期和已完成分组，并提供议程/日历视图
- 逾期摘要与待办列表统一按 `due_at < NOW()` 判断；“今日待办”只统计当前时刻至当天结束之间的未完成任务，同一条待办不能同时进入逾期和今日计数。
- 移动端待办列表、议程卡片和日历选中日期下方的当天议程列表支持向左拖动露出删除操作；日历月视图格子不承载滑动删除。一次只允许展开一项，点击该卡片之外的区域、纵向滚动、切换视图或进入批量选择都会收起；滑动只展示操作，点击删除后仍必须走统一确认与可撤销删除链路
- 移动端“我的成长”的概览、任务、成就和资产四个内容 Tab 共用页面滚动容器，但每次切换都回到页面顶部；带成长任务、热力图或回顾锚点的入口继续精准定位目标内容。
- 提醒计划存入 `todo_reminders`，支持单次/周期计划及站内/邮箱渠道；周期提醒以 `scheduled_at` 保存下一次投递时间，超过 `repeat_end_at` 自动结束
- 重复任务使用 `series_id / recurrence_rule / recurrence_instance_at` 独立建模，与“同一任务反复提醒”没有隐式关联；完成当前实例后在同一事务中生成下一实例、重置清单并平移提醒，撤销完成会删除本次自动生成且尚未变化的下一实例
- 完成、删除及批量操作的撤销由服务端事务校验，不以客户端计时器作为事实源；删除仅暂停提醒，恢复后恢复对应计划
- 账号偏好控制站内、邮件和浏览器通知总开关及免打扰时段；服务端投递按客户端同步的时区计算免打扰，浏览器通知只在应用已打开且获得系统授权时由前端展示
- 待办完成或删除不会修改任何书签、笔记或文件；管理员预览首期只允许读取，不允许代用户写入待办
- 待办提醒由服务端定时扫描 `todo_reminders`，先原子抢占再投递；站内渠道写入统一通知中心，邮件渠道使用服务端 SMTP 配置

## 标签列表与知识地图

- 标签管理 `/manage/tagMg` 只负责标签的新增、编辑和维护；资源中心的“全部资源 / 待整理”只表达资源范围，知识地图不作为第三个范围页签
- 知识地图是全部资源的关系查看方式，在范围页签右侧使用视觉独立的入口；进入后仍保持“全部资源”选中，并单独高亮知识地图入口。历史 `/graph` 地址仅作兼容入口，重定向到资源中心知识地图，不进入标签管理页面
- 知识地图桌面端保留全局关系画布与右侧主题检查器；移动端不缩放复刻画布，而是按主题列表浏览，点击主题后在底部抽屉中按资源类型查看主题内容和相关主题
- 移动端主题抽屉的相关主题必须来自当前标签的 `getTagGraph` 聚焦查询，不跟随全局地图的关系强度与孤立标签筛选；点击相关主题只刷新抽屉内容，不产生中间路由历史

### 管理员邮件发送记录

- Root 管理员的“通知中心”包含“站内通知”和“邮件发送”两个页签；邮件页签不进入普通用户通知铃铛，也不读取系统邮箱来信。
- 验证码和待办提醒统一通过 `util/emailDelivery.js` 发送，并在 `email_delivery_logs` 记录邮件类型、收件人、主题、关联业务、SMTP 状态、尝试次数和脱敏错误；不保存验证码、SMTP 凭据或完整邮件正文。
- 状态 `accepted` 只表示 SMTP 已受理，不能表述为进入收件箱或已读；`sending` 超过 10 分钟时，管理接口按 `unknown` 展示，禁止据此自动重发。
- 邮件记录接口位于 `/notification/admin/email/*`，只允许 Root 普通管理上下文访问；管理员预览目标账号时失败关闭。
- 列表接口默认脱敏收件邮箱，详情接口为 Root 排障返回完整收件地址。历史记录默认保留 180 天，可通过 `EMAIL_DELIVERY_LOG_RETENTION_DAYS` 调整，并由每日小批量任务清理。

## 日志白名单

- 浏览器请求在首个 API 发出前同步生成传统指纹，并同时携带本地生成的稳定 `X-Log-Device-Id` 与同值 `X-Device-Id`；前者用于 root 主动配置的日志排除，后者只用于同账号登录设备会话归并，均不参与认证、权限或设备信任判断
- 白名单主体继续存于 `log_exclude`，一个白名单可在 `log_exclude_devices` 关联多个稳定设备标识，以兼容正式域名、localhost、不同浏览器配置等独立本地存储来源
- 已有指纹白名单命中携带稳定设备标识的请求时自动完成关联，不提供也不需要单独的“升级”操作
- API 日志、操作日志、转化漏斗以及注册接口的手动日志写入统一调用 `isSelfTraffic`，稳定设备标识优先、浏览器指纹作为兼容和自动关联依据
- API 日志的 `system` JSON 将 `os` 与 `runtime` 分开记录；后台返回时统一归一历史 `*app` / `*(app)` / `*（app）` 值，因此旧记录也展示为系统名与 PWA 两个独立字段
- 用户管理、API 日志、操作日志与 AI 调用监控采用“服务端稳定键游标 + 前端虚拟窗口”列表链路；时间字段与 UUID `id` 组成确定性排序键，筛选变化后重新建立游标，避免深 OFFSET 和实时插入导致的重复或跳项。
- `user.last_active_time` 持久保存账号最近一次认证活跃时间，会话校验链路按 5 分钟窗口节流更新。后台用户列表直接按该字段进行全量后端排序，不依赖可能在退出时删除的 `user_sessions`，也不再按当前页面的 API/操作日志做前端排序。

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

### 账号自助注销

- 登录用户从“设置 → 账号与安全”发起，注销验证码只能发送到服务端从当前账号读取的已绑定邮箱；Redis 仅保存 5 分钟有效的加盐摘要，客户端不能指定收件地址，也不复用重置密码验证码。
- 最终提交必须同时通过 6 位验证码和精确确认文字。服务端在单事务内锁定账号、重新核对邮箱摘要、创建 `account_deletion_requests` 清理任务，并将密码、邮箱、电话、头像、位置、IP、GitHub 标识与授权凭据等身份字段清空，同时把账号标成不可登录；随后清除全部会话和当前登录 Cookie。
- 数据库内容、OBS 文件、笔记图片和书签图标由后台任务物理清理。数据库删除使用事务；对象或本地文件删除失败时进入指数退避重试，只有全部完成后才清空任务中的对象路径并标记 `completed`。已完成任务只保留不含邮箱、昵称的账号 UUID、时间和尝试次数，用于清理幂等与审计，并在 180 天后分批删除。
- 安全事件和管理员审计等依法或为安全所需的有限记录不随内容表直接删除，但会解除账号 ID 关联，并继续受各自保留期约束。Root、游客和任何管理员预览/代管上下文都不能走自助注销接口。

### 新账号示例内容

- 邮箱注册和 GitHub 首次建号会按注册语言初始化 4 个带 Base64 SVG 图标的标签、3 个书签、2 篇笔记、1 个示例文件夹和 2 份云文件；已有账号登录、GitHub 绑定已有邮箱账号和历史用户都不会补发或重复生成。
- 标签、书签、笔记和文件夹在独立短事务内同步创建；欢迎笔记使用账号级确定性 ID 作为幂等标记，整批失败会回滚，但不会反向让注册失败。
- 示例云文件是真实 Markdown 文件：使用说明放在示例文件夹，待整理清单保留在云空间根目录，因此“全部文件”和示例文件夹会显示不同内容。文件先异步上传 OBS，成功后才写 `files` 和标签关系，避免产生无法预览或下载的假记录；OBS 失败只记录稳定错误码，不阻断注册。
- 示例资源归用户本人所有，可正常编辑和删除，删除后不会自动恢复。Seed 直插不调用资源创建副作用，并通过 `onboarding_seed_resources` 保留系统来源，因此不计入首次创建成就、每日/每周任务、成长足迹、周报及后台运营资源总览。

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
  - **轨道 B — app 启动时 `ensure*()` 运行时建表/补列**：`app.js` 还会调用 `ensureSecurityTables` / `ensureNotificationTable`（`notification` + `batch_id`/`recalled` 列）/ `ensurePointsSchema`（建 `points_log` / `user_cosmetics` / `user_item` / `ai_daily_bonus` + `ALTER user_growth` 补 `points`/`equipped_title`/`equipped_frame`/`storage_bonus_mb`/`lottery_*` 列）/ `ensureBookmarkSnapshotTable` / `ensureBookmarkHealthTable` / `ensureFeatureRequestTables` / `ensureGrowthTaskSchema` / `ensureAiDocumentSchema`。成长任务由 `growth_tasks` 与 `user_growth_tasks` 保存定义、达成状态和 `claimed_at` 手动领取事实；业务事件只能标记达成，领取接口才可写经验账本。运行时**加列**因 MySQL 5.7 不支持 `ADD COLUMN IF NOT EXISTS`,才先查 `information_schema` 再条件 `ALTER`(这是加列的手法,不是 A 轨 CREATE TABLE 的)。
  - 同一张表可能被两轨分建:如 `growth_events` 主表在迁移 `20260708_growth.sql`,而 `user_growth` 的积分/装扮/抽奖列由 `ensurePointsSchema` 运行时补。**只读 `migrations/` 会漏掉 B 轨的表;只 grep 代码里的 `CREATE TABLE` 又会漏掉 A 轨迁移建的表——两边都要查,别信任何一侧的"未命中"。**
- **Schema 基线门禁**：`note_versions`、旧版兼容列 `files.share_token` 以及独立分享表已由 `20260730_file_share_lifecycle.sql` 和 `tag_db.sql` 补齐；发布前运行 `pnpm --filter server check:schema`，关键表、列或索引缺失时禁止重启应用。旧 `share_token` 仅用于迁移兼容，新写入统一使用 `file_shares.token_hash`。
- 基线 `tag_db.sql` 可能已过期，仍含 `note_tags` / `tag_bookmark_relations` 等旧表；现行代码走 `tag` + `resource_tag_relations` 统一多态关联。

### 安全模块会自动封 IP —— 密集运维流量小心

- `attackMonitor` 中间件：敏感路径探测（`.env`/`.git`/`wp-admin` 等）判 **SCANNER**、高频判 FLOOD，风险分累积到阈值（`SECURITY_IP_AUTO_BAN_RISK_SCORE`，默认 80）即自动封该 IP 30 分钟。
- 密集的 dev / 运维 / 预渲染（prerender、build）流量踩过这个雷；自救：清 `security_ip_reputation` 对应行。白名单 IP / 内网回环 / root 用户豁免。

### 成长系统是全站横切依赖

- 段位特权（`util/growth.js` 的 `RANKS[].perks`）被多个模块读取：**AI 每日 token 额度**（`aiQuota`）、**回收站保留天数**（`trashHandle`）、**云空间容量**、**每日抽奖次数**。改等级阈值或特权表会牵连这些模块，不是孤立改动。
- 一次性成长任务采用“事件达成、用户领取”两阶段模型：`status = completed` 只表示业务条件已满足，`claimed_at` 才表示奖励已领取。头像等资料保存接口必须等待达成状态同步后再响应；经验发放只允许从领取事务进入，并用成长账本唯一来源键保证重复点击幂等。

### 分享链接安全 —— 明确未完成

- 文件分享 `files.share_token` 由 `crypto.randomBytes(16)` 生成，**永久有效、无有效期、无提取码、无失效/撤销机制**；token 与文件名明文在 URL path。"有效期 / 提取码 / 失效" 是已知待办，需新增列或独立 share 表 + 撤销接口，勿误以为已完善。
