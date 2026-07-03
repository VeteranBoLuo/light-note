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

| 层 | 技术 | 版本 |
|---|------|------|
| 前端框架 | Vue 3 | ^3.x |
| 构建工具 | Vite | ^5.x |
| 状态管理 | Pinia | — |
| HTTP 客户端 | Axios | ^0.24.0 |
| UI 组件 | Ant Design Vue 3.x + 自研 BComponent | — |
| 多语言 | vue-i18n | — |
| 后端框架 | Express | — |
| 数据库 | MySQL 5.7 / 8.0 | — |
| 对象存储 | 华为云 OBS | — |
| 认证 | Cookie Session（express-session） | — |

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
    └── security/          # 安全攻击检测
```

### 响应格式

所有 API 统一使用 `resultData(data, status, msg)`：

```javascript
res.send(resultData({ id, name }, 200));           // 成功
res.send(resultData(null, 400, '参数错误'));        // 客户端错误
res.send(resultData(null, 401, '请先登录'));        // 未认证
res.send(resultData(null, 403, '无权限操作'));       // 无权限
res.send(resultData(null, 500, '服务器内部错误'));    // 服务端错误
```

- `resultData` 会自动将 snake_case key 转为 camelCase
- 非 200 响应自动记录错误日志

### 权限模型

- 角色：`visitor`（游客）、`user`（普通用户）、`root`（管理员）
- 权限检查内联在各 handler 中，通过 `req.user?.role` 判断
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

| 表 | 作用 | 主键类型 |
|----|------|---------|
| `user` | 用户 | UUID |
| `bookmark` | 书签 | UUID |
| `note` | 笔记 | UUID |
| `files` | 云空间文件 | 自增 |
| `folder` | 云空间文件夹 | 自增 |
| `tag` | 标签 | UUID |
| `resource_tag_relations` | 资源-标签关联 | 无独立 id |
| `tag_relations` | 标签-标签关联 | 无独立 id |
| `api_logs` | API 请求日志 | UUID |
| `operation_logs` | 操作日志 | UUID |
| `security_events` | 安全事件 | 自增 |
| `conversion_events` | 游客转化事件 | 自增 |
| `opinion` | 用户反馈 | UUID |
| `help_config` / `help_config_draft` | 帮助中心 | UUID |

### INSERT 规范

| 主键类型 | 使用函数 |
|---------|---------|
| UUID | `insertData({ ... })` 或 `generateUUID()` |
| 自增 | 直接用 `snakeCaseKeys()` |
| 无 id 列（关系表） | 用 `snakeCaseKeys()` |

## 轻笺智域（AI Agent）

- 主力供应商：DeepSeek（`DEEPSEEK_API_KEY`）
- 备用供应商：千问 Qwen（`DASHSCOPE_API_KEY`）
- 通过 `AGENT_LLM_PROVIDER` 环境变量切换
- 配置集中在 `util/agent/deepseekClient.js` 的 `PROVIDERS` 表
- 价格按供应商独立计算

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
