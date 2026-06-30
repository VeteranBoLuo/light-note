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
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC COMMENT='api日志';

-- ----------------------------
-- Table structure for bookmark
-- ----------------------------
DROP TABLE IF EXISTS `bookmark`;
CREATE TABLE `bookmark` (
  `id` varchar(255) NOT NULL DEFAULT '0',
  `name` varchar(255) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `url` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `del_flag` int(11) DEFAULT '0' COMMENT '1删除 0存在',
  `icon_url` longtext COMMENT '图标地址',
  `sort` int(11) NOT NULL DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `fk_bookmark_user_id` (`user_id`),
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
  PRIMARY KEY (`id`),
  KEY `fk_folder_id` (`folder_id`),
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
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

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
  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `del_flag` varchar(255) CHARACTER SET utf8 NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 ROW_FORMAT=DYNAMIC COMMENT='操作日志';

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
  `handled_status` enum('unhandled','processed','false_positive') DEFAULT 'unhandled',
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
  `location` varchar(255) DEFAULT NULL,
  `ip` varchar(255) DEFAULT NULL,
  `github_id` varchar(40) DEFAULT NULL,
  `github_access_token` varchar(100) DEFAULT NULL,
  `login_type` enum('local','github') DEFAULT 'local',
  `preferences` json DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `github_id` (`github_id`)
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
  PRIMARY KEY (`sid`),
  KEY `idx_user_sessions_user_id` (`user_id`),
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

SET FOREIGN_KEY_CHECKS = 1;
