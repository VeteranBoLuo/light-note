-- 后台用户私有备注：每位 Root 只读取和维护自己的备注名。
-- MySQL 5.7 兼容；CREATE TABLE IF NOT EXISTS 可重复执行。

CREATE TABLE IF NOT EXISTS `admin_user_remarks` (
  -- ID 列与历史 user.id 的 utf8_general_ci 保持一致，避免 JOIN 时发生字符集比较冲突；
  -- 表默认仍使用 utf8mb4，因此备注正文可以安全保存 emoji。
  `admin_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '备注所属 Root 用户',
  `target_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '被备注用户',
  `remark_name` varchar(80) NOT NULL COMMENT '仅所属 Root 可见的备注名',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_user_id`, `target_user_id`),
  KEY `idx_admin_user_remarks_target` (`target_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Root 私有用户备注';
