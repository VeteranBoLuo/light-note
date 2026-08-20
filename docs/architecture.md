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
│   ├── communityChat.js   # 社区访问、文本消息、举报屏蔽与 Root 治理
│   ├── featureRequest.js  # 共建轻笺公开需求与 Root 管理路由
│   ├── updateLog.js       # 更新日志公开读取、Root 编辑与 OBS 图片
│   ├── user.js            # 用户路由
│   ├── security.js        # 安全中心路由
│   ├── trash.js           # 回收站路由
│   └── opinion.js         # 反馈路由
├── router_handle/          # 业务处理层
│   ├── commonHandle.js    # Admin API、转化漏斗等
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
│   ├── communityChatHandle.js # 社区访问、消息、用户自护与 Root 审核边界
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
    ├── communityChatFeature.js # 社区开关，未知值失败关闭
    ├── communityChatSchema.js # 公共聊天基础表与单一主房间启动保障
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
| 点击底部「今日」                            | 今日                                                                      |
| 点击底部「资料」                            | 当前会话内回到上次打开的资料页签；新会话（重开 App / 新标签页）重置为书签 |

实现要点：

- `utils/appEntry.ts` 的四个入口函数（`getRuntimeApplicationEntryPath` / `getRuntimeApplicationHomePath` / `getRuntimePostRegistrationPath` / `getRuntimeGuestEntryPath`）在移动布局或 `android-app` 运行时统一返回 `MOBILE_TODAY_PATH`，不读账号首页偏好，也不恢复最近资料页签。
- 「资料」页签记忆存 **sessionStorage** 而非 localStorage，这是「重开 App 重置为书签」的实现方式；早期版本的 localStorage 残留会在读取时顺带清除。
- 首访分流由 `vite/earlyAppEntryBootstrap.ts` 在首次绘制前完成，判定顺序为：APK → 视口宽度 → PWA standalone → 本地首访/身份记录 → 展示官网。该守卫只作用于根路径 `/`，不改变 HTTP 响应与索引产物。
- 「默认首页」偏好只在桌面端作为设置项出现；移动端隐藏该项，因为移动端不存在可由它改变的落点。

- 正式包名为 `top.boluo66.lightnote`，Debug 使用 `.preview` 后缀，可与正式版同时安装；Release 应用入口固定为 `https://boluo66.top/app`，Debug 才允许用显式 Gradle 参数覆盖本地地址。`/app` 始终是应用入口，不能返回官网：手机布局、Android APK 与移动 PWA 统一进入「今日」（见上节移动端首页规则）；桌面浏览器与桌面 PWA 按账号默认应用首页进入，无账号偏好时回退书签 `/home`。根路径 `/` 始终保留官网；桌面应用内 Logo 进入 `/app`。移动端顶栏左侧改为账号头像入口，点击进入「我的」，回到「今日」由底部首位承担。普通移动浏览器首次访问 `/` 展示完整响应式官网并写入本地首访记录，后续访问由 `<head>` 守卫在首次绘制前进入 `/app`，既有登录/记住身份记录作为升级兼容信号；Android APK 与移动 PWA 不展示官网。
- 邮箱注册与 GitHub 首次注册成功后，移动端进入「今日」、桌面端固定书签 `/home`，都不继承设备上一个账号的最近资料模块；普通登录及 `/app` 入口仍按各自运行环境恢复最近资料或账号默认首页。
- PC 浏览器、移动浏览器、PWA 与 Android APK 的被动身份变化遵循同一规则：冷启动、刷新、自动入口分流、初始化发现游客、历史会话失效和手动退出都不能自动打开登录/注册弹窗。历史登录记录只用于移动入口兼容，不代表当前登录意图；运行中的真实会话过期仅显示非阻塞提示并降级到游客资料页。认证弹窗只由用户主动点击登录/注册，或在受保护操作的软引导中再次主动确认后打开。
- 原生壳只负责 WebView 容器、安全导航、文件选择、下载、系统返回和版本标识，书签、笔记、云空间等业务继续由 Web 端统一维护。
- Android 以 `MainActivity` 作为唯一桌面入口和 `singleTask` 任务根；隐私同意页只在未授权时由主入口内部打开。同意后重建以主页面为根的任务，Android 13+ 预测返回与旧版返回键统一走同一原生回调。底部一级导航使用替换历史而不是压栈；一级页没有浮层时，系统返回手势把整个任务移到后台但不结束 WebView 进程，再次点桌面图标恢复同一实例。详情页仍正常回退，带 history 占位的弹框/抽屉优先消费返回并关闭浮层。
- 冷启动开屏由三段接力构成，三者必须是同一套视觉，否则首帧会露出「无标识纯色」而被看成黑屏：`Theme.LightNote.Launcher` 的 `windowBackground`（`splash_window_background.xml`，Android 12 以下系统在 Activity 创建前唯一能画的东西）→ Android 12+ 的 `windowSplashScreenBackground` + `windowSplashScreenAnimatedIcon` → `MainActivity#createLaunchOverlay` 的原生等待层（等 Web 端 `app.ready` 或超时后淡出）。改动任一处的底色、标识资源或尺寸（当前为 288dp 居中）必须同步其余两处。带标识的窗口背景只给启动入口 Activity，应用内浏览器、法律文档和隐私同意页保持纯色，避免内容未铺满时透出标识。
- Android App 的列表页统一支持顶部下拉刷新，覆盖今日、书签、笔记库、标签、收集箱、云空间和资源中心；手势实现只有 `composables/useAndroidPullRefresh.ts` 一份，页面只声明「刷什么」和「什么状态下不该刷」，阈值、阻尼、方向锁、顶部判定、浮层拦截、竞态与失败提示都在 composable 里收口；指示器同样只有一个实例，由 `MobileAppShell` 渲染在顶栏正下方，页面不再各挂一个（各页滚动容器顶边高度不同，会让同一手势在不同模块弹出的位置不一致）。普通移动浏览器与 PWA 不接管系统页面回弹，继续使用页面内刷新入口。
- 离开一段时间再回到前台由 `composables/useForegroundRefresh.ts` 补一次静默刷新（默认陈旧阈值 5 分钟，`visibilitychange` 为主、`focus` 兜底）。静默刷新不进入 loading、不闪骨架屏、不驱动全局顶部进度条，刷新期间继续展示旧数据，失败则原样保留。本项目没有启用 keep-alive，路由切换会重建页面，所以只有「页面一直在但用户离开了」这一种情况需要它；页面里残留的 `onActivated` 刷新分支实际不会执行，不要依赖。
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

| 表                                                     | 作用                                 | 主键类型         |
| ------------------------------------------------------ | ------------------------------------ | ---------------- |
| `user`                                                 | 用户                                 | UUID             |
| `bookmark`                                             | 书签                                 | UUID             |
| `note`                                                 | 笔记                                 | UUID             |
| `note_shares`                                          | 可撤销的单篇/目录笔记分享            | UUID             |
| `note_share_events`                                    | 笔记分享隐私化访问事件               | 自增             |
| `files`                                                | 云空间文件                           | 自增             |
| `folders`                                              | 云空间文件夹                         | 自增             |
| `file_preview_artifacts`                               | 云文件派生预览及压缩包目录缓存       | 自增             |
| `file_preview_jobs`                                    | 云文件异步预览任务                   | 自增             |
| `tag`                                                  | 标签                                 | UUID             |
| `resource_tag_relations`                               | 资源-标签关联                        | 无独立 id        |
| `onboarding_seed_resources`                            | 注册示例资源来源标记                 | 复合主键         |
| `resource_inbox`                                       | 书签/笔记/文件待整理关系             | UUID             |
| `todo_items`                                           | 待处理中的待办事项                   | UUID             |
| `todo_reminders`                                       | 待办 v1 历史提醒调度记录             | UUID             |
| `todo_series`                                          | 待办 v2 任务系列模板与生成游标       | UUID             |
| `todo_series_resource_refs`                            | 待办 v2 系列参考资料模板             | UUID             |
| `todo_reminder_rules`                                  | 待办 v2 每项提醒规则                 | UUID             |
| `todo_reminder_jobs`                                   | 待办 v2 实际渠道投递 Job             | UUID             |
| `todo_plan_requests` / `todo_plan_mutations`           | v2 创建与系列操作幂等请求            | UUID             |
| `todo_plan_runtime_metrics`                            | v2 调度低基数累计诊断指标            | 指标名           |
| `email_delivery_logs`                                  | 系统邮件 SMTP 投递记录               | UUID             |
| `account_deletion_requests`                            | 账号注销物理清理重试队列             | UUID             |
| `tag_relations`                                        | 标签-标签关联                        | 无独立 id        |
| `api_logs`                                             | API 请求日志                         | UUID             |
| `operation_logs`                                       | 操作日志                             | UUID             |
| `security_events`                                      | 安全事件                             | 自增             |
| `conversion_events`                                    | 游客转化事件                         | 自增             |
| `admin_context_audit`                                  | 管理员预览与内容维护审计             | UUID             |
| `admin_user_remarks`                                   | Root 对用户设置的私有备注名          | 复合主键         |
| `resource_governance_scans`                            | 资源治理只读扫描任务与租约           | UUID             |
| `resource_governance_findings`                         | 治理候选、风险和无正文证据           | UUID             |
| `resource_cleanup_jobs` / `resource_cleanup_job_items` | 低风险清理批次与逐项结果             | UUID / 复合主键  |
| `resource_governance_audit`                            | 扫描、忽略与清理最小审计             | 自增             |
| `agent_logs`                                           | AI 请求、用量和阶段追踪              | UUID             |
| `ai_token_usage` / `ai_token_reservations`             | AI 日额度账本与请求级原子占位        | 复合键 / 自增    |
| `user_growth`                                          | 成长快照、积分及永久 AI 加油余额     | 用户 UUID        |
| `growth_events` / `points_log`                         | 经验与积分不可变账本                 | 自增             |
| `points_earning_period_policy`                         | 积分获取日/周策略版本锁              | 周期类型 + 键    |
| `points_grant_operations`                              | 非消费积分发放幂等收据               | 自增 / 账号请求  |
| `points_ledger_baselines`                              | C5 余额对账期初差额                  | 用户 UUID        |
| `points_campaigns` / `points_campaign_recipients`      | 积分活动状态机、冻结名单与交付结果   | 自增 / 复合主键  |
| `growth_tasks` / `user_growth_tasks`                   | 成长任务定义、达成与领取状态         | 任务键 / 复合键  |
| `user_achievements`                                    | 用户成就永久解锁与领取状态           | 用户 + 成就      |
| `user_growth_preferences` / `growth_recap_state`       | 成长偏好与内容回顾抑制状态           | 用户 / 复合键    |
| `ai_provider_balance_snapshots`                        | AI 供应商每日账户余额快照            | 自增             |
| `ai_evaluation_runs`                                   | 管理员手动 AI 冒烟结构化结果         | UUID             |
| `ai_document_sources`                                  | AI 文档来源与解析状态                | UUID             |
| `ai_document_chunks`                                   | AI 文档正文片段与定位                | 自增             |
| `ai_document_jobs`                                     | AI 文档异步解析任务                  | 自增             |
| `ai_conversations` / `ai_messages`                     | AI 持久会话与消息快照                | UUID             |
| `ai_message_sources` / `ai_message_evidence`           | 消息来源与不可变证据片段             | 自增             |
| `ai_feedback`                                          | AI 回答反馈与原因                    | UUID             |
| `ai_content_chunks`                                    | 个人知识统一词法索引元数据           | 自增             |
| `ai_content_generations`                               | 个人知识索引的账号级失效代际         | 账号 ID          |
| `ai_change_sets` / `ai_change_items`                   | 可审阅变更集、执行回执与撤销         | UUID             |
| `ai_memories`                                          | 候选、已确认与临时记忆               | UUID             |
| `ai_response_events`                                   | SSE 终态短期恢复事件                 | 自增             |
| `ai_product_events`                                    | 无正文 AI 产品学习事件               | UUID             |
| `note_template`                                        | 用户自存笔记模板                     | UUID             |
| `feature_requests`                                     | 共建轻笺公开需求                     | UUID             |
| `feature_request_votes`                                | 共建建议唯一投票                     | 复合主键         |
| `feature_request_updates`                              | 共建建议公开时间线                   | UUID             |
| `community_chat_rooms`                                 | 社区房间目录（当前仅 general）       | 自增             |
| `community_chat_runtime_policy`                        | 单行发言运行策略与切换人             | 固定值 1         |
| `community_chat_access_requests`                       | 社区内测申请与审核状态               | UUID             |
| `community_chat_members`                               | 社区成员、角色与规则确认             | 用户 UUID        |
| `community_chat_user_identities`                       | 不可变用户公有 UUID 与稳定社区 ID    | 用户账号 ID      |
| `community_chat_member_profiles`                       | 社区公开简介、轻笺资历隐私与精选成就 | 用户 UUID        |
| `community_chat_user_settings`                         | 社区通知与隐私偏好                   | 用户 UUID        |
| `community_chat_access_audit`                          | 私密房间预留准入与访问审计           | 自增             |
| `community_chat_messages`                              | 消息、回复、幂等与原文保留式撤回     | 自增 + 公有 UUID |
| `community_chat_message_likes`                         | 消息点赞关系                         | 消息 + 用户      |
| `community_chat_message_deletions`                     | 用户个人隐藏消息关系                 | 消息 + 用户      |
| `community_chat_message_mentions`                      | 稳定提及关系与发送时展示快照         | 消息 + 用户      |
| `community_chat_message_images`                        | 聊天图片对象、绑定状态与清理期限     | 自增 + 公有 UUID |
| `community_chat_custom_stickers`                       | 账号私有自定义表情图片库             | 自增 + 公有 UUID |
| `community_chat_reads`                                 | 用户在聊天室的单调阅读位置           | 房间 + 用户      |
| `community_chat_blocks`                                | 用户单向屏蔽关系                     | 公有 UUID        |
| `community_chat_reports`                               | 消息举报与最小证据快照               | 公有 UUID        |
| `community_chat_moderation_actions`                    | 不可变更的举报处置审计               | 公有 UUID        |
| `community_chat_member_sanctions`                      | 社区成员禁言处罚                     | 公有 UUID        |
| `update_logs`                                          | Markdown 更新日志及 OBS 图片键       | UUID             |
| `opinion`                                              | 用户反馈                             | UUID             |
| `help_config` / `help_config_draft`                    | 帮助中心                             | UUID             |

更新日志使用 `update_logs` 单表保存标题、发布日期、摘要、兼容摘要、标签、Markdown 正文及该条日志拥有的 OBS object key 集合。编辑器以 Markdown 为唯一正文输入，历史重点更新首次编辑时自动转换为 Markdown，`highlights` 仅作为工作台等旧读模型的自动生成兼容字段。公开正文统一经 `marked + DOMPurify` 渲染；图片存放在 `update-logs/{logId}/` 前缀，页面使用稳定站内地址，由后端为私有 OBS 对象生成短时下载签名。保存正文时按 Markdown 实际引用收敛 `image_keys`，事务提交后清理被移除的对象；删除日志同样先提交业务事务再清理 OBS。旧 `config_json` 数据由幂等迁移导入，迁移前公开读取仍可回退旧格式。

笔记模板：内置模板（日报/周报/会议纪要/读书笔记/项目计划/复盘/知识卡片）为前端常量（`config/noteTemplates.ts`，含 `{{date}}` 等占位变量的文案不进 i18n 文件）；用户自存模板存 `note_template`（每人上限 20，硬删除不接回收站），`name`（库内显示名）与 `title_template`（新笔记默认标题，可含变量）语义分离。`/noteLibrary/templates` 是自定义模板统一管理页，静态路由必须声明在 `/noteLibrary/:id(.*)` 之前；笔记库顶部、新建选择器和笔记“更多”菜单都进入同一管理页。管理页通过 `queryNoteTemplates / getNoteTemplateDetail / addNoteTemplate / updateNoteTemplate / duplicateNoteTemplate / delNoteTemplate` 完成列表、详情、创建、显式更新、服务端复制和删除；编辑器运行在 `context = template` 且不伪造笔记 ID，图片以内嵌方式保存，不建立笔记资源引用。模板创建后格式锁定，若需要另一种格式必须新建模板。

`note_template.revision` 从 1 起步并用于乐观并发控制；模板更新必须携带 `baseRevision`，服务端在事务内按归属 `FOR UPDATE`，版本不一致返回 `NOTE_TEMPLATE_VERSION_CONFLICT`，前端只能让用户加载最新版本或把本地内容另存为副本，禁止静默覆盖。模板复制在服务端事务内完成，并锁定账号行串行校验 20 个上限，避免客户端读取正文后再写回造成竞争。笔记正文图片按引用计数清理：彻底删除笔记后，仅当 URL 既无 `note_images` 残留引用、也无模板正文引用时才删除物理文件；新建笔记与存为模板都会校验图片归属并登记引用。

笔记库使用笔记自身组成页面树，不新增文件夹实体：`note.parent_id` 指向同 owner、未删除的父笔记，`NULL` 表示“我的知识库”根层；最大深度为 8。`note.is_top` 只表达当前父层内的整理状态，不改变 `update_time`；`sort` 同样只在 `(create_by, parent_id, is_top)` 兄弟组内有序。卡片、列表和目录树都使用前后锚点排序：目录树节点上沿/下沿分别表示插到该同级页面之前/之后，中央表示移入为子页面；“我的知识库”是移到根层同置顶分组最前的专用落点。松手后前端立即乐观更新目录位置、父子数量与置顶状态，接口失败才完整回滚。列表视觉上始终按置顶与普通分组；将页面拖到另一分组节点的上沿/下沿时，被拖页面会跟随目标自动置顶或取消置顶，因此可直接插到第一个置顶页面之前。面包屑页面仍作为移入父页面落点，目录树节点本身也可作为拖拽源；树节点前后插入时列表会动画让位，原生拖拽预览固定为小型标题浮标，避免遮挡落点。移动页面会携带全部后代，服务端用内存树快照校验父页面归属、循环与深度，不能依赖 MySQL 8 递归 CTE。桌面端左侧常驻树、右侧卡片/列表只展示直接子页面；顶层工具栏的“新建笔记”始终创建到“我的知识库”根层，当前目录标题栏、树菜单和父页面详情中的“新建子页面”才使用当前页面作为父级。树菜单和父页面详情分别提供“添加已有子页面”与“移动此页到…”：前者把其他页面移到当前页下，后者把当前页移到其他父页面下。目录与标签是互斥的两套分类入口，切换时清理另一套 URL 范围，不叠加过滤；关键词只作用于当前启用的分类范围。移动端通过底部目录 `BDrawer` 逐级进入，不卡片化复刻整棵常驻树；工具栏只保留一个当前范围入口，并只显示当前启用的目录或标签分类。账号偏好 `preferences.noteSidebarMode` 决定笔记库默认打开目录或标签侧栏，缺省为目录，不需要新增 Schema。

笔记分享使用独立公开阅读页 `/share/note?page=<noteId>#token=<opaqueToken>`，不复用登录后的笔记详情壳。单篇分享只允许读取根页面；目录分享按当前 `note.parent_id` 父链动态计算根页面及其后代，新建/移入会进入分享、移出会立即离开分享，服务端在创建或移动到有效分享目录前返回 `NOTE_SHARE_EXPOSURE_CONFIRMATION_REQUIRED`，由用户明确确认后重试。公开页不加载编辑工具栏、标签、历史、导出、私人页面树、AI 助手或账号探测；桌面端按内容显示“页面/大纲”侧栏，移动端使用底部 `BDrawer`。分享主令牌只以 SHA-256 摘要保存并放在 URL fragment，首次解析成功后换取绑定 `share + root + owner + scope` 的 30 分钟 Redis 阅读票据；访问码使用 scrypt，访问次数只在首次解析时原子增加。公开读取继续复用笔记正式读取模型与 HTML 白名单；站内笔记引用必须再次通过同一分享范围校验，文件和书签引用不随笔记分享获得权限。响应统一 `no-store`、`no-referrer`、`noindex`，分享可设置 1/7/30 天有效期、访问码、最大访问次数，并支持多链接、撤销与轮换。

置顶只在当前父层内有意义：置顶页面拖到另一目录中央时允许直接移动并自动取消旧层的置顶，不要求用户先手工解除；如果拖到新父层的置顶节点前后，则跟随目标保持为置顶。目录树与移动抽屉要显示实色置顶图标，并在节点菜单提供置顶/取消置顶；拖拽过程的全局提示要在松手前说明“并置顶”或“并取消置顶”。

子树删除使用 `tree_delete_batch_id` 记录一次删除批次：有后代的页面必须按实际子树数量确认并原子软删除；恢复只恢复同批节点，更早单独删除的页面不能被带回。硬删除、账号注销、JSON 导入/导出和回收站批量操作都必须携带页面树关系；导入先对外部 ID 做 owner 内重映射，再校验循环与 8 层上限。父页面本身仍是可编辑正文；桌面详情通过左侧共享页面树浏览子页面，移动详情底部只保留 52px 紧凑子页面入口。页面路径中的父页面直接打开对应正文，只有“我的知识库”根节点返回列表，详情页之间沿树连续切换时不再层层嵌套列表来源 URL。“页面”和只读取当前正文 H1/H2/H3 的“大纲”是两套独立结构。

笔记详情使用账号隔离的 `noteWorkspace` 共享 Store 保存页面树缓存、展开集合、当前正文 `activePageId`、卡片浏览范围 `browseParentId`、左侧栏宽度和双侧栏偏好。`noteDetail` 的主 `router-view` key 在笔记 ID 之间保持稳定，路由更新先保存旧笔记，再由详情页通过带版本号的请求切换正文；标题栏、页面树与 AI 面板不卸载，仅编辑内容区按笔记 key 重建并过渡，快速连续点击时旧请求不得覆盖新页面。正文上方的面包屑属于稳定工作区外壳：切换笔记时“我的知识库”根节点、分隔线和整行高度持续保留，只原位更新根节点之后的页面路径，不能随 keyed 编辑内容离场再重建。布局断点由纯函数统一裁决：宽屏左右常驻；标准桌面左侧常驻、AI 按需 Overlay；紧凑桌面显示 50px 页面轨道或互斥 Overlay；移动端不挂载桌面侧栏，通过单一“导航”底部 `BDrawer` 切换“页面 / 大纲”。临时 Overlay 与用户偏好分开存储，断点切换不得覆盖偏好。共享/外来笔记默认隐藏私人页面树，只保留当前正文大纲。

笔记正文编辑器的 HTML 与 Markdown 仍是两种正式文本存储格式。两种模式共用 `EditorToolbarV2`：桌面保留高频按钮并把低频能力收进“插入/更多”，编辑区变窄时只收起菜单文字而不移除功能；快捷键帮助使用独立键盘图标，按当前富文本或 Markdown 模式展示真实可用组合键；移动端固定六个 46px 入口，其余能力（含快捷键帮助）进入底部操作面板。行首输入 `/` 会打开两种模式共用的区块命令菜单，命令按正文、列表、内容区块和插入分组；方向键高亮复用通用资源选择器的容器内最近边缘滚动，只移动菜单滚动层，不推动正文页面。Markdown 在同一个 CodeMirror transaction 中替换触发文本，代码块先选择语言并生成带语言的围栏，富文本代码块复用 TinyMCE `codesample` 对话框与高亮链路。斜杠菜单与 `@` 资源提及互斥，并在 IME 合成期间让出按键。撤销、重做由两种编辑器各自的历史栈执行，重做同时兼容 `Ctrl/⌘ + Shift + Z` 与 `Ctrl + Y`；“重复上一步”是独立的格式复用能力，按模式记住最近一次加粗、列表、颜色、渐变等可重复操作，通过 `F4` 或 `Ctrl/⌘ + Alt + R` 再次执行，不得与重做共用语义或状态。移动端正文长按和选区必须由系统原生复制、粘贴、全选菜单接管，不挂载 TinyMCE 选区快捷条、上下文菜单或 Markdown 划词浮层。Markdown 源码由 CodeMirror 6 编辑，GFM 解析只负责语法能力和高亮，数据库正文仍保存原始 Markdown；预览继续走统一的 `marked + DOMPurify` 安全渲染。HTML/Markdown 切换先展示保留、标准化与可能丢失项，确认后才转换；格式切换前的旧态强制写入带 `reason = format_conversion` 的历史还原点。

手绘笔记使用同一 `note` / `note_versions` 表，通过 `note.type = drawing` 区分，不新增表或第三方画布依赖。`content` 保存 `@lightnote/shared/drawing-note` 定义的 scene JSON：当前 v3 固定为 1448 × 1448 方形页面，允许受控的笔画、文本与基础形状元素；笔画可附带仅作用于自身的圆形擦除采样，渲染时在独立透明层完成像素擦除后再按原场景顺序合成，因此小橡皮可在粗笔画内形成小圆孔且不会擦伤其下方元素。场景限制为 750KB、1000 个元素、800 条笔画、5 万组笔画坐标、2000 条擦除轨迹、5 万组擦除采样、200 个文本框和 300 个形状。形状只包含直线、箭头、矩形、圆角矩形、椭圆、三角形和菱形，保存有符号宽高以保留线条方向，不支持填充、旋转或任意多边形。v1 的 1024 × 1448 旧画纸与 v2 方形画纸继续可读；v1 拒绝 shape，新编辑器在内存中将 v1 所有 x 坐标平移 212，v2 只升级版本且不移动内容，均不缩放、不裁剪，只在用户实际保存后写成 v3。创建、专用保存、备份导入、详情读取与版本恢复均在服务端重新规范化；正文保存只走 `/api/note/updateDrawingNote` 并携带 revision，通用 `/updateNote` 拒绝手绘正文或类型提交。客户端上报最高支持的 `drawingSceneVersion`：高版本可读低版本，低版本不会收到高版本正文。

手绘编辑器以独立异步 chunk 加载，原生 Canvas 2D 只在手绘详情挂载；编辑态使用无原生滚动条的相机视口，首次进入按可用宽度缩放并居中、最高 100%，宽屏保持原始比例的 100% 书写尺度，画纸高度超出时通过手形工具平移；鼠标中键和右键在任意工具下临时进入平移，滚轮纵向增量以指针位置为锚点连续缩放，原生横向增量或 Shift+滚轮修改水平相机偏移，以上导航手势均不切换工具、不修改 scene 或历史。scene v3 让笔画与形状轮廓复用元素专属擦除遮罩：元素先在隔离透明层应用 `destination-out` 再按 z-order 合成，保证局部擦除不穿透下层；文本保持对象语义并由选择工具删除。文字工具提交后清空选择态，选择虚线只在选择工具显示；多选完成后使用统一组合包围框，命中框内空白也可拖动全部已选元素。直接预览仍由外层阅读区承载完整方形画纸，画板适配完成后只在首次进入时把画纸中心无动画对齐到视口中心，后续滚动和容器变化不得反复抢回位置。笔画采样与元素拖动使用非响应式临时对象并按 `requestAnimationFrame` 重绘，完成一次操作后才更新 Vue 状态，自动保存合并窗口为 3 秒。通用列表、全局搜索、标签图谱、AI、知识索引和目录分析不读取或解析 scene，手绘只按标题检索；分页列表始终省略 scene。手绘卡片接近可视区时通过 `/api/note/queryDrawingPreviews` 最多合并读取 12 篇当前用户的正文，服务端把场景限制到 120 个元素、1600 组轨迹点和 4000 个文本字符后返回，前端只用固定 480 × 270 Canvas 按内容范围智能居中取景，缩放下限为完整画纸 `contain`、上限为其 3 倍，并按 revision 短期缓存；这样正常绘画更易辨认，单点仍只保持像素级尺寸。离屏卡片不请求、不绘制。历史列表只回元素数，选定版本恢复时才读取完整内容。不支持图片元素、OCR、AI 正文编辑、模板或 HTML/Markdown/PDF 转换；单篇可导出 PNG 或原始 JSON，批量“原格式”导出使用 JSON。

笔记详情数据与对应编辑器运行时并行加载：正文数据到达后先由编辑区骨架遮住尚未就绪的真实编辑器，运行时在 300ms 内完成时直接交接，不额外挂载整篇静态正文；只有超过阈值的慢路径才显示已获取的安全静态预览。富文本预览必须与 TinyMCE 共用 `note-editor-rich-content` 排版规则，并执行相同的图文结构规范化、待办布局和站内资源引用展示装饰；Markdown 预览按 CodeMirror 的字体、行高和正文起点渲染。静态预览不得发起资源查询或接管交互，真实编辑器就绪后立即移除，以兼顾首次可见速度、长笔记渲染成本和交接时的零位移。移动端只允许在笔记库后台预热轻量详情路由，禁止在启动定时器或列表定时器中同时导入 HTML/Markdown 大型编辑器；用户按下具体卡片后才并行加载该笔记对应的一套运行时，避免预热下载与模块解析撞上列表渲染或真实导航。桌面端仍可在首屏稳定后的空闲期预热两套运行时。

笔记库卡片与列表共用同一批量导出能力：服务端一次只读返回所选笔记的标题、类型和正文，前端可按每篇原格式（HTML 笔记输出 `.html`、Markdown 笔记输出 `.md`、手绘笔记输出 `.json`），或把 HTML/Markdown 统一转换为 HTML、Markdown、PDF；手绘不参与转换模式。每篇笔记生成独立文件，同名文件自动追加序号，最终打包为一个 ZIP；PDF 必须逐篇顺序渲染，避免并行长图占满浏览器内存。移动浏览器优先使用系统分享，Android App 继续通过短时下载票据把 ZIP 交给系统下载目录，不恢复旧的批量 JSON 备份语义。

笔记库卡片图片预览只识别正文开头的本站已上传图片：列表 SQL 最多读取 4000 字符正文前缀，但 `previewVersion = 2` 的分页响应由服务端在这段有界文本中一次生成纯文本摘要、首图前后文字和独立 `previewImageUrl`，随后省略 `content`；旧客户端未声明版本时仍返回正文前缀，支持前后端滚动发布。这样 root 等笔记较多的账号不会让几十张卡片在移动 WebView 主线程各自执行 Markdown/HTML 净化和 DOM 解析；不恢复 `v-html`，也不为列表增加图片查询。卡片把缩略图放回正文原有顺序：图片前有文字就先显示文字，再按内容流显示图片与后续摘要；仍只挂载一张图片，使用原生懒加载和异步解码，失败时原位退回纯文本，列表视图不挂载图片。本地开发机没有生产缩略图目录时只允许 localhost 从已经校验过的 `source` 参数回退本站原图；线上与 App 始终读取服务端单并发生成的 720px、质量 76 WebP 派生图。新上传图片异步预热，历史图片通过 `backfill:note-thumbnails` 批量补齐，图片请求冷路径仅作兜底。派生缓存位于上传目录之外，原图物理清理时同步删除，不进入后台图库或资源引用计数。

富文本“图文组合”使用受控的 `section.ln-media-text > figure` 结构，每个 `figure` 只绑定一张图片和一段说明；图片左右位置与 30%/36%/42% 宽度保存为 `data-ln-media-*` 属性，渲染统一使用 flex，禁止借用普通图片的 `float`。桌面端图片列最多 320px，移动端按所选比例并排展示；HTML 转 Markdown 时整段保留为受控 raw HTML，切回富文本和离线导出均恢复同一结构。

富文本“渐变文字”使用 `.ln-text-gradient[data-ln-text-gradient="true"]` 受控结构，只持久化起止十六进制颜色与枚举方向三个 CSS 变量；真实渐变、旧示例的卡片/发光/呼吸/旋转/漂浮效果均由应用语义 class 渲染，不把任意 `background`、阴影或 `animation` 放回正文白名单。历史示例读取时由服务端净化器识别旧内联效果并升级为该语义协议；HTML/Markdown 往返与离线 HTML 导出继续保留受控渐变配置。

笔记标题、正文或正文类型更新使用 `note.revision` 乐观并发控制；当前 Web 客户端写入必须携带已读取的 revision，服务端事务内 `FOR UPDATE` 后不匹配即返回 `NOTE_VERSION_CONFLICT` 和经过净化的当前快照，不允许静默覆盖。未保存草稿按账号/代管上下文与笔记 ID 隔离保存在 IndexedDB `lightnote-note-drafts-v1/noteDrafts`，250ms 合并写入、30 天过期且每个身份域最多 20 条；仅在 IndexedDB 不可用时使用 localStorage 应急副本，并在恢复后自动迁回。版本冲突只能由用户选择保留云端、另存副本或二次确认覆盖。`note_versions.source_revision` 记录快照对应版本，`reason` 区分自动保存、格式转换、AI 修改、AI 撤销和恢复；HTML/Markdown 切换使用 `POST /api/note/convertMode`，请求必须携带 `baseRevision`、目标正文和预览指纹，服务端在同一事务内复核指纹、强制留档、更新正文/类型并同步资源引用。格式转换、AI 写入/撤销与版本恢复必须强制留档，不受普通自动保存的三分钟合并窗口影响。HTML 正文在创建、更新、AI 写入、导入、模板保存、新用户示例、历史恢复和旧数据读取边界统一经过服务端 allowlist 净化；Markdown 源码不得经过 HTML 净化器改写。

笔记详情顶栏按可用宽度分层：桌面端直接展示标签、历史版本和导出三个高频操作，其余低频动作保留在“更多”；平板和移动端继续从菜单或操作抽屉进入，不能因桌面直出而丢失入口。只读状态仍必须隐藏写操作，但保留导出等允许的只读能力。

桌面端从笔记库的卡片、列表或页面树打开已有笔记时默认先进入库内只读预览，并保留明确的“编辑”按钮；设置中心可开启账号级 `preferences.noteDirectEdit`，开启后上述入口直接进入正式编辑页。该设置只在 PC 显示，缺失值与关闭状态都按预览处理；移动端受触控流程约束，始终直接进入编辑页，不读取这项偏好。新建笔记和预览页内的“编辑”动作也始终直接进入编辑页。

页面树采用六个账号级 Feature Flag 分阶段灰度：`note_tree_read`、`note_tree_write`、`note_tree_mobile`、`note_tree_subtree_trash`、`ai_note_branch_scope`、`ai_note_branch_analysis`。生产环境未配置时默认关闭，Root/测试账号先行，普通账号按 subject ID 稳定分桶；显式急停对所有身份生效。下游开关必须依赖上游读取/写入能力，API 与 Agent 执行边界都重新校验。页面树遥测复用无正文 `ai_product_events`，只记录枚举和数量/耗时桶，不记录标题、路径、正文、搜索词或页面 ID。

书签、笔记库和云空间主列表采用服务端分页：前端首屏固定请求 48 条，接近滚动容器底部时增量合并下一页，接口同时返回当前筛选条件下的 `total / page / pageSize / hasMore`。关键词、标签、目录/文件夹、无标签和文件分类必须先在 SQL 中完成过滤与总数统计，再应用 `LIMIT / OFFSET`；云文件只为当前页生成签名地址。云空间的上传时间正反序、名称升降序和大小升降序都由服务端白名单排序后再分页；文件没有独立更新时间，重命名、移动和改标签不改变上传时间。卡片与列表共用 Store 中唯一排序状态：宽桌面显示当前排序短标签，中等宽度桌面收成带完整悬停说明的排序图标，列表表头只是同一状态的快捷入口；移动端排序放进页面操作抽屉。书签通过全局同置顶分组锚点排序；笔记在页面树模式按当前 `parentId + isTop` 兄弟组锚点排序，旧调用未传树模式时继续兼容平铺读取。目录内关键词搜索由服务端从 owner 树快照扩展后代 ID，并返回面包屑路径与子页面数量。已加载前缀可以拖拽、未加载尾部不会被局部编号覆盖；拖到当前已加载末尾只表示插入该锚点之后，只有加载到真实末尾后才能拖到全局最后。标签编辑、标签详情和管理页等尚未迁移的旧调用显式使用不分页模式并保持原响应结构，后续迁移前不得依赖分页默认值。

云空间文件预览统一由 `FilePreview.vue` 承载，桌面与移动端的上一个、下一个和下载操作固定使用同一套底部控制栏。视频默认暂停并由用户明确开始播放，音视频在进入播放器前通过 `canPlayType()` 做浏览器能力判断，真实解码失败仍回到可下载的稳定错误态；卡片视频使用完整比例缩略图、播放标识和可用时长。PDF 必须继续由前端主动拉取签名地址的字节数据并交给 `PdfPreview.vue` / PDF.js 渲染，禁止改回 `iframe`、`embed` 或直接导航到对象存储地址，避免浏览器把“查看”处理成下载。

云空间批量下载在多选时必须先让用户选择“分别下载”或“打包为 ZIP”；单文件仍走普通下载。普通浏览器分别触发每个文件的下载，ZIP 模式继续用有进度、可取消的前端打包；Android App 因系统 `DownloadManager` 无法保存 WebView Blob，只提供逐个交接并在选择器中明确说明 ZIP 不可用，不能静默把所选文件改成另一种结果。

新增格式由 `@lightnote/shared` 的统一注册表同时驱动前后端分类：ZIP/RAR/RAR5/7Z/TAR 及 GZ/BZ2/XZ 系列压缩包只在服务端调用 7-Zip 生成受限目录清单，前端支持目录导航、搜索和分页，不解压或读取包内正文；`.doc/.xls/.ppt/.rtf/.odt/.ods/.odp` 由独立 Worker 调用 LibreOffice 分别按 Writer、Calc、Impress 过滤器转换为私有 PDF，再沿用 `PdfPreview.vue`；TSV、JSONL/NDJSON、SRT、VTT、ICS、VCF、DIFF、PATCH 直接走已有文本预览。派生结果以源对象 ETag、大小、格式和策略版本作为缓存指纹，源文件变化后重新排队。分享页首次准备预览仍执行分享密码、有效期和次数校验并计一次下载授权，后续轮询使用短时随机票据，不重复计数。

`file_preview_artifacts` 保存任务状态、压缩包目录或派生 PDF 私有对象键，`file_preview_jobs` 保存单文件幂等任务和数据库租约；两类重处理任务与 AI 文档解析共用单并发 `documentWorker.js` 并交替取队列，避免 LibreOffice、7-Zip 和 OCR 同时抢占资源。压缩包设文件大小、条目数、路径长度、清单大小、超时和可疑膨胀提示，异常路径不进入清单；Office 转换使用随机私有临时目录、独立 LibreOffice profile、无 shell 子进程和输出大小上限。永久删除文件后，保留的派生记录由 Worker 定期识别孤儿记录并删除对应 OBS 对象；长期未访问的完成/失败记录也按保留期回收。

资源中心主结果流通过 `/search/global` 的 `ordered` 分页模式，按“书签 → 笔记 → 文件 → 标签”的固定分组顺序连续取数，每批合计最多 40 条；当前类型不足一批时由后续类型补齐，并以 `{ type, offset }` 游标从准确位置续取。首批返回经过关键词、资源类型、标签、无标签、日期和排序条件后的 `typeTotals`、`hasMoreByType` 与标签筛选选项，追加批次不重复执行这些统计查询；页面只为已经加载的类型显示一次分组标题。全局快捷搜索、提及选择器等小型预览调用继续使用按类型限量的兼容模式。前端不再用 `limit=0` 拉取书签、笔记、文件和标签全量后本地筛选；请求版本号负责阻止旧关键词或旧筛选响应覆盖新结果。

资源中心批量选择分为显式 ID 与 `allMatching` 查询范围两种模式。后者只保存关键词、资源类型、标签、无标签和日期条件以及少量排除项，服务端复用搜索过滤构造器解析当前账号的完整资源集合；页面滚动加载数量不再限制“选择全部”。`/search/batchSelectionPreview` 返回权威总数和分类型计数，删除、标签更新与加入待整理分别在服务端按块处理，并继续逐项校验资源归属。AI 材料仍只接受最多 5 个显式资源，不继承全量选择语义。

搜索类型分为 `ResourceSearchType`（书签/笔记/文件/标签）与 `GlobalSearchType`（再加待办），声明在 `utils/globalSearchTypes.ts`。待办是行动对象而非资料对象：它能被全局搜索找到，但不进资料四页签、`@` 资源选择器、标签操作、待整理和资源批量删除。服务端 `normalizeSearchTypes` 只在调用方**显式**声明 `types` 含 `todo` 时才查询 `todo_items`，缺省仍是资源四类，因此资源选择器等既有调用方既不会拿到待办，也不承担额外统计查询。待办检索第一版只覆盖 `title` 与 `description`，按 `user_id + del_flag` 归属过滤，参考资料数量由 `todo_resource_refs` 同样按归属统计；未完成状态只作为同一相关度档位内的弱权重，不会让低相关度的未完成待办压过标题完全匹配的已完成待办。按标签或无标签筛选时待办整体退出结果，不伪装成"无标签资源"。完整模式新增 `todoStatus / todoPriority / todoDue` 条件，仅在选中待办时下发。

完整搜索页（移动端）也不放一排类型 Tab：类型收进底部筛选抽屉做多选，主页面只保留一行「总数 + 各类型数量」。抽屉里的待办状态与待办优先级按条件显示——只有当前选中待办时才出现，取消待办立即隐藏，因为待办不属于标签体系也不该在纯资源筛选里占位。待办条件只在选中待办时随请求下发，避免污染纯资源查询的缓存键。搜索结果里的待办不参与资源批量语义：`selectableVisibleItems` 用 `isResourceSearchType` 过滤，批量加标签、加入待整理和批量删除都取不到待办。

`mode: 'suggest'` 是快捷搜索层专用的轻量模式：只按相关度取少量候选并做类型均衡（总数最多 8 条、单类型最多 3 条，其他类型没有匹配时才用超额类型补足），不返回 `typeTotals`、`tagOptions` 和分页，前端按"账号 + 语言 + 关键词 + 类型"做 30 秒短缓存，资源写操作触发 `clearGlobalSearchCache` 时一并失效。

### 移动端搜索入口

移动端只保留一个文本搜索入口，且它始终是全局搜索，不再按页面变成局部搜索框。入口外形可以因页面空间不同而不同，但能力必须相同——都打开同一个 `MobileGlobalSearchOverlay`、用同一套取数、最近搜索、结果跳转和关闭逻辑：今日、资料、待办用宽搜索框，AI、聊天室与我的用放大镜图标（`MobileTopBarBinding.searchMode`）。完整搜索页 `/search` 通过 `ownTopBar` 让共享顶栏整体让位，改用自己的"返回 + 唯一输入框 + 取消"，输入框直接驱动结果，避免同屏出现两个搜索框。各资源页只保留文件夹、标签、状态、排序、视图等结构化筛选；桌面端各页自己的搜索框不受影响。

搜索层不是路由：打开时插入一个 history sentinel，Android 返回键优先关闭搜索而不是退出页面；点击结果时先让 sentinel 出栈再跳目标路由，否则返回键会把新页面一起弹掉。层高按 `visualViewport` 计算，避免软键盘弹出后结果被遮挡。最近搜索按账号 ID 存本机、最多 8 条、不同步服务器，埋点只记录类型和来源页，不记录原始关键词。

通用移动端浮层遵循同一历史栈规则：`BModal`、`BDrawer`、`BAlert` 与图片预览在打开时加入 history sentinel，系统返回键或返回手势优先关闭最上层浮层，不直接切换业务路由；嵌套浮层按后进先出关闭。业务组件不再各自重复实现返回键监听，确有独立路由语义的全屏层除外。

当前页面只影响排序，不改变搜索范围：`MobileTopBarBinding.searchSourceType` 声明本页主资源类型（书签页 `bookmark`、待办页 `todo` 等），服务端按它给同类结果 +3 分。该值必须小于相关度档位间隔（10），否则会退化成事实上的局部搜索——在待办页搜索仍然要能看到相关书签、笔记、文件和标签。来源页会进快捷搜索缓存键。

### 移动端「今日」

`/workbenches` 一个路由两种产品形态：桌面端渲染 `DesktopWorkbenchView`（完整工作台），移动端渲染 `MobileTodayView`（今日）。两端是不同的产品概念而不是同一页面的两种布局，因此不按 `XxxDesktop / XxxMobile` 命名；桌面工作台带图表和大量统计，通过异步组件加载，移动端不为它付出下载成本。

今日首屏同时承担统一总览与当天行动：顶部总览与桌面工作台保持同一口径，依次展示全部未完成待办、待整理和未读通知；移动端为避免三等分入口拥挤，第二项固定使用短名称「待整理」。日期问候中的件数仍只统计逾期、今天到期和待整理，表达今天应优先处理的事项；下方继续展示今日待办与待整理明细（复用 `TodayActionSection` 的完成、延期、编辑和整理能力），逾期状态在明细中用危险色明确标出。页面不放「查看全部待办」按钮——底部导航已有待办一级入口，重复入口只会占位。资源总量、增长趋势、文件类型分布、常用标签排行和最近更新只留在桌面工作台，不搬进移动首屏。「每日回顾」暂不纳入。

继续处理取最近编辑的笔记与最近上传的文件，按活跃时间合并后最多 2 条。它不复用桌面工作台的近期列表——那两个查询各取 10 条并 JOIN 标签、生成文件签名地址，而今日页只需要标题和一个可跳转 ID；高频书签依赖 `operation_logs` 的 LIKE 聚合，成本高且语义上属于「常用」而不是「上次做到哪」，第一版不纳入。

数据来自 `POST /api/workbench/today` 轻量聚合，不复用完整工作台接口（后者会额外跑趋势、饼图、排行和最近列表共 8 组查询）。明细按今日页展示上限截断（逾期 3、今天 4、待整理 3），但摘要计数使用权威总数，不能把「最多取 3 条」显示成「只有 3 条逾期」。移动端快速记录覆盖书签、笔记、文件和待办；待办先使用轻量表单，需要时可继续进入完整编辑界面。

`workbench` 是移动端默认首页（`MobileHomePreference` 的默认值），设置页在移动端把这一项显示为「今日」并隐藏移动端不支持的资源中心。`getMobileHomePreference` 直接读原始偏好，不经过 `getHomePagePreference` 的桌面兜底——后者会把「没设置过」归一成书签，导致移动端默认值永远生效不了。

「默认首页」只在桌面端作为设置项出现：它影响登录后的落点和桌面 Logo（Logo 进 `/app`，桌面按该偏好解析）。移动端不显示这一项——冷启动与底部「今日」始终使用固定落点，顶部头像只负责进入「我的」，移动端并不存在一个可由该偏好改变的落点，暴露这个开关只会误导。

同理，移动端还隐藏了几个自身就只对桌面生效的设置：AI「默认全屏打开」（移动端始终全屏）、AI「记住抽屉宽度」（移动端 AI 是全屏容器，没有可拖拽抽屉）、以及需要拖进浏览器书签栏的「收藏按钮」bookmarklet。判断标准是该设置在移动端有没有可操作的对应物，而不是它属于哪个分区。

底部导航为 `今日｜资料｜AI｜待办｜聊天室`，AI 保持中间强调。个人中心从固定底栏移到移动顶栏左侧头像；头像继续显示成长升级与 Android 新版本的聚合红点，并在「我的」页用实色描边表示当前入口。`/inbox?tab=todo` 高亮待办，`/inbox?tab=all|bookmark|note|file` 与 `/search` 高亮资料——待整理和资源中心属于资料处理。

桌面顶栏保留 `工作台｜书签｜笔记｜云空间｜待办｜聊天室` 六个普通用户主入口：书签、笔记、云空间是核心工作对象，必须一键互切，不能为了减少视觉数量再加一层下拉。资源中心和标签归入右侧更多菜单，资源中心只是降为次级入口而非下线；聊天室保留带文字的独立描边入口和未读角标，不能藏进更多菜单。「共建轻笺」不占一级导航，但游客在右侧更多菜单和个人中心都能看到，登录用户也继续在个人中心看到；Root 的「管理」仍按角色追加。

`/community-chat` 是与 AI `/chat` 完全分离的社区领域路由，移动端高亮底部「聊天室」。当前公共模式为“游客可读、登录用户可发言”：页面直接进入唯一活跃房间 `general / 轻笺聊天室`，不经过邀请状态介绍页，也不渲染顶部频道标签或桌面频道侧栏；首个请求期间只显示与单栏聊天室同构的骨架，维护或连接失败也只在消息工作区内重试。公告走现有通知中心或消息流内的单条全局置顶，不占独立频道；置顶栏只展示当前消息的低干扰摘要，普通成员只读，Root / 社区管理员可在消息操作中置顶、替换或取消，操作写入治理审计但不产生通知或未读，撤回和审核隐藏会在同一事务中自动清空置顶。新手问答、技巧和功能想法先共用主消息流，达到明确活跃阈值后再拆房间。消息内的引用条采用细竖线和单行摘要，点击后复用公有消息 ID 聚焦协议：当前窗口已有目标时直接居中并短暂高亮，目标未加载时由 `?message=<publicId>` 读取包含原消息的历史窗口。消息支持每页 30 条的游标历史（首屏只取最新 30 条，滚动接近顶部时自动按游标加载更早一页，并保留手动重试入口）、全负载幂等发送、同房间回复、带公开昵称摘要的点赞、最多 4 张受控图片、阅读位置、登录用户未读、四档站内提醒、举报、屏蔽和 Root 审核处置；普通用户只可在发送后 120 秒内真正撤回自己的消息，但超时后仍保留撤回入口并由客户端解释规则，管理员/社区管理员可撤回任意活跃消息。发送动作先插入本地待发送气泡，服务端响应后按公有消息对象对账，已读写入不阻塞气泡出现；请求结束后焦点回到消息输入框。撤回只把消息改为 `recalled`，不清空正文或解绑图片：所有人看到的占位只写“该消息已撤回”，管理员仍可在权限内查看原文，管理员代撤回同时写入治理审计；若该消息曾因回复或提及进入通知中心，撤回会同步软删除对应通知。每个登录用户最多积压 12 张待发送或待清理图片，并用账号行锁串行预留配额。用户浏览历史时新消息只显示实色描边按钮，不抢滚动。消息列表只返回可缓存的短头像地址，头像正文按需读取；同页同一作者复用地址，避免在每条消息中重复传输 Base64。未上传头像时使用聊天室固定彩色默认头像，已佩戴头像框独立叠加，接口不返回内部账号 ID。站内通知使用 `/community-chat?message=<publicId>` 打开包含目标消息的可见历史窗口，以实色描边定位原消息，并在存在更新内容时显示“回到最新消息”；目标被隐藏、个人删除、屏蔽或不可见时移除失效参数并回退最新消息。PC 与移动端共用真实工作区；realtime 开启时使用同源 `/realtime/chat` 接收消息、审核、互动、权限、运行策略和项目在线人数变化信号，再由 REST 拉取当前用户可见的权威消息。在线人数统计当前处于前台的整个项目而非仅聊天室：登录账号按用户 ID 跨标签页和设备去重，游客按浏览器本地稳定标识去重，页面切换或短暂最小化保留 45 秒宽限，PC 与移动端统一显示“在线人数 N”，只公开聚合数、不公开成员列表。连接异常自动退回 8 秒前台刷新，连接正常也保留约 30 秒安全刷新以覆盖 Redis 跨实例故障。用户停留在聊天室之外时，`App` 根层为登录账号和游客保持唯一的 `general` 订阅；登录账号同时实时刷新服务端权威房间角标，游客只贡献在线人数。进入聊天室后关闭根层订阅、交由消息工作区连接接管，避免同设备重复连接。角标运行时不依赖可能因软键盘而卸载的移动底栏，短时事件会合并请求，若事件撞上在途目录请求则在请求结束后再补一次，断线时另保留 60 秒低频兜底。Root 从 `/admin/communityChatModeration`（移动端 `/communityChatModeration`）按证据快照驳回举报、隐藏消息、禁言或封禁作者；同页的运行状态卡可以填写原因后切换全站紧急只读。只读拦截新消息、点赞以及图片上传/绑定，但不拦截撤回、个人删除、历史与图片查看、已读、举报和屏蔽；切换、管理员撤回、消息状态和处罚均以事务写入不可变审计。原邀请申请、规则确认和准入审核表/路由保留为未来私密房间底座，不再阻断公共聊天。Android 后台推送、图片内容审核/元数据脱敏和申诉仍未接入；缺省环境继续失败关闭，页面不会用规划数据或演示消息冒充真实社区。

消息引用允许选择本人或他人的活跃消息。`撤回` 与 `删除` 是两套语义：普通用户只可在 120 秒内撤回自己的 active 消息，管理员/社区管理员可撤回任意时长的 active 消息；撤回会影响所有普通读者，但保留原文供管理员审核。`删除` 则为登录用户的个人隐藏，将 `(message_id, user_id)` 写入 `community_chat_message_deletions`，只从当前用户自己的历史、深链和未读中排除，不改变其他人的消息可见性，也不修改消息全局状态；Root 的全局隐藏继续走举报处置/治理接口。PC 悬停操作条锚定在气泡旁；移动端不显示常驻省略号，直接点击气泡打开底部操作面板，两端按同一服务端权限返回点赞、引用、撤回、个人删除。移动端长按他人头像可添加提及，轻触仍打开用户卡；已选择的提及只用输入框上方 tag 表达，正文不重复插入 `@昵称`，键入 `@` 后的候选通过锚定输入框上沿的 `BPopover` 独立浮层展示，不参与输入区高度计算。`@所有人` 与个人提及互斥，只允许 Root 选择和提交，服务端以独立 `mention_everyone` 标记再次鉴权并负责通知扇出。点赞后气泡下方显示最多三位公开昵称摘要及总人数，账号 ID 不进入响应。

> 当前项目在线人数由 PM2 单实例内的实时 Hub 聚合；若未来切换为 cluster 或多机部署，必须先把在线身份集合迁移到 Redis 等共享 presence 存储，避免各实例只返回自己的局部人数。

### 社区客厅访问与图文消息基础层

- API 挂载在 `/api/community-chat`，当前提供访问/申请/规则/房间、消息历史/发送/已读/点赞/撤回、待发送图片上传/丢弃/鉴权读取、按消息公有 ID 读取作者公开资料与全部公开成就、当前账号名片读取与编辑、通知偏好，以及举报和屏蔽作者、屏蔽名单与解除屏蔽接口；Root 另有准入申请、成员撤销、举报列表与处置接口。消息历史查询的 `before` 与 `focus` 互斥：前者向上翻页，后者只为当前用户可见的 active/recalled 消息深链返回截至目标的历史窗口并标记是否还有更新消息。公共接口当前只接受 `general`，旧的 `announcements/newcomers/tips/co-build/topics/lounge` 数据通过兼容 migration 合并后归档，不能靠直连旧 slug 绕过前台。两类后台页面只消费这些受控 API，禁止绕过业务接口直接操作数据库。所有接口均不得扩张或复用私人 AI `/api/chat`。
- 消息动作另提供 `/messages/:publicId/like|recall|delete` 独立资源；`delete` 对当前登录用户创建幂等的个人隐藏关系，只影响该用户自己的读取结果，不能通过提交角色或目标账号改变他人可见性；全局隐藏必须走 Root 治理接口。
- `COMMUNITY_CHAT_ACCESS_MODE` 接受 `closed`（默认）、`public` 和为未来私密频道保留的 `invite_only`；未知值回退 `closed`。`public` 也必须同时显式设置 `COMMUNITY_CHAT_MESSAGING_ENABLED=true`，realtime 继续依赖消息总开关；候补名单与规则版本只服务邀请制流程。
- `COMMUNITY_CHAT_REALTIME_ENABLED=true` 才注册有效实时能力；HTTP server 只处理 `/realtime/chat` upgrade，关闭压缩并限制 4 KiB 客户端载荷、连接数、每 IP upgrade 和单连接订阅频率。浏览器必须带可验证 `Origin`：生产默认只允许与 `Host`/可信转发主机同源，额外来源由 `COMMUNITY_CHAT_ALLOWED_ORIGINS` 显式列出；缺失、`null` 或不匹配来源失败关闭。本地 `VITE_ENV=local` WebSocket 代理保留设备访问 Vite 的原始 Host，使局域网 Debug App 的 Origin 继续按同源规则校验，禁止改写成 `127.0.0.1:9001` 后扩大局域网白名单。连接只从 sid Cookie 恢复会话，再查 `user` 实时角色、账号限制与社区可读权限，查询参数和订阅包都不接受 user ID、角色或内部 ID。25 秒 ping/pong 清理失联连接，约 2 分钟复核会话与权限，慢客户端超过发送高水位后要求重连。
- Android App 的站内通知与聊天室消息不进入系统通知栏，也不维护桌面图标数字角标。曾试验的 `/realtime/notifications` + WebView 原生桥链路已移除：卓易通等兼容层会在最小化后冻结网页运行时，恢复前台才补发，无法满足实时性且会造成延迟提醒。下载进度通知仍由系统 `DownloadManager` 独立负责；真正的后台提醒必须以后端消息 Outbox、设备 Token 和厂商推送为前提，不能复用网页轮询或下载通知冒充。
- WebSocket 只广播 `message.created`、`message.updated`、`message.removed`、`runtime.changed`、定向 `access.changed` 等小型变化事件；点赞与撤回共用 `message.updated`，事件只携带变化原因、房间和消息公有 ID，消息正文、点赞名单、头像 Data URL 和账号身份不进入事件包。历史、屏蔽过滤、`isOwn` 与消息顺序仍以 REST/MySQL 为准。业务事务提交后才向当前进程和 Redis `community-chat:realtime:v1` 发布，Redis 发布/订阅失败不得回滚已提交消息。前端按 `eventId` 去重，1/2/4 秒指数退避并加抖动，重连、切网或回前台后立即调 REST 补齐；旧 3000 端口 echo 演示已移除。
- 公共模式下游客取得 `read_only`，可读取 `general` 和消息，但不能发送、回复、举报、屏蔽、写已读位置或产生个人未读；普通登录用户无需邀请直接取得 `active` 和发言权限。`community_chat_members.status = banned` 仍会拒绝访问，active moderator 保留治理角色。Root 普通上下文可管理，管理员预览/代管上下文全部拒绝。
- 消息写入在同一事务中重新锁定成员限制、`community_chat_runtime_policy` 单行策略、有效禁言和主房间；用户不能提交身份/角色。数据库策略或更高优先级的 `COMMUNITY_CHAT_EMERGENCY_READ_ONLY` 环境硬开关生效时，返回 423 稳定业务码且不落库。内容按纯文本保存，移除控制字符并限制 2,000 个 Unicode 字符，前端只用文本插值渲染。`(user_id, client_request_id)` 唯一键保证发送幂等，回复只能引用 `general` 内 active 消息；发言同时受路由限流与 `slow_mode_seconds` 约束。
- 每个正常注册账号在邮箱/GitHub 首次建号时建立 `community_chat_user_identities`，存量正常账号由显式幂等脚本全量补齐，不要求先进入聊天室、加入成员表或发过言：关系键使用永久不变的随机 UUID，展示 ID 使用固定 `ln_` 前缀和 6 位去歧义大写随机码，数据库分别设置唯一索引；碰撞时服务端重试，未来仅允许把新生成码扩到 7～8 位，既有 ID 永不改写。社区名片展示 `@ln_XXXXXX`，输入框键入 `@` 后按昵称或社区 ID 搜索，发送只提交用户公有 UUID；昵称和社区 ID 快照仅用于历史展示，提及关系不依赖昵称、邀请制成员行或某条历史消息。旧客户端的消息公有 ID 提及参数只作迁移兼容。Root 专属 `@所有人` 不展开为逐用户提及关系，而是在消息行保存独立布尔标记；前端角色判断只负责隐藏入口，服务端必须按会话中的真实 `user.role = root` 失败关闭伪造请求。
- 统一表情入口提供 Unicode Emoji、官方「纸灵」与“我的表情”三类能力。Emoji 仍作为纯文本插入，最近使用记录仅保存在当前账号的本机偏好中。官方表情使用共享只读清单 `@lightnote/shared/community-chat-stickers`：首发包固定为 16 张透明 PNG，消息只保存 `sticker_source = official` 与版本化键 `paper-spirit-v1:<id>`，服务端按白名单还原 `/community-chat/stickers/paper-spirit-v1/*.png` 静态地址，客户端提交的 URL 不入库也不可信；已经发布并可能被历史消息引用的键和资产不得删除、换义或复用，新增动作必须新建键或新版本包。现有通用 `sticker_source VARCHAR(16)` / `sticker_key VARCHAR(80)` 已覆盖该协议，无需新增 Schema 枚举或迁移。自定义表情仍是用户上传图片形成的账号私有服务端表情库，登录后多端同步，不等同于官方表情收藏；限制 JPG/PNG/WebP、单张 2 MiB、每人 40 个，并按内容 SHA-256 去重，消息只保存 `sticker_source = custom` 与自定义表情公有 UUID，不保存签名 URL 或 OBS Key。从个人库移除时，若历史消息仍引用则只把表情记录标记为 `removed` 并保留对象，引用消失后或删除失败时由有界后台清理重试；读取始终重新校验消息可见性并跳转短时签名地址。
- 图片上传在写入对象存储前锁定当前账号行，串行统计 `uploading/pending/delete_pending/deleting` 未绑定记录；达到 12 张时返回稳定的 429 业务码，避免并发上传绕过配额。登记成功后才写私有 OBS，发送消息时按所有者和顺序原子绑定，取消或 24 小时过期进入可重试清理。
- 历史以消息公有 UUID 作为向前游标、服务端按自增 ID 排序，默认/首屏页大小为 30；前端接近列表顶部时自动请求 `before` 下一页并保持当前阅读锚点，接口不会一次性返回全量历史。返回对象不暴露内部账号 ID，头像字段只给当前窗口内可复用的 `/api/community-chat/messages/:publicId/author-avatar` 短地址，浏览器再按需读取并缓存头像正文，避免列表重复携带大段 Base64。消息行公开显示作者昵称、角色、已佩戴头像框、等级、段位和历史已佩戴称号；点击头像或昵称只能用消息公有 ID 请求 `/messages/:publicId/author-profile`，公开名片返回昵称、身份、等级、称号、头像框稀有度、最多 60 字简介、按账号注册时间计算且可关闭的轻笺资历和最多 3 项精选成就，`/author-profile/achievements` 才延迟读取其全部已解锁成就。登录用户从聊天室设置进入 `/profile/me` 编辑自己的简介、轻笺资历可见性和精选成就，保存使用 `baseRevision` 乐观并发版本，且只能选择服务端核验为已解锁的成就。两类公开接口都会重新校验消息可见性、个人删除和屏蔽关系，始终不返回账号 ID、邮箱、经验值、资源数量或私人内容；官方账号可举报但不可屏蔽。前端复用 `AvatarFramePreview` 组合渲染，移动端用底部抽屉、PC 用弹窗，共享同一资料内容和权限判断。阅读位置通过 `GREATEST(last_read_message_id, new_id)` 单调推进，主房间未读排除自己的消息，并按用户保存的 `official / mentions_only / mentions / all` 四档范围过滤：`official` 只计管理员消息，`mentions_only` 只计普通成员发出的显式提及和直接引用回复，管理员消息不计入，两档严格互斥；`mentions` 合并前两类，`all` 再计普通非定向消息。游客不记未读。通知关闭时房间目录不查询也不返回聊天室未读，桌面入口和移动底栏角标归零，公共聊天历史仍可主动查看。
- 聊天输入草稿使用当前页面运行时内存，按登录身份和房间绑定同一个响应式输入会话；会话统一持有文字、引用快照、个人提及、`@所有人`、待发送图片、上传中计数和发送中的幂等请求状态，路由切到其他模块再返回时直接重新绑定，不逐字段复制或重建。图片上传异步任务始终捕获其发起时的会话，即使工作区卸载也只回填原账号与房间；只有用户明确移除、发送成功或服务端过期清理才释放待发送图片。页面刷新后允许丢失运行期草稿，不能写入长期存储、序列化临时附件或串到另一身份。消息列表离底部超过 128px（桌面）或 320px（移动）后显示“回到底部”，有未读新消息或深链焦点时优先显示原有强语义按钮；点击后清零距离和新消息提示。
- 举报只接受消息公有 ID、原因枚举和最多 500 字说明；事务内重新校验成员和消息状态，证据快照只保留审核所需的频道、作者显示信息、正文和时间。相同用户对同一消息重复举报幂等。屏蔽同样从消息解析作者，不接受客户端 user ID；被屏蔽作者从历史、回复目标和未读统计中排除，官方安全账号不可屏蔽。
- Root 审核列表不依赖消息开放开关，但拒绝管理员预览身份。每份待处理举报只能终态处置一次；除“无需处置”外都会隐藏消息，禁言与封禁同时写成员处罚或访问审计，所有动作和原因写入不可变更审核动作表。发言事务会再次检查有效禁言，封禁立即使社区访问失败关闭。
- Root 运行策略管理只接受普通 Root 上下文，`GET/PUT /api/community-chat/admin/runtime-policy` 分别读取和切换数据库权威状态。切换原因必填，与动作、前后状态在同一事务写入 `community_chat_moderation_actions`；环境硬开关生效时后台不得恢复发言。
- 用户偏好建档时站内主开关 `global_notification_enabled` 默认为 `1`，提醒等级默认为“管理员和提及”；浏览器系统通知开关默认为 `0`，Android App 不提供系统通知开关。关闭站内提醒会在同一事务中软删除该用户已有的聊天室通知、清除铃铛贡献，并把主房间最新消息设为阅读基线；关闭期间不再投递，重新开启也不补算关闭期间的通知或角标，只处理之后的新消息。PC 与移动端通用通知中心接收“他人直接回复本人”“显式 @ 本人”，以及 Root 的 `@所有人` 定向聊天室事件；后者只扇出给已经建立 `community_chat_user_settings`、即实际进入过聊天室的参与者，不能因为所有注册账号都有公开身份就把从未进入聊天室的全站账号拉入通知事务。`official` 只允许 Root 或有效社区管理员的定向消息，`mentions_only` 只允许普通成员的定向消息，`mentions / all` 允许两类定向消息，因此 Root 的 `@所有人` 不绕过用户主动选择的 `mentions_only`；普通消息和未形成回复/@ 的管理员消息只参与聊天室入口角标，不进入通用通知中心。同一消息同时回复并 @ 同一成员时，`(user_id, source_type, source_id)` 唯一来源键只保留一条通知。通知投递还受账号级 `preferences.notificationsInApp` 总开关约束；定向消息撤回时同步软删除其来源通知。当前没有设备 Token、系统推送或消息 Outbox，移动端发送消息也不会创建系统通知，不得宣称 App 退后台后可接收聊天通知。
- 聊天正文、频道名和说明使用 `utf8mb4_unicode_ci`；所有账号 ID 列单独对齐主表 `user.id` 的 `utf8_general_ci`，避免 MySQL 5.7 跨表关联排序规则冲突，并保证 255 长度账号唯一索引不超出旧索引字节限制。
- Schema 三轨同步为 `migrations/20260809_community_chat_foundation.sql`、`migrations/20260809_community_chat_text_mvp.sql`、`migrations/20260809_community_chat_governance.sql`、单房间数据兼容迁移 `20260809_community_chat_single_room.sql`、历史账号列排序规则修正 `20260809_community_chat_account_id_collation.sql`、运行策略迁移 `20260809_community_chat_runtime_policy.sql`、消息互动迁移 `20260810_community_chat_message_interactions.sql`、社区名片迁移 `20260811_community_chat_member_profiles.sql`、公开身份/稳定提及/自定义表情迁移 `20260813_community_chat_identity_mentions_stickers.sql`、`util/communityChatSchema.js` 和 `tag_db.sql`，只读门禁在 `migrations/schema-assertions.sql` 第 31/32/33/34/41/43/47 组；迁移和功能开关分离，建表本身不会开放社区或消息。生产发布先执行正常注册账号身份回填脚本的 dry-run，再显式 `--apply`，不能在 GET 搜索或历史读取中隐式批量建身份。

书签图标采用 stale-while-revalidate：`bookmark.icon_checked_at` 记录最近一次 favicon 抓取检查时间；已有图标满 30 天后在列表后台静默刷新，抓取失败保留旧图标，无图标记录按 24 小时冷却重试。书签站点主机变化时清空旧图标及检查时间，同站点路径变化以及普通标题、描述、标签编辑不清图标；编辑页支持主动刷新。

普通新增、一键收藏和 Agent 创建统一复用 `createBookmark()`；未自带图标时都在主事务提交后写入 `bookmark_icon_jobs` 持久任务，由独立 `bookmarkIconWorker.js` 补全。普通新增页仍可前台即时抓取以获得快速反馈；Worker 处理前会把 URL 未变化且已经有图标的任务直接标记成功，避免重复请求。专用书签批量导入也在导入事务提交后按 Origin 建批次，Worker 有界并发调用 `FAVICON_API_BASE_URL`、逐条写回并记录 `finished_at`；前端用 `(finishedAt, jobId)` 游标短轮询增量更新，完成后最终刷新列表。图标文件使用完整 SHA-256 内容哈希作为共享文件名，不同书签和重复导入复用同一份内容；删除或替换书签图标时只在没有活动书签继续引用后清理文件，并兼容旧版按书签 ID 命名的文件。Worker 启动前必须验证任务表、`finished_at`、`idx_icon_job_updates` 和 favicon-api 健康状态；后台链路连续失败或长时间无进度时，前端恢复受限渐进补图，仅剩延时重试时改为低频静态后台状态且不跨页面恢复成“正在补全”。`BOOKMARK_ICON_BACKGROUND_JOBS_ENABLED=false` 可停止创建和领取新任务，但不删除既有任务或图标。

书签地址以 `@lightnote/shared` 的 `resolveBookmarkUrlInput` 为前后端共享判定规则，服务端 `util/bookmarkUrl.js` 是最终权限边界。纯网址和裸域名可确定性规范化；分享文案、协议后空格、重复协议或多网址输入只生成候选，必须由用户显式选择；无有效候选、非 HTTP(S)、带账号密码或超长地址直接拒绝。保存前 `/bookmark/resolveUrl` 进行 SSRF 防护下的短时探活：域名不存在及 404/410 仅标“疑似失效”，前端推荐返回修改但允许明确“仍然保存”；超时、反爬、鉴权和内网站点不武断判死。智能识别只在地址确定后运行，AI 只补名称、描述和标签，抓取失败时响应标记 `metadataSource=inferred`，不得伪装成已读取网页；已有名称或描述时先展示新旧逐字段对比，由用户选择要应用的字段。识别期间可由用户主动停止，客户端断开信号会传递到网页抓取与 LLM 请求，并由前后端超时共同兜底，停止或超时后的结果不得回填。

### INSERT 规范

| 主键类型           | 使用函数                                  |
| ------------------ | ----------------------------------------- |
| UUID               | `insertData({ ... })` 或 `generateUUID()` |
| 自增               | 直接用 `snakeCaseKeys()`                  |
| 无 id 列（关系表） | 用 `snakeCaseKeys()`                      |

## 轻笺智域（AI Agent）

### Agent Runtime V3

Runtime V3 把每轮请求拆成四个边界清晰、可独立验证的阶段：

```text
最新用户消息 + 服务端结构化会话投影
  → Intent Compiler（唯一一次语义编译）
  → 不可变 TurnSpec（目标、时间、指代、输出约束）
  → Capability Manifest 精确路由 + Execution Planner 参数规划
  → 服务端权威绑定 / Tool Runner / 确认生命周期 / Final Reply
```

- `util/agent/runtime/v3/capabilityManifest.js` 是 V3 读取与写入能力的统一运行时目录。每项能力声明 ID、领域、effect、工具、角色、时间槽、资源绑定和结果引用，启动校验保证注册工具、能力注册表与 Manifest 没有漂移；正常 V3 路由只接受 TurnSpec 中的精确 capability ID，不使用关键词、正则或相似度猜工具。
- Intent Compiler 只接收当前用户消息、当前身份、服务端解析后的材料摘要和 `DiscourseProjection`，不接收原始历史消息、旧助手正文或工具正文。它每轮只生成一次不可变 TurnSpec；Planner 和依赖轮只能消费或缩小该计划，不能重新解释顶层目标。
- 时间表达被编译为绑定到具体 goal/slot 的 `temporalConstraints`；资源指代被编译为类型化 `referentSelectors`。Manifest 声明的时间参数和权威资源参数会从模型工具 schema 中移除，再由服务端从 TurnSpec 或归属校验后的资源字段注入，模型不能复制、改写或臆造日期、资源 ID、URL 和对象键。
- Redis 会话只向下一轮投影最小结构状态：`ResultSet` 保存可继承的稳定引用，`ArtifactState` 保存待确认/已替换/已结算产物，`DiscourseState` 保存领域、主题代际和最近能力。正文、展示标题和模型回答不承担执行指代；跨领域新请求推进主题代际，不会无脑继承上一轮其他类型材料。
- Web 输入区的能力模块选择是单轮限制：默认“自动判断”，用户可显式收窄到笔记、书签、待办、文件等模块，消息发送后立即恢复自动；它只减少本轮候选能力，不改变长期会话状态，也不能扩大当前身份权限。
- 生命周期和语义计划分离。写操作仍沿用已有 owner 校验、风险卡、一次性令牌、幂等和回执链；替换草稿、取消、过期和成功只更新 ArtifactState，不把旧卡或自然语言历史重新送给模型判断。
- `AI_AGENT_RUNTIME_MODE=legacy|v3_shadow|v3_enforce` 只声明目标模式，默认 `legacy`；`AI_AGENT_RUNTIME_V3_ROLLOUT` 再按真实 actor 的角色、账号白名单和稳定百分比分桶裁决本请求的 effective mode。受众缺失或无效时失败关闭到 legacy，未命中账号不运行 V3 Compiler；排除列表高于所有纳入规则，Root 代管按 billing actor 而不是资源 subject 裁决。`v3_shadow` 只用于命中账号的结构化差异观测，`v3_enforce` 才以 V3 TurnSpec 执行；急停可直接退回 legacy，旧链路在完成灰度前不得删除。

- 待办写入能力包括状态修改与安全删除。`delete_todo` 只接受单个待办目标：稳定 `[todo:ID]` 直接冻结，标题重名先进入服务端白名单选择卡，选定后仍要生成中风险确认卡。确认执行在同一事务内复查 owner 和目标版本，并复用 `todoService` / `todoSeriesService` 的软删除、提醒取消和任务系列范围删除。任务系列必须明确 `current / future / series`，未说明时失败关闭；后两种范围只删除对应范围内的未完成项并保留已完成历史
- 待办查询复用 `todoService.listTodoPage()` 作为页面与 Agent 的唯一事实源。`query_todos` 可用计划日期和精确到分钟的本地提醒时间收窄同名实例；提醒时间同时覆盖仍待投递和已经投递的持久 Job，结果再通过 `@lightnote/shared/todo-reminder` 从规则还原安全摘要，因此不会把“未设置截止时间”误解为“没有提醒”，也不会向模型暴露说明、提醒邮箱或 Provider 数据。语义检索降级只提供候选 ID，二次筛选仍必须回到同一 Service；分页未覆盖全部结果时工具会明确禁止把当前页概括成全量
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
- `read_url` 将直接 Cheerio 正文提取与本地 Mozilla Readability 服务并行竞速，首个得到有效正文的结果胜出，并中止另一路；每次最多向 Agent 提供 12000 字正文，公开且无敏感查询参数的 URL 可在 Redis 缓存 10 分钟。底层 `fetchWebMeta` 默认维持 1.5MB 解压后响应预算，`read_url`、书签 AI 智能生成/整理、Agent 主动补全书签及网页正文快照通过调用参数复用 4MB 显式网页读取预算，不按微信公众号等域名复制抓取实现；响应超限返回 `CONTENT_TOO_LARGE`，识别到站点人机验证页返回 `ACCESS_CHALLENGE`。`READABILITY_SERVICE_URL` 默认为本机 `http://127.0.0.1:3466/`，可设为 `off` 禁用。内部两路都失败后只有在运维明确配置 `WEB_READER_EXTERNAL_FALLBACK_TEMPLATE` 时才调用外部增强阅读器；该配置会把目标公开 URL 发给第三方，因此不得默认开启。带凭据、fragment 或 token/auth/key/signature/session 等敏感查询参数的 URL 只允许服务端直连目标站点，始终禁止进入二级 Readability 服务、外部降级和缓存；内网或非法地址也不得借外部阅读器绕过 SSRF 阻断
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
- 文档正文与云文件派生预览由独立 `documentWorker.js` 从 OBS 拉取并处理，主 HTTP 进程只负责签名、鉴权、任务创建和状态/结果查询；Worker 在 AI 文档任务与文件预览任务之间公平轮转并保持单并发
- 临时文件使用 `ai-temp/{userId}/{sourceId}/` 独立前缀并在 24 小时后清理；云文件永久删除、覆盖或重命名时同步使解析缓存失效
- Agent 只接收服务端按问题检索出的受控片段，文件内容明确视为不可信资料；来源卡片由服务端生成真实定位
- 笔记正文进入 Agent 前由 `util/noteSemantic.js` 统一解析 HTML/Markdown，保留标题、段落、普通列表、复选任务、表格、引用、代码、链接和图片引用；`[x]`/`[ ]` 状态直接以正文中的复选框为准，普通列表不计入任务统计
- 单篇笔记细读使用 `read_note`，图片文字识别拆为通用只读工具 `analyze_resource_images`。前者只返回结构化正文和图片引用，后者按资源归属按需复用本地 OCR；本站笔记图片还必须命中 `note_images` 登记，单轮最多识别 3 张并使用内容哈希缓存
- 工具调用是结果驱动的有界多轮链路：上一轮失败、空结果或声明存在可选后续能力时，模型才能继续规划；后续仅允许已授权只读工具，默认最多 3 轮工具调用，最后再生成回答

### AI 工作区与持久对象

AI 前端由 `useAiAssistantStore` 承担会话域、草稿、单个材料 `contextRefs`、目录范围 `scopeRefs`、附件、滚动位置和活动请求租约，`AiWorkspaceShell` 承载问答产品界面。Store v3 的持久键与运行时 lease 都包含 actor、subject、mode、context ID 四维；切换同一 subject/mode 的管理员授权 context 也会中止旧请求并进入全新本地域。旧 v2 三维状态只允许普通 self 账号一次性安全迁移，管理员旧状态不复用。普通桌面问答使用无蒙层、可调宽且关闭不销毁的 `BDrawer`，移动端继续使用全屏容器；移动端侧边浮标只在笔记详情展示，其他页面仍可通过各自的显式 AI 入口打开工作区。笔记详情、笔记库、全局搜索、书签管理、云空间和标签详情通过统一的 `AiEntry` 事件传递受控引用、建议意图和查询：单个材料最多 5 个；笔记目录范围最多 3 个，客户端只提交 `note_branch` 根 ID，禁止提交后代 ID、正文或缓存树。服务端按 subject 重新解析当前子树并把 note IDs 作为 `personalKnowledgeSearch.scope.resourceIds` 强制 allowlist；普通目录问答只取 Top 8～20 证据并披露实际引用页数。明确要求整个目录分析时进入同步 Map/Reduce，逐页结构化摘要后合并主题、重复、冲突与待办，上限 30 页或 120,000 字符；超限或 Provider 部分失败时必须显示实际覆盖，不能声称完整读取。系统分享尚未接入统一入口。

所有需要按会话身份隔离的 AI 工作区顶层对象使用四维 owner 域：

```text
(actor_user_id, subject_user_id, admin_context_mode, admin_context_id)
```

- 普通上下文要求 actor 等于 subject，且 `admin_context_id IS NULL`；管理员上下文要求 Root、有效上下文 ID 和明确的 `readonly` / `maintain` 模式。
- SQL 查询使用 `admin_context_id <=> ?` 做 NULL-safe 精确匹配，不能只按 actor、subject 或 mode 查询。
- 消息、来源、证据和 Change Item 等子表通过已经完成四维校验的父对象访问；`ai_content_chunks` 等账号派生索引按 subject 隔离，`agent_logs` 与配额账本按各自安全主体模型隔离。不能为了复用四维模板而伪造不存在的列，也不能因子表没有重复 owner 列就绕过父对象校验。
- `readonly` 只允许读取已存在的会话、变更集和记忆；创建、更新、删除、反馈等持久状态写入由独立 `AI_STATE_WRITE` / `ACCOUNT_WRITE` / `CONTENT_WRITE` 策略阻断。

持久会话链路包括：

- `ai_conversations` 保存标题、范围、归档状态和保留策略；`ai_messages` 保存消息、请求/追踪 ID、材料快照、活动、覆盖度和答案版本组。
- 来源和证据分别进入 `ai_message_sources` 与 `ai_message_evidence`；客户端提交的消息 ID 不被信任，服务端生成 UUID，并仅以 `(conversation_id, request_id, role)` 做 owner 内幂等。
- 会话中心支持列表、搜索、重命名、归档、单条删除/撤销、导出和“清除全部 AI 数据”。单条删除先在服务端改为隐藏状态，默认提供 15 秒（可配置 5 秒～2 分钟）的权威撤销窗口；窗口结束后定时器会事务清理关联记忆、Change Set 与会话子表，应用重启或定时器丢失时由会话保留调度器兜底。UI 用 `BCard` 展示撤销条，但是否可恢复最终由服务端状态与时间判断。总清除是无撤销事务：普通 self/normal 账号按 `subject_user_id` 清除该主体全部可控 AI 对象，包含曾由管理员授权上下文为该主体产生的对象，响应 `scope=subject_user`；管理员 `maintain` 调用只清当前 actor + subject + mode + context 四维域，响应 `scope=owner_domain`，`readonly` 不能调用。两种范围都覆盖会话、记忆、Change Set、产品事件与 SSE 恢复事件；普通 self 还会在同一事务推进 `ai_content_generations` 并删除 `ai_content_chunks`，提交后只驱逐本进程缓存，代际/schema 失败会让整个清除回滚；owner-domain 清除不触碰 subject 级索引代际。`agent_logs`、配额用量和请求占位账本按独立安全/运营保留策略保留；`ai_provider_balance_snapshots` 是供应商级运营账本，不归属任何用户，也不随用户清除删除。任何必需 AI 表或字段缺失时，总清除返回 `AI_DATA_CLEAR_SCHEMA_UNAVAILABLE`（503）、回滚整个事务，不会把“未检查”误报为“已清空”。
- AI 问答分支功能已下线；历史 migration 中的 `root_conversation_id / parent_conversation_id / branch_from_message_id` 仅为已部署数据库和 fresh schema 兼容保留，运行时不再暴露谱系读取、分支创建或分支导航。新会话继续写入 `root_conversation_id=id`、其余两列为 NULL，以兼容 fresh schema 的非空约束。
- 重新生成保留全部旧答案，并用 `versionGroupId` 形成同会话版本组；版本 API 只读取 owner 内同 conversation 的 completed assistant 消息，最多 50 个。回答下方切换器只滚动/聚焦已保存版本，不隐藏、覆盖或删除旧答案；目标不在当前最多 200 条已加载消息时明确提示不可定位。`aiCloudHistory=false` 仍阻断自动 hydrate/create/save，但不误伤用户显式打开历史和版本管理。
- 账号 Settings 的“全量数据” JSON 导出同样按 `subject_user_id` 覆盖该账号的会话/消息/来源/证据/反馈、记忆、Change Set、产品事件、`agent_logs` 和配额用量，并返回 schema 版本、分域计数、不可用分域和排除清单。可重建内容/文档索引、10 分钟 SSE 恢复事件、请求级配额占位和供应商级 `ai_provider_balance_snapshots` 不具单用户可移植性，因此显式列为排除项。普通 self 总清除和导出虽然都是 subject 级，包含/排除与保留政策仍不同；管理员 maintain 清除则是更窄的 owner 域。接口和产品文案必须以返回的 scope 与 retained/exclusions 解释，不能混用。
- 会话中心已用 `BSelect` 提供逐会话 `standard` / `temporary` / `indefinite` 保留策略；temporary 可选 1、7、30 天，显示权威到期时间及自动级联会话、消息、来源/证据、记忆、Change Set 的范围。服务端严格校验 patch，回显时只映射最近合法档位；temporary 由启动/周期调度器物理删除，同一调度器也收口超过撤销窗口的软删除会话。standard/indefinite 的长期产品政策仍需验收。
- 登录账号的 Settings AI 区提供 `aiCloudHistory` 云端会话历史开关，使用账号 preferences 同步。关闭后 `ChatContainer` 不再自动 hydrate/create/save 云会话并清除当前 `cloudConversationId`；服务端 create/save 自动持久化 handler 也会按 subject 权威读取偏好，关闭或主体不可验证时失败关闭并返回 `AI_CLOUD_HISTORY_DISABLED`（409）。缺少该偏好字段默认开启，以兼容既有账号。本地 v3 Store 历史继续保留，既有云端历史不会因切换而删除；Change Set 等显式后台成果的直接 Service 写入和历史管理不被自动持久化门禁误伤。仍需真实账号和多设备偏好传播验证。草稿和尚未发送的材料始终是本地窗口状态，不能被当作长期记忆。
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
- `evaluation/ai-assistant/` 的 schema v2 提供 270 条完全合成任务、49 个合成来源和六维确定性评分器，覆盖 10 个能力域且每域至少 20 条；owner 四维、请求 lifecycle、反凑数校验和生成器 `--check` 都进入数据契约。确定性回放适配器已把 8 条合成 Provider 轨迹接到真实 `agentChat` 主链，覆盖统一笔记草稿协议修复、确认、明确字数失败关闭和显式 URL 读取；关键 UI E2E 在 Chrome 覆盖 `@ + Enter`、确认卡刷新恢复和材料生成笔记入口。这些 CI 门禁均不加载真实 Provider。DeepSeek Planner 冒烟分为 6 条快速集和 41 条完整集，完整集覆盖全部 36 个普通用户工具及关键边界；只允许 Root 在后台选择并二次确认后手动执行。运行只生成与评分语义计划，工具执行数恒为 0，不访问用户业务数据；互斥运行并把无正文结构化结果写入 `ai_evaluation_runs`，终态记录保留 90 天，不跟随提交、上线或定时任务。自然语言有用性评测和人工引用蕴含标注仍需独立建设。
- Agent Turn Contract V2 的第一阶段以 shadow trace 锁定当前行为，不改变 Planner、材料继承或工具执行决策。每轮在 `agent_logs.turn_contract_trace` 只保存请求/解析后的材料模式、允许来源与实际来源的数量和 SHA-256 集合摘要、长度契约测量、验证错误码以及候选能力域/工具数量；禁止保存资源 ID、标题、正文、模型回答或工具参数。真实模型冒烟允许关键用例重复 20 次，并按规划、工具契约和回答层的稳定摘要报告一致性；跨轮显式材料隔离、模糊继承和定性扩写的已知缺口由 expected-failure 行为用例锁定，后续 GroundingScope、Source Set 与 OutputContract 阶段必须把这些用例转为普通通过用例。
- Agent Turn Contract V2 的第二阶段由 `util/agent/runtime/turnEnvelope.js` 兼容归一新旧请求，再由 `runtime/groundingScope.js` 生成唯一事实边界。`current_explicit_only` 开启时，Planner 的 intent history 与 Final Reply 的 grounded-answer history 分离：后者不含旧用户/助手正文、旧 `session.lastTool` 或长期记忆，只保留本轮消息、校验后材料和无正文的 DiscourseProjection。候选来源和公开来源均执行 `sourcesUsed ⊆ allowedRefs` 校验；响应只公开 mode、数量与历史策略，不公开 allowedRefs。
- Agent Turn Contract V2 的第三阶段把成功解析的显式材料保存为与 owner/session 绑定的短期 Source Set：Redis 会话只保存稳定引用、范围引用、附件来源 ID 与 SHA-256 版本摘要，不保存标题、正文或模型回答；相同集合复用 ID，过期、跨会话或任一资源不再可读时失败关闭。新客户端续问只提交 `sourceSetId`，服务端每轮重新校验归属并解析当前内容；材料续问分类为“继承 / 独立 / 需要澄清”三态，多个集合指向不唯一时创建五分钟 ClarificationState。工作区查询的公开 `entityRefs/sources` 只是本轮展示与跳转用的有界引用，不是完整结果集，也不得被客户端反向拼装成下一轮显式材料；推荐问题只发送文字，动态资源范围由最新消息重新查询。需要复用某项公开来源时，用户必须主动把它加入当前输入区；只有前一轮确有显式材料时，才提供“继续基于上轮来源”。澄清令牌只填充原请求缺失的材料槽位，绝不把“第二个 / 两组都用”当作新的开放问题，也不默认扩大材料集合。SSE、恢复快照、本地/云端会话和消息 UI 共同保存安全摘要，并显示本轮是当前材料、继承材料、工作区检索还是未使用历史材料。
- Agent Turn Contract V2 的第四阶段由 `runtime/outputContract.js` 把笔记的最少字数、目标区间、相对扩写、保持篇幅、段落数、Markdown、链接保留与反重复要求编译为服务端契约。草稿模型的工具 Schema 同步携带可确定的长度边界，生成后仍由同一字符口径校验；只允许一次携带实际值和目标值的定向修复，第二次失败不创建确认卡。确认预览显示实际/目标字数。用户明确要求“仅依据材料”时关闭一般知识，并用可配置的材料扩展容量在调用模型前失败关闭；未禁止一般知识的主题创作不受该门禁影响。
- Agent Turn Contract V2 的第五至第七阶段以 `runtime/turnSpec.js` 作为本轮唯一语义契约。Intent Compiler 只看当前请求、裁剪后的 discourse 元数据和能力域摘要，不接触真实工具参数；Capability Router 再按 goal 的 domain/effect、身份和能力状态把候选收窄到最多 12 个，Execution Planner 只能在候选 schema 内生成依赖有序的步骤。`PlanValidator` 会阻断额外写工具、缺少必填参数、未知 goal/工具、循环依赖和 scope/output contract 注入；依赖轮仍复用同一份不可变 TurnSpec，不重新猜意图。笔记草稿入口也由 TurnSpec 决定，专用草稿模块只保留 artifact runner 职责。
- Runtime V2 默认 `enforce`，显式 `AI_AGENT_RUNTIME_V2_MODE=legacy` 可在事故中回退旧主链，`shadow` 只用于记录不含正文的语义分歧。V2 的 conversation/answer/action/mixed/note draft runners 统一返回 goal 状态，现有 tool executor、写确认、owner、toolPolicy、幂等和结果未知保护保持为唯一副作用出口。生产日志只记录编译状态、request kind、domain/goal/slot 数量、候选数量、耗时和稳定错误码。
- Provider 不再只有全局选择：Intent、Planner、Composer、Note Draft 分别支持 `AGENT_INTENT_*`、`AGENT_PLANNER_*`、`AGENT_COMPOSER_*`、`AGENT_NOTE_DRAFT_*` 覆盖，未配置时继承 `AGENT_LLM_PROVIDER` 和供应商默认模型。Qwen 所有阶段必须保持 `enable_thinking=false`，DeepSeek 同样关闭 thinking；真实模型 A/B 只运行 compiler/router/planner，绝不执行业务工具。
- `router_handle/agentHandle.js` 是稳定的薄 HTTP facade，路由不再直接承载语义编排；端点协议映射集中在 `agentEndpointHandlers.js`，顶层意图、候选收窄和执行计划由 `util/agent/runtime/` 独立模块决定。旧 runtime 只作为显式事故回退保留，不能在 enforce 主链中重新取得决策权。

## 共建轻笺

- `/co-build` 和 `/co-build/:id` 对游客开放公开内容；提交、投票和补充要求登录，Root 负责审核、合并、回复、进度和上线关联
- 桌面端游客可从右侧更多菜单或个人中心进入，登录用户可从个人中心进入；移动端游客和登录用户都在「我的 → 沟通与支持」看到入口。公开列表与详情允许游客阅读，提交、投票和补充仍在写操作时要求登录
- `source_type=user` 表示真实用户建议，`source_type=official` 表示“轻笺团队”的官方规划，两者在接口和 UI 中始终明确区分
- 私密意见反馈继续使用原 `opinion` 流程，不会被共建轻笺公共接口读取或自动公开
- 投票明细表以 `(request_id, user_id)` 唯一约束，并在事务中重新计数；提交者和支持者可接收进度通知，用户可在设置中关闭

## 支持轻笺

- `/support` 是游客与登录用户共用的响应式支持说明页；桌面端从个人中心头像菜单进入，移动端从“我的”进入，同一路径不做双端重映射
- 爱发电创作者主页与 ¥6 / ¥18 / ¥50 / 自选金额档位定义在 `@lightnote/shared`，前后端共用；前端只接受 HTTPS、精确官方域名、固定下单路径、公开方案/创作者 ID，以及后端生成的 URL-safe `custom_order_id`。`VITE_AFDIAN_SUPPORT_URL` 只可覆盖公开主页，不存放凭据
- 登录用户从轻笺选择档位时，`GET /support/checkout` 创建 30 天有效的随机下单凭证，仅保存 SHA-256 摘要，再 302 到爱发电。未 OAuth 关联也可按权威 API 返回的 `custom_order_id` 归属；游客或同步未配置时仍可走原官方下单页，但不能推断轻笺账号
- OAuth2 仅用于把爱发电身份与轻笺账号建立可撤回关联，不是赞助前置条件。state 存 Redis、绑定轻笺 user/session 且单次消费，Secret 只由服务端换取身份。绑定后按 `user_private_id`（存在时）或 `user_id` 归并历史订单；解绑会解除纯 OAuth 归属，通过下单凭证确认的订单仍保留
- `support_orders.provider_order_no` 是订单唯一事实，Webhook 重推、API 历史同步和 OAuth 后归并都只更新同一行。Webhook 必须 RSA 验签后先落 pending；由于官方签名不覆盖 `custom_order_id`，归属只能在 `query-order` 二次复核后写入。冲突证据保留原归属并标记 `conflict`，禁止静默转移
- `support_checkout_intents`、`support_account_links`、`support_orders` 与 `support_public_preferences` 分别承担下单证据、可撤回关联、交易事实和公开偏好。OAuth basic 只返回爱发电用户 ID；关联表通过该 ID 从爱发电公开用户资料补全昵称与 HTTPS 头像供本人核对，失败时保留关联并按退避周期重试，资料不进入公开榜。通用日志跳过 Webhook 原始载荷，不保存留言、收货人、电话或地址。账号注销删除凭证、关联与公开偏好，并把订单与轻笺账号去关联，但保留去标识化交易对账事实
- 累计榜只聚合已归属轻笺账号、`api_verified + provider_status=2` 且非 Root/test/visitor/注销账号的真实实付金额。默认参与但匿名；只有本人明确开启才公开轻笺昵称与受控短地址头像，也可退出榜单；Root 只能因安全原因审计隐藏，不能替用户开启公开。榜单缓存 60 秒且在订单、偏好、关联和注销变化时主动失效，不把 `head_picture` 长文本放进榜单 JSON
- 爱发电订单查询不提供逐单创建时间，历史订单不得按 `verified_at` 冒充支付时间构造月榜。新订单首次可靠观察写入 `ranking_observed_at`，现阶段仅提供累计榜；管理端“本月可靠确认”明确按观察时间统计，完整月榜等待可靠时间覆盖完整周期后再开放
- 订单状态每 5 分钟只重试到期 pending，小批量处理；全量历史最多每 6 小时同步一次且单进程合并，避免支持页轮询第三方。Root 管理页使用服务端分页，仅提供幂等同步、pending 复核和安全隐藏三类审计动作；禁止手工改金额、造订单、改归属或强制公开。核心功能不形成付费门槛

## 快速添加与待整理

- `resource_inbox` 是跨资源关系表，不复制书签、笔记或文件正文；资源本体仍是唯一事实源
- 桌面端与移动端“快速添加”都支持 URL、Markdown 文本、文件和待办。资源创建与加入待整理在同一业务事务或确认链中完成。快速待办只填写标题、日期预设和优先级即可直接进入待办列表，“完善详情”再携带当前草稿打开完整编辑器；完整待办编辑器在桌面端使用右侧抽屉，移动端新建使用独立 `/todo/new` 页面（轻量顶栏 + 页面内容），避免全屏底部抽屉的长距离入场动画；编辑已有待办仍复用编辑容器
- 加入操作以 `(user_id, resource_type, resource_id)` 幂等；完成整理只更新关系状态，不修改资源本体
- 列表查询、批量完成与重新加入都必须校验当前资源主体归属；资源删除时清理对应关系
- 资源中心及书签、笔记、云空间现有菜单统一复用 `useInboxEnqueue` 手动入队；接口失败显示可重试错误态，不伪装成空列表
- “快速添加”是登录用户的全局操作；待整理不作为独立一级导航，而作为资源中心的状态视图保留，`/inbox` 路由继续兼容已有入口
- 管理员维护游客工作区时，可维护归属于该游客的书签、笔记、云空间文件、文件夹、标签及待整理关系；仍按目标账号容量校验，并禁止账号权益写入与永久删除

## 待整理与待办

- 桌面端和移动端均严格分域：资源中心包含“全部资源 / 待整理”，顶部“待办”包含“列表 / 议程 / 日历 / 四象限”；`/inbox` 只承载待办工作区，待整理继续通过资源中心状态视图进入
- 顶部全局搜索仍可搜索待办，但资源中心的类型、数量、筛选和批量操作只允许书签、笔记、文件与标签
- 待整理资源继续使用 `resource_inbox`；待办独立存入 `todo_items`，不能伪装成笔记或资源关系
- 待办可被全局搜索找到并通过 `/inbox?tab=todo&todoId=` 定位，但不进资料四页签、`@` 资源选择器、标签体系和待整理；新增待办能力时不得因为"搜索里已经有了"就默认它继承资源能力
- 待办支持标题、说明、待办清单、优先级、开始时间、截止时间和稳定自定义顺序；列表按逾期、今天、即将到来、以后、无日期和已完成分组，并提供议程、日历和四象限视图。列表默认智能排序：先按时间状态切桶，再在桶内按优先级与下一步时间排序；按下一步时间、优先级和创建时间是显式备选排序。固定日程系列必须使用系列创建时间参与“最近创建”，后台新生成实例的 `create_time` 不能把旧系列顶到最前。提醒已触发只显示“提醒时间已过”，不会单独把仍在未来的任务归为逾期。议程、日历与已完成视图不显示无效排序入口
- 待办卡片、议程、日历、四象限和系列明细的默认点击统一打开 `TodoPreviewDrawer`，按状态/优先级、说明、清单、时间与提醒、关联资料和审计时间展示详情；编辑只能由详情右上角或显式“编辑待办”动作进入，搜索深链 `/inbox?tab=todo&todoId=` 也遵守相同入口。详情内允许快速勾选未完成待办的清单，但不复制编辑器的标题、计划和提醒表单。桌面详情及系列明细允许点击遮罩关闭，编辑器继续禁止遮罩误关以保护尚未保存的表单
- 待办关联资料在列表、详情和两套编辑器中统一复用 `TodoResourceLinks`：胶囊显式覆盖 `BButton` 默认行高并保持 24px 紧凑外观，书签/笔记/文件继续通过 `resolveResourceRoute()` 进入 canonical 页面，失效资料禁用主按钮但编辑器仍可解除关联。浮层内打开资料或从预览转编辑必须先通过 `closeCurrentMobileOverlayThen()` 释放移动端 history 占位，再执行路由或打开下一层，禁止同一事件循环内“关抽屉 + 跳路由”
- 逾期摘要与列表同时覆盖 `due_at < NOW()` 和“无截止但实例日期早于今天”的未完成固定日程；今日摘要同时覆盖今天尚未到期和实例日期为今天的任务。逾期与今天互斥，未来预生成实例不能计入今天。
- 移动端待办列表、议程卡片和日历选中日期下方的当天议程列表支持向左拖动露出删除操作；日历月视图格子不承载滑动删除。一次只允许展开一项，点击该卡片之外的区域、纵向滚动、切换视图或进入批量选择都会收起；滑动只展示操作，点击删除后仍必须走统一确认与可撤销删除链路
- 移动端“我的成长”的概览、任务、成就和资产四个内容 Tab 共用页面滚动容器，但每次切换都回到页面顶部；带成长任务、热力图或回顾锚点的入口继续精准定位目标内容。
- `todo_items.plan_version` 决定双轨语义：v1 旧数据继续使用 `recurrence_rule + todo_reminders`，保持“完成后按旧截止日期平移”和旧周期提醒行为；v2 新数据由 `todo_series + todo_reminder_rules + todo_reminder_jobs` 驱动，禁止同一系列同时进入两套生成器
- v2 的“任务计划”与“每项提醒”独立：`scheduled` 按本地日历预生成每日/每周/每月实例，前一项未完成不阻塞下一项；`after_completion` 才以实际完成时间为锚点生成下一项。每项提醒可为不提醒、提醒一次或多次催办，不得从任务重复规则推断提醒
- 新版默认入口在 v2 契约上增加 `taskMode = single | independent`：`single` 始终只创建一条待办，可在 `todo_reminder_rules.schedule_json` 保存按间隔、按周或按月的提醒日程；`independent` 才复用 `todo_series` 生成多实例。两种模式继续共用 `todo_reminder_jobs` 和既有投递 Worker，禁止建立平行调度器
- `POST /api/todo/v2/preview` 是无写入的确定性计算，游客可以填写标题、说明、简易清单和时间并查看完整预览；只有点击创建、产生持久化写入时才触发注册引导。预览日期范围必须使用实例的真实 `startAt / dueAt`，不能用单个 `occurrenceDate` 同时代替开始和截止日期
- 有限系列最多 366 项并一次生成；长期系列按未来 60 天且至少 8 个未来实例的滚动窗口补齐，单批最多 200 项，后台每 10 分钟扫描。用户翻到滚动窗口外的日历月份时，`POST /api/todo/v2/calendar-range` 会在事务内按当前 6 周可视区间补齐固定日程，单次最多向未来一年，随后刷新全量日历数据。唯一键 `(series_id, occurrence_no)`、创建请求幂等键与系列操作幂等键共同防止并发和重试重复生成
- v2 每个实例、渠道、序号都生成不可变 `todo_reminder_jobs`；调度器用数据库租约抢占，站内通知以来源键去重，SMTP 结果不确定时标记 `unknown` 而不自动重发。免打扰默认延迟一次，延后越过截止则跳过
- 修改支持“仅本次 / 本次及以后 / 整个系列”；后两者通过结束旧系列并创建带父系列信息的新系列实现，不重写已完成历史。删除支持仅本次、本次及以后或停止系列；完成固定日程实例只取消本项提醒，完成后重复则在同一事务内生成下一项
- 固定日程的每个实例继续作为独立 `todo_items` 行保存和操作，展示层按视图建立不同投影：列表必须先按时间桶、再按 `seriesId + status + bucket` 折叠，所以同一系列的昨天、今天和未来可以同时各出现一次；系列明细统一复用 `TodoSeriesDrawer`，列表入口和四象限系列胶囊都打开同一抽屉，每次加载 20 项，不能在主视图铺开全部预生成实例。四象限每系列只保留一个当前焦点，顺序为“今天 > 最近错过 > 下一项”，并显示今天/错过/后续计数；系列胶囊只能在卡片空间确实不足时省略，禁止用固定像素最大宽度提前截断。四象限卡片的指针点击面覆盖整行，勾选框、系列胶囊和更多菜单必须阻止冒泡并执行自己的动作；议程只把同系列历史漏做项压成摘要，今天和近 14 天仍逐实例；日历始终逐日展示实例并显示重复标识。任何视图都不能按标题物理合并，完成后再次安排也不参与固定日程聚合
- 待办页签与列表分组角标显示“可操作展示对象数”：一个固定日程系列在同一时间桶计为 1；卡片入口和系列明细继续披露真实实例数。工作台“全部未完成”属于库存口径，仍按独立实例计数，两者不得复用同一个文案冒充同一含义
- 完成、删除及批量操作的撤销由服务端事务校验，不以客户端计时器作为事实源；删除暂停或取消尚未投递的提醒，恢复时只恢复仍有效的计划
- 账号偏好控制站内、邮件和浏览器通知总开关及免打扰时段；服务端投递按客户端同步的时区计算免打扰，浏览器通知只在应用已打开且获得系统授权时由前端展示
- 待办完成或删除不会修改任何书签、笔记或文件；管理员预览首期只允许读取，不允许代用户写入待办
- v1 提醒仍由旧调度器扫描 `todo_reminders`；v2 调度器扫描 `todo_reminder_jobs`，系列补齐调度器维护长期窗口。单个计划理论提醒 Job 上限为 5,000，超过时必须减少实例、催办次数或渠道。站内渠道写入统一通知中心，邮件渠道使用服务端 SMTP 配置与投递日志
- `migrations/20260806_todo_plan_v2_rollback.sql` 是会删除 v2 数据的最终结构回退脚本；常规灰度回滚优先关闭四个待办 v2 Feature Flag，避免丢弃已有计划数据

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
- 后台总览的“活跃用户”使用 `api_logs` 中产生有效业务请求的非游客账号按日去重；该口径可稳定回溯昨日同期和近 7 日同期，不受退出、设备会话替换或过期会话清理影响。总览的活跃用户和 AI 调用同期基线都只扫描最近 7 天时间索引范围，并复用同一聚合查询。
- 通用 API 日志对笔记、手绘和模板写入只保存 ID、版本、类型与内容长度摘要，不复制正文；AI 遥测和聊天室目录等已有权威业务数据或高频被动刷新链路不重复写入通用日志。`api_logs` 的文本列使用 `utf8mb4`，并通过 `(request_time, id)` 支撑保留期批量清理。
- 社区目录以 `/community-chat/rooms` 为单一权威响应，合并访问状态、发言开关、房间与未读信息；无权限时返回空目录。根布局在聊天室内暂停 REST 刷新，页面在实时正常时每 60 秒安全校准，断开时每 8 秒降级轮询。
- 用户管理备注存于 `admin_user_remarks`，以 `(admin_user_id, target_user_id)` 为复合主键；列表查询只能用当前普通 Root 管理会话的 ID 关联自己的备注。备注不进入 `user` 资料、普通用户接口或管理员预览上下文，清空备注时直接删除关系行。

## 标签智能选图

- 标签新增与编辑共用 `TagIconPicker.vue`，支持中文或英文搜索 Iconify；桌面端和移动端保持同一套能力
- 英文关键词直接检索，中文标签由当前 Agent LLM 转换成 2～4 个英文图标关键词；AI 不生成 SVG
- 搜索阶段只返回 Iconify 图标名称供前端按需预览，选中后后端从固定 Iconify API 拉取 SVG、执行标签与危险属性白名单校验，再编码为 Data URL 写入现有 `tag.icon_url`
- 图标搜索仅允许预设的开源图标集和固定上游域名，并带超时、内存缓存、本地中文关键词降级；上游失败不影响标签正常保存
- Iconify 图标默认保留 SVG 的 `currentColor`；用户选择固定颜色时，将颜色和可恢复默认的标记直接编码进现有 `tag.icon_url`，不增加独立颜色字段

## 关键流程

### 认证流程

```
请求 → sid Cookie（主候选）+ X-Session-Id（可选备用候选）
  → 按顺序验证 user_sessions；有效 Cookie 始终优先
  → Cookie 已失效且备用 SID 有效时，按会话剩余有效期修复 Cookie
  → 查询 user 表实时角色 → req.user { id, role, alias, sessionId, ... }
```

只有两个候选都失效时才清理 Cookie、发送 `X-Auth-Expired` 并降级游客；Header 不能未经验证覆盖有效 Cookie。会话库或用户查询异常返回可重试的 `AUTH_UNAVAILABLE`（503），保留两个凭证，禁止伪装成游客。下游涉及管理员上下文、当前设备和退出的操作使用 `req.user.sessionId`，确保拿到的是中间件实际认证成功的会话，而不是请求里残留的旧 Cookie。

Android WebView 在账号密码、注册或 OAuth 登录成功后通过受信桥请求原生立即 `CookieManager.flush()`，并在退后台及销毁前再次兜底落盘。应用业务路由在 `/me` 返回确定身份前由根组件显示恢复门禁；网络、5xx 或非鉴权业务错误只进入保留凭证的重试态，不得把 Pinia 默认值当成真实游客。原生 `app.ready` 在确定身份或错误门禁完成绘制后发送。“记住账号”仍是用户可见选项：默认勾选时保存备用 SID 并签发较长会话，未勾选时不保存备用 SID；原生 Cookie 持久化不改变该产品语义。

登录设备页展示的是“设备组”而不是原始 session 行。浏览器请求会携带本地持久的随机设备标识；服务端只保存其 SHA-256 `user_sessions.device_key` 摘要，并在同一账号、同一浏览器再次登录时事务性轮换为一条会话，避免重复登录堆积为多台设备。该标识不参与认证、权限或设备信任判断。升级前没有设备摘要的历史会话不会根据 IP 或 UA 猜测归属，而是逐条独立展示和撤销，避免共享网络或浏览器升级造成远端会话误并入当前设备；“下线设备”会撤销该设备组包含的全部 session。

### 账号自助注销

- 登录用户从“设置 → 账号与安全”发起，注销验证码只能发送到服务端从当前账号读取的已绑定邮箱；Redis 仅保存 5 分钟有效的加盐摘要，客户端不能指定收件地址，也不复用重置密码验证码。
- 最终提交必须同时通过 6 位验证码和精确确认文字。服务端在单事务内锁定账号、重新核对邮箱摘要、创建 `account_deletion_requests` 清理任务，并将密码、邮箱、电话、头像、位置、IP、GitHub 标识与授权凭据等身份字段清空，同时把账号标成不可登录；随后清除全部会话和当前登录 Cookie。
- 数据库内容、OBS 文件、笔记图片和书签图标由后台任务物理清理。数据库删除使用事务；对象或本地文件删除失败时进入指数退避重试，只有全部完成后才清空任务中的对象路径并标记 `completed`。已完成任务只保留不含邮箱、昵称的账号 UUID、时间和尝试次数，用于清理幂等与审计，并在 180 天后分批删除。
- 安全事件和管理员审计等依法或为安全所需的有限记录不随内容表直接删除，但会解除账号 ID 关联，并继续受各自保留期约束。Root、游客和任何管理员预览/代管上下文都不能走自助注销接口。

### 新账号示例内容

- 邮箱注册和 GitHub 首次建号会按注册语言初始化 4 个带 Base64 SVG 图标的标签、3 个书签、5 篇笔记（包含标题固定为“手绘笔记示例”的手绘样例）、1 个示例文件夹和 2 份云文件；已有账号登录、GitHub 绑定已有邮箱账号和历史用户都不会补发或重复生成。
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
> 跨模块事故、性能回退及其完整根因、防回归测试和验收步骤统一记录在 `docs/pitfalls.md`；本节只保留架构与部署不变量。

### 部署机制：本地打包 → rsync 上传

- `deploy:server` = 本地 `pnpm deploy --legacy` 打平自包含 `node_modules` → rsync 增量（`--delete`）上传 → `pm2 restart app`（含 `documentWorker`）；`deploy:web` 同理传 `dist`。
- 资源治理使用独立 `resourceGovernanceWorker.js` 领取扫描和低风险清理任务；HTTP 进程只创建任务、查询证据和生成受会话绑定的确认，不遍历目录。历史后台 `/admin/imageMg`、`/imageMg` 只做路由重定向，旧 `/common/clearImages` 不再注册。
- **因此不能引入平台相关的 native node 库**（如 sharp）：本地装的是当前平台（mac）二进制，rsync 到 linux 服务器会崩。项目一贯用系统 CLI（`tesseract` / `convert`(ImageMagick) / `pdftoppm`，走 `execFile`）做图像/OCR，正是为规避这一点。
- 部署脚本健康检查**不 gate 部署、失败不自动回滚**；非 200 需手动执行脚本末尾的回滚命令（切回服务器上的 `${REMOTE}_bak_*` 硬链接快照）。

### Schema 现状：migrations 只是冰山一角

- **建表 schema 是双轨,两条并存,排查时都要看**：
  - **轨道 A — 手工 `migrations/*.sql`**（现约 57 个 dated 文件）：**没有自动迁移 runner**,靠人工/DBA 执行(如 `rename_admin_to_user`、`conversion_events_ip`),deploy 脚本不跑迁移;建表直接用 `CREATE TABLE IF NOT EXISTS`(MySQL 5.7 支持)。已有 `migrations/schema-assertions.sql` 做启动/发布期 schema 断言(约定"有输出=失败",目前主要覆盖 AI 工作区表)。
  - **轨道 B — app 启动时 `ensure*()` 运行时建表/补列**：`app.js` 还会调用 `ensureSecurityTables` / `ensureNotificationTable`（`notification` + `batch_id`/`recalled` 列）/ `ensurePointsSchema`（建 `points_log` / `user_cosmetics` / `user_item` / 兼容表 `ai_daily_bonus` + `ALTER user_growth` 补 `points`/`equipped_title`/`equipped_frame`/`storage_bonus_mb`/`ai_bonus_tokens`/`lottery_*` 列）/ `ensureNoteTreeSchema`（补 `note.parent_id`、子树删除批次列及页面树索引）/ `ensureBookmarkSnapshotTable` / `ensureBookmarkHealthTable` / `ensureFeatureRequestTables` / `ensureGrowthTaskSchema` / `ensureGrowthCenterSchema`（成就状态、成长偏好、回顾状态及旧数据幂等回填）/ `ensureAiDocumentSchema` / `ensureFilePreviewSchema` / `ensureCommunityChatSchema`（社区访问预留、偏好、审计、单一主房间、文本消息与阅读位置）/ `ensureResourceGovernanceSchema`。`ai_bonus_tokens` 是永久 AI 加油余额；配额闸门在同一事务内先占等级每日额度，再自动占该余额。成长任务由 `growth_tasks` 与 `user_growth_tasks` 保存定义、达成状态和 `claimed_at` 手动领取事实；业务事件只能标记达成，领取接口才可写经验账本。资源治理 Schema 也由部署前 `check:resource-governance` 幂等初始化，保证 Schema 断言在应用重启前可通过。运行时**加列**因 MySQL 5.7 不支持 `ADD COLUMN IF NOT EXISTS`,才先查 `information_schema` 再条件 `ALTER`(这是加列的手法,不是 A 轨 CREATE TABLE 的)。
  - 同一张表可能被两轨分建:如 `growth_events` 主表在迁移 `20260708_growth.sql`,而 `user_growth` 的积分/装扮/抽奖列由 `ensurePointsSchema` 运行时补。**只读 `migrations/` 会漏掉 B 轨的表;只 grep 代码里的 `CREATE TABLE` 又会漏掉 A 轨迁移建的表——两边都要查,别信任何一侧的"未命中"。**
- **Schema 基线门禁**：`note.revision`、`note_versions.source_revision/reason`、旧版兼容列 `files.share_token`、独立分享表和文件预览任务表已由 `20260807_note_editor_safety.sql`、`20260730_file_share_lifecycle.sql`、`20260808_file_preview_artifacts.sql` 和 `tag_db.sql` 补齐；发布前运行 `pnpm --filter server check:schema` 与 `pnpm --filter server check:file-previews`，关键表、索引或已启用的 7-Zip/LibreOffice 运行时缺失时禁止重启应用。旧 `share_token` 仅用于迁移兼容，新写入统一使用 `file_shares.token_hash`。
- 基线 `tag_db.sql` 可能已过期，仍含 `note_tags` / `tag_bookmark_relations` 等旧表；现行代码走 `tag` + `resource_tag_relations` 统一多态关联。

### 安全模块会自动封 IP —— 密集运维流量小心

- `attackMonitor` 中间件：敏感路径探测（`.env`/`.git`/`wp-admin` 等）判 **SCANNER**、高频判 FLOOD，风险分累积到阈值（`SECURITY_IP_AUTO_BAN_RISK_SCORE`，默认 80）即自动封该 IP 30 分钟。
- 密集的 dev / 运维 / 预渲染（prerender、build）流量踩过这个雷；自救：清 `security_ip_reputation` 对应行。白名单 IP / 内网回环 / root 用户豁免。

### 成长系统是全站横切依赖

- 段位特权（`util/growth.js` 的 `RANKS`）被多个模块读取：**AI 每日 token 额度**（`aiQuota`）、**回收站保留天数**（`trashHandle`）、**云空间容量**、**每日抽奖次数**。AI 调用先消耗当日等级额度，耗尽后才扣 `user_growth.ai_bonus_tokens` 永久余额；兑换、抽奖与历史背包转换都只能增加此余额。改等级阈值、特权表或余额扣减顺序会牵连这些模块，不是孤立改动。
- 云空间等级容量采用 15 级曲线：`1 / 1.25 / 1.5 / 1.75 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 / 10.5 / 13.5 / 16.5 / 20 GB`，再叠加 `user_growth.storage_bonus_mb` 永久扩容。正常文件与回收站文件共用同一额度；移入回收站不释放容量，恢复不重复占用，只有彻底删除、清空或过期物理清理才释放。上传预检、写库前权威拦截及容量明细统一复用 `util/storageUsage.js`；AI 附件保存、工作台、管理员用户统计和 Agent 存储查询也必须按 `del_flag IN (0, 1)` 保持同一口径。同名覆盖只计算新旧文件差额。
- 笔记内“上传文件”使用托管单文件直传：服务端签发账号命名空间内的随机 UUID 对象键，浏览器直传后再以 OBS 实际元数据确认；展示文件名、对象键和稳定 `files.id` 相互解耦。确认事务锁定账号行，校验目录归属与共享容量，并对正常区或回收站中的同名文件自动添加序号，禁止覆盖对象或删除重建旧文件。确认按对象键幂等，失败中止也必须先确认对象未落库。Markdown 与富文本都只插入标准 `fileId` 资源引用，继续由 `note_resource_refs` 统一解析和同步；上传期间编辑位置失效时保留云文件，由用户在当前光标重试插入。
- 成长周报由 `util/weeklyReport.js` 聚合，不新建周报表：实时预览统计“含今天的最近 7 个自然日”，每周一通知固定统计上周一至周日，并把快照写入 `notification.meta.weeklyReport`。返回值除总量与上周对比外，还包含固定 7 天 `days`、`activeDays`、`bestDay`、自然周 `period`、等级进度和 `expStatus`；前端据此绘制真实趋势并解释最高等级/免经验账号的零经验，禁止把缺失日数据伪造成趋势。旧通知缺少新增字段时必须降级展示。导出周报卡只包含聚合指标，不包含资源标题或正文；除本地图片下载外，还可通过标准云文件预签名上传链路保存到账号的“周报”目录，目录不存在时由 owner 事务接口原子复用或创建，禁止客户端先查后建造成重复目录。
- `GET /growth/claimable` 只读返回日常阶段、一次性任务、成就、周挑战和 `nextAction`；`POST /growth/claimAll` 在单事务、同一用户锁内重新核算选定范围，统一写入经验、积分、道具和头像框回执。重复请求必须幂等，任一项失败必须整体回滚；所有成长 GET 接口禁止顺带建表、回填解锁或修正领取状态。
- 一次性成长任务采用“事件达成、用户领取”两阶段模型：`status = completed` 只表示业务条件已满足，`claimed_at` 才表示奖励已领取。头像等资料保存接口必须等待达成状态同步后再响应；经验发放只允许从领取事务进入，并用成长账本唯一来源键保证重复点击幂等。
- 头像框完整目录仍由 `util/points.js` 用 `acquisition = shop | achievement` 统一组合；其中积分商品的价格、等级、AI/空间与免费/付费奖池来自版本化单一事实源 `util/pointsEconomyCatalog.js`，完整规范见 `docs/points-economy.md`。C4 的 13 款积分框为基础 `220 / 320 / 480`、进阶 `700 / 1000 / 1400`、炫彩 `2000 / 2800 / 3800`、传说 `6000 / 9000 / 12000 / 16000`；前三档无等级门槛，四款传说只要求 Lv.3～6。完整目录及所有入口仍按“基础 → 进阶 → 炫彩 → 传说”稳定递增，同档保留目录顺序；当前 29 款按 `7 / 7 / 7 / 8` 分布，积分框为 `3 / 3 / 3 / 4`，成就框为 `4 / 4 / 4 / 4`。书签、笔记与文件都按 200 炫彩、500 传说形成双阶梯；200 数量档同时要求 Lv.5，三类资源的 500 数量档同时要求 Lv.8。`bookmark_200` 对应新增 `frame_bookmark_corridor`，历史已领取该成就的用户由领取事实自动获得现行头像框权益，不回收既有装扮。视觉等级、结构 / 动效预算与新增款实施标准只遵循 `docs/avatar-frame-design.md`，经济版本不得另改几何或动效。所有商店预览、顶栏、个人中心、聊天室佩戴态和后台用户管理复用 `AvatarFramePreview` 的 64px 固定设计画布并整体等比缩放。后台用户分页接口随列表一次性左连接 `user_growth.equipped_frame`，禁止逐行请求；未知框 ID 回退普通头像。`GET /growth/shop` 返回当前 `economyVersion`、积分商品和完整 `frames`；购买接口只校验积分目录，佩戴接口校验完整目录与权益。Root 自己的普通管理会话保留全目录试戴能力，不扣积分、不写所有权，管理员预览上下文不继承。成就领取继续用不可重复的领取事实发放积分和头像框，历史领取兼容不能由只读入口产生写入。
- C4 每日惊喜与积分抽奖使用独立奖池：每日惊喜按等级每日 `0 / 1 / 2 / 3 / 3` 次，只发积分或 AI 永久余额，不发永久空间/补签卡，也不推进付费保底；付费单抽 170、十连 1600，每第 10 次付费抽从稀有池命中。`lottery_count` 保留为历史总数，权威付费状态位于 `lottery_paid_count` 与 `lottery_paid_pity_progress`。
- 商店购买和两类抽奖使用 `points_economy_operations` 保存账号级幂等请求、经济版本、规范负载哈希和可回放结果。服务端必须先回放成功旧请求，再校验新请求的版本与预期价格；扣分、资产、保底和操作结果在同一事务提交。`points_economy_migration_state` 标记显式的一次性旧保底继承，C4 激活但标记缺失时应用拒绝启动；`ensurePointsSchema()` 只补表/列，不执行历史回填。
- 获取策略与 C4 消费目录独立，C5 基础规范见 `docs/points-earning-c5.md`，C6 每日任务扩展见 `docs/points-earning-c6.md`。签到、每日任务和每周挑战稳定理论周上限保持 670；C6 每天固定签到，并从“收藏书签/新建笔记/上传文件/创建待办”四个无需前置库存的任务中稳定选择两个不同任务，任务由不可变 `growth_events` 事实聚合。账号加自然日可唯一重算同一组合，连续 6 天组合不重复，GET 不写分配状态；事件只保存低敏感类型/判重键，不保存正文、标题、URL 或路径。账号自然日/ISO 周版本由 `points_earning_period_policy` 固化，领取事务重算并使用版本化 ref，避免同周期双领。
- C5 用户积分中心按今日、本周和最多 28 天有界聚合，目标商品实时读取 C4 服务端目录，预计天数只使用稳定收入且支持低压力模式。Root 治理按最大 365 天范围聚合，提供健康、来源/去向、用户 360、只读模拟、异常和游标对账；期初差额由 `points_ledger_baselines` 固化，对账只报告，人工修正只补幂等 `correction` 流水，不自动覆盖余额。
- 正向活动积分通过 `points_campaigns` 状态机和冻结收件人表执行，结构化受众默认排除游客、删除/非普通/有效封禁账号；预览不写积分，名单冻结后按租约小批执行，每个收件人复用 `points_grant_operations` 请求号。Campaign 依赖治理开关与显式正数安全上限，禁止批量扣分。`20260814_points_earning_c5.sql` 显式固化旧成就快照、历史有意义行为和对账基线；应用启动只补结构。

### 分享链接安全 —— 明确未完成

- 文件分享 `files.share_token` 由 `crypto.randomBytes(16)` 生成，**永久有效、无有效期、无提取码、无失效/撤销机制**；token 与文件名明文在 URL path。"有效期 / 提取码 / 失效" 是已知待办，需新增列或独立 share 表 + 撤销接口，勿误以为已完善。

## 本机服务器管理（Host Agent）

- PC 顶栏 Root「管理」下拉与移动个人中心同时提供「后台管理」和「服务器管理」；`/serverManagement` 仍在现有应用外壳内，由 Root 路由守卫保护。
- 浏览器只访问 Express 的 `/api/infra/*`。Express 是控制面，继续承担登录态、每请求角色校验、管理员预览失败关闭、高风险确认、意图/终态审计和幂等键派生。
- `apps/host-agent` 是独立 Node.js 进程，不是 AI Agent。它只监听 `/run/lightnote-host-agent/agent.sock`，不开放 TCP 端口；Express 与 Agent 共享 `@lightnote/shared/host-agent-protocol` 版本化封闭协议。
- Agent 采集 CPU、负载、内存、根磁盘、网络速率、主机与服务状态，内存保留最近 60 分钟采样；日志按服务白名单、行数、输出大小和脱敏规则返回，不提供任意路径读取。
- 写动作只有 `nginx.reload` 与三个固定 Worker 的 `service.restart`。Nginx 必须匹配受支持的 systemd 或固定面板路径拓扑并确认主进程身份，才通过 root 所有的固定 helper 先 `nginx -t` 再 reload；PM2 只允许精确进程名且不使用 `--update-env`。非 root PM2 优先由同账户 Agent 直连；遗留 root PM2 只允许通过 `0660 root:<agent-user>` 的专用 Unix Socket 请求 systemd 按连接启动的 root helper，以固定 action/target 读取受限状态/日志和重启三个固定 Worker，不共享 `/root/.pm2`。面板托管的 Nginx/Redis 状态也由 helper 校验固定 PID 文件与 `/proc/<pid>/exe` 后返回，避免把失效的兼容 systemd unit 当成真实状态。Agent 自身继续运行于 `no_new_privileges` 沙箱，不使用 sudo；轻笺 API、MySQL、Redis 没有页面重启能力。
- 每次动作由 Root 填写原因并显式确认，Express 先写 intent 审计；Agent 按派生 job ID 在执行前原子落「结果未知」占位，再以成功/失败终态回执原子替换。同一幂等键并发、网络重试或 Agent 中途崩溃都不会自动重复执行；Express 再写 succeeded/failed 终态审计。
- Agent 不加载后端 `.env`，不持有数据库、Redis、对象存储或 SSH 凭据。部署配置只含 Socket、状态目录、二进制和 PM2 home 等非敏感绝对路径；详细安装与回滚见 `apps/host-agent/README.md`。
- v1 只管理轻笺当前所在主机。网站或主 API 完全不可用时页面也不可用，紧急恢复仍走人工 SSH；未来增加少量其他主机时再引入主机注册、双向认证与远端 Agent，不提前建设多主机控制面。
