-- AI 工作区迁移 schema 断言（改编自运行手册 §7）。
-- 约定:每个查询"有输出=失败"。全部无输出 = 全部通过。针对当前连接的库(DATABASE())。

-- 1) 缺失表（期望 0 行）
SELECT '[1] missing_table' AS check_name, expected.t AS detail FROM (
  SELECT 'ai_conversations' t UNION ALL SELECT 'ai_messages' UNION ALL SELECT 'ai_message_sources'
  UNION ALL SELECT 'ai_message_evidence' UNION ALL SELECT 'ai_feedback' UNION ALL SELECT 'ai_content_chunks'
  UNION ALL SELECT 'ai_content_generations' UNION ALL SELECT 'ai_change_sets' UNION ALL SELECT 'ai_change_items'
  UNION ALL SELECT 'ai_memories' UNION ALL SELECT 'ai_response_events'
  UNION ALL SELECT 'ai_product_events' UNION ALL SELECT 'ai_token_reservations'
  UNION ALL SELECT 'ai_evaluation_runs'
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
  SELECT 'ai_content_generations','generation','ai_content_generations.generation'
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
  SELECT 'ai_token_reservations','uk_ai_token_reservation_key'
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

-- 31) 统一资源治理必须持久化扫描、候选、任务明细与最小审计（期望 0 行）
SELECT '[31] missing_resource_governance_table' AS check_name, expected.t AS detail
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

SELECT '[31] missing_resource_governance_column' AS check_name, expected.n AS detail
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

SELECT '[31] missing_resource_governance_index' AS check_name, CONCAT(expected.tn, '.', expected.ix) AS detail
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
