-- AI 工作区迁移 schema 断言（改编自运行手册 §7）。
-- 约定:每个查询"有输出=失败"。全部无输出 = 全部通过。针对当前连接的库(DATABASE())。

-- 1) 缺失表（期望 0 行）
SELECT '[1] missing_table' AS check_name, expected.t AS detail FROM (
  SELECT 'ai_conversations' t UNION ALL SELECT 'ai_messages' UNION ALL SELECT 'ai_message_sources'
  UNION ALL SELECT 'ai_message_evidence' UNION ALL SELECT 'ai_feedback' UNION ALL SELECT 'ai_content_chunks'
  UNION ALL SELECT 'ai_content_generations' UNION ALL SELECT 'ai_change_sets' UNION ALL SELECT 'ai_change_items'
  UNION ALL SELECT 'ai_memories' UNION ALL SELECT 'ai_response_events'
  UNION ALL SELECT 'ai_product_events' UNION ALL SELECT 'ai_token_reservations'
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
