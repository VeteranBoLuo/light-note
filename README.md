# 轻笺 🌊

![top-language](https://img.shields.io/github/languages/top/VeteranBoLuo/light-note) [![Website](https://img.shields.io/website?up_message=online&url=https%3A%2F%2Fboluo66.top)](https://boluo66.top) ![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/VeteranBoLuo/light-note) ![GitHub last commit](https://img.shields.io/github/last-commit/VeteranBoLuo/light-note)

> **以智能标签为中枢的知识连接工具**
>
> 轻笺（light-note）是一个围绕“标签网络”构建的云端效率系统，核心覆盖：**书签归档、笔记沉淀、云空间协同**。目标是把网址、笔记、文件统一组织在同一套标签语义下，实现跨设备检索与联动管理。

🌐 **在线体验**：[https://boluo66.top/](https://boluo66.top/) 📱 **多端适配**：桌面端 + 移动端

## 📑 目录

- [🧭 产品定位](#-产品定位)
- [🛠 技术栈](#-技术栈)
- [⚡ 当前功能](#-当前功能)
- [🚀 快速开始](#-快速开始)
- [✨ 下一步规划](#-下一步规划)
- [📢 更新日志](#-更新日志)
- [⭐ Stargazers](#-stargazers)

## 🧭 产品定位

轻笺不是“只收藏网址”的工具，而是书签 × 笔记 × 文件三位一体的知识管理系统：

- **统一标签体系**：同一标签可以关联多个书签、笔记与文件资源
- **统一检索入口**：按标题/链接/标签/关键词进行多维查找
- **统一组织方式**：支持拖拽排序、批量处理、权限隔离与跨端访问

## 🛠 技术栈

| 层级    | 技术选型                                       |
| ------- | ---------------------------------------------- |
| 前端    | Vue 3 + TypeScript + Vite + Pinia + Vue Router |
| UI/编辑 | Ant Design Vue + TinyMCE + Viewer.js           |
| 后端    | Node.js + Express + MySQL2 + Nginx（部署）     |
| 其他    | Axios / WebSocket / GitHub Actions             |

> Node 版本建议：`20.x`

## ⚡ 当前功能

### 1) 书签模块（核心）

- 智能标签关联：一个书签可绑定多个标签
- 标签树与书签卡片支持拖拽排序
- 支持按书签标题、URL、标签进行搜索
- 右键快捷操作：编辑、删除、复制链接等
- 首页右上角集成搜索入口，符合常见使用习惯

### 2) 笔记模块（知识沉淀）

- 富文本编辑（标题、段落、图片、列表、表格等）
- 支持标签筛选与关键词搜索
- 笔记卡片/列表双视图（桌面端）
- 支持目录（TOC）、批量删除、拖拽排序
- 支持导出 PDF，便于归档与分享

### 3) 云空间模块（个人文件中心）

- 默认配额：**1000MB**（已按当前实现统一）
- 支持多类型文件上传与管理（图片/视频/PDF/Word/Excel/音频等）
- 文件夹管理 + 文件移动 + 拖拽排序
- 类型/文件夹双维度过滤与搜索
- 文件预览已支持：图片、PDF、音视频，Office 文件支持在线预览链路
- 严格权限隔离：用户仅可访问自己的资源

### 4) 配套能力

- 登录注册、GitHub OAuth 回调、个人中心、帮助文档、更新日志
- 管理页支持标签与书签的编辑管理
- 已预留工作台/AI 助手相关能力入口（按路由与角色策略逐步开放）

## 🚀 快速开始

### 前端

```bash
# 克隆项目
git clone https://github.com/VeteranBoLuo/light-note
cd light-note

# 安装依赖（任选其一）
pnpm install
# 或
npm install

# 本地开发
pnpm dev
# 或
npm run dev

# 生产构建
pnpm build
# 或
npm run build
```

默认访问地址：`http://localhost:5173`

### 后端（按需）

```bash
git clone https://github.com/VeteranBoLuo/BMS_Back
```

- 将后端仓库中的 SQL 初始化文件导入 MySQL
- 按后端项目说明配置数据库连接（账号/密码/库名）
- 启动后端服务后，再启动当前前端项目

后端仓库地址：<https://github.com/VeteranBoLuo/BMS_Back>

## ✨ 下一步规划

- 标签驱动的跨模块推荐（书签 ↔ 笔记 ↔ 文件）
- 知识卡片化（链接与笔记联动沉淀）
- AI 辅助归档与标签建议
- 工作台能力逐步开放（统计看板与效率入口）

## 📢 更新日志

[查看更新日志](https://boluo66.top/#/updateLogs)

## ⭐ Stargazers

感谢每一位关注和支持轻笺的朋友。

[![Stargazers for light-note](https://reporoster.com/stars/VeteranBoLuo/light-note)](https://github.com/VeteranBoLuo/light-note/stargazers)
