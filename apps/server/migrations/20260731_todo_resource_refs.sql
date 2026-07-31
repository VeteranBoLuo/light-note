-- 2026-07-31 待办参考资料关联（MySQL 5.7，可重复执行）
--
-- 待办说明保持纯文本，`@` 只负责触发选择，选中结果落到本表成为结构化关系，
-- 便于权限校验、批量 hydration、重复任务复制与后续项目空间复用。
--
-- 设计说明：
-- - target_id 指向多态资源（书签/笔记/文件），因此不建跨表外键；归属由服务层校验。
-- - target_name_snapshot 用于目标被删除后仍能给出可理解的展示，读取时仍按权限实时解析真实标题。
-- - todo_id 对 todo_items 建外键并级联删除：待办被物理删除时关系自动清理。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS todo_resource_refs (
  todo_id               CHAR(36)     NOT NULL COMMENT '所属待办',
  user_id               VARCHAR(255) NOT NULL COMMENT '归属用户，所有读写先按主体过滤',
  target_type           VARCHAR(16)  NOT NULL COMMENT 'bookmark/note/file',
  target_id             VARCHAR(255) NOT NULL COMMENT '目标资源 ID（多态，不建外键）',
  target_name_snapshot  VARCHAR(255) NOT NULL DEFAULT '' COMMENT '选中时的标题快照，目标失效后用于展示',
  sort_order            INT          NOT NULL DEFAULT 0 COMMENT '同一待办内的展示顺序',
  create_time           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (todo_id, target_type, target_id),
  KEY idx_todo_resource_refs_owner_todo (user_id, todo_id, sort_order),
  KEY idx_todo_resource_refs_target (user_id, target_type, target_id),
  CONSTRAINT fk_todo_resource_refs_todo
    FOREIGN KEY (todo_id) REFERENCES todo_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='待办关联的参考资料';
