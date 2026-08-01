-- 书签用户内容字段统一为 utf8mb4（MySQL 5.7，可重复执行）。
--
-- 只修改可展示/可编辑的内容字段，保留 id、user_id 的旧字符集，
-- 以维持它们与 user.id 及现有多态关系表的兼容性。
-- utf8mb4_general_ci 延续旧 utf8_general_ci 的比较语义，
-- 同时与当前 mysql2 连接的 utf8mb4_general_ci 保持一致。

SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

SET @bookmark_text_columns_need_utf8mb4 := (
  SELECT COUNT(*)
  FROM (
    SELECT 'name' AS column_name
    UNION ALL SELECT 'description'
    UNION ALL SELECT 'url'
    UNION ALL SELECT 'icon_url'
  ) expected
  LEFT JOIN information_schema.COLUMNS actual
    ON actual.TABLE_SCHEMA = DATABASE()
   AND actual.TABLE_NAME = 'bookmark'
   AND actual.COLUMN_NAME = expected.column_name
  WHERE actual.COLUMN_NAME IS NULL
     OR NOT (actual.CHARACTER_SET_NAME <=> 'utf8mb4')
     OR NOT (actual.COLLATION_NAME <=> 'utf8mb4_general_ci')
);

SET @bookmark_text_columns_ddl := IF(
  @bookmark_text_columns_need_utf8mb4 > 0,
  'ALTER TABLE bookmark
     MODIFY COLUMN name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
     MODIFY COLUMN description VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
     MODIFY COLUMN url VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
     MODIFY COLUMN icon_url LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT ''图标地址''',
  'SELECT 1'
);

PREPARE bookmark_text_columns_stmt FROM @bookmark_text_columns_ddl;
EXECUTE bookmark_text_columns_stmt;
DEALLOCATE PREPARE bookmark_text_columns_stmt;
