# 轻笺 LightNote Backend

> 轻笺后端服务——为标签化知识管理提供 API 支撑。

基于 Node.js + Express + MySQL 构建，为前端提供书签、笔记、云空间、AI 助手、标签图谱、后台管理等功能接口。

---

## 技术栈

| 层级 | 技术选型 |
|------|----------|
| 运行时 | Node.js |
| 框架 | Express |
| 数据库 | MySQL |
| 连接池 | mysql2 |
| 实时通信 | WebSocket |

---

## 功能接口

### 书签
- 书签 CRUD · 书签搜索（标题/URL/描述/标签联合检索）
- 书签移动/复制 · 批量删除
- 自动抓取网页图标与描述

### 笔记
- 笔记 CRUD · 富文本内容存储
- 笔记搜索 · 批量删除
- PDF 导出接口

### 标签
- 标签 CRUD · 标签树结构维护
- 标签关系图谱数据
- 标签合并/拆分
- 统一标签体系：一个标签同时关联书签、笔记、文件

### 云空间
- 文件上传/下载/删除
- 文件夹管理 · 文件移动
- 文件预览支持（图片/PDF/音视频/Office）
- 存储配额管理（默认 1GB）
- 外部分享链接生成与下载

### AI 助手
- AI 对话接口 · 流式响应
- 翻译能力
- 知识问答

### 后台管理（Root 角色）
- 用户管理 · 账号封禁
- API 日志 / 操作日志审计
- 用户反馈处理
- 图片存储管理
- 帮助文档管理（含草稿发布）
- SQL 控制台

### 基础能力
- 用户注册/登录 · GitHub OAuth 回调
- Token 鉴权 · 角色权限控制（user / visitor / root）
- 操作埋点与日志记录
- 国际化文案接口
- WebSocket 实时通知

---

## 快速开始

### 前置要求

- Node.js 20.x
- MySQL 8.0+

### 安装

```bash
git clone https://github.com/VeteranBoLuo/light-note-back
cd light-note-back

# 导入数据库
mysql -u root -p < init.sql

# 安装依赖
npm install

# 配置数据库连接（编辑 app.js 中的 pool 配置）
# host / port / user / password / database

# 启动服务
node app.js
```

---

## API 规范

- **响应格式**：统一 `{ code, data, msg }`
- **认证方式**：Bearer Token（`Authorization` 请求头）
- **状态码**：200 成功 · 400 参数错误 · 401 未登录 · 403 无权限 · 404 不存在 · 500 服务端错误
- **命名风格**：请求使用 camelCase，服务端自动转换 snake_case

---

## 项目结构

```
├── app.js              # 入口文件
├── db/index.js         # 数据库连接池
├── util/
│   ├── common.js       # 工具函数（insertData / snakeCaseKeys / generateUUID 等）
│   ├── auth.js         # 认证中间件
│   ├── resourceTags.js # 资源标签关联工具
│   └── ...
├── api/                # 路由与处理器
│   ├── bookmarkHandle.js
│   ├── noteHandle.js
│   ├── tagHandle.js
│   ├── fileHandle.js
│   ├── aiHandle.js
│   ├── admin/          # 后台管理接口
│   └── ...
└── websocket/          # WebSocket 服务
```

---

## 相关项目

- [轻笺前端](https://github.com/VeteranBoLuo/light-note)——Vue 3 + TypeScript 前端
- [轻笺后端](https://github.com/VeteranBoLuo/light-note-back)——本仓库

---

## License

MIT
