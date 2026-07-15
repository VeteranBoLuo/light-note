# 轻笺设计文档

## 品牌色

轻笺使用 4 种资源语义色，分别对应 4 大功能模块：

| 模块 | 色值 | CSS 变量 | 用途 |
|------|------|---------|------|
| 书签 | `#615ced` | `--resource-bookmark-color` | 书签卡片、图标、强调色 |
| 笔记 | `#00a884` | `--resource-note-color` | 笔记卡片、编辑区辅助色 |
| 文件 | `#ff8a00` | `--resource-file-color` | 文件卡片、上传状态 |
| 标签 | `#ec4899` | `--resource-tag-color` | 标签圆点、标签选择 |

- TS 配置：`src/config/resourceColor.ts`
- CSS 变量：`src/assets/css/theme.less`

官网封面渐变大字使用 4 色渐变过渡。

## 品牌标识

- 主标识名为“笺结”，以抽象纸带的循环、连接和聚合表达个人知识空间。
- 标识中的四向转折是保证小尺寸稳定与视觉平衡的几何骨架，不对应产品模块数量，也不随功能增减而改变。
- 浏览器 favicon 使用透明底彩色标识，外轮廓约占画布 90.6%，以补偿中心负形造成的视觉收缩；Apple Touch 与 PWA 图标使用浅色完整底板并保留系统裁切安全区；单色环境使用同一负形轮廓。
- 标识只使用品牌紫的明度层次，不套用书签、笔记、文件等资源语义色，避免产生功能数量或模块映射。

## 主题系统

### 切换机制

- 通过 `data-theme` 属性挂载在 `<html>` 上实现主题切换
- 切换逻辑在应用层控制，支持亮色/暗色

### 主题变量

主题变量定义在 `src/assets/css/theme.less`，主要分为几类：

**文本色：**

| 变量 | 亮色 | 暗色 | 用途 |
|------|------|------|------|
| `--text-color` | 深灰 | 浅灰 | 正文 |
| `--sub-text-color` | 中灰 | 中灰 | 辅助文字 |
| `--disabled-text-color` | 浅灰 | 深灰 | 禁用态 |

**背景色：**

| 变量 | 亮色 | 暗色 | 用途 |
|------|------|------|------|
| `--background-color` | 白 | 深黑 | 页面背景 |
| `--card-background` | 白 | 深灰 | 卡片、面板背景 |
| `--hover-background` | 浅灰 | 稍亮黑 | hover 态 |

**边框色：**

| 变量 | 用途 |
|------|------|
| `--card-border-color` | 卡片边框、分割线 |

**编写原则：**

- 不在业务组件中硬编码亮色/暗色两套样式
- 颜色、背景、边框、阴影优先使用主题变量
- 新增变量请在 `theme.less` 中统一添加

## 组件体系

### 基础组件（BComponent）

项目维护了一套自研基础组件，前缀为 `B`，位于 `src/components/base/BasicComponents/`：

| 组件 | 作用 | 关键特性 |
|------|------|---------|
| `BTable` | 表格 | 内置分页、排序、自定义列宽 |
| `BModal` | 弹窗 | 支持深浅主题、移动端适配 |
| `BButton` | 按钮 | 支持多种风格 |
| `BSelect` | 下拉选择 | Teleport 到 body，自动翻转方向 |
| `BTooltip` | 工具提示 | Teleport 到 body，自适应方向 |
| `BMessage` | 消息提示 | 全局消息 |
| `BList` | 列表 | 侧边栏 + 筛选 + 分类管理 |

### UI 组件库

**以自研 B 系列组件为主，Ant Design Vue 正在逐步淘汰（不新增 `a-*`，存量改到哪替到哪，最终完全移除）。**
**有 B 组件的场景禁止使用原生 HTML 控件。** 常用映射：

- 表格 `BTable`（禁 `a-table`）
- 按钮 `b-button`（禁原生 `<button>`、`a-button`）
- 下拉选择 `BSelect`（禁原生 `<select>`、`a-select`）
- 输入框 `BInput`（禁原生 `<input>`、`a-input`）
- 确认弹窗 `Alert.alert()`（禁 `Modal.confirm`）
- 业务弹窗 `BModal`（禁 ant-design-vue 的 `Modal`）
- 气泡 `BPopover` / 提示 `BTooltip` / 消息 `BMessage` / 加载 `BLoading`
- 确无对应 B 组件才用原生，并在自检说明里注明原因

### 空状态与加载态

- 列表页、卡片流、搜索结果使用结构化骨架屏（skeleton）
- 禁止仅用纯色块或空白区域占位

## 响应式设计

### 断点体系

断点定义在 `src/store/bookmark.ts`：

| 设备 | 判断 | 使用方式 |
|------|------|---------|
| 手机 | `bookmark.isMobile` | 简化布局、堆叠排列 |
| 平板 | `bookmark.isTablet` | 中等布局 |
| 桌面 | `bookmark.isDesktop` | 完整布局 |

判断依据：通过 `isMobileDevice()` 结合 UA 和窗口宽度检测。

### 布局策略

- 不新增 UA 判断或重复断点
- 移动端和桌面端使用各自的路由映射（`src/App.vue` 中的 `phoneReplaceMap` / `deskReplaceMap`）
- 新增页面入口需同时检查 PC 和移动端路由配置

### 移动端注意

- 弹窗、抽屉、下拉等浮层避免遮挡、滚动穿透
- Flexbox 子项设置 `min-width: 0; overflow: hidden` 防止溢出
- 表格内容可左右滚动

## 国际化

### 策略

- 使用 vue-i18n，固定展示文案必须走 `$t()`
- 同步维护两个语言文件：
  - `src/i18n/locales/zh-CN.ts`
  - `src/i18n/locales/en-US.ts`
- 不扩大硬编码文案范围

### 结构

翻译文件按模块组织：

```typescript
export default {
  common: { ... },       // 通用文案
  bookmark: { ... },     // 书签模块
  note: { ... },         // 笔记模块
  cloud: { ... },        // 云空间
  admin: { ... },        // 后台管理
  auth: { ... },         // 认证
  help: { ... },         // 帮助中心
};
```

## 官网设计

- 深色主题
- 5 页全屏幻灯片滚动
- Canvas 粒子动画背景
- 封面：左右布局（左文字 + 右产品截图轮播）
- 底部药丸指示器切换页面
- 品牌大字使用 4 色渐变

## 资源语义

| 资源类型 | 图标风格 | 颜色代码 |
|---------|---------|---------|
| 书签 | 圆角方形图标 | `#615ced` |
| 笔记 | 文档图标 | `#00a884` |
| 文件 | 文件图标 | `#ff8a00` |
| 标签 | 圆形点 | `#ec4899` |

书签、笔记、文件、标签相关的点、边框、图表线条、卡片强调色必须复用这套配置。
