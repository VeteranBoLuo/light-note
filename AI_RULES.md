# Light Note AI 开发规则

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

## 修改自检

- 前端改动默认检查：PC、移动端、主题、中英文。
- 涉及路由、导航、顶部栏、浮层、搜索、个人中心时，额外检查遮挡、错位、无法点击。

## 环境

- 推荐 Node：`20.x`

## 埋点规范

- 项目使用v-click-log 和 recordOperation 来埋点，页面修改和新增功能时，需要加上埋点
- v-click-log 主要用于 templete 模板里，recordOperation只有非点击态才使用，一般是记录状态之类的，比如操作成功这种，这样会更干净，也更好维护。
- 同一个动作不要两边都记”，否则日志会重复
