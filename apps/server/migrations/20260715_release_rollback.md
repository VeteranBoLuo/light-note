# 2026-07-15 发布迁移与回滚说明

本批代码依赖以下三份增量迁移，线上执行前必须单独获得数据库变更授权：

1. `20260715_admin_context_audit.sql`
2. `20260715_agent_trace.sql`
3. `20260715_resource_inbox.sql`

同时需要执行 `20260715_knowledge_base_docs.sql`，同步“快速收集与待整理箱”的公开帮助说明，以及“管理员只读预览与内容代管”的内部运维说明。该脚本属于线上业务数据写入，必须与结构迁移一样单独获得授权；未授权或执行校验未通过时，本批发布保持阻断。

## 上线顺序

1. 备份 `agent_logs` 表结构，并确认 `user.id` 与 `resource_inbox.user_id` 的字符集、排序规则和字段长度兼容。当前仓库基线的 `user` 表为 `utf8`，因此待整理表保持相同字符集以满足外键要求。
2. 依次执行审计表、Agent 追踪列、待整理表迁移。
3. 用 `SHOW CREATE TABLE` 和 `SHOW INDEX` 校验新表、列与索引。
4. 执行知识库说明同步脚本，确认一条 `public` 帮助文档和一条 `internal` 运维文档均存在且没有重复标题。
5. 部署服务端，再部署前端；服务端未更新前前端不得提前开放待整理入口。
6. `ADMIN_MAINTENANCE_ENABLED` 默认关闭；完成只读预览和审计验证后，再由运维显式设为 `true` 开启内容代管。

## 回滚顺序

1. 先关闭 `ADMIN_MAINTENANCE_ENABLED`，并清理 Redis `admin-context:*`、`admin-context-meta:*` 与 `agent:confirm:*` 短时令牌。
2. 回滚前端，隐藏待整理和新版 AI 交互入口。
3. 回滚服务端代码。
4. `admin_context_audit` 默认保留，不删除历史审计。
5. `resource_inbox` 默认保留；确认不再需要待整理状态且已导出数据后，才可执行 `DROP TABLE resource_inbox`。
6. Agent 新列可保留，不影响旧代码。确需结构回滚时，先删除 `idx_agent_logs_request_id`、`idx_agent_logs_provider_status`，再删除本次新增列；该 ALTER 可能锁表，应另行评估维护窗口。
7. 知识库文档默认保留；若功能代码已回滚，应将“快速收集与待整理箱怎么使用”改为 `internal` 或删除，并保留内部管理员说明作为历史运维记录。

## 兼容性说明

- `agentHandle` 对未迁移 `agent_logs` 新列保留旧字段写入回退，但完整追踪依赖迁移完成。
- `resource_inbox` 是待整理接口的硬依赖，不能在未建表时开放入口。
- 审计写入失败不会阻断业务，但属于上线告警，不能长期忽略。
- 活跃管理员上下文仅保存 Token 哈希键；`admin-context-meta:*` 在上下文过期后额外保留 24 小时，仅用于区分过期访问并写审计，不保存原始 Token。
