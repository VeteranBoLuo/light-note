# Light Note AI 开发规则

## 回答规范

- 回答和思考过程必须用中文

## 部署禁令（不可违反）

- 改完代码后**绝对不 build、不部署、不上传服务器**
- 部署必须用户明确说出"部署"、"deploy"、"上线"等词才算指令
- "改好看效果"、"改完看看"、"改成这样"等词**不视为**部署指令
- build 也需要用户明确说"build"、"构建"、"打包"才算
- 即使 deploy.sh 已有确认保护，也不代表可以擅自执行

## 新增/修改文件自检流程

- 每轮新增或修改文件后，必须先确认本轮变更范围：列出新增、修改、删除文件，避免遗漏文件或混入无关改动。
- 必须逐文件通读本轮新增和修改的文件，不能只看 diff；重点检查 import/export、类型、命名、边界分支、错误处理、空值处理、权限判断、状态重置和资源释放。
- 新增文件必须确认已被正确接入：路由、入口、导出、组件引用、接口注册、样式引入、国际化、权限、埋点或菜单配置等不能漏。
- 修改已有文件必须反查调用方和被调用方，确认 props、事件、参数、返回值、接口字段、状态结构没有破坏兼容。
- 删除或移动文件时，必须检查是否仍有引用、路由残留、导出残留、样式残留、配置残留。
- 自检发现问题必须先修复，再进入构建或测试。

## 验证要求

- 前端改动默认至少执行构建或类型检查。
- 后端改动默认至少执行语法检查、相关接口/函数的最小可验证流程，能跑测试时优先跑测试。
- 如果因为环境、依赖、数据库或配置原因无法验证，必须在最终回复中明确说明未验证项和原因。
- 最终回复必须简要列出：改了哪些文件、自检了哪些重点、执行了哪些验证命令、是否仍有风险。

---

# 前端

## 核心原则

- 默认同时考虑 PC 和移动端。
- 默认兼容主题、国际化、现有路由和交互体系。
- 优先复用现有 store、组件、配置和主题变量，不重复造轮子。

## 多端

- 断点来源：`src/store/bookmark.ts`
- 使用 `bookmark.isMobile` / `isTablet` / `isDesktop` / `isMobileDevice`
- 不新增 UA 判断或重复断点。

## 主题与颜色

- 主题基于 `data-theme`，挂载于 `document.documentElement`。
- 主题变量文件：`src/assets/css/theme.less`
- 样式颜色、背景、边框、阴影优先使用主题变量。
- 不在业务组件里硬编码浅色/深色两套样式。

## 资源语义色

- 书签：`#615ced`
- 笔记：`#00a884`
- 文件：`#ff8a00`
- 标签：`#ec4899`
- CSS 变量在 `theme.less`：`--resource-bookmark-color` 等。
- TS 配置在 `src/config/resourceColor.ts`
- 书签、笔记、文件、标签相关的点、边框、图表线条、卡片强调色必须复用这套配置。
- 模块内部二级分类图表可用独立色板，但必须集中放在 `resourceColor.ts`。

## 国际化

- 固定展示文案必须走 `vue-i18n`。
- 同步维护 `zh-CN.ts` 和 `en-US.ts`。
- 不扩大硬编码文案范围。

## 路由与状态

- 多端路由映射在 `src/App.vue`。
- 新入口或页面需检查 `phoneReplaceMap` / `deskReplaceMap`。
- 常用 store：`bookmark.ts`、`useUser.ts`、`note.ts`、`cloudSpace.ts`
- 大模块、大功能不要全部堆在一个组件里；页签、子页面、复杂表格、抽屉/弹窗、业务表单等达到独立职责时应拆分组件，并用路由或清晰状态边界承载页面级状态。
- 多页签模块需每个页签对应独立路由和组件(参照 admin 模块的 children 路由结构和安全中心的重构模式)，父组件做布局+共享抽屉，子组件各自管理数据。共享逻辑抽到模块内 `shared.ts`，跨组件通信用 provide/inject。

## 前端专项自检

- **每轮改动完成后，必须逐文件通读所有新增和修改的文件**，检查：未使用的 import、缺失的模板边界处理（文本溢出截断、空状态、加载态）、硬编码颜色/文案、路由跳转路径是否正确、组件 props/事件是否匹配。
- 前端改动默认检查：PC、移动端、主题、中英文。
- 列表页、卡片流、搜索结果等可感知加载区域，默认使用结构化骨架屏（skeleton）作为加载态；禁止仅用纯色块或空白区域占位。
- 表格默认使用 `BTable`，不要新增 `a-table`，除非现有业务组件无法满足并说明原因。
- 普通业务按钮默认使用 `b-button`，不要直接使用 Ant Design Vue 的按钮。
- 确认类提示默认使用 `Alert.alert({ ... })`，不要新增 `Modal.confirm`；业务弹框默认优先使用项目内 `BModal`。
- 新增组件/页面必须检查是否复用主题变量、响应式断点、i18n、公共 store 和已有组件。
- 新增页面入口必须检查 PC/移动端路由映射、菜单入口、返回路径、空状态、加载态、错误态。
- 新增弹窗、抽屉、下拉、浮层必须检查移动端遮挡、滚动穿透、关闭方式、重复打开状态重置。
- 新增接口调用必须检查 loading、错误提示、权限失败、空数据和重复提交。
- 涉及路由、导航、顶部栏、浮层、搜索、个人中心时，额外检查遮挡、错位、无法点击。
- **改动完成后必须跑一次构建**（`vite build` 或 `vue-tsc`），确认无编译错误。

## 埋点规范

- 项目使用 `v-click-log` 和 `recordOperation` 做操作日志埋点。页面修改、新增入口、新增关键交互时，需要同步检查是否需要埋点。
- 操作日志用于记录"用户完成了什么业务动作"，API 日志用于排查接口请求和成功失败；不要把操作日志写成 API 日志的重复版。
- 后台管理页面只保留 API 日志，不新增 `v-click-log` 或 `recordOperation` 操作日志。
- `v-click-log` 优先用于 template 中的简单点击行为：页面跳转、打开弹窗、查看详情、筛选、切换展示、展开收起等。
- `recordOperation` 用于 JS 中才能确认语义的操作：接口成功后的新增、删除、保存、上传、移动、清空、发布；以及快捷键、右键、拖拽、粘贴、批处理等非普通点击入口。
- 新增、删除、保存、上传、移动、清空、发布等会改数据或可失败的操作，默认在接口返回成功后记录 `xxx成功`，不要只在点击按钮时记录。
- 同一个业务动作不要同时用 `v-click-log` 和 `recordOperation` 重复记录；除非两条日志表达的是不同语义，例如"打开分享弹窗"和"分享文件成功"。
- 只打开确认弹窗或编辑弹窗的点击，不等同于业务完成；删除、保存这类动作应记录确认并成功后的结果。
- 操作文案使用稳定的业务名，必要时带对象名或数量，例如 `删除书签成功【xxx】`、`批量删除文件成功【3个】`。

## 环境

- 推荐 Node：`20.x`

---

# 后端

- 后端路径：`apps/server`
- 数据库连接：`db/index.js`
- 工具函数：`util/common.js`

## 后端修改自检

- 新增或修改 handler 后，必须检查最外层 `try/catch`、所有提前响应后的 `return`、状态码和 `resultData()` 格式。
- 涉及写入多张表时，必须检查是否使用事务，事务内是否全部使用 `connection.query()`，并在 `finally` 中释放连接。
- 涉及用户输入时，必须检查 SQL 是否全部参数化，动态列名/表名/排序字段是否白名单校验。
- 涉及权限、用户数据、后台管理接口时，必须检查登录态、角色判断、用户隔离条件和越权访问。
- 新增 INSERT 时，必须确认有 `id` 列的表使用 `insertData()` 或 `generateUUID()`，不能用 `snakeCaseKeys()` 直接插入。
- 涉及标签、资源关系、日志、分页、批量操作时，必须对照本文件对应专项规范复核。

## INSERT 规范（UUID 生成）

- 所有带 `id` 列的表（`user`、`bookmark`、`tag`、`note`、`note_tags`、`api_logs`、`operation_logs`、`opinion`、`help_config`、`help_config_draft`），INSERT 时**必须**使用 `insertData()` 而不是 `snakeCaseKeys()`。
- `insertData()` 会自动注入时间戳 UUID v1（格式与 MySQL `UUID()` 一致，InnoDB 友好），再转 snake_case。
- 关系表（`tag_bookmark_relations`、`tag_relations`、`note_tag_relations`、`resource_tag_relations`）没有 `id` 列，用 `snakeCaseKeys()` 即可。
- 获取新记录的 ID 时，直接取 `insertData()` 返回值的 `.id`，**不要**用 `SELECT id FROM t ORDER BY create_time DESC LIMIT 1`。
- 不需要改 `files`、`folders` 表，它们使用数据库自增主键。

```javascript
import { insertData, snakeCaseKeys, generateUUID } from '../util/common.js';

// ✅ 正确：有 id 列的表用 insertData
const data = insertData({ name: 'xxx', userId });
await pool.query('INSERT INTO tag SET ?', [data]);
const tagId = data.id; // 直接拿到 UUID

// ✅ 正确：显式指定 id 的 INSERT，用 generateUUID
const helpId = generateUUID();
await pool.query('INSERT INTO help_config (id,title,content,sort) VALUES (?,?,?,?)', [helpId, title, content, sort]);

// ✅ 正确：关系表用 snakeCaseKeys
await pool.query('INSERT INTO tag_bookmark_relations SET ?', [snakeCaseKeys({ tag_id, bookmark_id })]);

// ❌ 错误：有 id 列的表用 snakeCaseKeys（id 为空，插入失败）
await pool.query('INSERT INTO tag SET ?', [snakeCaseKeys(params)]);

// ❌ 错误：用 ORDER BY create_time DESC LIMIT 1 获取 ID（并发不安全）
```

## 事务

- 修改多张表的操作**必须**放在事务里。
- 标准模式：`getConnection` → `beginTransaction` → 业务查询 → `commit` / `rollback` → `finally release`。
- 事务内**必须用 `connection.query()`**，不能用 `pool.query()`（会脱离事务）。
- 纯读查询不需要 `getConnection`，直接用 `pool.query()`。

```javascript
// ✅ 正确
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  await connection.query('INSERT INTO tag SET ?', [tagData]);
  await connection.query('INSERT INTO tag_bookmark_relations SET ?', [relData]);
  await connection.commit();
  res.send(resultData(null));
} catch (e) {
  await connection.rollback();
  res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
} finally {
  connection.release();
}

// ❌ 错误：事务内用了 pool.query
await connection.beginTransaction();
await pool.query('INSERT INTO tag SET ?', [data]); // 不在事务里！

// ❌ 错误：纯读查询用了 getConnection（浪费连接）
const conn = await pool.getConnection();
const [rows] = await conn.query('SELECT * FROM tag WHERE user_id = ?', [userId]);
conn.release();
```

## 响应格式

- 统一用 `resultData(data, status, msg)`。
- 状态码约定：`200` 成功、`400` 客户端输入错误、`401` 未登录、`403` 无权限、`404` 不存在、`423` 账号封禁、`500` 服务端错误。
- 每个 handler 最外层必须 `try/catch`，catch 中返回 `resultData(null, 500, ...)`。
- `resultData` 会自动 camelCase 转换 key，非 200 响应会自动记录错误日志。

```javascript
// ✅ 正确
res.send(resultData({ id, name }, 200));
res.send(resultData(null, 400, '标签名称不能为空'));
res.send(resultData(null, 401, '请先登录'));
res.send(resultData(null, 403, '无权限操作'));

// ❌ 错误：不用 res.json 或手动构造响应
res.json({ code: 0, data: xxx });
```

## 权限检查

- 权限检查写在各 handler 内部，用 `req.user?.role`。
- Root 操作用已有的 `ensureRootRole(req, res)`（在 `commonHandle.js` 和 `securityHandle.js` 中各有一份，功能相同）。
- **不要**用 `requireRole()`（`util/auth.js` 导出了但没有任何地方用）。
- **不要**新增权限中间件，保持 inline 检查风格。

```javascript
// ✅ 正确
const userId = await ensureRootRole(req, res);
if (!userId) return; // ensureRootRole 内部已发送 403

// ✅ 正确：非 root 的简单检查
if (!req.user?.id || req.user?.role === 'visitor') {
  return res.send(resultData(null, 401, '请先登录'));
}

// ❌ 错误
import { requireRole } from '../util/auth.js';
app.use('/api/admin', requireRole('root')); // 不要用这套
```

## 分页

- 使用 `validateQueryParams(req.body)` 提取 `{ filters, pageSize, currentPage, order }`。
- `offset = pageSize * (currentPage - 1)`。
- 并行执行数据查询和 count 查询。
- `pageSize = -1` 表示不分页（去掉 LIMIT）。

```javascript
// ✅ 正确
const { filters, pageSize, currentPage } = validateQueryParams(req.body);
const offset = pageSize * (currentPage - 1);
const [rows] = await pool.query(`SELECT * FROM bookmark WHERE user_id = ? LIMIT ? OFFSET ?`, [
  userId,
  pageSize,
  offset,
]);
const [countRes] = await pool.query(`SELECT COUNT(*) as total FROM bookmark WHERE user_id = ?`, [userId]);
res.send(resultData({ items: rows, total: countRes[0].total }));
```

## 资源标签关联

- 书签、笔记、文件关联标签时**必须同时写入两套关联表**：
  - 统一表 `resource_tag_relations`（通过 `insertResourceTagRelations` / `replaceResourceTagRelations`）
  - 书签遗留表 `tag_bookmark_relations`（通过 `insertBookmarkLegacyRelations` / `replaceBookmarkLegacyRelations`）
- 新增资源标签关联入口时，参照 `bookmarkHandle.js` 的 `addBookmark` / `addTag` 方法，**两套函数都要调用**。

```javascript
import { insertResourceTagRelations, insertBookmarkLegacyRelations } from '../util/resourceTags.js';

// ✅ 正确：两套都要写
await insertResourceTagRelations(connection, { tagIds, resourceType: 'bookmark', resourceId, userId });
await insertBookmarkLegacyRelations(connection, { tagIds, bookmarkId: resourceId, userId });
```

## Agent LLM 供应商（DeepSeek 主 / 千问备用）

- 轻笺智域（`/api/chat/agent`，`agentHandle.js` + `util/agent/deepseekClient.js`）**主力供应商是 DeepSeek**，千问（qwen3.5-flash）只是应急备用，由 `AGENT_LLM_PROVIDER` 环境变量选择（`deepseek` 默认 / `qwen`）。
- **不要**把默认值改成 `qwen`，不要删掉 `deepseek` 分支，不要在代码里硬编码切到千问——这是给人在 DeepSeek 出故障时手动切换用的应急开关，不是常态。
- 供应商配置集中在 `deepseekClient.js` 的 `PROVIDERS` 表（baseUrl / 密钥环境变量 / 默认模型 / 单价 / `extraBody`），新增字段时两边都要补，不要只改一边导致行为不对称。
- 千问那边**必须**保留 `extraBody: { enable_thinking: false }`：`qwen3.5-flash` 默认开深度思考，实测一句简单问答就产生 97% 是思考 token，又慢又贵，直接违背备用模型"优先保证速度"的定位。以后换/加千问系列模型，先实测默认是否开思考，不要假设关闭。
- 千问复用项目已有的 `DASHSCOPE_API_KEY`（`chatHandle.js` 的 App Completion 接口也用它），**不要**为它单独申请/新增一个 key。
- 两家单价不同，`agentHandle.js` 的 `logAgentRequest` 必须按 `getActiveProviderPricing()` 取当前生效供应商的价格算成本，不要写死某一家的单价。
- 切换只需要改 `.env` 的 `AGENT_LLM_PROVIDER` + `pm2 restart app --update-env`，**不要**做成代码里自动检测故障并切换——低频问题，自动判断容易误判，还可能在用户不知情时在备用账号上产生费用。

```javascript
// ✅ 正确：新增/修改 provider 配置
const PROVIDERS = {
  deepseek: { baseUrl, apiKeyEnv: 'DEEPSEEK_API_KEY', modelEnv: 'DEEPSEEK_MODEL', defaultModel, price },
  qwen: { baseUrl, apiKeyEnv: 'DASHSCOPE_API_KEY', modelEnv: 'QWEN_MODEL', defaultModel: 'qwen3.5-flash', price, extraBody: { enable_thinking: false } },
};

// ❌ 错误：改默认值、丢 enable_thinking、写死价格
const name = process.env.AGENT_LLM_PROVIDER || 'qwen'; // 默认不能是 qwen
const cost = (promptTokens / 1e6) * 1 + (completionTokens / 1e6) * 2; // 没按供应商区分单价
```

## SQL 安全

- **所有**用户输入必须通过参数化占位符 `?` 传入，永远不要字符串拼接。
- 动态 `IN (...)` 子句时，用 `map(() => '?').join(',')` 生成占位符。
- 需要动态表名/列名/排序字段时必须白名单校验。

```javascript
// ✅ 正确
const [rows] = await pool.query('SELECT * FROM tag WHERE user_id = ? AND name LIKE ?', [userId, `%${keyword}%`]);

// ✅ 正确：动态 IN
const placeholders = ids.map(() => '?').join(',');
const [rows] = await pool.query(`SELECT * FROM tag WHERE id IN (${placeholders})`, ids);

// ❌ 错误
const [rows] = await pool.query(`SELECT * FROM tag WHERE name = '${name}'`); // SQL 注入！
```

## 常见错误

- **事务内用 `pool.query` 而不是 `connection.query`**：查询脱离事务，回滚无效。
- **纯读查询用 `getConnection`**：浪费连接池，直接用 `pool.query()`。
- **忘记 `ORDER BY create_time DESC LIMIT 1` 获取新 ID**：改用 `insertData()` 直接拿 `.id`。
- **`connection.release()` 写在 try 里而不是 finally**：异常时连接泄漏。
- **`res.send` 后没有 `return`**：代码继续执行，可能导致重复响应。
