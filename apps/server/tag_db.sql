/*
 Navicat Premium Dump SQL

 Source Server         : light-note
 Source Server Type    : MySQL
 Source Server Version : 50743 (5.7.43-log)
 Source Host           : 139.9.83.16:3306
 Source Schema         : tag_db

 Target Server Type    : MySQL
 Target Server Version : 50743 (5.7.43-log)
 File Encoding         : 65001

 Date: 26/05/2026 11:24:13
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for api_logs
-- ----------------------------
DROP TABLE IF EXISTS `api_logs`;
CREATE TABLE `api_logs` (
  `id` varchar(255) NOT NULL,
  `user_id` varchar(255) NOT NULL COMMENT '用户ID',
  `url` varchar(255) DEFAULT NULL COMMENT '调用的接口路径',
  `method` varchar(255) DEFAULT NULL COMMENT '请求方法（如GET, POST等）',
  `req` longtext,
  `ip` varchar(255) NOT NULL COMMENT 'ip地址',
  `system` varchar(255) DEFAULT NULL COMMENT '系统信息',
  `request_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '用户调用接口的时间',
  `del_flag` varchar(255) NOT NULL DEFAULT '0',
  `status_code` varchar(255) DEFAULT NULL COMMENT '状态码',
  `request_id` varchar(64) DEFAULT NULL COMMENT '服务端链路请求 ID',
  `duration_ms` int unsigned DEFAULT NULL COMMENT '服务端处理耗时毫秒',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_api_logs_admin_list` (`del_flag`,`request_time`,`id`),
  KEY `idx_api_logs_request_id` (`request_id`),
  KEY `idx_api_logs_status_time` (`del_flag`,`status_code`,`request_time`,`id`),
  KEY `idx_api_logs_user_time` (`user_id`,`request_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC COMMENT='api日志';

-- ----------------------------
-- Table structure for bookmark
-- ----------------------------
DROP TABLE IF EXISTS `bookmark`;
CREATE TABLE `bookmark` (
  `id` varchar(255) NOT NULL DEFAULT '0',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `del_flag` int(11) DEFAULT '0' COMMENT '1删除 0存在',
  `icon_url` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '图标地址',
  `sort` int(11) NOT NULL DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `fk_bookmark_user_id` (`user_id`),
  KEY `idx_bookmark_owner_create` (`create_time`,`del_flag`,`user_id`),
  CONSTRAINT `fk_bookmark_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC;

-- ----------------------------
-- Table structure for config_json
-- ----------------------------
DROP TABLE IF EXISTS `config_json`;
CREATE TABLE `config_json` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(255) NOT NULL COMMENT '数据名称，唯一标识，如 update_log_2025',
  `json_content` longtext NOT NULL COMMENT 'JSON 格式的内容',
  `del_flag` tinyint(4) DEFAULT '0' COMMENT '删除标记：0-未删除，1-已删除',
  `created_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_name` (`name`),
  KEY `idx_del_flag` (`del_flag`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COMMENT='通用JSON配置数据表';

-- ----------------------------
-- Table structure for update_logs
-- ----------------------------
DROP TABLE IF EXISTS `update_logs`;
CREATE TABLE `update_logs` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `publish_date` date NOT NULL,
  `summary` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `highlights` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'JSON 字符串数组，供列表与工作台摘要使用',
  `tags` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'JSON 字符串数组',
  `content_markdown` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_keys` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '该日志拥有的 OBS object key JSON 数组',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `sort` int(11) NOT NULL DEFAULT '0',
  `created_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_update_logs_public` (`status`, `publish_date`, `sort`),
  KEY `idx_update_logs_updated` (`updated_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='更新日志';

-- ----------------------------
-- Table structure for files
-- ----------------------------
DROP TABLE IF EXISTS `files`;
CREATE TABLE `files` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `create_by` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '上传用户ID',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件原名',
  `file_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件类型（MIME类型）',
  `file_size` bigint(20) NOT NULL COMMENT '文件大小（字节）',
  `directory` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件访问目录',
  `folder_id` int(11) DEFAULT NULL,
  `del_flag` int(1) NOT NULL DEFAULT '0',
  `obs_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `share_token` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '旧版分享令牌（仅迁移兼容，禁止新写入）',
  PRIMARY KEY (`id`),
  KEY `fk_folder_id` (`folder_id`),
  KEY `idx_files_owner_create` (`create_time`,`del_flag`,`create_by`),
  CONSTRAINT `fk_folder_id` FOREIGN KEY (`folder_id`) REFERENCES `folders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=298 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件信息表';

-- ----------------------------
-- Table structure for folders
-- ----------------------------
DROP TABLE IF EXISTS `folders`;
CREATE TABLE `folders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `create_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `del_flag` int(1) NOT NULL DEFAULT '0',
  `sort` int(10) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for file_shares
-- ----------------------------
DROP TABLE IF EXISTS `file_share_events`;
DROP TABLE IF EXISTS `file_shares`;
CREATE TABLE `file_shares` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_id` int(11) NOT NULL,
  `owner_user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `token_hint` varchar(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `description` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `access_code_hash` varchar(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `max_access_count` int(10) unsigned DEFAULT NULL,
  `max_download_count` int(10) unsigned DEFAULT NULL,
  `access_count` int(10) unsigned NOT NULL DEFAULT '0',
  `download_count` int(10) unsigned NOT NULL DEFAULT '0',
  `status` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
  `last_access_at` datetime DEFAULT NULL,
  `last_download_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_shares_token_hash` (`token_hash`),
  KEY `idx_file_shares_owner_status` (`owner_user_id`,`status`,`create_time`),
  KEY `idx_file_shares_file_status` (`file_id`,`status`),
  KEY `idx_file_shares_expiry` (`status`,`expires_at`),
  CONSTRAINT `fk_file_shares_file` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='可撤销文件分享';

CREATE TABLE `file_share_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `share_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_type` varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `outcome` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `visitor_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_file_share_events_share_time` (`share_id`,`create_time`),
  KEY `idx_file_share_events_retention` (`create_time`),
  CONSTRAINT `fk_file_share_events_share` FOREIGN KEY (`share_id`) REFERENCES `file_shares` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件分享隐私化访问事件';

-- ----------------------------
-- Table structure for file_preview_artifacts / file_preview_jobs
-- ----------------------------
DROP TABLE IF EXISTS `file_preview_jobs`;
DROP TABLE IF EXISTS `file_preview_artifacts`;
CREATE TABLE `file_preview_artifacts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `file_id` int(11) NOT NULL,
  `owner_user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `strategy` enum('archive_manifest','converted_pdf') COLLATE utf8mb4_unicode_ci NOT NULL,
  `strategy_version` smallint(5) unsigned NOT NULL,
  `format_id` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_etag` varchar(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_size` bigint(20) unsigned NOT NULL,
  `status` enum('queued','processing','ready','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `artifact_object_key` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `artifact_size` bigint(20) unsigned NOT NULL DEFAULT '0',
  `manifest_json` mediumtext COLLATE utf8mb4_unicode_ci,
  `entry_count` int(10) unsigned NOT NULL DEFAULT '0',
  `total_uncompressed_size` bigint(20) unsigned NOT NULL DEFAULT '0',
  `contains_encrypted` tinyint(1) NOT NULL DEFAULT '0',
  `suspicious_expansion` tinyint(1) NOT NULL DEFAULT '0',
  `error_code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_access_at` datetime DEFAULT NULL,
  `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_preview_artifact` (`file_id`,`strategy`,`strategy_version`),
  KEY `idx_file_preview_owner_status` (`owner_user_id`,`status`,`update_time`),
  KEY `idx_file_preview_cleanup` (`last_access_at`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='云文件派生预览缓存';

CREATE TABLE `file_preview_jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `artifact_id` bigint(20) unsigned NOT NULL,
  `status` enum('queued','processing','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `attempts` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `available_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `locked_at` datetime DEFAULT NULL,
  `locked_by` varchar(96) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `output_object_key` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_preview_job_artifact` (`artifact_id`),
  KEY `idx_file_preview_job_queue` (`status`,`available_at`,`id`),
  CONSTRAINT `fk_file_preview_job_artifact` FOREIGN KEY (`artifact_id`) REFERENCES `file_preview_artifacts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='云文件预览任务队列';

-- ----------------------------
-- Table structure for help_config
-- ----------------------------
DROP TABLE IF EXISTS `help_config`;
CREATE TABLE `help_config` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for help_config_draft
-- ----------------------------
DROP TABLE IF EXISTS `help_config_draft`;
CREATE TABLE `help_config_draft` (
  `id` varchar(128) NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` mediumtext NOT NULL,
  `updated_by` varchar(64) DEFAULT NULL,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `sort` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for note
-- ----------------------------
DROP TABLE IF EXISTS `note`;
CREATE TABLE `note` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `create_by` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `update_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `del_flag` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0',
  `sort` int(11) NOT NULL DEFAULT '0',
  `is_top` tinyint(1) NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'html',
  `revision` bigint(20) unsigned NOT NULL DEFAULT '1' COMMENT '正文/标题乐观并发版本号',
  `parent_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '页面树父笔记 ID，NULL 表示我的知识库根层',
  `tree_delete_batch_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '同一次页面子树软删除的恢复批次',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_note_owner_top_sort` (`create_by`,`del_flag`,`is_top`,`sort`,`update_time`),
  KEY `idx_note_owner` (`create_by`,`del_flag`,`update_time`),
  KEY `idx_note_owner_parent_order` (`create_by`(64),`parent_id`(64),`del_flag`(8),`is_top`,`sort`,`update_time`,`id`(64)),
  KEY `idx_note_parent` (`parent_id`),
  KEY `idx_note_tree_delete_batch` (`create_by`(64),`tree_delete_batch_id`(64),`del_flag`(8))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

-- ----------------------------
-- Table structure for note_shares / note_share_events
-- ----------------------------
DROP TABLE IF EXISTS `note_share_events`;
DROP TABLE IF EXISTS `note_shares`;
CREATE TABLE `note_shares` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `root_note_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scope_type` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `token_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `token_hint` varchar(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `description` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `access_code_hash` varchar(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `max_access_count` int(10) unsigned DEFAULT NULL,
  `access_count` int(10) unsigned NOT NULL DEFAULT '0',
  `status` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
  `last_access_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_note_shares_token_hash` (`token_hash`),
  KEY `idx_note_shares_owner_status` (`owner_user_id`,`status`,`create_time`),
  KEY `idx_note_shares_root_status` (`root_note_id`,`status`),
  KEY `idx_note_shares_expiry` (`status`,`expires_at`),
  CONSTRAINT `fk_note_shares_root` FOREIGN KEY (`root_note_id`) REFERENCES `note` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='可撤销笔记与目录分享';

CREATE TABLE `note_share_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `share_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_type` varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `outcome` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `visitor_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_note_share_events_share_time` (`share_id`,`create_time`),
  KEY `idx_note_share_events_retention` (`create_time`),
  CONSTRAINT `fk_note_share_events_share` FOREIGN KEY (`share_id`) REFERENCES `note_shares` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笔记分享隐私化访问事件';

-- ----------------------------
-- Table structure for note_versions
-- ----------------------------
DROP TABLE IF EXISTS `note_versions`;
CREATE TABLE `note_versions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `note_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'html',
  `source_revision` bigint(20) unsigned DEFAULT NULL COMMENT '快照对应的原笔记 revision',
  `reason` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'autosave' COMMENT '快照来源',
  `create_by` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_note_versions_note_time` (`note_id`,`create_time`,`id`),
  KEY `idx_note_versions_owner` (`create_by`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笔记历史版本';

-- ----------------------------
-- Table structure for note_images
-- ----------------------------
DROP TABLE IF EXISTS `note_images`;
CREATE TABLE `note_images` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `note_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `fk_note_images_note` (`note_id`),
  CONSTRAINT `fk_note_images_note` FOREIGN KEY (`note_id`) REFERENCES `note` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='笔记图片';

-- ----------------------------
-- Table structure for note_tag_relations
-- ----------------------------
DROP TABLE IF EXISTS `note_tag_relations`;
CREATE TABLE `note_tag_relations` (
  `note_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tag_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`note_id`,`tag_id`),
  KEY `tag_id` (`tag_id`),
  CONSTRAINT `note_tag_relations_ibfk_1` FOREIGN KEY (`note_id`) REFERENCES `note` (`id`) ON DELETE CASCADE,
  CONSTRAINT `note_tag_relations_ibfk_2` FOREIGN KEY (`tag_id`) REFERENCES `note_tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for note_tags
-- ----------------------------
DROP TABLE IF EXISTS `note_tags`;
CREATE TABLE `note_tags` (
  `id` varchar(222) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for operation_logs
-- ----------------------------
DROP TABLE IF EXISTS `operation_logs`;
CREATE TABLE `operation_logs` (
  `id` varchar(255) CHARACTER SET utf8 NOT NULL,
  `module` varchar(255) CHARACTER SET utf8 DEFAULT NULL,
  `operation` varchar(255) CHARACTER SET utf8 DEFAULT NULL,
  `create_by` varchar(255) CHARACTER SET utf8 DEFAULT NULL COMMENT '创建人员',
  `ip` varchar(255) CHARACTER SET utf8 DEFAULT NULL COMMENT 'ip地址',
  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `del_flag` varchar(255) CHARACTER SET utf8 NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_operation_logs_admin_list` (`del_flag`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 ROW_FORMAT=DYNAMIC COMMENT='操作日志';

-- ----------------------------
-- Table structure for admin_operation_audit
-- ----------------------------
DROP TABLE IF EXISTS `admin_operation_audit`;
CREATE TABLE `admin_operation_audit` (
  `id` char(36) NOT NULL,
  `actor_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `action` varchar(64) NOT NULL,
  `target_type` varchar(64) DEFAULT NULL,
  `target_id` varchar(255) DEFAULT NULL,
  `outcome` varchar(16) NOT NULL COMMENT 'intent/succeeded/failed/denied',
  `reason` varchar(500) NOT NULL DEFAULT '',
  `request_id` varchar(64) DEFAULT NULL,
  `ip_masked` varchar(64) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_operation_actor_time` (`actor_user_id`,`create_time`,`id`),
  KEY `idx_admin_operation_action_time` (`action`,`create_time`,`id`),
  KEY `idx_admin_operation_target_time` (`target_type`,`target_id`,`create_time`,`id`),
  KEY `idx_admin_operation_outcome_time` (`outcome`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台高风险操作追加式审计';

-- ----------------------------
-- Table structure for opinion
-- ----------------------------
DROP TABLE IF EXISTS `opinion`;
CREATE TABLE `opinion` (
  `id` varchar(255) NOT NULL,
  `type` varchar(255) DEFAULT NULL,
  `content` varchar(255) DEFAULT NULL,
  `img_array` longtext,
  `phone` varchar(255) DEFAULT NULL,
  `reply_content` text COMMENT '管理员回复',
  `reply_time` datetime DEFAULT NULL COMMENT '回复时间',
  `status` varchar(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/replied/viewed',
  `reply_viewed` tinyint(1) NOT NULL DEFAULT '1' COMMENT '用户是否已查看回复',
  `viewed_time` datetime DEFAULT NULL COMMENT '用户查看回复时间',
  `del_flag` varchar(255) NOT NULL DEFAULT '0',
  `user_id` varchar(255) NOT NULL,
  `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='意见反馈';

-- ----------------------------
-- Table structure for resource_tag_relations
-- ----------------------------
DROP TABLE IF EXISTS `resource_tag_relations`;
CREATE TABLE `resource_tag_relations` (
  `tag_id` varchar(255) NOT NULL,
  `resource_type` varchar(32) NOT NULL,
  `resource_id` varchar(255) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `source` varchar(32) DEFAULT 'manual',
  `confidence` decimal(5,4) DEFAULT NULL,
  PRIMARY KEY (`tag_id`,`resource_type`,`resource_id`) USING BTREE,
  KEY `idx_resource` (`resource_type`,`resource_id`) USING BTREE,
  KEY `idx_user_tag` (`user_id`,`tag_id`) USING BTREE,
  CONSTRAINT `fk_resource_tag_tag_id` FOREIGN KEY (`tag_id`) REFERENCES `tag` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_resource_tag_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC;

-- ----------------------------
-- Table structure for onboarding_seed_resources
-- ----------------------------
DROP TABLE IF EXISTS `onboarding_seed_resources`;
CREATE TABLE `onboarding_seed_resources` (
  `user_id` varbinary(255) NOT NULL,
  `resource_type` varchar(32) NOT NULL,
  `resource_id` varbinary(255) NOT NULL,
  `seed_version` varchar(32) NOT NULL DEFAULT 'v1',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`resource_type`,`resource_id`),
  KEY `idx_onboarding_resource` (`resource_type`,`resource_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='注册时系统自动生成的示例资源，不计入成长和运营统计';

-- ----------------------------
-- Table structure for security_account_bans
-- ----------------------------
DROP TABLE IF EXISTS `security_account_bans`;
CREATE TABLE `security_account_bans` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `user_id` varchar(64) NOT NULL COMMENT '被封禁账号的用户ID',
  `banned_by` varchar(64) DEFAULT NULL COMMENT '执行封禁的管理员用户ID',
  `ban_reason` varchar(255) DEFAULT NULL COMMENT '账号封禁原因',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '封禁记录是否仍有效',
  `banned_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '账号封禁时间',
  `unbanned_by` varchar(64) DEFAULT NULL COMMENT '执行解封的管理员用户ID',
  `unbanned_at` datetime DEFAULT NULL COMMENT '账号解封时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_id` (`user_id`),
  KEY `idx_active_time` (`is_active`,`banned_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COMMENT='账号封禁记录表：记录安全中心对账号的封禁、解封、原因和操作人';

-- ----------------------------
-- Table structure for security_account_reputation
-- ----------------------------
DROP TABLE IF EXISTS `security_account_reputation`;
CREATE TABLE `security_account_reputation` (
  `user_id` varchar(64) NOT NULL,
  `total_events` int(11) DEFAULT '0',
  `high_risk_count` int(11) DEFAULT '0',
  `critical_count` int(11) DEFAULT '0',
  `risk_score` int(11) DEFAULT '0',
  `attack_type_breakdown` json DEFAULT NULL,
  `first_event_at` datetime DEFAULT NULL,
  `last_event_at` datetime DEFAULT NULL,
  `last_attack_time` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  KEY `idx_risk_score` (`risk_score`),
  KEY `idx_last_event_at` (`last_event_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for security_event_evidence
-- ----------------------------
DROP TABLE IF EXISTS `security_event_evidence`;
CREATE TABLE `security_event_evidence` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `event_id` varchar(64) NOT NULL COMMENT '关联security_events.event_id',
  `rule_code` varchar(100) DEFAULT NULL COMMENT '命中的规则编码',
  `rule_name` varchar(100) DEFAULT NULL COMMENT '命中的规则名称',
  `detector` varchar(50) DEFAULT NULL COMMENT '检测器类型，如signature、behavior、reputation',
  `attack_type` varchar(50) DEFAULT NULL COMMENT '该证据对应的攻击类型',
  `severity` varchar(20) DEFAULT NULL COMMENT '该证据对应的威胁等级',
  `matched_field` varchar(200) DEFAULT NULL COMMENT '命中的请求字段路径，如body.id、query.url、sourceIp',
  `matched_value_preview` text COMMENT '命中值预览，已截断或脱敏',
  `evidence_message` text COMMENT '证据说明',
  `score_delta` int(11) DEFAULT '0' COMMENT '该证据贡献的威胁分',
  `confidence` int(11) DEFAULT '0' COMMENT '该证据置信度，范围0-100',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '证据创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_event_id` (`event_id`),
  KEY `idx_rule_code` (`rule_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3062 DEFAULT CHARSET=utf8mb4 COMMENT='安全事件证据明细表：一条安全事件可对应多条规则命中证据，用于解释为什么被判定为威胁';

-- ----------------------------
-- Table structure for security_events
-- ----------------------------
DROP TABLE IF EXISTS `security_events`;
CREATE TABLE `security_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `event_id` varchar(64) NOT NULL COMMENT '安全事件唯一ID，业务侧展示和关联证据使用',
  `attack_type` varchar(50) NOT NULL COMMENT '攻击类型，如SQL_INJECTION、XSS、SCANNER、BRUTE_FORCE、IP_REPUTATION等',
  `severity` enum('low','medium','high','critical') NOT NULL COMMENT '威胁等级：low低、medium中、high高、critical严重',
  `threat_score` int(11) DEFAULT '0' COMMENT '综合威胁分，范围0-100',
  `confidence` int(11) DEFAULT '0' COMMENT '检测置信度，范围0-100',
  `action_taken` enum('log','allow','rate_limit','block','ban') DEFAULT 'log' COMMENT '系统处置动作：记录、放行、限流、拦截、封禁',
  `blocked` tinyint(1) DEFAULT '0' COMMENT '本次请求是否已被拦截',
  `request_method` varchar(10) DEFAULT NULL COMMENT 'HTTP请求方法',
  `request_path` varchar(500) DEFAULT NULL COMMENT '请求路径，不含域名',
  `request_url` text COMMENT '原始请求URL',
  `status_code` int(11) DEFAULT NULL COMMENT '响应状态码',
  `response_time_ms` int(11) DEFAULT NULL COMMENT '请求处理耗时，单位毫秒',
  `source_ip` varchar(45) DEFAULT NULL COMMENT '来源IP，兼容IPv4和IPv6',
  `x_forwarded_for` varchar(500) DEFAULT NULL COMMENT '代理转发链路中的X-Forwarded-For',
  `user_agent` varchar(500) DEFAULT NULL COMMENT '客户端User-Agent',
  `user_id` varchar(64) DEFAULT NULL COMMENT '请求关联用户ID，未识别则为空',
  `role` varchar(50) DEFAULT NULL COMMENT '请求关联用户角色',
  `matched_rule` varchar(100) DEFAULT NULL COMMENT '最终命中的主要规则名称',
  `matched_payload` text COMMENT '最终命中的主要载荷预览，已截断或脱敏',
  `payload_summary` json DEFAULT NULL COMMENT '脱敏后的body/query/params请求快照',
  `headers_summary` json DEFAULT NULL COMMENT '脱敏后的关键请求头快照',
  `ip_attack_count_5m` int(11) DEFAULT '0' COMMENT '该IP过去5分钟安全事件数',
  `ip_attack_count_24h` int(11) DEFAULT '0' COMMENT '该IP过去24小时安全事件数',
  `ip_risk_delta` int(11) DEFAULT '0',
  `ip_risk_reverted` tinyint(1) DEFAULT '0',
  `ip_risk_reverted_at` datetime DEFAULT NULL,
  `user_risk_delta` int(11) DEFAULT '0',
  `user_risk_reverted` tinyint(1) DEFAULT '0',
  `user_risk_reverted_at` datetime DEFAULT NULL,
  `decision_reason` varchar(255) DEFAULT NULL COMMENT '系统做出处置动作的原因说明',
  `handled_status` enum('unhandled','processed','false_positive','authorized_test') DEFAULT 'unhandled',
  `handled_by` varchar(64) DEFAULT NULL COMMENT '处理人用户ID',
  `handled_at` datetime DEFAULT NULL COMMENT '人工处理时间',
  `remark` text COMMENT '人工处理备注',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '事件创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_id` (`event_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_type_time` (`attack_type`,`created_at`),
  KEY `idx_ip_time` (`source_ip`,`created_at`),
  KEY `idx_severity_time` (`severity`,`created_at`),
  KEY `idx_score` (`threat_score`),
  KEY `idx_user_time` (`user_id`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=1700 DEFAULT CHARSET=utf8mb4 COMMENT='安全事件主表：记录每次被安全模块判定为可疑或攻击的请求快照、威胁评分、处置动作和人工处理状态';

-- ----------------------------
-- Table structure for security_ip_reputation
-- ----------------------------
DROP TABLE IF EXISTS `security_ip_reputation`;
CREATE TABLE `security_ip_reputation` (
  `ip` varchar(45) NOT NULL COMMENT 'IP地址，主键，兼容IPv4和IPv6',
  `total_requests` bigint(20) DEFAULT '0' COMMENT '累计请求次数',
  `total_attacks` int(11) DEFAULT '0' COMMENT '累计安全事件次数',
  `high_risk_count` int(11) DEFAULT '0' COMMENT '累计高危事件次数',
  `critical_count` int(11) DEFAULT '0' COMMENT '累计严重事件次数',
  `risk_score` int(11) DEFAULT '0' COMMENT 'IP风险分，范围0-100',
  `attack_type_breakdown` json DEFAULT NULL COMMENT '攻击类型统计JSON，如{"SQL_INJECTION":3}',
  `is_banned` tinyint(1) DEFAULT '0' COMMENT 'IP是否处于封禁状态',
  `banned_until` datetime DEFAULT NULL COMMENT 'IP封禁截止时间，过期后视为未封禁',
  `ban_reason` varchar(255) DEFAULT NULL COMMENT 'IP封禁原因',
  `first_seen_at` datetime DEFAULT NULL COMMENT '首次看到该IP时间',
  `last_seen_at` datetime DEFAULT NULL COMMENT '最近一次请求时间',
  `last_attack_time` datetime DEFAULT NULL COMMENT '最近一次安全事件时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
  `location` json DEFAULT NULL COMMENT '地理位置 {city, province}',
  PRIMARY KEY (`ip`),
  KEY `idx_risk_score` (`risk_score`),
  KEY `idx_banned_until` (`banned_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IP信誉画像表：累计每个IP的请求量、攻击次数、风险分、攻击类型分布和封禁状态';

-- ----------------------------
-- Table structure for security_rules
-- ----------------------------
DROP TABLE IF EXISTS `security_rules`;
CREATE TABLE `security_rules` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `rule_code` varchar(100) NOT NULL COMMENT '规则唯一编码',
  `rule_name` varchar(100) NOT NULL COMMENT '规则展示名称',
  `attack_type` varchar(50) NOT NULL COMMENT '规则所属攻击类型',
  `severity` enum('low','medium','high','critical') NOT NULL COMMENT '规则默认威胁等级',
  `base_score` int(11) DEFAULT '0' COMMENT '规则基础威胁分',
  `confidence` int(11) DEFAULT '0' COMMENT '规则默认置信度，范围0-100',
  `action` enum('log','allow','rate_limit','block','ban') DEFAULT 'log' COMMENT '规则默认处置动作',
  `enabled` tinyint(1) DEFAULT '1' COMMENT '规则是否启用',
  `description` text COMMENT '规则说明',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '规则创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '规则更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `rule_code` (`rule_code`)
) ENGINE=InnoDB AUTO_INCREMENT=167 DEFAULT CHARSET=utf8mb4 COMMENT='安全规则库表：保存内置检测规则的编码、分类、等级、基础分、置信度和默认动作';

-- ----------------------------
-- Table structure for security_whitelist
-- ----------------------------
DROP TABLE IF EXISTS `security_whitelist`;
CREATE TABLE `security_whitelist` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `target_type` enum('ip','user') NOT NULL,
  `target_value` varchar(128) NOT NULL,
  `label` varchar(255) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `enabled` tinyint(1) DEFAULT '1',
  `created_by` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_security_whitelist_target` (`target_type`,`target_value`),
  KEY `idx_enabled_type` (`enabled`,`target_type`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for tag
-- ----------------------------
DROP TABLE IF EXISTS `tag`;
CREATE TABLE `tag` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) NOT NULL,
  `icon_url` longtext COMMENT '图标地址',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `sort` int(10) NOT NULL DEFAULT '0',
  `del_flag` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `fk_tag_user_id` (`user_id`),
  CONSTRAINT `fk_tag_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC;

-- ----------------------------
-- Table structure for tag_relations
-- ----------------------------
DROP TABLE IF EXISTS `tag_relations`;
CREATE TABLE `tag_relations` (
  `tag_id` varchar(255) NOT NULL,
  `related_tag_id` varchar(255) NOT NULL,
  PRIMARY KEY (`tag_id`,`related_tag_id`) USING BTREE,
  KEY `fk_tag_relations_related_tag` (`related_tag_id`) USING BTREE,
  CONSTRAINT `fk_tag_relations_related_tag_id` FOREIGN KEY (`related_tag_id`) REFERENCES `tag` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tag_relations_tag_id` FOREIGN KEY (`tag_id`) REFERENCES `tag` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC;

-- ----------------------------
-- Table structure for community_chat_rooms
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_rooms`;
CREATE TABLE `community_chat_rooms` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) NOT NULL,
  `name_zh` varchar(80) NOT NULL,
  `name_en` varchar(80) NOT NULL,
  `description_zh` varchar(280) NOT NULL DEFAULT '',
  `description_en` varchar(280) NOT NULL DEFAULT '',
  `type` varchar(24) NOT NULL DEFAULT 'text',
  `status` varchar(24) NOT NULL DEFAULT 'active',
  `default_notification_level` varchar(16) NOT NULL DEFAULT 'mentions',
  `slow_mode_seconds` smallint unsigned NOT NULL DEFAULT 0,
  `last_message_id` bigint unsigned DEFAULT NULL,
  `pinned_message_id` bigint unsigned DEFAULT NULL,
  `pinned_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `pinned_at` datetime DEFAULT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_room_slug` (`slug`),
  KEY `idx_community_chat_room_status_sort` (`status`,`sort_order`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `community_chat_rooms`
  (`slug`,`name_zh`,`name_en`,`description_zh`,`description_en`,`type`,`default_notification_level`,`sort_order`)
VALUES
  ('general','轻笺聊天室','Light Note Chat','聊使用问题、实用技巧、功能想法和日常见闻。','Discuss product questions, useful workflows, ideas, and everyday topics.','text','mentions',10);

-- ----------------------------
-- Table structure for community_chat_runtime_policy
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_runtime_policy`;
CREATE TABLE `community_chat_runtime_policy` (
  `id` tinyint unsigned NOT NULL,
  `posting_enabled` tinyint unsigned NOT NULL DEFAULT 1,
  `updated_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `community_chat_runtime_policy` (`id`,`posting_enabled`) VALUES (1,1);

-- ----------------------------
-- Table structure for community_chat_access_requests
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_access_requests`;
CREATE TABLE `community_chat_access_requests` (
  `id` char(36) NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `request_message` varchar(500) NOT NULL DEFAULT '',
  `reviewed_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `review_note` varchar(500) NOT NULL DEFAULT '',
  `reviewed_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_access_user` (`user_id`),
  KEY `idx_community_chat_access_status_time` (`status`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_members
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_members`;
CREATE TABLE `community_chat_members` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `role` varchar(16) NOT NULL DEFAULT 'member',
  `status` varchar(16) NOT NULL DEFAULT 'invited',
  `invited_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `rules_version` varchar(32) DEFAULT NULL,
  `rules_accepted_at` datetime DEFAULT NULL,
  `joined_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  KEY `idx_community_chat_member_status_role` (`status`,`role`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_user_identities
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_user_identities`;
CREATE TABLE `community_chat_user_identities` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `public_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `community_id` varchar(11) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_community_chat_identity_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_identity_community` (`community_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_member_profiles
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_member_profiles`;
CREATE TABLE `community_chat_member_profiles` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `bio` varchar(255) NOT NULL DEFAULT '',
  `show_community_tenure` tinyint unsigned NOT NULL DEFAULT 1,
  `featured_achievements` json DEFAULT NULL,
  `revision` bigint unsigned NOT NULL DEFAULT 1,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_user_settings
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_user_settings`;
CREATE TABLE `community_chat_user_settings` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `global_notification_enabled` tinyint unsigned NOT NULL DEFAULT 1,
  `browser_notification_enabled` tinyint unsigned NOT NULL DEFAULT 0,
  `android_notification_enabled` tinyint unsigned NOT NULL DEFAULT 0,
  `lock_screen_preview` varchar(16) NOT NULL DEFAULT 'hidden',
  `default_room_level` varchar(16) NOT NULL DEFAULT 'mentions',
  `dnd_enabled` tinyint unsigned NOT NULL DEFAULT 0,
  `dnd_start` time NOT NULL DEFAULT '22:00:00',
  `dnd_end` time NOT NULL DEFAULT '08:00:00',
  `timezone_offset_minutes` smallint NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_access_audit
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_access_audit`;
CREATE TABLE `community_chat_access_audit` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `target_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `action` varchar(32) NOT NULL,
  `reason` varchar(500) NOT NULL DEFAULT '',
  `metadata` json DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_chat_audit_target_time` (`target_user_id`,`create_time`,`id`),
  KEY `idx_community_chat_audit_actor_time` (`actor_user_id`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_messages
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_messages`;
CREATE TABLE `community_chat_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `room_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `client_request_id` varchar(64) NOT NULL,
  `payload_fingerprint` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `reply_to_id` bigint unsigned DEFAULT NULL,
  `message_kind` varchar(16) NOT NULL DEFAULT 'text',
  `sticker_source` varchar(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `sticker_key` varchar(80) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `mention_everyone` tinyint unsigned NOT NULL DEFAULT '0',
  `content` text NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `edited_at` datetime DEFAULT NULL,
  `recalled_at` datetime DEFAULT NULL,
  `recalled_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_message_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_message_request` (`user_id`,`client_request_id`),
  KEY `idx_community_chat_message_room_status_id` (`room_id`,`status`,`id`),
  KEY `idx_community_chat_message_reply` (`reply_to_id`),
  KEY `idx_community_chat_message_user_time` (`user_id`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_message_likes
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_message_likes`;
CREATE TABLE `community_chat_message_likes` (
  `message_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `idx_community_chat_like_user_time` (`user_id`,`create_time`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_message_deletions
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_message_deletions`;
CREATE TABLE `community_chat_message_deletions` (
  `message_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `idx_community_chat_deletion_user_time` (`user_id`,`create_time`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_message_mentions
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_message_mentions`;
CREATE TABLE `community_chat_message_mentions` (
  `message_id` bigint unsigned NOT NULL,
  `mentioned_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `sort_order` tinyint unsigned NOT NULL DEFAULT 0,
  `display_name_snapshot` varchar(80) NOT NULL DEFAULT '',
  `community_id_snapshot` varchar(11) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`mentioned_user_id`),
  KEY `idx_community_chat_mention_user_message` (`mentioned_user_id`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_message_images
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_message_images`;
CREATE TABLE `community_chat_message_images` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `owner_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `message_id` bigint unsigned DEFAULT NULL,
  `object_key` varchar(512) NOT NULL,
  `content_type` varchar(64) NOT NULL,
  `file_size` int unsigned NOT NULL,
  `width` int unsigned NOT NULL,
  `height` int unsigned NOT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'uploading',
  `sort_order` tinyint unsigned NOT NULL DEFAULT 0,
  `expires_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_image_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_image_object` (`object_key`),
  KEY `idx_community_chat_image_owner_status_expiry` (`owner_user_id`,`status`,`expires_at`),
  KEY `idx_community_chat_image_message_status_sort` (`message_id`,`status`,`sort_order`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_custom_stickers
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_custom_stickers`;
CREATE TABLE `community_chat_custom_stickers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `object_key` varchar(512) NOT NULL,
  `content_sha256` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `content_type` varchar(64) NOT NULL,
  `file_size` int unsigned NOT NULL,
  `width` int unsigned NOT NULL,
  `height` int unsigned NOT NULL,
  `name` varchar(40) NOT NULL DEFAULT '',
  `status` varchar(24) NOT NULL DEFAULT 'uploading',
  `sort_order` int unsigned NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_custom_sticker_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_custom_sticker_content` (`user_id`,`content_sha256`),
  KEY `idx_community_chat_custom_sticker_owner_status` (`user_id`,`status`,`sort_order`,`id`),
  KEY `idx_community_chat_custom_sticker_status_time` (`status`,`update_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_reads
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_reads`;
CREATE TABLE `community_chat_reads` (
  `room_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `last_read_message_id` bigint unsigned NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`room_id`,`user_id`),
  KEY `idx_community_chat_read_user_time` (`user_id`,`update_time`,`room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_blocks
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_blocks`;
CREATE TABLE `community_chat_blocks` (
  `id` char(36) NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `blocked_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_block_pair` (`user_id`,`blocked_user_id`),
  KEY `idx_community_chat_block_target_time` (`blocked_user_id`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_reports
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_reports`;
CREATE TABLE `community_chat_reports` (
  `id` char(36) NOT NULL,
  `reporter_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `message_id` bigint unsigned NOT NULL,
  `reason_code` varchar(32) NOT NULL,
  `detail` varchar(500) NOT NULL DEFAULT '',
  `evidence_snapshot` json NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `reviewed_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `review_note` varchar(500) NOT NULL DEFAULT '',
  `reviewed_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_reporter_message` (`reporter_id`,`message_id`),
  KEY `idx_community_chat_report_status_time` (`status`,`create_time`,`id`),
  KEY `idx_community_chat_report_message_time` (`message_id`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_moderation_actions
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_moderation_actions`;
CREATE TABLE `community_chat_moderation_actions` (
  `id` char(36) NOT NULL,
  `report_id` char(36) DEFAULT NULL,
  `actor_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `target_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `message_id` bigint unsigned DEFAULT NULL,
  `action` varchar(32) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_moderation_report` (`report_id`),
  KEY `idx_community_chat_moderation_target_time` (`target_user_id`,`create_time`,`id`),
  KEY `idx_community_chat_moderation_actor_time` (`actor_user_id`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for community_chat_member_sanctions
-- ----------------------------
DROP TABLE IF EXISTS `community_chat_member_sanctions`;
CREATE TABLE `community_chat_member_sanctions` (
  `id` char(36) NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `type` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `expires_at` datetime DEFAULT NULL,
  `reason` varchar(500) NOT NULL,
  `created_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `revoked_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_chat_sanction_user_status_expiry` (`user_id`,`status`,`expires_at`,`id`),
  KEY `idx_community_chat_sanction_status_expiry` (`status`,`expires_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for user
-- ----------------------------
DROP TABLE IF EXISTS `user`;
CREATE TABLE `user` (
  `id` varchar(255) NOT NULL,
  `alias` varchar(255) NOT NULL DEFAULT '默认昵称' COMMENT '别名，昵称',
  `password` varchar(255) DEFAULT NULL,
  `password_method` varchar(20) NOT NULL DEFAULT 'plain' COMMENT '密码存储方式: plain(明文待升级)/scrypt',
  `email` varchar(255) DEFAULT NULL,
  `phone_number` int(11) DEFAULT NULL,
  `role` varchar(255) DEFAULT NULL,
  `head_picture` longtext COMMENT '头像',
  `del_flag` varchar(255) NOT NULL DEFAULT '0',
  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `last_active_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次认证活跃时间',
  `location` varchar(255) DEFAULT NULL,
  `ip` varchar(255) DEFAULT NULL,
  `github_id` varchar(40) DEFAULT NULL,
  `github_access_token` varchar(100) DEFAULT NULL,
  `login_type` enum('local','github') DEFAULT 'local',
  `preferences` json DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `github_id` (`github_id`),
  KEY `idx_user_active_list` (`del_flag`,`last_active_time`,`id`),
  KEY `idx_user_created_list` (`del_flag`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC;

-- ----------------------------
-- Table structure for user_sessions
-- ----------------------------
DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
  `sid` varchar(128) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `role` varchar(32) NOT NULL,
  `expires_at` datetime NOT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `last_active_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `ip` varchar(100) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `device_key` char(64) DEFAULT NULL,
  PRIMARY KEY (`sid`),
  KEY `idx_user_sessions_user_id` (`user_id`),
  KEY `idx_user_sessions_user_device_key` (`user_id`,`device_key`),
  KEY `idx_user_sessions_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Procedure structure for quick_uuid_triggers
-- ----------------------------
DROP PROCEDURE IF EXISTS `quick_uuid_triggers`;
delimiter ;;
CREATE PROCEDURE `quick_uuid_triggers`()

;;
delimiter ;

-- ----------------------------
-- Table structure for conversion_events (游客转化漏斗事件)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `conversion_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `fingerprint` varchar(128) DEFAULT NULL,
  `user_id` varchar(64) DEFAULT NULL,
  `visitor_type` varchar(20) DEFAULT NULL,
  `event` varchar(64) NOT NULL,
  `context` varchar(255) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_event_time` (`event`, `create_time`),
  KEY `idx_fingerprint` (`fingerprint`),
  KEY `idx_conversion_user_event_time` (`user_id`,`event`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='游客转化漏斗事件';

-- ----------------------------
-- Unified resource governance (scan-only by default; cleanup requires an explicit feature flag)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `resource_governance_scans` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  `scope_json` json NOT NULL,
  `summary_json` json DEFAULT NULL,
  `cursor_json` json DEFAULT NULL,
  `lease_owner` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lease_expires_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `heartbeat_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `last_error_code` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resource_governance_scans_status` (`status`,`lease_expires_at`,`create_time`),
  KEY `idx_resource_governance_scans_created` (`created_by`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resource_governance_findings` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scan_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fingerprint` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `issue_code` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `resource_type` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `target_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_locator` text COLLATE utf8mb4_unicode_ci,
  `owner_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `risk_level` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `state` varchar(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'open',
  `estimated_bytes` bigint(20) unsigned NOT NULL DEFAULT '0',
  `evidence_json` json NOT NULL,
  `observation_count` int(10) unsigned NOT NULL DEFAULT '1',
  `first_seen_at` datetime NOT NULL,
  `last_seen_at` datetime NOT NULL,
  `last_verified_at` datetime DEFAULT NULL,
  `resolution_code` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `resolved_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_resource_governance_finding_fingerprint` (`fingerprint`),
  KEY `idx_resource_governance_findings_list` (`state`,`risk_level`,`resource_type`,`last_seen_at`,`id`),
  KEY `idx_resource_governance_findings_scan` (`scan_id`,`last_seen_at`),
  KEY `idx_resource_governance_findings_owner` (`owner_id`,`resource_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resource_cleanup_jobs` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `risk_level` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` varchar(28) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  `total` int(10) unsigned NOT NULL DEFAULT '0',
  `succeeded` int(10) unsigned NOT NULL DEFAULT '0',
  `skipped` int(10) unsigned NOT NULL DEFAULT '0',
  `failed` int(10) unsigned NOT NULL DEFAULT '0',
  `estimated_bytes` bigint(20) unsigned NOT NULL DEFAULT '0',
  `released_bytes` bigint(20) unsigned NOT NULL DEFAULT '0',
  `confirmation_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `lease_owner` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lease_expires_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `heartbeat_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `last_error_code` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resource_cleanup_jobs_status` (`status`,`lease_expires_at`,`create_time`),
  KEY `idx_resource_cleanup_jobs_created` (`created_by`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resource_cleanup_job_items` (
  `job_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `finding_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(28) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  `attempts` int(10) unsigned NOT NULL DEFAULT '0',
  `precondition_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `result_code` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `claimed_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `released_bytes` bigint(20) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`job_id`,`finding_id`),
  KEY `idx_resource_cleanup_job_items_claim` (`job_id`,`status`,`claimed_at`),
  KEY `idx_resource_cleanup_job_items_finding` (`finding_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resource_governance_audit` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `actor_user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `target_type` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `target_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `outcome` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `summary_json` json DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resource_governance_audit_time` (`create_time`,`id`),
  KEY `idx_resource_governance_audit_target` (`target_type`,`target_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_checkout_intents` (
  `id` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `option_key` varchar(32) NOT NULL,
  `provider_user_id` varchar(128) DEFAULT NULL,
  `provider_private_id` varchar(128) DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `first_used_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_support_checkout_token` (`token_hash`),
  KEY `idx_support_checkout_user_time` (`user_id`,`create_time`,`id`),
  KEY `idx_support_checkout_expiry` (`expires_at`,`first_used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_account_links` (
  `id` char(36) NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `provider_user_id` varchar(128) NOT NULL,
  `provider_private_id` varchar(128) DEFAULT NULL,
  `provider_name` varchar(100) DEFAULT NULL,
  `provider_avatar_url` varchar(1024) DEFAULT NULL,
  `identity_refreshed_at` datetime DEFAULT NULL,
  `linked_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_support_link_user` (`user_id`),
  UNIQUE KEY `uk_support_link_provider_user` (`provider_user_id`),
  UNIQUE KEY `uk_support_link_provider_private` (`provider_private_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_orders` (
  `id` char(36) NOT NULL,
  `provider_order_no` varchar(128) NOT NULL,
  `provider_user_id` varchar(128) DEFAULT NULL,
  `provider_private_id` varchar(128) DEFAULT NULL,
  `checkout_intent_id` char(36) DEFAULT NULL,
  `light_note_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `ownership_source` varchar(24) NOT NULL DEFAULT 'unlinked',
  `plan_id` varchar(128) DEFAULT NULL,
  `product_type` tinyint unsigned NOT NULL DEFAULT 0,
  `month` int unsigned NOT NULL DEFAULT 1,
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `show_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `provider_status` smallint NOT NULL DEFAULT 0,
  `verification_state` varchar(24) NOT NULL DEFAULT 'pending',
  `webhook_signature_valid` tinyint unsigned NOT NULL DEFAULT 0,
  `webhook_received_at` datetime DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `ranking_observed_at` datetime DEFAULT NULL,
  `retry_count` int unsigned NOT NULL DEFAULT 0,
  `next_retry_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_support_order_provider` (`provider_order_no`),
  KEY `idx_support_order_user_status` (`light_note_user_id`,`verification_state`,`provider_status`,`create_time`),
  KEY `idx_support_order_provider_user` (`provider_user_id`,`provider_private_id`,`create_time`),
  KEY `idx_support_order_checkout` (`checkout_intent_id`),
  KEY `idx_support_order_retry` (`verification_state`,`next_retry_at`,`retry_count`),
  KEY `idx_support_order_ranking` (`verification_state`,`provider_status`,`ranking_observed_at`,`light_note_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_public_preferences` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `public_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `participate_in_ranking` tinyint unsigned NOT NULL DEFAULT 1,
  `show_identity` tinyint unsigned NOT NULL DEFAULT 0,
  `identity_consented_at` datetime DEFAULT NULL,
  `admin_hidden` tinyint unsigned NOT NULL DEFAULT 0,
  `admin_hidden_reason` varchar(255) DEFAULT NULL,
  `admin_hidden_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `admin_hidden_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_support_public_id` (`public_id`),
  KEY `idx_support_public_visibility` (`participate_in_ranking`,`admin_hidden`,`show_identity`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
