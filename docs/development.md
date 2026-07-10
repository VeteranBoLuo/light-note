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

## 代码规范

### 通用原则

1. **同时考虑 PC 和移动端** — 没有"只有桌面端用"的模块
2. **兼容深浅主题** — 颜色使用主题变量，不硬编码
3. **兼容中英文** — 展示文案走 vue-i18n
4. **优先复用** — store、组件、配置、主题变量，不重复造轮子

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 后端 handler | `xxHandle.js` | `bookmarkHandle.js` |
| 后端路由 | `router/xx.js` | `router/common.js` |
| Vue 组件 | PascalCase | `CloudFolder.vue` |
| Pinia store | camelCase | `bookmark.ts` |
| 目录 | kebab-case | `basic-components/` |
| API 路由路径 | kebab-case | `/api/common/getDashboard` |

### 后端规范

**响应格式：**

```javascript
// ✅ 统一使用 resultData
res.send(resultData({ id, name }, 200));
res.send(resultData(null, 401, '请先登录'));

// ❌ 不要手动构造
res.json({ code: 0, data: xxx });
```

**状态码约定：**

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 客户端输入错误 |
| 401 | 未登录 |
| 403 | 无权限 |
| 404 | 不存在 |
| 423 | 账号封禁 |
| 500 | 服务端错误 |

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
  await connection.query('...');  // 必须用 connection.query()
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

| 场景 | 使用 | 不要使用 |
|------|------|---------|
| 表格 | `BTable` | `a-table` |
| 按钮 | `b-button` | 原生 `<button>`、`a-button` |
| 下拉选择 | `BSelect` | 原生 `<select>`、`a-select` |
| 输入框 | `BInput` | 原生 `<input>`、`a-input` |
| 确认弹窗 | `Alert.alert()` | `Modal.confirm` |
| 业务弹窗 | `BModal` | ant-design-vue 的 Modal |
| 气泡卡片 | `BPopover` | `a-popover` |
| 文字提示 | `BTooltip` | `a-tooltip` |

- 存量 Ant Design（`a-*`）逐步替换为自研 B 组件，不新增；确无对应 B 组件才用原生，并注明原因。

**国际化：**

- 所有固定展示文案用 `$t()` 或 vue-i18n 的 `t()`
- 新增 key 需同步更新 `zh-CN.ts` 和 `en-US.ts`

**主题：**

- 基于 `data-theme` 属性切换
- 主题变量定义在 `src/assets/css/theme.less`
- 使用 CSS 变量（`var(--text-color)`）而非写死颜色

**埋点规范：**

| 场景 | 方式 |
|------|------|
| 简单点击（跳转、弹窗、筛选等） | `v-click-log` |
| 操作成功（新增、删除、保存等） | `recordOperation()` |
| 后台管理页面 | 只记录 API 日志，不加埋点 |

**响应式断点：**

- 来源于 `src/store/bookmark.ts`
- 使用 `bookmark.isMobile` / `isTablet` / `isDesktop` / `isMobileDevice`
- 不新增 UA 判断或重复断点

**状态管理：**

- 书签 + 断点 → `src/store/bookmark.ts`
- 用户 → `src/store/useUser.ts`
- 笔记 → `src/store/note.ts`
- 云空间 → `src/store/cloudSpace.ts`

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

### 后端 handler 自检

- [ ] 最外层有 `try/catch`
- [ ] 所有提前响应后都有 `return`
- [ ] 状态码和 `resultData()` 格式正确
- [ ] 多表写入使用事务
- [ ] 用户输入全部参数化
- [ ] 权限判断正确（登录态、角色、用户隔离）
- [ ] INSERT 使用正确的函数（insertData / snakeCaseKeys）

## 部署

1. **前端：** 构建后将 `dist/` 上传到服务器（替换旧 `dist`）
2. **后端：** 通过 pm2 启动 `app.js`，配置 `.env` 环境变量
3. 根用户用 `pm2 restart app --update-env` 刷新环境变量

⚠️ **部署禁令：** 改完代码后不 build、不部署、只能建议是否提交，但是不能推送，除非用户明确说"部署"或"上线"。
