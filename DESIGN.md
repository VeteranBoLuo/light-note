# 轻笺设计规范

> 项目视觉设计体系文档。新页面/组件开发时查这里，保持全站视觉一致。

---

## 1. 品牌色板

| 用途 | 色值 | CSS 变量 | 使用场景 |
|------|------|----------|----------|
| 品牌主色 | `#615ced` | `--resource-bookmark-color` | 主题强调、按钮主色、选中态、hover 边框 |
| 笔记色 | `#00a884` | `--resource-note-color` | 笔记模块强调色、图标 |
| 文件色 | `#ff8a00` | `--resource-file-color` | 云空间模块强调色、图标 |
| 标签色 | `#ec4899` | `--resource-tag-color` | 标签网络强调色、图标 |

**规则：**
- 按钮、checkbox、radio 选中态、链接 hover 统一用品牌主色 `#615ced`
- 四个资源色各自绑定对应模块，不可混用
- 图标/点/边框/卡片强调色必须复用这套色板

---

## 2. 主题系统

支持亮色（day）和暗色（night）两套主题，通过 `data-theme` 属性切换，挂载于 `document.documentElement`。

### 2.1 核心变量

所有主题变量定义在 `src/assets/css/theme.less`，按用途分组：

**基础层：**
- `--background-color`：页面主背景
- `--text-color`：主文字色
- `--desc-color`：辅助/描述文字
- `--icon-color`：图标默认色
- `--card-border-color`：卡片边框
- `--scrollbar-color`：滚动条颜色

**输入控件层：**
- `--bl-input-border-h-color`：输入框边框 hover
- `--bl-input-noBorder-bg-color`：无边框输入框背景
- `--modal-input-bg`：弹框输入框背景
- `--common-tag-bg-color`：标签背景
- `--ant-select-dropdown-bg-color`：下拉框背景

**交互层：**
- `--btn-h-bg-color`：按钮/可点击项 hover 背景
- `--menu-item-h-bg-color`：菜单项 hover 背景
- `--noteType-hover-color`：笔记类型 hover 色（`#605ce5`，略暗于品牌色）
- `--primary-btn-bg-color`：次要按钮背景
- `--primary-btn-h-bg-color`：次要按钮 hover

**表格层：**
- `--table-header-bg-color`：表头背景（day: `#f4f4f5`, night: `#27272a`）
- `--ant-table-boxShadow`：表格阴影

### 2.2 亮色主题（`[data-theme='day']`）

- 主背景：`#ffffff`
- 背景渐变：`linear-gradient(150deg, #ffffff → #ffecf9)`（右下角微粉）
- 文字：`#161824`（深蓝黑）
- 描述文字：`rgb(113, 113, 122)`
- 标签背景：`#f0f0f0`
- 下拉框背景：`#ffffff`

### 2.3 暗色主题（`[data-theme='night']`）

- 主背景：`#222222`
- 文字：`#ffffff`
- 描述文字：`rgb(161, 161, 170)`
- 标签背景：`#333333`
- 下拉框背景：`#27272a`
- 输入框背景：`#303033`

---

## 3. 响应式断点

定义在 `src/store/bookmark.ts` 的 `VIEWPORT_BREAKPOINTS`：

| 断点 | 宽度 | 类型 | 说明 |
|------|------|------|------|
| mobile | `< 768px` | `isMobile` | 手机竖屏 |
| tablet | `768px ~ 1199px` | `isTablet` | 平板/折叠屏 |
| desktop | `≥ 1200px` | `isDesktop` | 桌面/笔记本 |

**JS 判断（Pinia store）：**
```ts
bookmark.isMobile        // < 768px
bookmark.isTablet        // 768-1199px
bookmark.isDesktop       // ≥ 1200px
bookmark.isMobileDevice  // isMobile || isTablet（统称窄屏）
bookmark.isTouchDevice   // pointer: coarse（触摸为主）
```

**CSS 媒体查询：**
```less
/* 移动端（窄屏，含平板） */
@media (max-width: 1024px) { }

/* 桌面端 */
@media (min-width: 1025px) { }
```

> 注意：CSS 媒体查询以 **1024px** 为界（响应式卡片/表格切换），JS 断点以 **768px/1200px** 为界（布局类型判断），两者不冲突——CSS 管展示形态，JS 管路由/组件条件。

---

## 4. 字体

**全局字体栈（`common.less`）：**
- 正文：`'微软雅黑', sans-serif`
- 代码：`'Fira Code', 'Courier New', Courier, monospace`（代码块和行内 code）

**字号层级（`common.less` + 组件内）：**

| 层级 | 字号 | 行高 | 使用场景 |
|------|------|------|----------|
| Logo | `3.2em` | `1.1` | 品牌标题 |
| 页面标题 | `24px` | — | 页面 header |
| 副标题 | `20px` | `1.2` | 区块标题 |
| 正文 | `13px` | — | 一般内容 |
| 辅助文字 | `12px` | — | 描述、标签、表格单元格 |

---

## 5. 间距体系

**页面常规间距：**
- 页面容器 padding：`20px`（PC）/ `16px`（移动端）
- 卡片内边距：`12px`
- 表头 padding：`0 20px 14px 20px`
- 移动端底部安全区：`20px`

**布局间距：**
- 组件间距（gap）：`8px`（工具栏）/ `16px`（区块间）
- 搜索框高度：`28px`（b-input 用 `height` prop）
- 导航栏高度：`60px`

---

## 6. 圆角 & 阴影

**圆角：**
- 按钮/小控件：`4px`
- 分页器、下拉框：`6px`
- 卡片、弹框：`8px`

**阴影（表格）：**
- 亮色：`0 0 5px 0 rgba(0,0,0,0.02), 0 2px 10px 0 rgba(0,0,0,0.06), 0 0 1px 0 rgba(0,0,0,0.3)`
- 暗色：`0 0 5px 0 #444, 0 2px 10px 0 #444, 0 0 1px 0 #444`

---

## 7. 组件视觉规范

### 7.1 BTable

- 表头背景：`var(--table-header-bg-color)`
- 列宽用 CSS 字符串（`'1fr'` / `'80px'` / `'200px'`），非数字
- 操作列固定 `'120px'`，保持按钮对齐
- 移动端默认列表：精简到 2-3 列（80px + 1fr + 1fr），详情走 BModal
- 分页含：每页条数下拉（10/20/50/100）、页码按钮（« ‹ ··· › »）、总数
- `.table-body` 使用 `max-height: calc(100% - 100px)` + `overflow-y: auto` 实现内部滚动

### 7.2 BModal

- 宽度：详情弹框 `500-600px`，编辑器 `90%`
- 居中：`top: 50%; left: 50%; translate(-50%, -50%)`
- 遮罩关闭：`mask-closable="true"`
- 默认不显示 footer（`:show-footer="false"`）
- 关闭勿泄漏 keydown 事件监听器

### 7.3 BPagination

- 当前页：品牌色 `#615ced` 高亮
- 每页条数下拉 Teleport 到 body，`fixed` 定位防裁剪
- 自动判断上下方向（下方不足 140px 且上方够则向上弹出）
- hover/展开时边框变 `#615ced`
- 下拉背景：`var(--ant-select-dropdown-bg-color)`

### 7.4 BTooltip

- Teleport to body 防容器 overflow 裁剪
- 自动判断上下方向
- 支持深浅主题

### 7.5 b-input

- 通过 `height` prop 控制高度（默认 32px），**不支持** `size="small"`
- 搜索图标用 `.suffix-icon` + `place-items: center` 居中
- 常用高度：`28px`（搜索栏）、`32px`（默认）

### 7.6 b-button

- 普通业务按钮优先使用 `b-button`，不用 Ant Design Vue `<a-button>`

### 7.7 BTable 行详情

- 统一用**点击行弹出 BModal**，不用行展开（expandedRows）
- `BTable` 设 `:row-clickable="true"` + `@row-click`，`BModal` 展示详情

---

## 8. 资源语义色对照

定义在 `src/config/resourceColor.ts`：

```ts
bookmark: '#615ced'  // 紫蓝色 — 书签
note:     '#00a884'  // 翠绿 — 笔记
file:     '#ff8a00'  // 橙色 — 云空间文件
tag:      '#ec4899'  // 粉色 — 标签网络
```

CSS 变量（两套主题共享，不随 theme 变化）：
```less
--resource-bookmark-color: #615ced;
--resource-note-color: #00a884;
--resource-file-color: #ff8a00;
--resource-tag-color: #ec4899;
```

文件类型色（`FILE_TYPE_COLOR_HEX`）：
- image `#ff8a00` / video `#615ced` / audio `#00a884`
- pdf `#ef4444` / word `#3b82f6` / excel `#22c55e`
- ppt `#f97316` / text `#eab308` / compress `#8b5cf6` / other `#8c8f99`

---

## 9. 工作台（Workbench）视觉

工作台面板有独立的视觉系统（见 `theme.less` `--workbench-*` 变量族），包括：
- 渐变表面：`--workbench-surface-start` → `--workbench-surface-end`
- 子卡片：半透明磨砂玻璃效果（`rgba(255,255,255,0.72)`）
- 图表色：`--workbench-chart-{bookmark,note,file,tag}-color`
- 卡片色环：`--workbench-accent-ring-alpha: 18%`
- 活动色：`#5d77ff`（亮色）/ `#7f95ff`（暗色）
- 快速操作色：`#875fff`（亮色）/ `#ad88ff`（暗色）
- 日志色：`#2bb4a5`（亮色）/ `#48c8ba`（暗色）

---

## 10. 移动端设计规则

### 10.1 表格高度

```less
// 页面 wrapper 用 position:fixed 绕过 height:100% 传播链
.page-body {
  position: fixed;
  top: 60px;        // 导航栏
  left: 20px;       // 容器 padding
  right: 20px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-card { flex: 1; min-height: 0; }
:deep(.table-container) { flex: 1; min-height: 0; }
```

### 10.2 列宽约定

- 短内容（等级/分数/状态标签）：`80px`
- 长内容（IP/规则名/账号）：`1fr`
- 时间列：`1fr`

### 10.3 操作按钮

移动端表格操作按钮默认 `opacity: 0`（PC hover 显示），移动端**必须**强制 `opacity: 1 !important`。

---

## 11. 表单与确认

- 确认提示：统一用 `Alert.alert({ ... })`（项目封装），不用 `Modal.confirm`
- 表单提交错误：axios interceptor 统一 `handleErrorResponse` 弹 toast，无需各自 `message.error`
- 成功提示：自建 DOM toast（`document.createElement('div')` + fixed 居中，1.8s 后消失），不依赖 antd message 容器

---

## 12. 注意事项（踩过的坑）

- CSS 变量名必须用 `theme.less` 中实际定义的，猜的变量名（如 `--card-color`、`--tag-bg-color`）会解析为 transparent
- BTable 列宽必须是 CSS 字符串（`'200px'`），不要传数字（`200`）
- 移动端 hover 样式（opacity、颜色变化）必须加 `!important` 覆盖
- 父容器 `overflow: hidden` 会裁掉 `position: absolute` 的子元素
- Teleport 到 body 的下拉/弹框，CSS 变量在 body 上下文中仍可用
- 输入框用 `height` prop 控制高度，不用 `size="small"`
