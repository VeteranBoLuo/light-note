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

**主题：**

- 基于 `data-theme` 属性切换
- 主题变量定义在 `src/assets/css/theme.less`
- 使用 CSS 变量（`var(--text-color)`）而非写死颜色

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
- [ ] 权限判断正确（登录态、角色、用户隔离）
- [ ] INSERT 使用正确的函数（insertData / snakeCaseKeys）
- [ ] 笔记、书签、标签、回收站恢复和知识库写入复用 `util/services/`，页面 handler 与 Agent 工具不得各写一套 SQL 和副作用

## AI 助手知识库（功能变更需同步）

AI 助手（轻笺智域）回答"怎么用 / 是什么 / 在哪设置"依赖 `knowledge_base` 表（工具 `search_knowledge_base` → `util/knowledgeService.js`）。**每次上线用户可见的新功能或较大改动，必须同步更新知识库**，否则 AI 会答"没有该功能 / 机制"（例：积分系统上线后未同步，AI 答不出"AI 额度"）。

- **检索机制**：关键词二字词打分（非向量），`title` 命中权重高于 `content`，所以标题要含核心词；有 5 分钟内存缓存，写入后需 `pm2 restart app`（或等 5 分钟）才生效。
- **字段**：`title` / `content`（html 或 markdown）/ `category`（帮助中心 · 内部知识 · FAQ · 系统行为）/ `status`（`public` 普通用户可搜、`internal` 仅 root）。
- **写入方式**：root 让 AI 用 `write_knowledge_base` 工具；或写 `.mjs` 脚本 `import { generateUUID }` + INSERT `knowledge_base`（title 已存在则 UPDATE，幂等），放服务器 `node` 跑。
- **配套**：若新功能涉及"可查询的实时数据"（如额度、用量），除知识库说明外，考虑给 Agent 加对应查询工具（见 `util/agent/tools/`，如 `get_ai_quota`）。

## 部署

1. **前端：** 构建后将 `dist/` 上传到服务器（替换旧 `dist`）
2. **后端：** 通过 pm2 启动 `app.js`，配置 `.env` 环境变量
3. 根用户用 `pm2 restart app --update-env` 刷新环境变量

⚠️ **部署禁令：** 改完代码后不 build、不部署、只能建议是否提交，但是不能推送，除非用户明确说"部署"或"上线"。
