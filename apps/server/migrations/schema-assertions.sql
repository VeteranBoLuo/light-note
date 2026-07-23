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
