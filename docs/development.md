# 轻笺开发规范

本文只说明全项目通用的开发规则与验证门禁。系统边界见 [架构文档](./architecture.md)，设计规则见 [设计文档](./design.md)，发布流程见 [本地预览与上线](./release-acceptance.md)，专题规范从 [文档目录](./README.md) 进入。

## 环境与命令

- Node.js 20.x
- pnpm 8+
- MySQL 5.7+

```bash
pnpm install
pnpm dev:web
pnpm dev:server
pnpm test
pnpm typecheck
pnpm build:web
```

`pnpm dev:server`、`pnpm dev:server:watch` 和 `pnpm preview` 会托管项目需要的本地 Worker。仅在绕过项目级命令单独启动后端时，才按专题需求额外启动 Worker。

Vite 开发服务器的 REST、上传和实时代理固定指向本机后端；`VITE_ENV` 缺省或为 `local` 时允许启动，其他值失败关闭。生产构建部署后使用站点同源 API，不允许用本地 Vite 反向代理生产服务，以免调试请求和在线状态进入生产运行时。

### 数据库环境隔离

- HTTP、Worker 和脚本都通过 `apps/server/db/index.js` 建立数据库连接。
- 本地只允许回环地址或 Unix Socket；远程地址默认以 `REMOTE_DATABASE_WRITE_BLOCKED` 失败关闭。
- 本地使用 `LIGHTNOTE_RUNTIME_ENV=local` 与 `ALLOW_REMOTE_DATABASE_WRITES=false`；生产必须显式设置 `LIGHTNOTE_RUNTIME_ENV=production`。
- 远程写入只允许在当前任务明确授权后，用一次性进程环境开启；不得写回本地 `.env`。
- 测试环境禁用真实数据库适配器，不加载真实凭据。代码默认主机固定为 `127.0.0.1`，禁止提交生产地址或账号。

## 实施前门禁

除纯文案和机械格式化外，编码前必须：

1. 明确用户目标、真实根因、影响范围与授权边界。
2. 搜索现有组件、Store、Service、协议、配置和 [踩坑记录](./pitfalls.md)。
3. 至少比较局部实现与复用既有能力/唯一事实源两条路径。
4. 评估数据正确性、权限、并发、性能、请求与订阅成本、失败回退、兼容性和可测试性。
5. 用户可见 UI 建立适用状态矩阵，并确定 PC/移动、浅色/深色和共享移动渲染基线的验收范围。

采用满足完整约束的最简单方案。需要扩大协议、迁移数据或取得新授权时先说明；阶段性方案必须明确遗留风险和回退边界。

## 文档维护

- 先阅读 [文档目录](./README.md)，把信息写入唯一事实源。
- 只有架构/协议/数据边界、跨模块硬约束、用户可见产品规则、发布门禁或重要反直觉根因变化时才更新正式文档。
- 不把排障过程、实现日报、文件清单、测试运行记录、上线状态和可从 Git 历史恢复的内容写入长期文档。
- 功能规格不塞进本文；复杂领域使用专题文档，普通实现细节由代码与测试表达。
- `pitfalls.md` 只记录重要且会复发的问题。稳定条目采用“约束 + 验收”，同根因合并，过时过程直接删除。
- `docs/plan/`、`docs/done/` 与 `docs/fix/` 是本地临时材料，不是规范。方案落地后将有效结论合并到正式文档，删除已纳入 Git 的旧方案稿。

## 后端规则

### 分层与复用

- 路由只定义 HTTP 边界，Handler 负责编排，跨入口业务规则放 `util/services/`。
- 笔记、书签、标签、待整理、待办、回收站和 AI 写入必须复用领域 Service，禁止页面 Handler、Agent 和脚本各写一套 SQL 与副作用。
- 只读查询直接使用连接池；多表写入使用同一事务连接。

### 响应与错误

- API 统一返回 `resultData(data, status, msg)`。
- 常用状态为 200、400、401、403、404、409、423、500；业务冲突使用稳定错误码。
- Handler 最外层保留 `try/catch`；提前响应后立即 `return`。
- 客户端错误不得泄漏 raw `error.message`、stack、对象存储 key、临时路径、SQL 或 Provider 原文。
- 主事务提交后的通知、成长、索引等旁路失败不得把成功请求改写为失败。

### SQL、主键与事务

- 用户输入全部参数化。动态 `IN` 使用占位符数组；表名、列名和排序只允许白名单。
- UUID 主键表使用 `insertData()`；自增表和无独立 ID 的关系表使用 `snakeCaseKeys()`。
- 新 ID 使用插入函数返回值，禁止 `ORDER BY ... LIMIT 1` 猜测。

```javascript
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  await connection.query("...");
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
}
```

事务内只能使用 `connection.query()`，不能混入 `pool.query()`。唯一键竞争后需要 current read 或新事务，不能继续相信旧快照。

### 权限与身份

- 身份来自认证后的 `req.user`、`req.billingUser`、`req.resourceUser` 与 `req.adminContext`，不接受请求体中的用户或管理员上下文 ID。
- Root 操作使用 `ensureRootRole(req, res)`。
- 管理员上下文路由必须在 `adminRoutePolicy.js` 显式声明；遗漏默认拒绝，`readonly` 禁止持久化写入。
- 列表、详情、导出和后台聚合都必须按权威 owner 过滤；统计口径不能反向成为产品权限。

### 安全、日志与外部输入

- 通用安全豁免绑定请求方法、规范化路由、完整字段路径、载荷形态和业务上限；不得按字段名或整条路由全局放行。
- API 日志只保存低敏摘要，不复制正文、场景、模板、访问令牌或 Provider 原文。高频被动刷新和已有领域遥测不重复写通用日志。
- 用户 URL 必须经过协议、重定向和 SSRF 校验；浏览器渲染的主页面、跳转和每个子资源也必须在实际连接层固定已校验公网 IP，禁止只在路由回调中“先查一次 DNS”后交给浏览器重新解析。渲染子进程不得继承后端密钥、用户 Cookie 或 root 身份。对象存储只保存受控 key，不信任客户端 URL。
- 网页元信息只来自 `static_html`、`rendered_dom` 或用户明确授权且 URL 一致的 `browser_capture`。页面不可读、需登录或仍处于访问验证时必须返回稳定原因并在模型调用前失败关闭，禁止根据域名、路径或查询参数猜名称、描述和标签。
- 邮件统一通过 `sendTrackedEmail()`。SMTP 成功只表示已受理；日志失败不能触发业务重复发信。

### Schema 与迁移

- Schema 同时存在显式 migration 与运行时 `ensure*()` 两条轨道，排查时必须同时检查。
- `ensure*()` 只补幂等结构，不做历史业务回填。数据迁移使用自包含、幂等、可审计的显式脚本。
- 发布前运行 `pnpm --filter server check:schema`；任何断言输出都表示未就绪。
- 代码和文档不得把 MySQL 8 专属能力当作 MySQL 5.7 基线。

## 前端规则

### 组件与图标

- 有 B 组件必须使用 B 组件：`BButton`、`BInput`、`BSelect`、`BTable`、`BModal`、`Alert.alert()`、`BPopover`、`BTooltip`、`BMessage`、`BLoading` 等。
- 不新增 Ant Design Vue `a-*`；存量按改动范围迁移。确无 B 组件时才能使用原生控件，并在自检中说明。
- 修改图标前实际打开 `apps/web/src/config/icon.ts`，确认完整属性路径存在。静态 UI 图标统一在该文件定义，由 `SvgIcon` 使用。
- 禁止在业务模板新增静态 `<svg>/<path>`，也不创建只包装静态 SVG 的组件。共享单色图标优先使用 `currentColor`。
- 数据可视化、复杂插画、favicon、用户上传和服务端动态图标不属于静态 UI 图标。

### 状态、数据与请求

- API、权限、业务操作和跨端共享状态优先放 Store、composable 或 Service；桌面与移动视图只负责各自展示。
- 异步请求绑定业务目标和请求世代；筛选、身份或目标变化时取消/忽略旧响应。
- 乐观更新必须有完整回滚；写操作后只失效受影响读模型，不用全页刷新掩盖缓存问题。
- 持续增长的列表由服务端分页/游标和前端虚拟化共同约束；虚拟化不能代替慢查询治理。
- 静默刷新保留旧数据，不闪骨架、不清空列表；页面隐藏时停止轮询。

### 国际化、主题与层级

- 固定文案使用 vue-i18n；新增、删除或移动 key 同步 `zh-CN.ts` 与 `en-US.ts`，并通过 locale parity 测试。
- 颜色、背景、边框和阴影使用 `theme.less` 的语义变量；资源色复用 `resourceColor.ts`。
- 全站 z-index 使用 0–1300 的既有分层：页面 100、导航 200、普通浮层 300、菜单 500、抽屉 600、弹框 700、弹框内浮层 800、覆盖层 900、搜索 1000、Tooltip 1100、消息 1200、确认 1300。禁止新增军备竞赛值。
- 展示成功日志只在真实成功后记录；批量操作按一次用户意图汇总，不为加载、轮询和分页写操作日志。

### 响应式与页面结构

- 断点唯一来源是 `config/responsive.ts` 与 `bookmark.isMobile/isTablet/isDesktop/isMobileDevice`，不新增 UA 判断或重复断点。
- 轻微排版差异使用共享组件和断点；结构与交互显著不同时使用 `XxxDesktop.vue` / `XxxMobile.vue`，业务状态仍共享。
- 移动浏览器、PWA 与 Android APK 共用 Web UI；`apps/android` 只维护原生容器能力。
- Flex 子项需要省略或收缩时设置 `min-width: 0`；页面明确唯一滚动容器，避免嵌套滚动。
- 移动触控目标通常不小于 44px；危险操作必须有可发现入口和二次确认，不能只依赖左滑或长按。

### 浮层、历史与 CSS zoom

- 移动端 `BModal`、`BDrawer` 和全屏预览统一接入 `utils/mobileOverlayHistory.ts`。
- 从一个占 history 的浮层导航或打开下一层时，使用 `closeCurrentMobileOverlayThen()` 等待旧占位出栈；后续需要的数据在关闭前复制为普通对象快照。
- `BPopover` / `BDropdown` 不占 history；Escape 和系统返回只关闭最上层可关闭对象。
- 桌面界面缩放通过根节点 CSS `zoom` 实现。视觉坐标与布局坐标混用前使用 `getRootZoom()` 换算；滚动定位复用 `utils/zoom.ts`。
- Teleport 浮层必须响应页面/容器滚动、缩放、视口和软键盘变化，不能假设触发器打开后保持静止。

## 移动浏览器 / Android App 共享渲染基线

- 手机、平板、移动 PWA 和 Android App 都在 `html.light-note-mobile-rendering` 下加载 `mobile-rendering-baseline.less`。
- `light-note-android-webview` 只标识引擎，不承载用户可见样式；业务组件禁止按 App UA 写视觉分支。
- 共享基线稳定化中间字重、`color-mix()`、混色阴影、滚动条和旧 WebView 能力差异。
- 选中、今天、激活、错误、暂停等状态必须同时使用实色描边、图标、圆点、形状或明确文字色，不能只靠混色或阴影。
- 不用 `@supports (color-mix(...))` 分流；关键布局不只依赖 `:has()`、容器查询或动态视口单位。
- 本机可用 `?renderProfile=mobile` 模拟共享基线；最终仍需在相同 CSS 视口对照移动浏览器与 Debug App。

## 模块化 AI Skills

现行 AI 架构、协议、计费与验收统一见 [模块化 AI Skills](./ai-skills.md)。禁止依据旧 Agent V2/V3 方案新增万能助手、历史分类器、裸 Provider 调用或页面级计费补丁。

用户可见的新功能或较大行为变化需要同步帮助知识；实时数据不能只写静态知识，应评估是否需要受控查询能力。知识写入必须幂等、低敏，不在文档保存生产内容。

## 鸿蒙 6 / 卓易通与 Android Debug App 真机实时预览

真机前端联调使用 Vite HMR，不使用生产预览流程。

### 环境

- JDK 17
- Android SDK 35、Build Tools 35.0.0、Platform Tools
- `JAVA_HOME`、`ANDROID_HOME`、`ANDROID_SDK_ROOT`

```bash
export JAVA_HOME="$(brew --prefix openjdk@17)"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

接受新的 Android SDK 许可是用户交互行为，不在自动化脚本中代替确认。

### 启动与安装

1. 确认 Mac 与设备在同一局域网，并取得当前 Mac IPv4。
2. 需要本地 API 时，先确认 `apps/server/.env` 指向允许使用的环境，再启动 `pnpm dev:server:watch`。
3. 启动 `VITE_ENV=local pnpm dev:web:device`，固定监听 `0.0.0.0:5175`。
4. 先用设备浏览器打开 `http://<MAC_LAN_IP>:5175/app`，再检查 Debug App。

首次安装、Mac IP 变化或原生代码变化时：

```bash
cd apps/android
./gradlew assembleDebug -PlightNoteHomeUrl=http://<MAC_LAN_IP>:5175
"$ANDROID_HOME/platform-tools/adb" install -r app/build/outputs/apk/debug/app-debug.apk
```

鸿蒙 6 + 卓易通未暴露 ADB 时可手动传输 Debug APK。普通 Vue、TypeScript、Less 修改只走 HMR；Release 永远不能写入本地 HTTP 地址。

浏览器和 App 都不可用时检查监听地址、防火墙、访客网络、VPN 与 AP 隔离；浏览器可用而 App 不可用时优先检查 APK 中固化的 IP 是否过期。

## 自检与验证

### 逐文件自检

1. 列出本轮新增、修改和删除文件，区分用户已有改动。
2. 通读每个 diff，检查 import/export、类型、空值、边界、权限、事务、状态重置和错误分支。
3. 新文件确认已接入入口、路由、菜单、国际化、注册表或 Worker。
4. 反查调用方与被调用方；删除文件确认无残留引用。
5. 检查是否引入重复状态、全量请求、轮询、监听、缓存或第二事实源。
6. 只有确认重要反直觉根因时才更新 `pitfalls.md`。

### 自动验证

- 前端：至少运行受影响测试及 `pnpm typecheck` 或 `pnpm build:web`。
- 后端：至少运行语法/受影响测试；涉及 Schema 时运行只读门禁。
- AI：运行协议、Registry、模型访问与受影响 Skill 测试，不用真实 Provider 代替确定性门禁。
- 文档：检查链接、标题、重复职责、敏感信息与 `git diff --check`；纯文档改动不要求构建。

### 视觉验收

用户可见 UI 按风险覆盖：

- PC 与移动端；
- 浅色与深色；
- 默认、hover/focus、选中、空、加载、错误及业务相关状态；
- 共享移动渲染基线与真实 Debug App；
- 中英文、长文本、窄屏和键盘操作。

DOM 断言、文案测试、类型检查和构建不能代替真实浏览器视觉验收。

## 发布

本地生产链路预览、Schema/Worker 门禁、分支处理、上线授权和发布后检查统一见 [本地预览与上线](./release-acceptance.md)。没有当前任务的明确“上线/部署”授权时，不提交、推送、连接生产环境或执行线上写入。
