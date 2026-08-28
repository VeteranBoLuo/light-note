# 轻笺架构

本文描述当前系统边界、分层、核心数据域和关键运行链路。路由、表、环境变量和 Skill 的完整清单以源码、Schema 与契约测试为准；本文不复制易漂移的实现枚举。

## 系统概览

轻笺是书签、笔记、文件、标签、待办与个人知识处理平台，使用 pnpm monorepo：

```text
light-note/
├── apps/
│   ├── web/          Vue 3 + Vite Web、PWA 与 Manifest V3 扩展
│   ├── server/       Express 5 + MySQL + Redis + OBS
│   ├── android/      Android WebView 原生壳
│   └── host-agent/   本机服务器只读采集与白名单运维代理
├── packages/         共享协议与领域包
└── scripts/          本地开发、检查与部署脚本
```

主要运行链路：

```text
Browser / PWA / Android WebView / Extension
                    │ HTTPS / same-origin realtime
                    ▼
               Express API
        ┌───────────┼───────────┐
        ▼           ▼           ▼
      MySQL       Redis         OBS
        ▲                       ▲
        └──── domain Workers ───┘

Browser → Express /api/infra/* → Unix Socket → Host Agent
```

MySQL 5.7 是兼容基线。Redis 保存会话、短期票据、实时失效与租约；OBS 保存用户文件和私有派生资源。浏览器不能直连数据库、Redis、Host Agent 或任意服务器命令。

## 后端分层

```text
router/ → router_handle/ → util/services/ → db / Redis / OBS
                              │
                              └→ Worker queues / domain side effects
```

- `router/`：认证、中间件、参数与 HTTP 路径。
- `router_handle/`：请求编排和响应，不承载可复用业务 SQL。
- `util/services/`：跨页面、AI Skill、Worker 和脚本共享的权限、事务、幂等与副作用。
- `db/index.js`：HTTP、Worker 和脚本的统一数据库连接与环境安全边界。
- `packages/shared`：前后端共用的版本化协议与领域常量。

API 使用 `resultData(data, status, msg)` 信封，snake_case 响应键统一转 camelCase。客户端只依赖稳定业务错误码，不依赖 raw 异常文本。

### 身份与权限

- 角色为 `visitor`、`user`、`test`、`root`。`test` 只在运营统计中按内部账号过滤，不失去普通产品能力。
- 普通请求以 `req.user` 为身份。管理员代看分离真实操作者 `billingUser` 与资源主体 `resourceUser`。
- 管理员上下文使用短时 `X-Admin-Context`，所有路由在 `adminRoutePolicy.js` 显式声明；遗漏失败关闭。
- `readonly` 只读；`maintain` 只允许可逆内容维护并抑制目标账号成长、转化和权益副作用。
- Root 高风险操作使用 `ensureRootRole()` 并保留意图与终态审计。

## 前端与客户端

### Web

- 路由入口位于 `apps/web/src/router/`，页面位于 `view/`，共享 UI 位于 `components/`。
- Pinia Store 与 composable 承担跨页面状态、请求和业务动作；桌面/移动视图不复制领域逻辑。
- 断点由 `config/responsive.ts` 和 bookmark Store 统一提供。
- 主题变量位于 `assets/css/theme.less`；资源语义色位于 `config/resourceColor.ts`；静态 UI 图标位于 `config/icon.ts`。

### 应用入口

- 根路径 `/` 保留响应式官网。
- `/app` 是应用入口：移动浏览器回访、移动 PWA 与 Android App 固定进入“今日” `/workbenches`；桌面按账号首页偏好进入，无偏好回退书签。
- 手机浏览器第一次访问根路径展示官网；回访分流只使用本地记录，不改变搜索引擎得到的 HTML。
- 移动端底部一级导航为“今日｜资料｜AI｜待办｜聊天室”，个人中心由顶栏头像进入。
- 被动身份变化不会自动弹登录框；登录/注册弹框只响应用户明确意图或受保护操作的再次确认。

### Android

- `apps/android` 只负责 WebView 容器、安全导航、文件选择、下载、系统返回、开屏与版本标识；业务 UI 继续由 Web 端维护。
- Release 固定加载 HTTPS `/app`，关闭 WebView 调试、拒绝 SSL 错误并禁用不需要的文件访问。
- Debug 可在构建时覆盖局域网 Vite 地址；Web 代码通过 HMR 更新，不因普通前端改动重装 APK。
- 移动浏览器、PWA 与 App 共用 `html.light-note-mobile-rendering` 渲染基线；Android 引擎类不承载业务视觉。

### PWA 与扩展

- PWA Service Worker 只处理页面导航与离线页，不缓存私有 API 数据； `start_url` 为 `/app?source=pwa`。
- Android App 内不注册 PWA 安装能力。
- 浏览器扩展使用 Manifest V3 Side Panel，完整权限、认证和资源流程见 [浏览器扩展](./browser-extension.md)。

## 核心领域

### 资源、标签与待整理

- 书签、笔记、文件是三类资源；待办是行动对象，不进入资源标签关系。
- `tag` 是标签本体，`resource_tag_relations` 是三类资源与标签的唯一关系事实。
- “标签”使用单一浏览与治理模块：`/manage/tagMg` 只作为兼容 URL，由 `TagSpaceEntry` 在路由提交前进入上次使用或最近标签；历史 `TagMg` 页面实现已删除。浏览、创建、编辑和删除都在同一标签目录与 `/tag/:id` 工作区完成，不再挂载第二套标签总览页。历史 `?mode=manage` 只做兼容规范化。
- `/tag/:id` 按标签 ID 读取内容；同名标签不合并。目录摘要、分区预览和跨类型时间线都由服务端分页读模型提供，不能先分表截断再在前端伪造全局顺序。
- `resource_inbox` 保存书签、笔记和文件的待整理关系。入口参数和页面位置不构成待整理事实。
- `tag_relations` 保存由有效共享资源派生的标签关系；软删除资源保留的恢复关系不能计入活跃统计。

### 笔记

- `note` 同时承载正文与页面树节点；`parent_id = NULL` 表示根层，最大深度为 8，不新增文件夹实体。
- 同级排序限定在 `(owner, parent_id, is_top)` 兄弟组。树负责同级前后排序，卡片/列表负责移入或移出父页面。
- 移动、批量移动、右键移动和关联已有页面都由服务端返回原/新父级，前端据此失效两侧目录缓存。
- HTML、Markdown、手绘是正式正文类型。所有写入口复用 owner、revision、净化、历史还原点与资源引用事务。
- 手动版本、格式转换、AI 修改和历史恢复使用明确 reason；普通保存与“保存版本”不是同一动作。
- 公开分享使用独立只读页面。令牌摘要落库，原令牌放 URL fragment 并换短时阅读票据；目录分享按当前页面树实时计算范围。
- 新建或移动页面进入有效分享目录时，服务端事务内检测新增暴露并要求显式确认；公开读取复用正式正文净化和范围校验。

### 文件与派生预览

- 展示名、OBS object key 与稳定 `files.id` 相互分离。
- 上传使用 prepare → signed PUT → confirm；confirm 事务重新校验 owner、目录、容量和 OBS 元数据。
- 文档解析、OCR、压缩包清单和 Office 转换由独立 Worker 处理；HTTP 进程只创建任务与读取状态。
- 派生资源有尺寸、条目数、超时、输出大小和进程并发上限；解析子进程不继承数据库、Redis 或 OBS 凭据。

### 待办

- `todo_items` 是任务实例；提醒计划、系列模板、提醒规则和实际投递 Job 分表保存。
- 创建、状态变更、撤销和 Agent 操作统一复用 `todoService`。
- 日期、DST、月末、系列实例和提醒时间由服务端确定性计算器处理，前端和模型不自行计算。
- 系列与提醒写入使用幂等请求和数据库租约；关闭新建入口不能停止既有调度。

### 社区聊天室

- 社区与私人 AI 完全分域；当前公共房间只有 `general`，游客可读、登录用户可发言。
- MySQL/REST 是消息唯一事实，`/realtime/chat` 只发送失效信号和公有 ID；客户端收到事件后拉取当前用户可见的权威数据。
- realtime 显式开关、同源 Origin、Cookie session、载荷、连接和订阅频率都失败关闭；不可用时降级为有界前台轮询。
- 消息发送、回复、提及、图片、投票和通知共享完整幂等负载；撤回、个人删除和 Root 全局治理是不同状态。
- 行内小表情仍属于 `text` 消息，以 `@lightnote/shared/community-chat-inline-emojis` 的版本化令牌持久化；前后端共用注册表、逻辑长度与数量上限，未知令牌拒绝写入，摘要和通知只输出可读名称。
- 房间阅读位置只服务未读角标，逐消息回执使用独立不可变事实。
- 管理员预览不能代用社区身份；Root 治理写入原因、权限和不可变审计。
- Android 当前只有站内通知与角标，不用被冻结的 WebView 运行时冒充后台系统推送。

### 模块化 AI Skills

页面选择封闭 Skill，服务端 Registry 绑定资源、权限、历史、模型、输出与计费；所有模型访问经过统一 Gateway 与 AI Execution。完整规范见 [模块化 AI Skills](./ai-skills.md)。

旧助手的会话、来源、反馈等表只用于导出、删除与审计兼容，不再作为普通 Skill 上下文。

### 成长、积分与支持

- `user_growth.exp` 是所有角色的等级事实源；Root 身份不等于满级。
- EXP、积分、AI 永久余额、空间和道具使用各自可审计账本，展示快照不能替代流水。
- 积分获取与消费使用不同版本：获取规则见 [C5 基线](./points-earning-c5.md) 与 [C6 每日任务](./points-earning-c6.md)，消费见 [积分经济](./points-economy.md)。
- 资源商店与纯支持共享支付渠道但使用不可变订单用途分域。套餐、首购和权益发放见 [资源商店套餐](./support-packages.md)。
- 头像框视觉等级与动效不由经济目录定义，唯一设计规范见 [头像框设计](./avatar-frame-design.md)。

### 服务器管理

- 浏览器只访问 Express 的 `/api/infra/*`。Express 负责登录态、Root 权限、确认、审计和幂等。
- `apps/host-agent` 仅监听 Unix Socket，不开放 TCP，不加载后端 `.env`，不持有数据库、Redis、OBS 或 SSH 凭据。
- Agent 只提供白名单指标、服务状态、受限日志和固定动作；不接受任意路径、命令或进程名。
- 写动作先落 intent，再由 Agent 以 job ID 原子保存未知/成功/失败终态。网络重试和进程崩溃不能自动重复执行。
- 主站完全不可用时仍需人工 SSH；Host Agent 不是远程多主机控制平台。

## 数据域

表结构以 migration、`ensure*()` 和 Schema 断言为准。排查时按领域同时搜索，而不是依赖一份手工表清单。

| 数据域     | 代表表                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| 账号与审计 | `user`、session、安全、API/操作日志、管理员上下文审计                   |
| 资源       | `bookmark`、`note`、`files`、`folders`、`tag`（含标签说明）与待整理关系 |
| 笔记安全   | `note_versions`、资源引用、模板、分享与分享事件                         |
| 待办       | `todo_items`、系列、提醒规则、提醒 Job、幂等请求                        |
| AI         | Skill Execution/Span/额度、文档来源与任务、历史兼容表                   |
| 社区       | 房间、消息、互动、图片、投票、阅读、举报、处罚与审计                    |
| 成长与积分 | `user_growth`、成长事件、积分流水、周期策略、消费/发放收据              |
| 支持与商店 | 订单、结算意图、套餐/活动、首购事实、权益账本                           |
| 资源治理   | 扫描、finding、清理 Job 与审计                                          |

## Worker 与副作用

- 文档/文件预览 Worker：解析、OCR、压缩包与 Office 派生。
- 书签图标 Worker：持久任务、去重、受控下载和活动引用检查。
- 资源治理 Worker：只读扫描与经确认的低风险清理。
- 待办/提醒与其他调度：数据库事实、租约、幂等和有界批次。

业务事务先提交权威状态，再触发可补偿旁路。Worker 任务表而不是 API 日志用于解释执行状态。部署到 Linux 的后端包不得依赖本机平台 native Node 二进制；图像/OCR 使用服务器受控 CLI。

## Schema 与部署边界

- Schema 有显式 `migrations/*.sql` 和运行时 `ensure*()` 两条轨道；前者负责历史迁移，后者只补幂等结构。
- `tag_db.sql` 可能落后于运行时，不能作为唯一事实源。
- 发布前运行只读 Schema 与受影响 Worker 门禁；有输出即未就绪。
- 部署脚本从本地打包后 rsync 到 Linux。健康检查失败不会自动证明已回滚，必须按发布输出执行精确恢复。
- 本地预览、发布授权、分支处理和验收步骤见 [本地预览与上线](./release-acceptance.md)。
