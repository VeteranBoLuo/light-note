# 为轻笺贡献

感谢你愿意帮助轻笺变得更好。轻笺首先是一项面向用户的在线服务，同时开放源代码，欢迎提交问题、改进文档和贡献代码。

## 提交问题

- 功能异常请使用 [Bug 报告](https://github.com/VeteranBoLuo/light-note/issues/new?template=bug_report.yml)。
- 产品建议请使用 [功能建议](https://github.com/VeteranBoLuo/light-note/issues/new?template=feature_request.yml)。
- 提交前请先搜索现有 Issue，避免重复。
- 安全漏洞不要公开提交 Issue，请按 [安全政策](SECURITY.md) 私下报告。

轻笺的完整生产环境依赖数据库、对象存储、缓存、邮件和第三方 AI 服务，目前不提供面向普通用户的一键自托管支持。部署环境问题不属于常规 Bug，但清晰、可复现的兼容性改进仍然欢迎讨论。

## 本地开发

环境要求：Node.js 20、pnpm 10、MySQL 5.7 或更高版本。

```bash
pnpm install
pnpm dev:web
pnpm dev:server
```

后端启动前需要准备本地环境变量和数据库。不要把 `.env`、密钥、访问令牌、数据库连接串或用户数据提交到仓库。更完整的项目结构和规范请阅读 [开发文档](docs/development.md) 与 [架构文档](docs/architecture.md)。

## 提交 Pull Request

1. 从 `main` 创建独立分支，每个 PR 聚焦一个问题。
2. 说明改动动机、影响范围和验证方式；界面改动请附桌面端及移动端截图。
3. 用户可见文案需同步维护中文和英文；界面需兼容明暗主题及移动端。
4. 前端优先使用项目的 B 系列组件，不新增 Ant Design Vue 组件。
5. 提交前按改动范围执行验证：

```bash
pnpm typecheck
pnpm test
SKIP_PRERENDER=1 pnpm build:web
```

无法执行某项验证时，请在 PR 中说明原因。维护者会根据项目方向、兼容性和维护成本决定是否合并。

## English summary

Bug reports, feature requests, documentation improvements, and focused pull requests are welcome. Please search existing issues first, never include secrets or user data, and report vulnerabilities privately according to [SECURITY.md](SECURITY.md). LightNote is primarily a hosted online service; beginner-oriented, one-click self-hosting support is not currently provided.
