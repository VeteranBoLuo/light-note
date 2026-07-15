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
│   ├── inbox.js           # 快速收集与待整理路由
│   ├── todo.js            # 行动中心待办与提醒路由
│   ├── chat.js            # AI Agent、写操作确认与额度路由
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
| `todo_items`                        | 行动中心待办事项         | UUID      |
| `todo_reminders`                    | 待办提醒调度记录         | UUID      |
| `tag_relations`                     | 标签-标签关联            | 无独立 id |
| `api_logs`                          | API 请求日志             | UUID      |
| `operation_logs`                    | 操作日志                 | UUID      |
| `security_events`                   | 安全事件                 | 自增      |
| `conversion_events`                 | 游客转化事件             | 自增      |
| `admin_context_audit`               | 管理员预览与内容维护审计 | UUID      |
| `agent_logs`                        | AI 请求、用量和阶段追踪  | UUID      |
| `opinion`                           | 用户反馈                 | UUID      |
| `help_config` / `help_config_draft` | 帮助中心                 | UUID      |

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
- 五个写工具使用 Redis 哈希键保存的一次性确认令牌；前端先展示风险、目标和影响范围，确认后按服务端保存参数执行
- 笔记、书签、标签、回收站恢复和知识库写入必须复用 `util/services/`；Agent 工具不得再直接拼接这些业务 SQL，以保持事务、归属、成长、转化、快照和参数校验一致
- SSE 使用 `start/tool_start/tool_result/tool_confirmation/sources/delta/done` 结构化事件，并保留 `requestId` 关联日志
- 用户可为单条消息选择书签、笔记、文件或标签上下文；后端重新校验归属后读取，不信任前端正文

## 快速收集与待整理

- `resource_inbox` 是跨资源关系表，不复制书签、笔记或文件正文；资源本体仍是唯一事实源
- 快速收集支持 URL、Markdown 文本和文件，创建资源与加入待整理在同一业务事务或确认链中完成
- 加入操作以 `(user_id, resource_type, resource_id)` 幂等；完成整理只更新关系状态，不修改资源本体
- 列表查询、批量完成与重新加入都必须校验当前资源主体归属；资源删除时清理对应关系
- 资源中心及书签、笔记、云空间现有菜单统一复用 `useInboxEnqueue` 手动入队；接口失败显示可重试错误态，不伪装成空列表
- “快速收集”是登录用户的全局操作；待整理不作为独立一级导航，而作为资源中心的状态视图保留，`/inbox` 路由继续兼容已有入口
- 管理员维护游客工作区时，待整理写操作只允许游客自己的书签和笔记，文件始终拒绝；永久删除和过期清理再次兜底移除关系

## 行动中心与待办

- `/inbox` 页面统一展示待整理资源与待办，产品入口名称为“行动中心”，原路由保持兼容
- 待整理资源继续使用 `resource_inbox`；待办独立存入 `todo_items`，不能伪装成笔记或资源关系
- 待办支持标题、说明、简易清单、优先级、截止时间和站内提醒；提醒计划存入 `todo_reminders`
- 待办完成或删除不会修改任何书签、笔记或文件；管理员预览首期只允许读取，不允许代用户写入待办
- 待办提醒由服务端定时扫描 `todo_reminders`，以事务抢占防止重复发送，并写入统一通知中心

## 日志白名单

- 浏览器请求同时携带传统指纹和本地生成的稳定 `X-Log-Device-Id`；稳定标识仅用于 root 主动配置的日志排除，不参与认证或权限判断
- API 日志、操作日志、转化漏斗以及注册接口的手动日志写入统一调用 `isSelfTraffic`，稳定设备标识优先、浏览器指纹作为旧数据兼容

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
