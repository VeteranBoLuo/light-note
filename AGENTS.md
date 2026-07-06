# Light Note AI 开发规则

> 项目规范文档在 `docs/` 目录下，AI 每次开发前应加载相关文档。

## 回答规范

- 回答和思考过程必须用中文

## 部署禁令（不可违反）

- 改完代码后**绝对不 build、不部署、不上传服务器**
- 部署必须用户明确说出"部署"、"deploy"、"上线"等词才算指令
- "改好看效果"、"改完看看"、"改成这样"等词**不视为**部署指令
- build 也需要用户明确说"build"、"构建"、"打包"才算
- 即使 deploy.sh 已有确认保护，也不代表可以擅自执行

## 开发工作流

### 新增/修改文件自检

1. 列出本轮新增、修改、删除文件
2. 逐文件通读改动，检查 import/export、类型、边界分支、空值处理、权限判断、状态重置
3. 新增文件确认已正确接入（路由、入口、引用、国际化、菜单等）
4. 修改文件反查调用方和被调用方，确认不破坏兼容
5. 删除文件检查无残留引用
6. 自检发现问题先修复再构建

### 验证要求

- 前端改动默认至少执行构建或类型检查
- 后端改动默认至少执行语法检查，能跑测试时优先跑测试
- 若因环境/依赖/数据库原因无法验证，在回复中说明未验证项和原因
- 最终回复简要列出：改了什么文件、自检了哪些重点、执行了什么验证、是否还有风险

## 开发时必读

执行与项目相关的任何任务前，先加载以下文档：

- `docs/architecture.md` — 项目架构、路由映射、数据库表
- `docs/development.md` — 编码规范、自检清单、建表/API/事务约定
- `docs/design.md` — 品牌色、主题系统、组件体系、响应式设计

## AI 专用记录

以下内容仅 AI 开发时使用，不进项目规范：

- **常用工具路径：** `util/common.js`（insertData/snakeCaseKeys）、`util/request.js`（validateQueryParams）
- **Agent LLM 供应商策略：** DeepSeek 主 / 千问备用，由 `AGENT_LLM_PROVIDER` 控制，千问必须保留 `extraBody: { enable_thinking: false }`
- **常见错误：** 事务内用 `pool.query` 而非 `connection.query`、纯读查询用 `getConnection`、`res.send` 后没 `return`、用 `ORDER BY LIMIT 1` 获取新 ID
