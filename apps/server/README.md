# 轻笺 LightNote Backend

> 轻笺后端服务——为标签化知识管理提供 API 支撑。

基于 Node.js + Express + MySQL 构建，为前端提供书签、笔记、云空间、模块化 AI Skills、标签图谱、后台管理等功能接口。

所属 monorepo：[VeteranBoLuo/light-note](https://github.com/VeteranBoLuo/light-note)

---

## 技术栈

| 层级     | 技术选型  |
| -------- | --------- |
| 运行时   | Node.js   |
| 框架     | Express   |
| 数据库   | MySQL     |
| 连接池   | mysql2    |
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
- 文件预览支持（图片/PDF/音视频/新版 Office、旧版 Office 转 PDF）
- 压缩包目录在线查看（ZIP/RAR/7Z/TAR 与 GZ/BZ2/XZ 系列，只列目录、不解压）
- 存储配额管理（Lv.1 为 1GB，随等级增长至 20GB，并可永久扩容；正常文件与回收站共享容量）
- 外部分享链接生成与下载

### 模块化 AI Skills

- 在笔记、书签、文件、待办、资源检索和帮助中心内提供范围明确的 AI 能力
- 页面选择 Skill，服务端按 owner 重读资源，模型不再猜测业务模块和材料范围
- 写操作只返回结构化预览，确认后复用既有业务 Service 写入
- 所有真实 Provider 调用统一进入 AI Execution、Provider Span 和额度结算
- 待办时间由模型摘录原话、服务端按 IANA 时区确定性解析；待办拆解只修改未保存表单预览
- Skill 生命周期与采用行为使用低敏埋点，Feature Config 异常不会拖垮原业务页面
- Registry 契约测试精确锁定 20 个 Skill，源码门禁阻止别名、动态导入和 Provider HTTP 旁路
- 旧通用助手的产品入口、续聊 API 和业务 Service 均已下线；历史数据仅供账号全量导出、账号注销与必要的审计治理兼容

#### AI 配额安全配置

- 配额默认强制执行；只有显式设置 `AI_GATE_ENFORCE=false` 才进入只观测、不拦截模式。
- 生产环境必须配置稳定的独立高熵密钥 `AI_QUOTA_HASH_SECRET`（至少 32 字节），用于对游客设备与网络绑定做 HMAC；原始 IP、UA、fingerprint 不写入配额账本。密钥轮换会开启新的游客额度桶，应作为受控运维变更处理。Linux 部署即使漏设 `NODE_ENV` 也不会回退到本地开发密钥。
- 游客同时受设备桶与可信网络桶约束。网络桶默认是单设备额度的 3 倍，可通过 `AI_GUEST_NETWORK_QUOTA_MULTIPLIER` 在 1～20 范围调整，以平衡共享网络误伤和指纹轮换滥用。
- 配额以 MySQL 为单一事实源，不依赖 Redis。上线新版后端前必须先执行 `migrations/20260719_ai_quota_hardening.sql`；迁移缺失或 MySQL 配额事务失败时会失败关闭 AI Provider 调用。

### 后台管理（Root 角色）

- 用户管理 · 账号封禁
- API 日志 / 操作日志审计
- 用户反馈处理
- 图片存储管理
- 帮助文档管理（含草稿发布）

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
- pnpm
- 7-Zip（`7zz`）与 LibreOffice Writer/Calc/Impress（启用压缩包和旧版 Office 预览时）

### 安装

```bash
git clone https://github.com/VeteranBoLuo/light-note
cd light-note

# 安装依赖（根目录）
pnpm install

# 导入数据库
mysql -u root -p < apps/server/init.sql

# 配置数据库连接（编辑 apps/server/app.js 中的 pool 配置）
# host / port / user / password / database

# 启动服务
node apps/server/app.js
```

启用新增文件预览前，先应用 `apps/server/migrations/20260808_file_preview_artifacts.sql`，并运行：

```bash
pnpm --filter server check:file-previews
pnpm --filter server worker:documents
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
light-note/
├── apps/
│   ├── web/               # Vue 3 前端
│   └── server/            # Express 后端（本包）
│       ├── app.js              # 入口文件
│       ├── db/index.js         # 数据库连接池
│       ├── util/
│       │   ├── common.js       # 工具函数
│       │   ├── auth.js         # 认证中间件
│       │   ├── resourceTags.js # 资源标签关联工具
│       │   └── ...
│       ├── api/                # 路由与处理器
│       │   ├── bookmarkHandle.js
│       │   ├── noteHandle.js
│       │   ├── tagHandle.js
│       │   ├── fileHandle.js
│       │   ├── aiHandle.js
│       │   ├── admin/          # 后台管理接口
│       │   └── ...
│       └── util/communityChat/ # 公共聊天室 realtime 协议、Hub 与 Redis Broker
└── packages/
    └── shared/             # 共享工具包
```

---

## License

MIT
