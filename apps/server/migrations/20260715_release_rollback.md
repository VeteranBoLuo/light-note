# 2026-07-15 发布迁移与回滚说明

本批代码依赖以下五份增量迁移，线上执行前必须单独获得数据库变更授权：

1. `20260715_admin_context_audit.sql`
2. `20260715_agent_trace.sql`
3. `20260715_resource_inbox.sql`
4. `20260715_log_exclude_device_id.sql`
5. `20260715_todo_action_center.sql`

同时需要先执行 `20260715_knowledge_base_docs.sql`，再执行 `20260715_action_center_knowledge.sql`，同步行动中心、待办和管理员代管说明。知识库脚本属于线上业务数据写入，必须与结构迁移一样单独获得授权；未授权或执行校验未通过时，本批发布保持阻断。

## 上线顺序

1. 备份 `agent_logs` 表结构，并确认 `user.id` 与 `resource_inbox.user_id` 的字符集、排序规则和字段长度兼容。当前仓库基线的 `user` 表为 `utf8`，因此待整理表保持相同字符集以满足外键要求。
2. 依次执行审计表、Agent 追踪列、待整理表、日志稳定设备标识、待办与提醒表迁移。
3. 用 `SHOW CREATE TABLE` 和 `SHOW INDEX` 校验新表、列与索引。
4. 按顺序执行两份知识库说明同步脚本，确认行动中心 `public` 帮助文档和管理员 `internal` 运维文档均存在且没有重复标题。
5. 部署服务端，再部署前端；服务端未更新前前端不得提前开放待整理入口。
6. `ADMIN_MAINTENANCE_ENABLED` 默认关闭；完成只读预览和审计验证后，再由运维显式设为 `true` 开启内容代管。

## 回滚顺序

1. 先关闭 `ADMIN_MAINTENANCE_ENABLED`，并清理 Redis `admin-context:*`、`admin-context-meta:*` 与 `agent:confirm:*` 短时令牌。
2. 回滚前端，隐藏待整理和新版 AI 交互入口。
3. 回滚服务端代码。
4. `admin_context_audit` 默认保留，不删除历史审计。
5. `resource_inbox` 默认保留；确认不再需要待整理状态且已导出数据后，才可执行 `DROP TABLE resource_inbox`。
6. `todo_items` 与 `todo_reminders` 默认保留；确需删除时先停服务端提醒调度器并导出数据，再先删 `todo_reminders`、后删 `todo_items`。
7. `log_exclude.device_id` 与唯一索引可保留，旧代码会忽略该列。
8. Agent 新列可保留，不影响旧代码。确需结构回滚时，先删除 `idx_agent_logs_request_id`、`idx_agent_logs_provider_status`，再删除本次新增列；该 ALTER 可能锁表，应另行评估维护窗口。
9. 知识库文档默认保留；若功能代码已回滚，应将“行动中心：待整理与待办怎么使用”改为 `internal` 或删除，并保留内部管理员说明作为历史运维记录。

## 兼容性说明

- `agentHandle` 对未迁移 `agent_logs` 新列保留旧字段写入回退，但完整追踪依赖迁移完成。
- `resource_inbox` 是待整理接口的硬依赖，不能在未建表时开放入口。
- `todo_items` / `todo_reminders` 是行动中心待办与提醒调度器的硬依赖，必须先迁移再部署服务端。
- `log_exclude.device_id` 未迁移时应用启动会尝试幂等补列，但正式上线仍应先执行迁移，避免启动阶段执行 DDL。
- 审计写入失败不会阻断业务，但属于上线告警，不能长期忽略。
- 活跃管理员上下文仅保存 Token 哈希键；`admin-context-meta:*` 在上下文过期后额外保留 24 小时，仅用于区分过期访问并写审计，不保存原始 Token。
