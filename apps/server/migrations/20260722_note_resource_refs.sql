-- 笔记内联提及(N0)· 见 docs/plan/execution-handoff-v2.md 第 4 节。
-- 派生关系表:源笔记 → 三类目标资源(bookmark/note/file)的去重集合;由保存时解析正文站内链接同步维护。
-- 纯新建表,幂等(CREATE TABLE IF NOT EXISTS,MySQL 5.7 支持)。属结构迁移,随发布手工执行;本包只写文件,未授权不执行线上 SQL。
-- 落地前应先对本次允许使用的库执行只读 schema 核对(不假设历史库与 tag_db.sql 完全一致)。
-- 字段宽度依据线上事实:note.id / user.id / bookmark.id / files.id 均 VARCHAR(255)。多态 target 不加外键(目标软删后关系保留,恢复后重新可用)。

CREATE TABLE IF NOT EXISTS note_resource_refs (
  source_note_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '源笔记 id(note.id)',
  source_user_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '源笔记归属用户(note.create_by)',
  target_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'bookmark | note | file',
  target_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标资源 id',
  target_name_snapshot VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '插入/更新时的目标名称快照(离线/导出可读,不作权威)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (source_note_id, target_type, target_id),
  KEY idx_note_resource_refs_target (source_user_id, target_type, target_id),
  KEY idx_note_resource_refs_source_user (source_user_id, source_note_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笔记内联提及:源笔记→目标资源的去重引用关系(派生,可重建)';
