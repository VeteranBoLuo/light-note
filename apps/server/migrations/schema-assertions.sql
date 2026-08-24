-- AI 工作区迁移 schema 断言（改编自运行手册 §7）。
-- 约定:每个查询"有输出=失败"。全部无输出 = 全部通过。针对当前连接的库(DATABASE())。

-- 1) 缺失表（期望 0 行）
SELECT '[1] missing_table' AS check_name, expected.t AS detail FROM (
  SELECT 'ai_conversations' t UNION ALL SELECT 'ai_messages' UNION ALL SELECT 'ai_message_sources'
  UNION ALL SELECT 'ai_message_evidence' UNION ALL SELECT 'ai_feedback' UNION ALL SELECT 'ai_content_chunks'
  UNION ALL SELECT 'ai_content_generations' UNION ALL SELECT 'ai_change_sets' UNION ALL SELECT 'ai_change_items'
  UNION ALL SELECT 'ai_memories' UNION ALL SELECT 'ai_response_events'
  UNION ALL SELECT 'ai_product_events' UNION ALL SELECT 'ai_token_reservations'
  UNION ALL SELECT 'ai_executions' UNION ALL SELECT 'ai_provider_spans'
  UNION ALL SELECT 'ai_skill_threads' UNION ALL SELECT 'ai_skill_turns'
  UNION ALL SELECT 'ai_evaluation_runs'
  UNION ALL SELECT 'ai_agent_conversation_state' UNION ALL SELECT 'ai_agent_run'
  UNION ALL SELECT 'ai_agent_source_set' UNION ALL SELECT 'ai_agent_result_set'
  UNION ALL SELECT 'ai_agent_artifact_version'
) expected
LEFT JOIN information_schema.tables a ON a.table_schema=DATABASE() AND a.table_name=expected.t
WHERE a.table_name IS NULL;

-- 2) 非 InnoDB / 非 utf8mb4 的 ai_ 表（期望 0 行）
SELECT '[2] engine_or_charset' AS check_name, CONCAT(table_name,':',engine,':',table_collation) AS detail
FROM information_schema.tables
WHERE table_schema=DATABASE() AND table_name LIKE 'ai\_%'
  AND (engine<>'InnoDB' OR table_collation NOT LIKE 'utf8mb4%');

-- 3) 关键列缺失（期望 0 行）
SELECT '[3] missing_column' AS check_name, t.n AS detail FROM (
  SELECT 'ai_document_sources' tab,'coverage_metadata' col,'ai_document_sources.coverage_metadata' n UNION ALL
  SELECT 'ai_conversations','root_conversation_id','ai_conversations.root_conversation_id' UNION ALL
  SELECT 'ai_conversations','parent_conversation_id','ai_conversations.parent_conversation_id' UNION ALL
  SELECT 'ai_conversations','branch_from_message_id','ai_conversations.branch_from_message_id' UNION ALL
  SELECT 'ai_change_sets','preview_revision','ai_change_sets.preview_revision' UNION ALL
  SELECT 'ai_change_sets','retry_json','ai_change_sets.retry_json' UNION ALL
  SELECT 'ai_change_sets','attempt_count','ai_change_sets.attempt_count' UNION ALL
  SELECT 'ai_change_sets','last_attempt_at','ai_change_sets.last_attempt_at' UNION ALL
  SELECT 'ai_change_sets','admin_context_scope','ai_change_sets.admin_context_scope' UNION ALL
  SELECT 'ai_response_events','admin_context_scope','ai_response_events.admin_context_scope' UNION ALL
  SELECT 'ai_content_generations','generation','ai_content_generations.generation' UNION ALL
  SELECT 'ai_skill_threads','admin_context_mode','ai_skill_threads.admin_context_mode' UNION ALL
  SELECT 'ai_skill_threads','admin_context_id','ai_skill_threads.admin_context_id' UNION ALL
  SELECT 'ai_agent_conversation_state','owner_key_hash','ai_agent_conversation_state.owner_key_hash' UNION ALL
  SELECT 'ai_agent_conversation_state','revision','ai_agent_conversation_state.revision' UNION ALL
  SELECT 'ai_agent_run','execution_receipt','ai_agent_run.execution_receipt' UNION ALL
  SELECT 'ai_agent_source_set','source_digest','ai_agent_source_set.source_digest' UNION ALL
  SELECT 'ai_agent_result_set','query_fingerprint','ai_agent_result_set.query_fingerprint' UNION ALL
  SELECT 'ai_agent_result_set','completeness','ai_agent_result_set.completeness' UNION ALL
  SELECT 'ai_agent_artifact_version','content_hash','ai_agent_artifact_version.content_hash' UNION ALL
  SELECT 'ai_agent_artifact_version','source_set_id','ai_agent_artifact_version.source_set_id'
) t
LEFT JOIN information_schema.columns c
  ON c.table_schema=DATABASE() AND c.table_name=t.tab AND c.column_name=t.col
WHERE c.column_name IS NULL;

-- 4) admin_context_scope 必须是 STORED GENERATED（期望 0 行）
SELECT '[4] scope_not_stored' AS check_name, CONCAT(table_name,'.',column_name,' extra=',extra) AS detail
FROM information_schema.columns
WHERE table_schema=DATABASE() AND column_name='admin_context_scope'
  AND extra NOT LIKE '%STORED GENERATED%';

-- 5) ai_content_generations.generation 必须 bigint unsigned NOT NULL DEFAULT 0（期望 0 行）
SELECT '[5] generation_type' AS check_name, CONCAT(column_type,'/',is_nullable,'/',IFNULL(column_default,'NULL')) AS detail
FROM information_schema.columns
WHERE table_schema=DATABASE() AND table_name='ai_content_generations' AND column_name='generation'
  AND NOT (column_type='bigint(20) unsigned' AND is_nullable='NO' AND column_default='0');

-- 6) 旧三维唯一索引应已移除（期望 0 行）
SELECT '[6] obsolete_unique_index' AS check_name, CONCAT(table_name,'.',index_name) AS detail
FROM information_schema.statistics
WHERE table_schema=DATABASE() AND (
  (table_name='ai_change_sets' AND index_name='uk_ai_change_set_request') OR
  (table_name='ai_response_events' AND index_name='uk_ai_response_event')
);

-- 7) 新四维/预留唯一索引应存在（期望 0 行 = 无缺失）
SELECT '[7] missing_unique_index' AS check_name, CONCAT(x.tn,'.',x.ix) AS detail FROM (
  SELECT 'ai_change_sets' tn,'uk_ai_change_set_request_context' ix UNION ALL
  SELECT 'ai_response_events','uk_ai_response_event_context' UNION ALL
  SELECT 'ai_token_reservations','uk_ai_token_reservation_key' UNION ALL
  SELECT 'ai_executions','uk_ai_execution_request' UNION ALL
  SELECT 'ai_skill_turns','uk_ai_skill_turn_request'
) x
LEFT JOIN information_schema.statistics s
  ON s.table_schema=DATABASE() AND s.table_name=x.tn AND s.index_name=x.ix
WHERE s.index_name IS NULL;

-- 8) 会话谱系索引应存在（期望 0 行）
SELECT '[8] missing_lineage_index' AS check_name, CONCAT(x.tn,'.',x.ix) AS detail FROM (
  SELECT 'ai_conversations' tn,'idx_ai_conversation_lineage_owner' ix UNION ALL
  SELECT 'ai_conversations','idx_ai_conversation_parent'
) x
LEFT JOIN information_schema.statistics s
  ON s.table_schema=DATABASE() AND s.table_name=x.tn AND s.index_name=x.ix
WHERE s.index_name IS NULL;

-- 8A) Agent Runtime Phase 2 的关键 CAS、恢复与生命周期索引应存在（期望 0 行）
SELECT '[8A] missing_agent_runtime_index' AS check_name, CONCAT(x.tn,'.',x.ix) AS detail FROM (
  SELECT 'ai_agent_conversation_state' tn,'idx_ai_agent_state_owner_updated' ix UNION ALL
  SELECT 'ai_agent_run','idx_ai_agent_run_conversation_created' UNION ALL
  SELECT 'ai_agent_source_set','idx_ai_agent_source_digest' UNION ALL
  SELECT 'ai_agent_result_set','uk_ai_agent_result_handle' UNION ALL
  SELECT 'ai_agent_result_set','idx_ai_agent_result_run_goal' UNION ALL
  SELECT 'ai_agent_artifact_version','uk_ai_agent_artifact_chain_version'
) x
LEFT JOIN information_schema.statistics s
  ON s.table_schema=DATABASE() AND s.table_name=x.tn AND s.index_name=x.ix
WHERE s.index_name IS NULL;

-- 9) 笔记内联提及派生表 note_resource_refs 应存在（N0;期望 0 行）
SELECT '[9] missing_note_resource_refs' AS check_name, expected.t AS detail FROM (
  SELECT 'note_resource_refs' t
) expected
LEFT JOIN information_schema.tables a ON a.table_schema=DATABASE() AND a.table_name=expected.t
WHERE a.table_name IS NULL;

-- 10) note_resource_refs 表引擎/默认排序规则(期望 0 行;CREATE IF NOT EXISTS 不会修复历史同名表)
SELECT '[10] note_ref_table_shape' AS check_name,
  CONCAT('实际=', IFNULL(CONCAT(t.engine, '/', t.table_collation), '缺失')) AS detail
FROM (
  SELECT 'InnoDB' expected_engine, 'utf8mb4_unicode_ci' expected_collation
) expected
LEFT JOIN information_schema.tables t
  ON t.table_schema=DATABASE() AND t.table_name='note_resource_refs'
WHERE t.table_name IS NULL
   OR LOWER(t.engine) <> LOWER(expected.expected_engine)
   OR t.table_collation <> expected.expected_collation;

-- 11) note_resource_refs 全部列的顺序、类型/宽度、可空、默认、字符集/排序规则与自动更新时间(期望 0 行)
SELECT '[11] note_ref_column_shape' AS check_name,
  CONCAT(
    expected.col,
    ' 实际=',
    IFNULL(
      CONCAT(
        c.ordinal_position, '/', c.column_type, '/', c.is_nullable, '/', IFNULL(c.column_default, 'NULL'), '/',
        IFNULL(c.character_set_name, 'NULL'), '/', IFNULL(c.collation_name, 'NULL'), '/', IFNULL(c.extra, '')
      ),
      '缺失'
    )
  ) AS detail
FROM (
  SELECT 1 pos, 'source_note_id' col, 'varchar(255)' ct, 'NO' nn, CAST(NULL AS CHAR) dflt,
    'utf8mb4' charset_name, 'utf8mb4_unicode_ci' collation_name, '' extra UNION ALL
  SELECT 2, 'source_user_id', 'varchar(255)', 'NO', CAST(NULL AS CHAR), 'utf8mb4', 'utf8mb4_unicode_ci', '' UNION ALL
  SELECT 3, 'target_type', 'varchar(16)', 'NO', CAST(NULL AS CHAR), 'utf8mb4', 'utf8mb4_unicode_ci', '' UNION ALL
  SELECT 4, 'target_id', 'varchar(255)', 'NO', CAST(NULL AS CHAR), 'utf8mb4', 'utf8mb4_unicode_ci', '' UNION ALL
  SELECT 5, 'target_name_snapshot', 'varchar(255)', 'NO', '', 'utf8mb4', 'utf8mb4_unicode_ci', '' UNION ALL
  SELECT 6, 'create_time', 'datetime', 'NO', 'CURRENT_TIMESTAMP', CAST(NULL AS CHAR), CAST(NULL AS CHAR), '' UNION ALL
  SELECT 7, 'update_time', 'datetime', 'NO', 'CURRENT_TIMESTAMP', CAST(NULL AS CHAR), CAST(NULL AS CHAR), 'on update CURRENT_TIMESTAMP'
) expected
LEFT JOIN information_schema.columns c
  ON c.table_schema=DATABASE() AND c.table_name='note_resource_refs' AND c.column_name=expected.col
WHERE c.column_name IS NULL
   OR c.ordinal_position <> expected.pos
   OR LOWER(c.column_type) <> expected.ct
   OR c.is_nullable <> expected.nn
   OR NOT (c.column_default <=> expected.dflt)
   OR NOT (c.character_set_name <=> expected.charset_name)
   OR NOT (c.collation_name <=> expected.collation_name)
   OR LOWER(COALESCE(c.extra, '')) <> LOWER(expected.extra);

-- 12) note_resource_refs 主键与二级索引的完整列序、唯一性与前缀长度(期望 0 行)
SELECT '[12] note_ref_index_shape' AS check_name,
  CONCAT(
    expected.idx,
    ' 实际=',
    IFNULL(CONCAT(actual.non_unique, '/', actual.cols), '缺失')
  ) AS detail
FROM (
  SELECT 'PRIMARY' idx, 0 non_unique, 'source_note_id,target_type,target_id' cols UNION ALL
  SELECT 'idx_note_resource_refs_target', 1, 'source_user_id,target_type,target_id' UNION ALL
  SELECT 'idx_note_resource_refs_source_user', 1, 'source_user_id,source_note_id'
) expected
LEFT JOIN (
  SELECT
    s.index_name,
    MAX(s.non_unique) AS non_unique,
    GROUP_CONCAT(
      CONCAT(s.column_name, IF(s.sub_part IS NULL, '', CONCAT('(', s.sub_part, ')')))
      ORDER BY s.seq_in_index SEPARATOR ','
    ) AS cols
  FROM information_schema.statistics s
  WHERE s.table_schema=DATABASE() AND s.table_name='note_resource_refs'
  GROUP BY s.index_name
) actual ON actual.index_name=expected.idx
WHERE actual.index_name IS NULL
   OR actual.non_unique <> expected.non_unique
   OR actual.cols <> expected.cols;

-- 13) 核心业务基线表必须存在（P0-7；期望 0 行）
SELECT '[13] missing_core_table' AS check_name, expected.t AS detail FROM (
  SELECT 'note_versions' t UNION ALL
  SELECT 'file_shares' UNION ALL
  SELECT 'file_share_events'
  UNION ALL SELECT 'note_shares'
  UNION ALL SELECT 'note_share_events'
  UNION ALL SELECT 'file_preview_artifacts'
  UNION ALL SELECT 'file_preview_jobs'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.t
WHERE actual.table_name IS NULL;

-- 14) 核心业务关键列必须存在（P0-7；期望 0 行）
SELECT '[14] missing_core_column' AS check_name, expected.n AS detail FROM (
  SELECT 'files' tab, 'share_token' col, 'files.share_token' n UNION ALL
  SELECT 'note', 'revision', 'note.revision' UNION ALL
  SELECT 'note_versions', 'note_id', 'note_versions.note_id' UNION ALL
  SELECT 'note_versions', 'type', 'note_versions.type' UNION ALL
  SELECT 'note_versions', 'source_revision', 'note_versions.source_revision' UNION ALL
  SELECT 'note_versions', 'reason', 'note_versions.reason' UNION ALL
  SELECT 'file_shares', 'token_hash', 'file_shares.token_hash' UNION ALL
  SELECT 'file_shares', 'access_code_hash', 'file_shares.access_code_hash' UNION ALL
  SELECT 'file_shares', 'expires_at', 'file_shares.expires_at' UNION ALL
  SELECT 'file_shares', 'status', 'file_shares.status' UNION ALL
  SELECT 'file_share_events', 'visitor_hash', 'file_share_events.visitor_hash' UNION ALL
  SELECT 'note_shares', 'root_note_id', 'note_shares.root_note_id' UNION ALL
  SELECT 'note_shares', 'scope_type', 'note_shares.scope_type' UNION ALL
  SELECT 'note_shares', 'token_hash', 'note_shares.token_hash' UNION ALL
  SELECT 'note_shares', 'access_code_hash', 'note_shares.access_code_hash' UNION ALL
  SELECT 'note_shares', 'expires_at', 'note_shares.expires_at' UNION ALL
  SELECT 'note_shares', 'status', 'note_shares.status' UNION ALL
  SELECT 'note_share_events', 'visitor_hash', 'note_share_events.visitor_hash' UNION ALL
  SELECT 'file_preview_artifacts', 'strategy', 'file_preview_artifacts.strategy' UNION ALL
  SELECT 'file_preview_artifacts', 'source_etag', 'file_preview_artifacts.source_etag' UNION ALL
  SELECT 'file_preview_artifacts', 'status', 'file_preview_artifacts.status' UNION ALL
  SELECT 'file_preview_artifacts', 'manifest_json', 'file_preview_artifacts.manifest_json' UNION ALL
  SELECT 'file_preview_jobs', 'artifact_id', 'file_preview_jobs.artifact_id' UNION ALL
  SELECT 'file_preview_jobs', 'locked_at', 'file_preview_jobs.locked_at' UNION ALL
  SELECT 'file_preview_jobs', 'output_object_key', 'file_preview_jobs.output_object_key' UNION ALL
  SELECT 'ai_conversations', 'is_pinned', 'ai_conversations.is_pinned' UNION ALL
  SELECT 'todo_items', 'sort_order', 'todo_items.sort_order' UNION ALL
  SELECT 'todo_items', 'series_id', 'todo_items.series_id' UNION ALL
  SELECT 'todo_items', 'recurrence_rule', 'todo_items.recurrence_rule' UNION ALL
  SELECT 'todo_items', 'recurrence_instance_at', 'todo_items.recurrence_instance_at'
  UNION ALL SELECT 'user_growth', 'ai_bonus_tokens', 'user_growth.ai_bonus_tokens'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

-- 15) 核心业务索引必须存在（P0-7；期望 0 行）
SELECT '[15] missing_core_index' AS check_name, CONCAT(expected.tn, '.', expected.ix) AS detail FROM (
  SELECT 'note_versions' tn, 'idx_note_versions_note_time' ix UNION ALL
  SELECT 'note_versions', 'idx_note_versions_owner' UNION ALL
  SELECT 'file_shares', 'uk_file_shares_token_hash' UNION ALL
  SELECT 'file_shares', 'idx_file_shares_owner_status' UNION ALL
  SELECT 'file_shares', 'idx_file_shares_file_status' UNION ALL
  SELECT 'file_share_events', 'idx_file_share_events_retention' UNION ALL
  SELECT 'note_shares', 'uk_note_shares_token_hash' UNION ALL
  SELECT 'note_shares', 'idx_note_shares_owner_status' UNION ALL
  SELECT 'note_shares', 'idx_note_shares_root_status' UNION ALL
  SELECT 'note_share_events', 'idx_note_share_events_retention' UNION ALL
  SELECT 'file_preview_artifacts', 'uk_file_preview_artifact' UNION ALL
  SELECT 'file_preview_artifacts', 'idx_file_preview_owner_status' UNION ALL
  SELECT 'file_preview_jobs', 'uk_file_preview_job_artifact' UNION ALL
  SELECT 'file_preview_jobs', 'idx_file_preview_job_queue' UNION ALL
  SELECT 'ai_conversations', 'idx_ai_conversation_sidebar' UNION ALL
  SELECT 'todo_items', 'idx_todo_custom_order' UNION ALL
  SELECT 'todo_items', 'uk_todo_series_instance'
) expected
LEFT JOIN information_schema.statistics actual
 ON actual.table_schema=DATABASE()
AND actual.table_name=expected.tn
AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 16) 已下线的表不应再存在（期望 0 行）
-- tag_relations：手工「相关标签」已改为按共同资源自动推导（20260731_drop_tag_relations.sql）
SELECT '[16] retired_table_still_present' AS check_name, retired.t AS detail FROM (
  SELECT 'tag_relations' t
) retired
INNER JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=retired.t;

-- 17) 待办参考资料关系的关键索引与外键（期望 0 行）
SELECT '[17] missing_todo_ref_index' AS check_name, CONCAT(expected.tn, '.', expected.ix) AS detail FROM (
  SELECT 'todo_resource_refs' tn, 'idx_todo_resource_refs_owner_todo' ix UNION ALL
  SELECT 'todo_resource_refs', 'idx_todo_resource_refs_target'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

SELECT '[17] missing_todo_ref_fk' AS check_name, 'fk_todo_resource_refs_todo' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.table_constraints
   WHERE constraint_schema=DATABASE()
     AND table_name='todo_resource_refs'
     AND constraint_name='fk_todo_resource_refs_todo'
     AND constraint_type='FOREIGN KEY'
);

-- 18) 成长任务数据模型必须存在（PR2；期望 0 行）
SELECT '[18] missing_growth_task_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'growth_tasks' t UNION ALL
  SELECT 'user_growth_tasks'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.t
WHERE actual.table_name IS NULL;

-- 19) 成长任务关键列与索引必须存在（PR2；期望 0 行）
SELECT '[19] missing_growth_task_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'growth_tasks' tab, 'task_key' col, 'growth_tasks.task_key' n UNION ALL
  SELECT 'growth_tasks', 'reward_exp', 'growth_tasks.reward_exp' UNION ALL
  SELECT 'growth_tasks', 'enabled', 'growth_tasks.enabled' UNION ALL
  SELECT 'user_growth_tasks', 'status', 'user_growth_tasks.status' UNION ALL
  SELECT 'user_growth_tasks', 'completed_at', 'user_growth_tasks.completed_at' UNION ALL
  SELECT 'user_growth_tasks', 'claimed_at', 'user_growth_tasks.claimed_at'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[19] missing_growth_task_index' AS check_name, CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'growth_tasks' tn, 'uk_growth_tasks_task_key' ix UNION ALL
  SELECT 'growth_tasks', 'idx_growth_tasks_enabled_order' UNION ALL
  SELECT 'user_growth_tasks', 'idx_user_growth_tasks_status'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 20) 书签用户内容字段必须支持完整 Unicode（期望 0 行）
SELECT '[20] bookmark_content_charset' AS check_name,
  CONCAT(
    expected.col,
    ' 实际=',
    IFNULL(CONCAT(actual.character_set_name, '/', actual.collation_name), '缺失')
  ) AS detail
FROM (
  SELECT 'name' col, 'utf8mb4' charset_name, 'utf8mb4_general_ci' collation_name UNION ALL
  SELECT 'description', 'utf8mb4', 'utf8mb4_general_ci' UNION ALL
  SELECT 'url', 'utf8mb4', 'utf8mb4_general_ci' UNION ALL
  SELECT 'icon_url', 'utf8mb4', 'utf8mb4_general_ci'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='bookmark'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL
   OR NOT (actual.character_set_name <=> expected.charset_name)
   OR NOT (actual.collation_name <=> expected.collation_name);

-- 21) 后台虚拟列表的活跃字段与稳定排序索引必须存在（期望 0 行）
SELECT '[21] invalid_admin_virtual_list_column' AS check_name,
  CONCAT('user.last_active_time=', IFNULL(CONCAT(actual.column_type, '/', actual.is_nullable, '/', actual.column_default), '缺失')) AS detail
FROM (SELECT 1) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='user'
 AND actual.column_name='last_active_time'
WHERE actual.column_name IS NULL
   OR actual.data_type <> 'datetime'
   OR actual.is_nullable <> 'NO'
   OR UPPER(IFNULL(actual.column_default, '')) NOT IN ('CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP()');

SELECT '[21] missing_admin_virtual_list_index' AS check_name, CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'user' tn, 'idx_user_active_list' ix UNION ALL
  SELECT 'user', 'idx_user_created_list' UNION ALL
  SELECT 'api_logs', 'idx_api_logs_admin_list' UNION ALL
  SELECT 'operation_logs', 'idx_operation_logs_admin_list' UNION ALL
  SELECT 'agent_logs', 'idx_agent_logs_admin_list'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 22) AI 监控的结果轮廓与动作链路字段必须存在（期望 0 行）
SELECT '[22] missing_agent_log_outcome_column' AS check_name, CONCAT('agent_logs.', expected.cn) AS detail
FROM (
  SELECT 'correlation_id' cn UNION ALL
  SELECT 'confirmation_id' UNION ALL
  SELECT 'outcome_kind' UNION ALL
  SELECT 'answer_chars' UNION ALL
  SELECT 'answer_digest' UNION ALL
  SELECT 'delivered'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='agent_logs'
 AND actual.column_name=expected.cn
WHERE actual.column_name IS NULL;

SELECT '[22] missing_agent_log_correlation_index' AS check_name, 'agent_logs.idx_agent_logs_correlation' AS detail
FROM (SELECT 1) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='agent_logs'
 AND actual.index_name='idx_agent_logs_correlation'
WHERE actual.index_name IS NULL;

-- 23) 操作日志的环境列必须存在（期望 0 行）
-- 缺列时后台的「操作系统 / 运行环境」两列会整列空白，且写入侧会静默丢掉这个字段。
SELECT '[23] missing_operation_logs_system_column' AS check_name, 'operation_logs.system' AS detail
FROM (SELECT 1) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='operation_logs'
 AND actual.column_name='system'
WHERE actual.column_name IS NULL;

-- 26) 待办任务计划 × 每项提醒 v2 的事实表、关键列与幂等索引必须存在（期望 0 行）
SELECT '[26] missing_todo_plan_v2_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'todo_series' t UNION ALL
  SELECT 'todo_series_resource_refs' UNION ALL
  SELECT 'todo_reminder_rules' UNION ALL
  SELECT 'todo_reminder_jobs' UNION ALL
  SELECT 'todo_plan_requests' UNION ALL
  SELECT 'todo_plan_mutations' UNION ALL
  SELECT 'todo_plan_runtime_metrics'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.t
WHERE actual.table_name IS NULL;

SELECT '[26] missing_todo_plan_v2_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'todo_items' tab, 'start_at' col, 'todo_items.start_at' n UNION ALL
  SELECT 'todo_items', 'plan_version', 'todo_items.plan_version' UNION ALL
  SELECT 'todo_items', 'series_version', 'todo_items.series_version' UNION ALL
  SELECT 'todo_items', 'occurrence_no', 'todo_items.occurrence_no' UNION ALL
  SELECT 'todo_items', 'occurrence_date', 'todo_items.occurrence_date' UNION ALL
  SELECT 'todo_items', 'instance_timezone', 'todo_items.instance_timezone' UNION ALL
  SELECT 'todo_items', 'is_exception', 'todo_items.is_exception' UNION ALL
  SELECT 'todo_items', 'instance_state', 'todo_items.instance_state' UNION ALL
  SELECT 'todo_items', 'generated_by_todo_id', 'todo_items.generated_by_todo_id' UNION ALL
  SELECT 'notification', 'source_type', 'notification.source_type' UNION ALL
  SELECT 'notification', 'source_id', 'notification.source_id'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

-- 27) 默认单待办的版本化提醒计划必须存放在既有规则事实中（期望 0 行）
SELECT '[27] missing_todo_single_schedule_column' AS check_name, 'todo_reminder_rules.schedule_json' AS detail
FROM (SELECT 1) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='todo_reminder_rules'
 AND actual.column_name='schedule_json'
WHERE actual.column_name IS NULL OR LOWER(actual.data_type) <> 'json';

SELECT '[26] missing_todo_plan_v2_index' AS check_name, CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'todo_items' tn, 'uk_todo_series_occurrence' ix UNION ALL
  SELECT 'todo_series', 'uk_todo_series_creation' UNION ALL
  SELECT 'todo_series', 'idx_series_generation' UNION ALL
  SELECT 'todo_series_resource_refs', 'uk_series_resource' UNION ALL
  SELECT 'todo_reminder_rules', 'idx_rule_series' UNION ALL
  SELECT 'todo_reminder_jobs', 'uk_todo_reminder_job_dedupe' UNION ALL
  SELECT 'todo_reminder_jobs', 'idx_reminder_job_due' UNION ALL
  SELECT 'todo_plan_requests', 'uk_todo_plan_request' UNION ALL
  SELECT 'todo_plan_mutations', 'uk_todo_plan_mutation' UNION ALL
  SELECT 'notification', 'uk_notification_source'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 规则必须恰好归属于一个实例或一个系列；MySQL 5.7 无 CHECK 约束，由写入服务保证，门禁查脏数据。
SELECT '[26] invalid_todo_reminder_rule_owner' AS check_name, id AS detail
FROM todo_reminder_rules
WHERE (todo_id IS NULL AND series_id IS NULL) OR (todo_id IS NOT NULL AND series_id IS NOT NULL);

-- 24) 笔记页面树基础列与索引必须存在（页面树 PR1；期望 0 行）
SELECT '[24] missing_note_tree_column' AS check_name, 'note.parent_id' AS detail
FROM (SELECT 1) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='note'
 AND actual.column_name='parent_id'
WHERE actual.column_name IS NULL
   OR LOWER(actual.column_type) <> 'varchar(255)'
   OR actual.is_nullable <> 'YES';

SELECT '[24] invalid_note_tree_index' AS check_name,
  CONCAT(expected.idx, ' 实际=', IFNULL(actual.cols, '缺失')) AS detail
FROM (
  SELECT 'idx_note_owner_parent_order' idx,
    'create_by(64),parent_id(64),del_flag(8),is_top,sort,update_time,id(64)' cols UNION ALL
  SELECT 'idx_note_parent', 'parent_id'
) expected
LEFT JOIN (
  SELECT index_name,
    GROUP_CONCAT(
      CONCAT(column_name, IF(sub_part IS NULL, '', CONCAT('(', sub_part, ')')))
      ORDER BY seq_in_index SEPARATOR ','
    ) AS cols
  FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='note'
  GROUP BY index_name
) actual ON actual.index_name=expected.idx
WHERE actual.index_name IS NULL OR actual.cols <> expected.cols;

-- 25) 页面树子树删除批次列与恢复索引必须存在（页面树 PR6；期望 0 行）
SELECT '[25] missing_note_tree_delete_batch_column' AS check_name, 'note.tree_delete_batch_id' AS detail
FROM (SELECT 1) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='note'
 AND actual.column_name='tree_delete_batch_id'
WHERE actual.column_name IS NULL
   OR LOWER(actual.column_type) <> 'varchar(255)'
   OR actual.is_nullable <> 'YES';

SELECT '[25] invalid_note_tree_delete_batch_index' AS check_name,
  CONCAT('idx_note_tree_delete_batch 实际=', IFNULL(actual.cols, '缺失')) AS detail
FROM (SELECT 1) expected
LEFT JOIN (
  SELECT index_name,
    GROUP_CONCAT(
      CONCAT(column_name, IF(sub_part IS NULL, '', CONCAT('(', sub_part, ')')))
      ORDER BY seq_in_index SEPARATOR ','
    ) AS cols
  FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='note'
  GROUP BY index_name
) actual ON actual.index_name='idx_note_tree_delete_batch'
WHERE actual.index_name IS NULL OR actual.cols <> 'create_by(64),tree_delete_batch_id(64),del_flag(8)';

-- 28) 安全中心 V2 策略、复核与访问限制 Schema 必须在应用重启前完整就绪（期望 0 行）
SELECT '[28] missing_security_v2_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'security_rule_overrides' t UNION ALL
  SELECT 'security_exceptions' UNION ALL
  SELECT 'security_account_restrictions' UNION ALL
  SELECT 'security_rule_tuning_suggestions' UNION ALL
  SELECT 'security_policy_audit' UNION ALL
  SELECT 'security_migration_state'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.t
WHERE actual.table_name IS NULL;

SELECT '[28] missing_security_v2_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'security_events' tab, 'primary_rule_code' col, 'security_events.primary_rule_code' n UNION ALL
  SELECT 'security_events', 'workflow_status', 'security_events.workflow_status' UNION ALL
  SELECT 'security_events', 'disposition', 'security_events.disposition' UNION ALL
  SELECT 'security_events', 'cluster_key', 'security_events.cluster_key' UNION ALL
  SELECT 'security_events', 'policy_version', 'security_events.policy_version' UNION ALL
  SELECT 'security_events', 'detector_version', 'security_events.detector_version' UNION ALL
  SELECT 'security_events', 'reviewed_by', 'security_events.reviewed_by' UNION ALL
  SELECT 'security_events', 'reviewed_at', 'security_events.reviewed_at' UNION ALL
  SELECT 'security_events', 'review_reason', 'security_events.review_reason' UNION ALL
  SELECT 'security_event_evidence', 'field_context', 'security_event_evidence.field_context' UNION ALL
  SELECT 'security_event_evidence', 'policy_mode', 'security_event_evidence.policy_mode' UNION ALL
  SELECT 'security_event_evidence', 'policy_version', 'security_event_evidence.policy_version' UNION ALL
  SELECT 'security_event_evidence', 'exception_ids', 'security_event_evidence.exception_ids'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[28] missing_security_v2_index' AS check_name, CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'security_events' tn, 'idx_security_event_cluster' ix UNION ALL
  SELECT 'security_events', 'idx_security_event_review' UNION ALL
  SELECT 'security_rule_overrides', 'idx_rule_override_active' UNION ALL
  SELECT 'security_rule_overrides', 'idx_rule_override_version' UNION ALL
  SELECT 'security_exceptions', 'idx_security_exception_subject' UNION ALL
  SELECT 'security_exceptions', 'idx_security_exception_rule' UNION ALL
  SELECT 'security_account_restrictions', 'idx_security_restriction_active' UNION ALL
  SELECT 'security_account_restrictions', 'idx_security_restriction_created' UNION ALL
  SELECT 'security_rule_tuning_suggestions', 'idx_tuning_event' UNION ALL
  SELECT 'security_rule_tuning_suggestions', 'idx_tuning_rule_status' UNION ALL
  SELECT 'security_policy_audit', 'idx_security_policy_audit'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

SELECT '[28] missing_security_v2_migration' AS check_name,
  'security-controls-v2-del-flag-separation' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM security_migration_state
  WHERE migration_key='security-controls-v2-del-flag-separation'
);

-- 29) 自定义模板管理依赖 revision 乐观锁（期望 0 行）
SELECT '[29] missing_note_template_management_schema' AS check_name, expected.n AS detail
FROM (
  SELECT 'note_template' tab, 'id' col, 'note_template.id' n UNION ALL
  SELECT 'note_template', 'create_by', 'note_template.create_by' UNION ALL
  SELECT 'note_template', 'title_template', 'note_template.title_template' UNION ALL
  SELECT 'note_template', 'content', 'note_template.content' UNION ALL
  SELECT 'note_template', 'revision', 'note_template.revision'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[29] invalid_note_template_revision' AS check_name,
  CONCAT('实际=', IFNULL(CONCAT(actual.column_type, '/', actual.is_nullable, '/', actual.column_default), '缺失')) AS detail
FROM (SELECT 1) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='note_template'
 AND actual.column_name='revision'
WHERE actual.column_name IS NULL
   OR LOWER(actual.column_type) NOT IN ('int(10) unsigned', 'int unsigned')
   OR actual.is_nullable <> 'NO'
   OR actual.column_default <> '1';

-- 30) Root 私有用户备注必须按管理员与目标用户复合隔离（期望 0 行）
SELECT '[30] missing_admin_user_remarks_schema' AS check_name, expected.n AS detail
FROM (
  SELECT 'admin_user_remarks' tab, 'admin_user_id' col, 'admin_user_remarks.admin_user_id' n UNION ALL
  SELECT 'admin_user_remarks', 'target_user_id', 'admin_user_remarks.target_user_id' UNION ALL
  SELECT 'admin_user_remarks', 'remark_name', 'admin_user_remarks.remark_name' UNION ALL
  SELECT 'admin_user_remarks', 'create_time', 'admin_user_remarks.create_time' UNION ALL
  SELECT 'admin_user_remarks', 'update_time', 'admin_user_remarks.update_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[30] invalid_admin_user_remarks_primary_key' AS check_name,
  CONCAT('PRIMARY 实际=', IFNULL(actual.cols, '缺失')) AS detail
FROM (SELECT 1) expected
LEFT JOIN (
  SELECT index_name,
    GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS cols
  FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='admin_user_remarks' AND index_name='PRIMARY'
  GROUP BY index_name
) actual ON actual.index_name='PRIMARY'
WHERE actual.index_name IS NULL OR actual.cols <> 'admin_user_id,target_user_id';

SELECT '[30] missing_admin_user_remarks_target_index' AS check_name,
  'admin_user_remarks.idx_admin_user_remarks_target' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.statistics
  WHERE table_schema=DATABASE()
    AND table_name='admin_user_remarks'
    AND index_name='idx_admin_user_remarks_target'
    AND column_name='target_user_id'
    AND seq_in_index=1
);

-- 31) 社区客厅 Stage 0 必须先具备邀请、规则确认、通知默认开启和访问审计底座（期望 0 行）
SELECT '[31] missing_community_chat_foundation_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'community_chat_rooms' t UNION ALL
  SELECT 'community_chat_access_requests' UNION ALL
  SELECT 'community_chat_members' UNION ALL
  SELECT 'community_chat_user_settings' UNION ALL
  SELECT 'community_chat_access_audit'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.t
WHERE actual.table_name IS NULL;

SELECT '[31] invalid_community_chat_table_shape' AS check_name,
  CONCAT(actual.table_name, ':', actual.engine, ':', actual.table_collation) AS detail
FROM information_schema.tables actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name IN (
    'community_chat_rooms',
    'community_chat_access_requests',
    'community_chat_members',
    'community_chat_user_settings',
    'community_chat_access_audit'
  )
  AND (actual.engine <> 'InnoDB' OR actual.table_collation <> 'utf8mb4_unicode_ci');

SELECT '[31] missing_community_chat_foundation_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'community_chat_rooms' tab, 'slug' col, 'community_chat_rooms.slug' n UNION ALL
  SELECT 'community_chat_rooms', 'default_notification_level', 'community_chat_rooms.default_notification_level' UNION ALL
  SELECT 'community_chat_rooms', 'last_message_id', 'community_chat_rooms.last_message_id' UNION ALL
  SELECT 'community_chat_rooms', 'pinned_message_id', 'community_chat_rooms.pinned_message_id' UNION ALL
  SELECT 'community_chat_rooms', 'pinned_by', 'community_chat_rooms.pinned_by' UNION ALL
  SELECT 'community_chat_rooms', 'pinned_at', 'community_chat_rooms.pinned_at' UNION ALL
  SELECT 'community_chat_access_requests', 'user_id', 'community_chat_access_requests.user_id' UNION ALL
  SELECT 'community_chat_access_requests', 'status', 'community_chat_access_requests.status' UNION ALL
  SELECT 'community_chat_members', 'status', 'community_chat_members.status' UNION ALL
  SELECT 'community_chat_members', 'rules_version', 'community_chat_members.rules_version' UNION ALL
  SELECT 'community_chat_members', 'rules_accepted_at', 'community_chat_members.rules_accepted_at' UNION ALL
  SELECT 'community_chat_user_settings', 'global_notification_enabled', 'community_chat_user_settings.global_notification_enabled' UNION ALL
  SELECT 'community_chat_user_settings', 'browser_notification_enabled', 'community_chat_user_settings.browser_notification_enabled' UNION ALL
  SELECT 'community_chat_user_settings', 'android_notification_enabled', 'community_chat_user_settings.android_notification_enabled' UNION ALL
  SELECT 'community_chat_user_settings', 'lock_screen_preview', 'community_chat_user_settings.lock_screen_preview' UNION ALL
  SELECT 'community_chat_access_audit', 'actor_user_id', 'community_chat_access_audit.actor_user_id' UNION ALL
  SELECT 'community_chat_access_audit', 'target_user_id', 'community_chat_access_audit.target_user_id' UNION ALL
  SELECT 'community_chat_access_audit', 'action', 'community_chat_access_audit.action'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[31] invalid_community_chat_notification_default' AS check_name,
  CONCAT(actual.column_name, ' actual=', IFNULL(actual.column_default, 'NULL'), ' expected=', expected.default_value) AS detail
FROM (
  SELECT 'global_notification_enabled' column_name, '1' default_value UNION ALL
  SELECT 'browser_notification_enabled', '0' UNION ALL
  SELECT 'android_notification_enabled', '0'
) expected
JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_user_settings'
 AND actual.column_name=expected.column_name
WHERE NOT (actual.is_nullable='NO' AND actual.column_default=expected.default_value);

SELECT '[31] invalid_community_chat_account_id_collation' AS check_name,
  CONCAT(expected.n, ' actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM (
  SELECT 'community_chat_rooms' tab, 'pinned_by' col, 'community_chat_rooms.pinned_by' n UNION ALL
  SELECT 'community_chat_access_requests', 'user_id', 'community_chat_access_requests.user_id' UNION ALL
  SELECT 'community_chat_access_requests', 'reviewed_by', 'community_chat_access_requests.reviewed_by' UNION ALL
  SELECT 'community_chat_members', 'user_id', 'community_chat_members.user_id' UNION ALL
  SELECT 'community_chat_members', 'invited_by', 'community_chat_members.invited_by' UNION ALL
  SELECT 'community_chat_user_settings', 'user_id', 'community_chat_user_settings.user_id' UNION ALL
  SELECT 'community_chat_access_audit', 'actor_user_id', 'community_chat_access_audit.actor_user_id' UNION ALL
  SELECT 'community_chat_access_audit', 'target_user_id', 'community_chat_access_audit.target_user_id'
) expected
JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.character_set_name <> 'utf8'
   OR actual.collation_name <> 'utf8_general_ci';

SELECT '[31] missing_community_chat_foundation_index' AS check_name,
  CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'community_chat_rooms' tn, 'uk_community_chat_room_slug' ix UNION ALL
  SELECT 'community_chat_rooms', 'idx_community_chat_room_status_sort' UNION ALL
  SELECT 'community_chat_access_requests', 'uk_community_chat_access_user' UNION ALL
  SELECT 'community_chat_access_requests', 'idx_community_chat_access_status_time' UNION ALL
  SELECT 'community_chat_members', 'idx_community_chat_member_status_role' UNION ALL
  SELECT 'community_chat_access_audit', 'idx_community_chat_audit_target_time' UNION ALL
  SELECT 'community_chat_access_audit', 'idx_community_chat_audit_actor_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 32) 社区客厅文本 MVP 必须具备消息幂等、回复游标与阅读位置底座（期望 0 行）
SELECT '[32] missing_community_chat_text_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'community_chat_messages' t UNION ALL
  SELECT 'community_chat_reads'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.t
WHERE actual.table_name IS NULL;

SELECT '[32] invalid_community_chat_text_table_shape' AS check_name,
  CONCAT(actual.table_name, ':', actual.engine, ':', actual.table_collation) AS detail
FROM information_schema.tables actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name IN ('community_chat_messages', 'community_chat_reads')
  AND (actual.engine <> 'InnoDB' OR actual.table_collation <> 'utf8mb4_unicode_ci');

SELECT '[32] missing_community_chat_text_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'community_chat_messages' tab, 'public_id' col, 'community_chat_messages.public_id' n UNION ALL
  SELECT 'community_chat_messages', 'room_id', 'community_chat_messages.room_id' UNION ALL
  SELECT 'community_chat_messages', 'user_id', 'community_chat_messages.user_id' UNION ALL
  SELECT 'community_chat_messages', 'client_request_id', 'community_chat_messages.client_request_id' UNION ALL
  SELECT 'community_chat_messages', 'reply_to_id', 'community_chat_messages.reply_to_id' UNION ALL
  SELECT 'community_chat_messages', 'content', 'community_chat_messages.content' UNION ALL
  SELECT 'community_chat_messages', 'status', 'community_chat_messages.status' UNION ALL
  SELECT 'community_chat_reads', 'room_id', 'community_chat_reads.room_id' UNION ALL
  SELECT 'community_chat_reads', 'user_id', 'community_chat_reads.user_id' UNION ALL
  SELECT 'community_chat_reads', 'last_read_message_id', 'community_chat_reads.last_read_message_id'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[32] invalid_community_chat_read_default' AS check_name,
  CONCAT(actual.column_name, ' actual=', IFNULL(actual.column_default, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_reads'
  AND actual.column_name='last_read_message_id'
  AND NOT (actual.is_nullable='NO' AND actual.column_default='0');

SELECT '[32] invalid_community_chat_account_id_collation' AS check_name,
  CONCAT(actual.table_name, '.user_id actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name IN ('community_chat_messages', 'community_chat_reads')
  AND actual.column_name='user_id'
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[32] missing_community_chat_text_index' AS check_name,
  CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'community_chat_messages' tn, 'uk_community_chat_message_public' ix UNION ALL
  SELECT 'community_chat_messages', 'uk_community_chat_message_request' UNION ALL
  SELECT 'community_chat_messages', 'idx_community_chat_message_room_status_id' UNION ALL
  SELECT 'community_chat_messages', 'idx_community_chat_message_reply' UNION ALL
  SELECT 'community_chat_messages', 'idx_community_chat_message_user_time' UNION ALL
  SELECT 'community_chat_reads', 'PRIMARY' UNION ALL
  SELECT 'community_chat_reads', 'idx_community_chat_read_user_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 33) 社区客厅邀请制开放前必须具备举报、屏蔽、人工处置与临时禁言底座（期望 0 行）
SELECT '[33] missing_community_chat_governance_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'community_chat_blocks' t UNION ALL
  SELECT 'community_chat_reports' UNION ALL
  SELECT 'community_chat_moderation_actions' UNION ALL
  SELECT 'community_chat_member_sanctions'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.t
WHERE actual.table_name IS NULL;

SELECT '[33] invalid_community_chat_governance_table_shape' AS check_name,
  CONCAT(actual.table_name, ':', actual.engine, ':', actual.table_collation) AS detail
FROM information_schema.tables actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name IN (
    'community_chat_blocks',
    'community_chat_reports',
    'community_chat_moderation_actions',
    'community_chat_member_sanctions'
  )
  AND (actual.engine <> 'InnoDB' OR actual.table_collation <> 'utf8mb4_unicode_ci');

SELECT '[33] missing_community_chat_governance_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'community_chat_blocks' tab, 'id' col, 'community_chat_blocks.id' n UNION ALL
  SELECT 'community_chat_blocks', 'user_id', 'community_chat_blocks.user_id' UNION ALL
  SELECT 'community_chat_blocks', 'blocked_user_id', 'community_chat_blocks.blocked_user_id' UNION ALL
  SELECT 'community_chat_reports', 'id', 'community_chat_reports.id' UNION ALL
  SELECT 'community_chat_reports', 'reporter_id', 'community_chat_reports.reporter_id' UNION ALL
  SELECT 'community_chat_reports', 'message_id', 'community_chat_reports.message_id' UNION ALL
  SELECT 'community_chat_reports', 'reason_code', 'community_chat_reports.reason_code' UNION ALL
  SELECT 'community_chat_reports', 'evidence_snapshot', 'community_chat_reports.evidence_snapshot' UNION ALL
  SELECT 'community_chat_reports', 'status', 'community_chat_reports.status' UNION ALL
  SELECT 'community_chat_moderation_actions', 'report_id', 'community_chat_moderation_actions.report_id' UNION ALL
  SELECT 'community_chat_moderation_actions', 'actor_user_id', 'community_chat_moderation_actions.actor_user_id' UNION ALL
  SELECT 'community_chat_moderation_actions', 'target_user_id', 'community_chat_moderation_actions.target_user_id' UNION ALL
  SELECT 'community_chat_moderation_actions', 'action', 'community_chat_moderation_actions.action' UNION ALL
  SELECT 'community_chat_moderation_actions', 'reason', 'community_chat_moderation_actions.reason' UNION ALL
  SELECT 'community_chat_member_sanctions', 'user_id', 'community_chat_member_sanctions.user_id' UNION ALL
  SELECT 'community_chat_member_sanctions', 'type', 'community_chat_member_sanctions.type' UNION ALL
  SELECT 'community_chat_member_sanctions', 'status', 'community_chat_member_sanctions.status' UNION ALL
  SELECT 'community_chat_member_sanctions', 'expires_at', 'community_chat_member_sanctions.expires_at' UNION ALL
  SELECT 'community_chat_member_sanctions', 'created_by', 'community_chat_member_sanctions.created_by'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[33] invalid_community_chat_governance_json' AS check_name,
  CONCAT(actual.table_name, '.', actual.column_name, ' actual=', actual.data_type) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND (
    (actual.table_name='community_chat_reports' AND actual.column_name='evidence_snapshot')
    OR (actual.table_name='community_chat_moderation_actions' AND actual.column_name='metadata')
  )
  AND actual.data_type <> 'json';

SELECT '[33] invalid_community_chat_governance_account_id_collation' AS check_name,
  CONCAT(actual.table_name, '.', actual.column_name, ' actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name IN (
    'community_chat_blocks',
    'community_chat_reports',
    'community_chat_moderation_actions',
    'community_chat_member_sanctions'
  )
  AND actual.column_name IN (
    'user_id',
    'blocked_user_id',
    'reporter_id',
    'reviewed_by',
    'actor_user_id',
    'target_user_id',
    'created_by',
    'revoked_by'
  )
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[33] missing_community_chat_governance_index' AS check_name,
  CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'community_chat_blocks' tn, 'uk_community_chat_block_pair' ix UNION ALL
  SELECT 'community_chat_blocks', 'idx_community_chat_block_target_time' UNION ALL
  SELECT 'community_chat_reports', 'uk_community_chat_reporter_message' UNION ALL
  SELECT 'community_chat_reports', 'idx_community_chat_report_status_time' UNION ALL
  SELECT 'community_chat_reports', 'idx_community_chat_report_message_time' UNION ALL
  SELECT 'community_chat_moderation_actions', 'uk_community_chat_moderation_report' UNION ALL
  SELECT 'community_chat_moderation_actions', 'idx_community_chat_moderation_target_time' UNION ALL
  SELECT 'community_chat_moderation_actions', 'idx_community_chat_moderation_actor_time' UNION ALL
  SELECT 'community_chat_member_sanctions', 'idx_community_chat_sanction_user_status_expiry' UNION ALL
  SELECT 'community_chat_member_sanctions', 'idx_community_chat_sanction_status_expiry'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 34) 社区客厅公开灰度前必须具备可审计、可即时生效的全站只读策略（期望 0 行）
SELECT '[34] missing_community_chat_runtime_policy_table' AS check_name,
  'community_chat_runtime_policy' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema=DATABASE()
    AND table_name='community_chat_runtime_policy'
    AND engine='InnoDB'
    AND table_collation='utf8mb4_unicode_ci'
);

SELECT '[34] missing_community_chat_runtime_policy_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'id' col, 'community_chat_runtime_policy.id' n UNION ALL
  SELECT 'posting_enabled', 'community_chat_runtime_policy.posting_enabled' UNION ALL
  SELECT 'updated_by', 'community_chat_runtime_policy.updated_by' UNION ALL
  SELECT 'update_time', 'community_chat_runtime_policy.update_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_runtime_policy'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[34] invalid_community_chat_runtime_policy_default' AS check_name,
  CONCAT('posting_enabled actual=', IFNULL(actual.column_default, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_runtime_policy'
  AND actual.column_name='posting_enabled'
  AND NOT (actual.is_nullable='NO' AND actual.column_default='1');

SELECT '[34] invalid_community_chat_runtime_policy_account_id_collation' AS check_name,
  CONCAT('updated_by actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_runtime_policy'
  AND actual.column_name='updated_by'
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

-- 35) 后台高风险操作必须具备追加式审计事实表（期望 0 行）
SELECT '[35] missing_admin_operation_audit_table' AS check_name, 'admin_operation_audit' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema=DATABASE()
    AND table_name='admin_operation_audit'
    AND engine='InnoDB'
    AND table_collation='utf8mb4_unicode_ci'
);

SELECT '[35] missing_admin_operation_audit_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'id' col, 'admin_operation_audit.id' n UNION ALL
  SELECT 'actor_user_id', 'admin_operation_audit.actor_user_id' UNION ALL
  SELECT 'action', 'admin_operation_audit.action' UNION ALL
  SELECT 'target_type', 'admin_operation_audit.target_type' UNION ALL
  SELECT 'target_id', 'admin_operation_audit.target_id' UNION ALL
  SELECT 'outcome', 'admin_operation_audit.outcome' UNION ALL
  SELECT 'reason', 'admin_operation_audit.reason' UNION ALL
  SELECT 'request_id', 'admin_operation_audit.request_id' UNION ALL
  SELECT 'ip_masked', 'admin_operation_audit.ip_masked' UNION ALL
  SELECT 'metadata', 'admin_operation_audit.metadata' UNION ALL
  SELECT 'create_time', 'admin_operation_audit.create_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='admin_operation_audit'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[35] invalid_admin_operation_actor_collation' AS check_name,
  CONCAT('actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='admin_operation_audit'
  AND actual.column_name='actor_user_id'
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[35] missing_admin_operation_audit_index' AS check_name,
  CONCAT('admin_operation_audit.', expected.ix) AS detail
FROM (
  SELECT 'idx_admin_operation_actor_time' ix UNION ALL
  SELECT 'idx_admin_operation_action_time' UNION ALL
  SELECT 'idx_admin_operation_target_time' UNION ALL
  SELECT 'idx_admin_operation_outcome_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='admin_operation_audit'
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 36) AI 反馈必须有独立管理员处理状态，不能复用用户侧 resolved 语义（期望 0 行）
SELECT '[36] missing_admin_ai_feedback_triage_table' AS check_name, 'admin_ai_feedback_triage' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema=DATABASE()
    AND table_name='admin_ai_feedback_triage'
    AND engine='InnoDB'
    AND table_collation='utf8mb4_unicode_ci'
);

SELECT '[36] missing_admin_ai_feedback_triage_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'feedback_id' col, 'admin_ai_feedback_triage.feedback_id' n UNION ALL
  SELECT 'status', 'admin_ai_feedback_triage.status' UNION ALL
  SELECT 'priority', 'admin_ai_feedback_triage.priority' UNION ALL
  SELECT 'note', 'admin_ai_feedback_triage.note' UNION ALL
  SELECT 'updated_by', 'admin_ai_feedback_triage.updated_by' UNION ALL
  SELECT 'create_time', 'admin_ai_feedback_triage.create_time' UNION ALL
  SELECT 'update_time', 'admin_ai_feedback_triage.update_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='admin_ai_feedback_triage'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[36] missing_admin_ai_feedback_triage_index' AS check_name,
  CONCAT('admin_ai_feedback_triage.', expected.ix) AS detail
FROM (
  SELECT 'idx_admin_ai_feedback_triage_status_time' ix UNION ALL
  SELECT 'idx_admin_ai_feedback_triage_priority_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='admin_ai_feedback_triage'
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 37) API 日志需要请求 ID 与耗时，才能从反馈追到服务端调用（期望 0 行）
SELECT '[37] missing_api_log_trace_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'request_id' col, 'api_logs.request_id' n UNION ALL
  SELECT 'duration_ms', 'api_logs.duration_ms'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='api_logs'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[37] missing_api_log_trace_index' AS check_name, CONCAT('api_logs.', expected.ix) AS detail
FROM (
  SELECT 'idx_api_logs_request_id' ix UNION ALL
  SELECT 'idx_api_logs_status_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='api_logs'
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 38) 产品洞察聚合必须走所有者 + 时间索引，避免后台看板扫描业务主表（期望 0 行）
SELECT '[38] missing_admin_product_insights_index' AS check_name,
  CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'api_logs' tn, 'idx_api_logs_user_time' ix UNION ALL
  SELECT 'conversion_events', 'idx_conversion_user_event_time' UNION ALL
  SELECT 'bookmark', 'idx_bookmark_owner_create' UNION ALL
  SELECT 'files', 'idx_files_owner_create' UNION ALL
  SELECT 'ai_product_events', 'idx_ai_product_subject_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 39) 聊天室提及关系必须持久化，通知范围不能依赖正文解析（期望 0 行）
SELECT '[39] missing_community_chat_mention_table' AS check_name,
  'community_chat_message_mentions' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema=DATABASE()
    AND table_name='community_chat_message_mentions'
    AND engine='InnoDB'
    AND table_collation='utf8mb4_unicode_ci'
);

SELECT '[39] missing_community_chat_mention_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'message_id' col, 'community_chat_message_mentions.message_id' n UNION ALL
  SELECT 'mentioned_user_id', 'community_chat_message_mentions.mentioned_user_id' UNION ALL
  SELECT 'create_time', 'community_chat_message_mentions.create_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_message_mentions'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[39] invalid_community_chat_mention_account_id_collation' AS check_name,
  CONCAT('mentioned_user_id actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_message_mentions'
  AND actual.column_name='mentioned_user_id'
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[39] missing_community_chat_mention_index' AS check_name,
  CONCAT('community_chat_message_mentions.', expected.ix) AS detail
FROM (
  SELECT 'PRIMARY' ix UNION ALL
  SELECT 'idx_community_chat_mention_user_message'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_message_mentions'
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 40) 聊天图片必须具备私有对象映射、归属、状态和过期回收索引（期望 0 行）
SELECT '[40] missing_community_chat_image_table' AS check_name,
  'community_chat_message_images' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema=DATABASE()
    AND table_name='community_chat_message_images'
    AND engine='InnoDB'
    AND table_collation='utf8mb4_unicode_ci'
);

SELECT '[40] missing_community_chat_image_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'id' col, 'community_chat_message_images.id' n UNION ALL
  SELECT 'public_id', 'community_chat_message_images.public_id' UNION ALL
  SELECT 'owner_user_id', 'community_chat_message_images.owner_user_id' UNION ALL
  SELECT 'message_id', 'community_chat_message_images.message_id' UNION ALL
  SELECT 'object_key', 'community_chat_message_images.object_key' UNION ALL
  SELECT 'content_type', 'community_chat_message_images.content_type' UNION ALL
  SELECT 'file_size', 'community_chat_message_images.file_size' UNION ALL
  SELECT 'width', 'community_chat_message_images.width' UNION ALL
  SELECT 'height', 'community_chat_message_images.height' UNION ALL
  SELECT 'status', 'community_chat_message_images.status' UNION ALL
  SELECT 'sort_order', 'community_chat_message_images.sort_order' UNION ALL
  SELECT 'expires_at', 'community_chat_message_images.expires_at' UNION ALL
  SELECT 'create_time', 'community_chat_message_images.create_time' UNION ALL
  SELECT 'update_time', 'community_chat_message_images.update_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_message_images'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[40] invalid_community_chat_image_account_id_collation' AS check_name,
  CONCAT('owner_user_id actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_message_images'
  AND actual.column_name='owner_user_id'
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[40] invalid_community_chat_image_defaults' AS check_name,
  CONCAT(actual.column_name, ' actual=', IFNULL(actual.column_default, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_message_images'
  AND (
    (actual.column_name='status' AND NOT (actual.is_nullable='NO' AND actual.column_default='uploading'))
    OR (actual.column_name='sort_order' AND NOT (actual.is_nullable='NO' AND actual.column_default='0'))
  );

SELECT '[40] missing_community_chat_image_index' AS check_name,
  CONCAT('community_chat_message_images.', expected.ix) AS detail
FROM (
  SELECT 'PRIMARY' ix UNION ALL
  SELECT 'uk_community_chat_image_public' UNION ALL
  SELECT 'uk_community_chat_image_object' UNION ALL
  SELECT 'idx_community_chat_image_owner_status_expiry' UNION ALL
  SELECT 'idx_community_chat_image_message_status_sort'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_message_images'
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 41) 聊天消息互动必须具备点赞、个人删除关系与原文保留式撤回字段（期望 0 行）
SELECT '[41] missing_community_chat_interaction_table' AS check_name,
  expected.table_name AS detail
FROM (
  SELECT 'community_chat_message_likes' table_name UNION ALL
  SELECT 'community_chat_message_deletions'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.table_name
 AND actual.engine='InnoDB'
 AND actual.table_collation='utf8mb4_unicode_ci'
WHERE actual.table_name IS NULL;

SELECT '[41] invalid_community_chat_interaction_table' AS check_name,
  CONCAT(actual.table_name, ' actual=', IFNULL(actual.engine, 'NULL'), '/', IFNULL(actual.table_collation, 'NULL')) AS detail
FROM information_schema.tables actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name IN ('community_chat_message_likes', 'community_chat_message_deletions')
  AND (actual.engine <> 'InnoDB' OR actual.table_collation <> 'utf8mb4_unicode_ci');

SELECT '[41] missing_community_chat_recall_column' AS check_name,
  CONCAT('community_chat_messages.', expected.col) AS detail
FROM (
  SELECT 'recalled_at' col UNION ALL
  SELECT 'recalled_by'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_messages'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[41] invalid_community_chat_recalled_by_collation' AS check_name,
  CONCAT('recalled_by actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_messages'
  AND actual.column_name='recalled_by'
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[41] missing_community_chat_like_column' AS check_name,
  CONCAT('community_chat_message_likes.', expected.col) AS detail
FROM (
  SELECT 'message_id' col UNION ALL
  SELECT 'user_id' UNION ALL
  SELECT 'create_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_message_likes'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[41] invalid_community_chat_like_user_collation' AS check_name,
  CONCAT('user_id actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_message_likes'
  AND actual.column_name='user_id'
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[41] missing_community_chat_like_index' AS check_name,
  CONCAT('community_chat_message_likes.', expected.ix) AS detail
FROM (
  SELECT 'PRIMARY' ix UNION ALL
  SELECT 'idx_community_chat_like_user_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_message_likes'
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

SELECT '[41] missing_community_chat_deletion_column' AS check_name,
  CONCAT('community_chat_message_deletions.', expected.col) AS detail
FROM (
  SELECT 'message_id' col UNION ALL
  SELECT 'user_id' UNION ALL
  SELECT 'create_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_message_deletions'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[41] invalid_community_chat_deletion_user_collation' AS check_name,
  CONCAT('user_id actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_message_deletions'
  AND actual.column_name='user_id'
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[41] missing_community_chat_deletion_index' AS check_name,
  CONCAT('community_chat_message_deletions.', expected.ix) AS detail
FROM (
  SELECT 'PRIMARY' ix UNION ALL
  SELECT 'idx_community_chat_deletion_user_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_message_deletions'
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 42) 统一资源治理必须持久化扫描、候选、任务明细与最小审计（期望 0 行）
SELECT '[42] missing_resource_governance_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'resource_governance_scans' t UNION ALL
  SELECT 'resource_governance_findings' UNION ALL
  SELECT 'resource_cleanup_jobs' UNION ALL
  SELECT 'resource_cleanup_job_items' UNION ALL
  SELECT 'resource_governance_audit'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.t
WHERE actual.table_name IS NULL;

SELECT '[42] missing_resource_governance_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'resource_governance_scans' tab, 'scope_json' col, 'resource_governance_scans.scope_json' n UNION ALL
  SELECT 'resource_governance_scans', 'lease_expires_at', 'resource_governance_scans.lease_expires_at' UNION ALL
  SELECT 'resource_governance_findings', 'fingerprint', 'resource_governance_findings.fingerprint' UNION ALL
  SELECT 'resource_governance_findings', 'target_locator', 'resource_governance_findings.target_locator' UNION ALL
  SELECT 'resource_governance_findings', 'evidence_json', 'resource_governance_findings.evidence_json' UNION ALL
  SELECT 'resource_governance_findings', 'observation_count', 'resource_governance_findings.observation_count' UNION ALL
  SELECT 'resource_cleanup_jobs', 'confirmation_digest', 'resource_cleanup_jobs.confirmation_digest' UNION ALL
  SELECT 'resource_cleanup_job_items', 'precondition_hash', 'resource_cleanup_job_items.precondition_hash' UNION ALL
  SELECT 'resource_governance_audit', 'summary_json', 'resource_governance_audit.summary_json'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[42] missing_resource_governance_index' AS check_name, CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'resource_governance_scans' tn, 'idx_resource_governance_scans_status' ix UNION ALL
  SELECT 'resource_governance_findings', 'uk_resource_governance_finding_fingerprint' UNION ALL
  SELECT 'resource_governance_findings', 'idx_resource_governance_findings_list' UNION ALL
  SELECT 'resource_cleanup_jobs', 'idx_resource_cleanup_jobs_status' UNION ALL
  SELECT 'resource_cleanup_job_items', 'idx_resource_cleanup_job_items_claim' UNION ALL
  SELECT 'resource_governance_audit', 'idx_resource_governance_audit_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 43) 社区名片扩展必须具备隐私设置、精选成就与乐观并发版本（期望 0 行）
SELECT '[43] missing_community_chat_profile_table' AS check_name,
  'community_chat_member_profiles' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema=DATABASE()
    AND table_name='community_chat_member_profiles'
    AND engine='InnoDB'
    AND table_collation='utf8mb4_unicode_ci'
);

SELECT '[43] missing_community_chat_profile_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'user_id' col, 'community_chat_member_profiles.user_id' n UNION ALL
  SELECT 'bio', 'community_chat_member_profiles.bio' UNION ALL
  SELECT 'show_community_tenure', 'community_chat_member_profiles.show_community_tenure' UNION ALL
  SELECT 'featured_achievements', 'community_chat_member_profiles.featured_achievements' UNION ALL
  SELECT 'revision', 'community_chat_member_profiles.revision' UNION ALL
  SELECT 'create_time', 'community_chat_member_profiles.create_time' UNION ALL
  SELECT 'update_time', 'community_chat_member_profiles.update_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_member_profiles'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[43] invalid_community_chat_profile_account_id_collation' AS check_name,
  CONCAT('user_id actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_member_profiles'
  AND actual.column_name='user_id'
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[43] invalid_community_chat_profile_defaults' AS check_name,
  CONCAT(actual.column_name, ' actual=', IFNULL(actual.column_default, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_member_profiles'
  AND (
    (actual.column_name='bio' AND NOT (actual.is_nullable='NO' AND actual.column_default=''))
    OR (actual.column_name='show_community_tenure' AND NOT (actual.is_nullable='NO' AND actual.column_default='1'))
    OR (actual.column_name='revision' AND NOT (actual.is_nullable='NO' AND actual.column_default='1'))
  );

SELECT '[43] missing_community_chat_profile_primary_key' AS check_name,
  'community_chat_member_profiles.PRIMARY' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.statistics
  WHERE table_schema=DATABASE()
    AND table_name='community_chat_member_profiles'
    AND index_name='PRIMARY'
    AND column_name='user_id'
);

-- 44) 后台通知与知识库归档必须保留业务事实，同时从当前工作列表隐藏（期望 0 行）
SELECT '[44] missing_admin_governance_archive_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'notification' tab, 'admin_archived' col, 'notification.admin_archived' n UNION ALL
  SELECT 'knowledge_base', 'admin_archived', 'knowledge_base.admin_archived'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[44] invalid_admin_governance_archive_default' AS check_name,
  CONCAT(actual.table_name, '.', actual.column_name, ' actual=', IFNULL(actual.column_default, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.column_name='admin_archived'
  AND actual.table_name IN ('notification', 'knowledge_base')
  AND NOT (actual.is_nullable='NO' AND actual.column_default='0');

SELECT '[44] missing_admin_governance_archive_index' AS check_name,
  CONCAT(expected.tab, '.', expected.ix) AS detail
FROM (
  SELECT 'notification' tab, 'idx_notification_admin_history' ix UNION ALL
  SELECT 'knowledge_base', 'idx_knowledge_admin_archive'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 46) 成长中心 V2 的永久状态、偏好与回顾状态必须独立存在（期望 0 行）
SELECT '[46] missing_growth_center_v2_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'user_achievements' t UNION ALL
  SELECT 'user_growth_preferences' UNION ALL
  SELECT 'growth_recap_state'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.t
 AND actual.engine='InnoDB'
WHERE actual.table_name IS NULL;

SELECT '[46] missing_growth_center_v2_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'user_achievements' tab, 'unlocked_at' col, 'user_achievements.unlocked_at' n UNION ALL
  SELECT 'user_achievements', 'claimed_at', 'user_achievements.claimed_at' UNION ALL
  SELECT 'user_growth_preferences', 'weekly_active_target', 'user_growth_preferences.weekly_active_target' UNION ALL
  SELECT 'user_growth_preferences', 'low_pressure_mode', 'user_growth_preferences.low_pressure_mode' UNION ALL
  SELECT 'user_growth_preferences', 'timezone', 'user_growth_preferences.timezone' UNION ALL
  SELECT 'user_growth_preferences', 'utc_offset_minutes', 'user_growth_preferences.utc_offset_minutes' UNION ALL
  SELECT 'growth_recap_state', 'snoozed_until', 'growth_recap_state.snoozed_until' UNION ALL
  SELECT 'growth_recap_state', 'dismissed_at', 'growth_recap_state.dismissed_at'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[46] missing_growth_center_v2_index' AS check_name, CONCAT(expected.tab, '.', expected.ix) AS detail
FROM (
  SELECT 'user_achievements' tab, 'PRIMARY' ix UNION ALL
  SELECT 'user_achievements', 'idx_user_achievements_status' UNION ALL
  SELECT 'user_growth_preferences', 'PRIMARY' UNION ALL
  SELECT 'growth_recap_state', 'PRIMARY' UNION ALL
  SELECT 'growth_recap_state', 'idx_growth_recap_available'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 47) 积分经济 C4 的幂等收据、迁移状态与付费保底字段必须存在（期望 0 行）
SELECT '[47] missing_points_economy_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'points_economy_operations' t UNION ALL
  SELECT 'points_economy_migration_state'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema = DATABASE() AND actual.table_name = expected.t AND actual.engine = 'InnoDB'
WHERE actual.table_name IS NULL;

SELECT '[47] missing_points_economy_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'points_economy_operations' tab, 'request_id' col, 'points_economy_operations.request_id' n UNION ALL
  SELECT 'points_economy_operations', 'operation_type', 'points_economy_operations.operation_type' UNION ALL
  SELECT 'points_economy_operations', 'economy_version', 'points_economy_operations.economy_version' UNION ALL
  SELECT 'points_economy_operations', 'operation_hash', 'points_economy_operations.operation_hash' UNION ALL
  SELECT 'points_economy_operations', 'status', 'points_economy_operations.status' UNION ALL
  SELECT 'points_economy_operations', 'result_json', 'points_economy_operations.result_json' UNION ALL
  SELECT 'points_economy_operations', 'item_id', 'points_economy_operations.item_id' UNION ALL
  SELECT 'points_economy_operations', 'cost_points', 'points_economy_operations.cost_points' UNION ALL
  SELECT 'points_economy_operations', 'points_rewarded', 'points_economy_operations.points_rewarded' UNION ALL
  SELECT 'points_economy_operations', 'ai_tokens_granted', 'points_economy_operations.ai_tokens_granted' UNION ALL
  SELECT 'points_economy_operations', 'storage_mb_granted', 'points_economy_operations.storage_mb_granted' UNION ALL
  SELECT 'points_economy_operations', 'makeup_cards_granted', 'points_economy_operations.makeup_cards_granted' UNION ALL
  SELECT 'points_economy_operations', 'draw_count', 'points_economy_operations.draw_count' UNION ALL
  SELECT 'points_economy_operations', 'pity_hits', 'points_economy_operations.pity_hits' UNION ALL
  SELECT 'points_economy_operations', 'replay_count', 'points_economy_operations.replay_count' UNION ALL
  SELECT 'points_economy_operations', 'last_replayed_at', 'points_economy_operations.last_replayed_at' UNION ALL
  SELECT 'user_growth', 'lottery_paid_count', 'user_growth.lottery_paid_count' UNION ALL
  SELECT 'user_growth', 'lottery_paid_pity_progress', 'user_growth.lottery_paid_pity_progress'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema = DATABASE()
 AND actual.table_name = expected.tab
 AND actual.column_name = expected.col
WHERE actual.column_name IS NULL;

SELECT '[47] missing_points_economy_index' AS check_name, CONCAT(expected.tab, '.', expected.ix) AS detail
FROM (
  SELECT 'points_economy_operations' tab, 'uk_points_economy_user_request' ix UNION ALL
  SELECT 'points_economy_operations', 'idx_points_economy_version_time' UNION ALL
  SELECT 'points_economy_operations', 'idx_points_economy_status_time' UNION ALL
  SELECT 'points_economy_operations', 'idx_points_economy_metrics' UNION ALL
  SELECT 'points_economy_operations', 'idx_points_economy_user_status_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema = DATABASE()
 AND actual.table_name = expected.tab
 AND actual.index_name = expected.ix
WHERE actual.index_name IS NULL;

SELECT '[47] missing_points_economy_migration_state' AS check_name,
       'points-economy-c4-paid-pity-v1' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
    FROM points_economy_migration_state
   WHERE migration_key = 'points-economy-c4-paid-pity-v1'
);

-- 48) 社区公开身份、稳定提及与表情消息契约必须完整（期望 0 行）
SELECT '[48] missing_community_chat_identity_table' AS check_name,
  'community_chat_user_identities' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables
   WHERE table_schema=DATABASE()
     AND table_name='community_chat_user_identities'
     AND engine='InnoDB'
);

SELECT '[48] missing_community_chat_identity_column' AS check_name, expected.col AS detail
FROM (
  SELECT 'user_id' col UNION ALL
  SELECT 'public_id' UNION ALL
  SELECT 'community_id' UNION ALL
  SELECT 'create_time' UNION ALL
  SELECT 'update_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_user_identities'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[48] invalid_community_chat_identity_collation' AS check_name,
  CONCAT(actual.column_name, ' actual=', IFNULL(actual.character_set_name, 'NULL'), '/', IFNULL(actual.collation_name, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='community_chat_user_identities'
  AND (
    (actual.column_name='user_id' AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci'))
    OR (actual.column_name='public_id' AND (actual.character_set_name <> 'ascii' OR actual.collation_name <> 'ascii_bin'))
    OR (actual.column_name='community_id' AND (actual.character_set_name <> 'ascii' OR actual.collation_name <> 'ascii_general_ci'))
  );

SELECT '[48] missing_community_chat_identity_index' AS check_name, expected.ix AS detail
FROM (
  SELECT 'PRIMARY' ix UNION ALL
  SELECT 'uk_community_chat_identity_public' UNION ALL
  SELECT 'uk_community_chat_identity_community'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_user_identities'
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

SELECT '[48] missing_community_chat_message_contract_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'community_chat_messages' tab, 'payload_fingerprint' col, 'community_chat_messages.payload_fingerprint' n UNION ALL
  SELECT 'community_chat_messages', 'message_kind', 'community_chat_messages.message_kind' UNION ALL
  SELECT 'community_chat_messages', 'sticker_source', 'community_chat_messages.sticker_source' UNION ALL
  SELECT 'community_chat_messages', 'sticker_key', 'community_chat_messages.sticker_key' UNION ALL
  SELECT 'community_chat_messages', 'mention_everyone', 'community_chat_messages.mention_everyone' UNION ALL
  SELECT 'community_chat_message_mentions', 'sort_order', 'community_chat_message_mentions.sort_order' UNION ALL
  SELECT 'community_chat_message_mentions', 'display_name_snapshot', 'community_chat_message_mentions.display_name_snapshot' UNION ALL
  SELECT 'community_chat_message_mentions', 'community_id_snapshot', 'community_chat_message_mentions.community_id_snapshot'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tab
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[48] invalid_community_chat_message_contract_default' AS check_name,
  CONCAT(actual.table_name, '.', actual.column_name, ' actual=', IFNULL(actual.column_default, 'NULL')) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND (
    (actual.table_name='community_chat_messages' AND actual.column_name='message_kind'
      AND NOT (actual.is_nullable='NO' AND actual.column_default='text'))
    OR (actual.table_name='community_chat_messages' AND actual.column_name='mention_everyone'
      AND NOT (actual.is_nullable='NO' AND actual.column_default='0'))
    OR (actual.table_name='community_chat_message_mentions' AND actual.column_name='sort_order'
      AND NOT (actual.is_nullable='NO' AND actual.column_default='0'))
    OR (actual.table_name='community_chat_message_mentions' AND actual.column_name IN ('display_name_snapshot', 'community_id_snapshot')
      AND NOT (actual.is_nullable='NO' AND actual.column_default=''))
  );

SELECT '[48] missing_community_chat_custom_sticker_table' AS check_name,
  'community_chat_custom_stickers' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables
   WHERE table_schema=DATABASE()
     AND table_name='community_chat_custom_stickers'
     AND engine='InnoDB'
);

SELECT '[48] missing_community_chat_custom_sticker_column' AS check_name, expected.col AS detail
FROM (
  SELECT 'public_id' col UNION ALL
  SELECT 'user_id' UNION ALL
  SELECT 'object_key' UNION ALL
  SELECT 'content_sha256' UNION ALL
  SELECT 'content_type' UNION ALL
  SELECT 'file_size' UNION ALL
  SELECT 'width' UNION ALL
  SELECT 'height' UNION ALL
  SELECT 'name' UNION ALL
  SELECT 'status' UNION ALL
  SELECT 'sort_order' UNION ALL
  SELECT 'create_time' UNION ALL
  SELECT 'update_time'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_custom_stickers'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[48] missing_community_chat_custom_sticker_index' AS check_name, expected.ix AS detail
FROM (
  SELECT 'uk_community_chat_custom_sticker_public' ix UNION ALL
  SELECT 'uk_community_chat_custom_sticker_content' UNION ALL
  SELECT 'idx_community_chat_custom_sticker_owner_status' UNION ALL
  SELECT 'idx_community_chat_custom_sticker_status_time'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='community_chat_custom_stickers'
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 48) 爱发电接入必须具备唯一订单账本、一次性下单凭证与唯一账号关联（期望 0 行）
SELECT '[48] missing_afdian_support_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'support_checkout_intents' t UNION ALL
  SELECT 'support_account_links' UNION ALL
  SELECT 'support_orders' UNION ALL
  SELECT 'support_public_preferences'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.t
 AND actual.engine='InnoDB'
 AND actual.table_collation='utf8mb4_unicode_ci'
WHERE actual.table_name IS NULL;

SELECT '[48] invalid_afdian_account_id_collation' AS check_name,
  CONCAT(actual.table_name, '.', actual.column_name, ' actual=', actual.character_set_name, '/', actual.collation_name) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND (
    (actual.table_name='support_checkout_intents' AND actual.column_name='user_id') OR
    (actual.table_name='support_account_links' AND actual.column_name='user_id') OR
    (actual.table_name='support_orders' AND actual.column_name='light_note_user_id') OR
    (actual.table_name='support_public_preferences' AND actual.column_name IN ('user_id', 'admin_hidden_by'))
  )
  AND (actual.character_set_name <> 'utf8' OR actual.collation_name <> 'utf8_general_ci');

SELECT '[48] missing_afdian_support_index' AS check_name, CONCAT(expected.tn, '.', expected.ix) AS detail
FROM (
  SELECT 'support_checkout_intents' tn, 'uk_support_checkout_token' ix UNION ALL
  SELECT 'support_account_links', 'uk_support_link_user' UNION ALL
  SELECT 'support_account_links', 'uk_support_link_provider_user' UNION ALL
  SELECT 'support_account_links', 'uk_support_link_provider_private' UNION ALL
  SELECT 'support_orders', 'uk_support_order_provider' UNION ALL
  SELECT 'support_orders', 'idx_support_order_user_status' UNION ALL
  SELECT 'support_orders', 'idx_support_order_retry' UNION ALL
  SELECT 'support_orders', 'idx_support_order_ranking' UNION ALL
  SELECT 'support_public_preferences', 'uk_support_public_id' UNION ALL
  SELECT 'support_public_preferences', 'idx_support_public_visibility'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

-- 49) 积分获取 C5：版本锁、幂等发放、对账基线、Campaign 与迁移标记必须完整（期望 0 行）
SELECT '[49] missing_points_earning_c5_table' AS check_name, expected.t AS detail
FROM (
  SELECT 'points_earning_period_policy' t UNION ALL
  SELECT 'points_grant_operations' UNION ALL
  SELECT 'points_ledger_baselines' UNION ALL
  SELECT 'points_campaigns' UNION ALL
  SELECT 'points_campaign_recipients'
) expected
LEFT JOIN information_schema.tables actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.t AND actual.engine='InnoDB'
WHERE actual.table_name IS NULL;

SELECT '[49] missing_points_earning_c5_column' AS check_name, expected.n AS detail
FROM (
  SELECT 'points_log' tab, 'policy_version' col, 'points_log.policy_version' n UNION ALL
  SELECT 'points_log', 'meta', 'points_log.meta' UNION ALL
  SELECT 'user_achievements', 'reward_points_snapshot', 'user_achievements.reward_points_snapshot' UNION ALL
  SELECT 'user_achievements', 'reward_frame_id_snapshot', 'user_achievements.reward_frame_id_snapshot' UNION ALL
  SELECT 'user_achievements', 'policy_version', 'user_achievements.policy_version' UNION ALL
  SELECT 'user_growth_preferences', 'points_goal_item_id', 'user_growth_preferences.points_goal_item_id' UNION ALL
  SELECT 'user_growth_preferences', 'points_goal_enabled', 'user_growth_preferences.points_goal_enabled' UNION ALL
  SELECT 'points_grant_operations', 'operation_hash', 'points_grant_operations.operation_hash' UNION ALL
  SELECT 'points_grant_operations', 'result_json', 'points_grant_operations.result_json' UNION ALL
  SELECT 'points_ledger_baselines', 'baseline_delta', 'points_ledger_baselines.baseline_delta' UNION ALL
  SELECT 'points_campaigns', 'audience_json', 'points_campaigns.audience_json' UNION ALL
  SELECT 'points_campaigns', 'create_request_id', 'points_campaigns.create_request_id' UNION ALL
  SELECT 'points_campaigns', 'create_payload_hash', 'points_campaigns.create_payload_hash' UNION ALL
  SELECT 'points_campaigns', 'confirmed_at', 'points_campaigns.confirmed_at' UNION ALL
  SELECT 'points_campaign_recipients', 'lease_until', 'points_campaign_recipients.lease_until' UNION ALL
  SELECT 'points_campaign_recipients', 'attempts', 'points_campaign_recipients.attempts'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.tab AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

SELECT '[49] invalid_points_grant_signedness' AS check_name,
  CONCAT(actual.table_name, '.', actual.column_name, ' actual=', actual.column_type) AS detail
FROM information_schema.columns actual
WHERE actual.table_schema=DATABASE()
  AND actual.table_name='points_grant_operations'
  AND actual.column_name='points'
  AND LOWER(actual.column_type) LIKE '%unsigned%';

SELECT '[49] missing_points_earning_c5_index' AS check_name, CONCAT(expected.tab, '.', expected.ix) AS detail
FROM (
  SELECT 'points_log' tab, 'idx_points_log_time_reason' ix UNION ALL
  SELECT 'points_log', 'idx_points_log_user_time' UNION ALL
  SELECT 'points_log', 'idx_points_log_policy_time' UNION ALL
  SELECT 'growth_events', 'idx_growth_events_activity' UNION ALL
  SELECT 'user_growth', 'idx_user_growth_points' UNION ALL
  SELECT 'points_earning_period_policy', 'PRIMARY' UNION ALL
  SELECT 'points_grant_operations', 'uk_points_grant_user_request' UNION ALL
  SELECT 'points_ledger_baselines', 'PRIMARY' UNION ALL
  SELECT 'points_campaigns', 'uk_points_campaign_public' UNION ALL
  SELECT 'points_campaigns', 'uk_points_campaign_create_request' UNION ALL
  SELECT 'points_campaign_recipients', 'uk_points_campaign_request' UNION ALL
  SELECT 'points_campaign_recipients', 'idx_points_campaign_recipient_work'
) expected
LEFT JOIN information_schema.statistics actual
  ON actual.table_schema=DATABASE() AND actual.table_name=expected.tab AND actual.index_name=expected.ix
WHERE actual.index_name IS NULL;

SELECT '[49] missing_points_earning_c5_migration_state' AS check_name, expected.migration_key AS detail
FROM (
  SELECT 'points-earning-c5-achievement-snapshots-v1' migration_key UNION ALL
  SELECT 'points-earning-c5-meaningful-activity-v1' UNION ALL
  SELECT 'points-earning-c5-baseline-v1'
) expected
LEFT JOIN points_economy_migration_state actual ON actual.migration_key=expected.migration_key
WHERE actual.migration_key IS NULL;

SELECT '[48] missing_afdian_support_management_column' AS check_name,
  CONCAT(expected.tn, '.', expected.col) AS detail
FROM (
  SELECT 'support_account_links' tn, 'provider_name' col UNION ALL
  SELECT 'support_account_links', 'provider_avatar_url' UNION ALL
  SELECT 'support_account_links', 'identity_refreshed_at' UNION ALL
  SELECT 'support_orders', 'ranking_observed_at' UNION ALL
  SELECT 'support_public_preferences', 'participate_in_ranking' UNION ALL
  SELECT 'support_public_preferences', 'show_identity' UNION ALL
  SELECT 'support_public_preferences', 'admin_hidden'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name=expected.tn
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL;

-- 50) Agent Turn Contract V2 shadow trace 必须可持久化（期望 0 行）
SELECT '[50] missing_agent_turn_contract_trace_column' AS check_name,
  'agent_logs.turn_contract_trace' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.columns actual
  WHERE actual.table_schema=DATABASE()
    AND actual.table_name='agent_logs'
    AND actual.column_name='turn_contract_trace'
);

-- 51) API 日志文本必须支持 emoji，保留期清理必须按时间索引取数（期望 0 行）
SELECT '[51] invalid_api_log_text_charset' AS check_name,
  CONCAT('api_logs.', expected.col, ' charset=', COALESCE(actual.character_set_name, 'missing')) AS detail
FROM (
  SELECT 'url' col UNION ALL
  SELECT 'req' UNION ALL
  SELECT 'system'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='api_logs'
 AND actual.column_name=expected.col
WHERE actual.column_name IS NULL OR actual.character_set_name <> 'utf8mb4';

SELECT '[51] missing_api_log_retention_index' AS check_name,
  'api_logs.idx_api_logs_retention' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.statistics actual
  WHERE actual.table_schema=DATABASE()
    AND actual.table_name='api_logs'
    AND actual.index_name='idx_api_logs_retention'
);

-- 52) 云空间目录树必须具备父级列、查询索引和有效的同账号层级关系（期望 0 行）
SELECT '[52] missing_cloud_folder_parent_column' AS check_name, 'folders.parent_id' AS detail
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns actual
  WHERE actual.table_schema=DATABASE()
    AND actual.table_name='folders'
    AND actual.column_name='parent_id'
    AND LOWER(actual.column_type)='int(11)'
    AND actual.is_nullable='YES'
);

SELECT '[52] invalid_cloud_folder_tree_index' AS check_name,
  CONCAT('idx_folders_owner_parent_order 实际=', IFNULL(actual.cols, '缺失')) AS detail
FROM (SELECT 1) expected
LEFT JOIN (
  SELECT GROUP_CONCAT(
    CONCAT(column_name, IF(sub_part IS NULL, '', CONCAT('(', sub_part, ')')))
    ORDER BY seq_in_index SEPARATOR ','
  ) AS cols
  FROM information_schema.statistics
  WHERE table_schema=DATABASE()
    AND table_name='folders'
    AND index_name='idx_folders_owner_parent_order'
) actual ON 1=1
WHERE actual.cols IS NULL OR actual.cols <> 'create_by(64),parent_id,del_flag,sort,create_time,id';

SELECT '[52] invalid_cloud_folder_parent' AS check_name,
  CONCAT(child.id, '->', child.parent_id) AS detail
FROM folders child
LEFT JOIN folders parent ON parent.id=child.parent_id
WHERE child.del_flag=0
  AND child.parent_id IS NOT NULL
  AND (
    child.id=child.parent_id
    OR parent.id IS NULL
    OR parent.del_flag<>0
    OR NOT (parent.create_by <=> child.create_by)
  );

-- 从当前节点连续追溯 8 个父级仍未到顶，说明深度至少为 9；循环关系也会被同一查询捕获。
SELECT '[52] cloud_folder_depth_or_cycle_exceeded' AS check_name, CAST(f0.id AS CHAR) AS detail
FROM folders f0
JOIN folders f1 ON f1.id=f0.parent_id AND f1.create_by <=> f0.create_by AND f1.del_flag=0
JOIN folders f2 ON f2.id=f1.parent_id AND f2.create_by <=> f0.create_by AND f2.del_flag=0
JOIN folders f3 ON f3.id=f2.parent_id AND f3.create_by <=> f0.create_by AND f3.del_flag=0
JOIN folders f4 ON f4.id=f3.parent_id AND f4.create_by <=> f0.create_by AND f4.del_flag=0
JOIN folders f5 ON f5.id=f4.parent_id AND f5.create_by <=> f0.create_by AND f5.del_flag=0
JOIN folders f6 ON f6.id=f5.parent_id AND f6.create_by <=> f0.create_by AND f6.del_flag=0
JOIN folders f7 ON f7.id=f6.parent_id AND f7.create_by <=> f0.create_by AND f7.del_flag=0
JOIN folders f8 ON f8.id=f7.parent_id AND f8.create_by <=> f0.create_by AND f8.del_flag=0
WHERE f0.del_flag=0;

-- 53) 后台总览趋势与最近新增必须按状态、创建时间命中复合索引（期望 0 行）
SELECT '[53] invalid_admin_overview_index' AS check_name,
  CONCAT(expected.tab, '.', expected.ix, ' 实际=', IFNULL(actual.cols, '缺失')) AS detail
FROM (
  SELECT 'note' tab, 'idx_note_admin_created' ix, 'del_flag(8),create_time,create_by(64)' expected_cols UNION ALL
  SELECT 'todo_items', 'idx_todo_admin_created', 'del_flag,create_time,user_id(64)'
) expected
LEFT JOIN (
  SELECT table_name, index_name,
    GROUP_CONCAT(
      CONCAT(column_name, IF(sub_part IS NULL, '', CONCAT('(', sub_part, ')')))
      ORDER BY seq_in_index SEPARATOR ','
    ) AS cols
  FROM information_schema.statistics
  WHERE table_schema=DATABASE()
    AND (
      (table_name='note' AND index_name='idx_note_admin_created') OR
      (table_name='todo_items' AND index_name='idx_todo_admin_created')
    )
  GROUP BY table_name, index_name
) actual ON actual.table_name=expected.tab AND actual.index_name=expected.ix
WHERE actual.cols IS NULL OR actual.cols <> expected.expected_cols;

-- 54) 用户 AI 用量明细必须按实际支付者与创建时间命中复合索引（期望 0 行）
SELECT '[54] invalid_ai_execution_actor_index' AS check_name,
  CONCAT('idx_ai_execution_actor_created 实际=', IFNULL(actual.cols, '缺失')) AS detail
FROM (SELECT 1) expected
LEFT JOIN (
  SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS cols
  FROM information_schema.statistics
  WHERE table_schema=DATABASE()
    AND table_name='ai_executions'
    AND index_name='idx_ai_execution_actor_created'
) actual ON 1=1
WHERE actual.cols IS NULL OR actual.cols <> 'actor_user_id,created_at';

-- 55) Provider Span 调用详情必须具备顺序、计费归属、修复触发码和保守预算（期望 0 行）
SELECT '[55] missing_ai_provider_span_explainability_column' AS check_name,
  CONCAT('ai_provider_spans.', expected.column_name, ' 缺失') AS detail
FROM (
  SELECT 'billing_scope' AS column_name UNION ALL
  SELECT 'sequence_no' UNION ALL
  SELECT 'trigger_code' UNION ALL
  SELECT 'estimated_tokens'
) expected
LEFT JOIN information_schema.columns actual
  ON actual.table_schema=DATABASE()
 AND actual.table_name='ai_provider_spans'
 AND actual.column_name=expected.column_name
WHERE actual.column_name IS NULL;
