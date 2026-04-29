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

- 项目使用 `v-click-log` 和 `recordOperation` 做操作日志埋点。页面修改、新增入口、新增关键交互时，需要同步检查是否需要埋点。
- 操作日志用于记录“用户完成了什么业务动作”，API 日志用于排查接口请求和成功失败；不要把操作日志写成 API 日志的重复版。
- 后台管理页面只保留 API 日志，不新增 `v-click-log` 或 `recordOperation` 操作日志。
- `v-click-log` 优先用于 template 中的简单点击行为：页面跳转、打开弹窗、查看详情、筛选、切换展示、展开收起等。
- `recordOperation` 用于 JS 中才能确认语义的操作：接口成功后的新增、删除、保存、上传、移动、清空、发布；以及快捷键、右键、拖拽、粘贴、批处理等非普通点击入口。
- 新增、删除、保存、上传、移动、清空、发布等会改数据或可失败的操作，默认在接口返回成功后记录 `xxx成功`，不要只在点击按钮时记录。
- 同一个业务动作不要同时用 `v-click-log` 和 `recordOperation` 重复记录；除非两条日志表达的是不同语义，例如“打开分享弹窗”和“分享文件成功”。
- 只打开确认弹窗或编辑弹窗的点击，不等同于业务完成；删除、保存这类动作应记录确认并成功后的结果。
- 操作文案使用稳定的业务名，必要时带对象名或数量，例如 `删除书签成功【xxx】`、`批量删除文件成功【3个】`。
