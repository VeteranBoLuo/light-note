# 轻笺项目 Copilot 指令

## 项目概述

轻笺是一个基于 Vue 3 + TypeScript + Vite 的前端应用，用于云端书签和笔记管理。核心功能包括智能标签系统、书签/笔记搜索、云空间文件上传和多端适配。后端使用 Node.js + Express + MySQL，API 通过 `/api` 代理调用。

## 架构

- **组件结构**：`src/components/base/` 存放共享基础组件（如 `SvgIcon`、`BButton`），`src/view/` 存放页面级组件（如 `noteLibrary/NoteLibrary.vue`）。
- **状态管理**：使用 Pinia，示例：`const bookmark = bookmarkStore(); bookmark.isMobileDevice` 检查设备类型。
- **路由**：Vue Router，导航示例：`router.push('/noteLibrary?tag=前端')`。
- **国际化**：Vue i18n，模板中使用 `$t('note.title')`，本地化文件在 `src/i18n/locales/`。
- **API 调用**：统一使用 `apiBasePost('/api/note/queryNoteList')` 从 `src/http/request.ts`，返回数据结构如笔记列表。
- **数据流**：用户操作触发 store 更新（如 `user.preferences.noteViewMode`），组件通过 computed 响应式过滤数据（如 `viewNoteList`）。

## 关键工作流

- **开发启动**：`pnpm dev`（代理 API 到本地后端 `http://127.0.0.1:9001`）。
- **构建**：`npm run build`（先 TypeScript 检查，再 Vite 打包到 `dist/`）。
- **调试**：使用浏览器开发者工具检查 Vue DevTools 中的 Pinia store 状态；移动端调试通过 `bookmark.isMobileDevice` 条件渲染。
- **依赖管理**：使用 pnpm，lockfile 为 `pnpm-lock.yaml`；自动导入通过 Vite 插件配置（`unplugin-vue-components`）。

## Copilot 行为

- 每次回答后，不自动启动项目或构建项目。

## 代码约定

- **导入路径**：使用 `@/` 别名指向 `src/`，如 `import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue'`。
- **响应式数据**：优先使用 `ref()` 和 `computed()`，示例：`const searchValue = ref(''); const viewNoteList = computed(() => { /* 过滤逻辑 */ })`。
- **事件处理**：添加操作日志，如 `v-click-log="OPERATION_LOG_MAP.noteLibrary.addNote"`。
- **标签处理**：笔记标签存储为 JSON 字符串，解析示例：`JSON.parse(note.tags)?.includes(tag)`。
- **拖拽排序**：使用 `VueDraggable`，结束时调用 API 更新顺序，如 `apiBasePost('/api/note/updateNoteSort', { notes: sortedTags })`。
- **搜索**：防抖实现，`watch(searchValue, (val) => { setTimeout(() => debouncedSearch.value = val, 200) })`。
- **样式**：使用 Less，主题变量如 `var(--primary-color)`；移动端样式通过 `v-if="bookmark.isMobileDevice"` 切换。

## 通信模式

- **跨组件**：通过 Pinia store 共享状态，如 `useUserStore().noteTotal`。
- **外部依赖**：Ant Design Vue for UI，axios for HTTP，vue-draggable-plus for 拖拽。
- **文件上传**：云空间组件处理多文件上传，显示容量 `已用 45 / 100MB`。
