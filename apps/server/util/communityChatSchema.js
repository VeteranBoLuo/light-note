import pool from '../db/index.js';

export const COMMUNITY_CHAT_TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS community_chat_rooms (
    id bigint unsigned NOT NULL AUTO_INCREMENT,
    slug varchar(64) NOT NULL,
    name_zh varchar(80) NOT NULL,
    name_en varchar(80) NOT NULL,
    description_zh varchar(280) NOT NULL DEFAULT '',
    description_en varchar(280) NOT NULL DEFAULT '',
    type varchar(24) NOT NULL DEFAULT 'text',
    status varchar(24) NOT NULL DEFAULT 'active',
    default_notification_level varchar(16) NOT NULL DEFAULT 'mentions',
    slow_mode_seconds smallint unsigned NOT NULL DEFAULT 0,
    last_message_id bigint unsigned DEFAULT NULL,
    pinned_message_id bigint unsigned DEFAULT NULL,
    pinned_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    pinned_at datetime DEFAULT NULL,
    sort_order int unsigned NOT NULL DEFAULT 0,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_community_chat_room_slug (slug),
    KEY idx_community_chat_room_status_sort (status, sort_order, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_runtime_policy (
    id tinyint unsigned NOT NULL,
    posting_enabled tinyint unsigned NOT NULL DEFAULT 1,
    updated_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_access_requests (
    id char(36) NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'pending',
    request_message varchar(500) NOT NULL DEFAULT '',
    reviewed_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    review_note varchar(500) NOT NULL DEFAULT '',
    reviewed_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_community_chat_access_user (user_id),
    KEY idx_community_chat_access_status_time (status, create_time, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_members (
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    role varchar(16) NOT NULL DEFAULT 'member',
    status varchar(16) NOT NULL DEFAULT 'invited',
    invited_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    rules_version varchar(32) DEFAULT NULL,
    rules_accepted_at datetime DEFAULT NULL,
    joined_at datetime DEFAULT NULL,
    revoked_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    KEY idx_community_chat_member_status_role (status, role, update_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_user_identities (
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    community_id varchar(11) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uk_community_chat_identity_public (public_id),
    UNIQUE KEY uk_community_chat_identity_community (community_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_member_profiles (
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    bio varchar(255) NOT NULL DEFAULT '',
    show_community_tenure tinyint unsigned NOT NULL DEFAULT 1,
    featured_achievements json DEFAULT NULL,
    revision bigint unsigned NOT NULL DEFAULT 1,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_user_settings (
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    global_notification_enabled tinyint unsigned NOT NULL DEFAULT 1,
    browser_notification_enabled tinyint unsigned NOT NULL DEFAULT 0,
    android_notification_enabled tinyint unsigned NOT NULL DEFAULT 0,
    lock_screen_preview varchar(16) NOT NULL DEFAULT 'hidden',
    default_room_level varchar(16) NOT NULL DEFAULT 'mentions',
    dnd_enabled tinyint unsigned NOT NULL DEFAULT 0,
    dnd_start time NOT NULL DEFAULT '22:00:00',
    dnd_end time NOT NULL DEFAULT '08:00:00',
    timezone_offset_minutes smallint NOT NULL DEFAULT 0,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_access_audit (
    id bigint unsigned NOT NULL AUTO_INCREMENT,
    actor_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    target_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    action varchar(32) NOT NULL,
    reason varchar(500) NOT NULL DEFAULT '',
    metadata json DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_community_chat_audit_target_time (target_user_id, create_time, id),
    KEY idx_community_chat_audit_actor_time (actor_user_id, create_time, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_messages (
    id bigint unsigned NOT NULL AUTO_INCREMENT,
    public_id char(36) NOT NULL,
    room_id bigint unsigned NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    client_request_id varchar(64) NOT NULL,
    payload_fingerprint char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    reply_to_id bigint unsigned DEFAULT NULL,
    message_kind varchar(16) NOT NULL DEFAULT 'text',
    sticker_source varchar(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    sticker_key varchar(80) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    mention_everyone tinyint unsigned NOT NULL DEFAULT 0,
    read_receipt_enabled tinyint unsigned NOT NULL DEFAULT 0,
    content text NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'active',
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    edited_at datetime DEFAULT NULL,
    recalled_at datetime DEFAULT NULL,
    recalled_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    deleted_at datetime DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_community_chat_message_public (public_id),
    UNIQUE KEY uk_community_chat_message_request (user_id, client_request_id),
    KEY idx_community_chat_message_room_status_id (room_id, status, id),
    KEY idx_community_chat_message_reply (reply_to_id),
    KEY idx_community_chat_message_user_time (user_id, create_time, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_polls (
    message_id bigint unsigned NOT NULL,
    ends_at_utc datetime(3) NOT NULL,
    closed_at_utc datetime(3) DEFAULT NULL,
    closed_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id),
    KEY idx_community_chat_poll_deadline (ends_at_utc, message_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_poll_options (
    id bigint unsigned NOT NULL AUTO_INCREMENT,
    public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    message_id bigint unsigned NOT NULL,
    label varchar(80) NOT NULL,
    sort_order tinyint unsigned NOT NULL DEFAULT 0,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_community_chat_poll_option_public (public_id),
    UNIQUE KEY uk_community_chat_poll_option_order (message_id, sort_order),
    KEY idx_community_chat_poll_option_message (message_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_poll_votes (
    message_id bigint unsigned NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    option_id bigint unsigned NOT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    KEY idx_community_chat_poll_vote_option (message_id, option_id),
    KEY idx_community_chat_poll_vote_user_time (user_id, update_time, message_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_message_read_receipts (
    message_id bigint unsigned NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    first_seen_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (message_id, user_id),
    KEY idx_community_chat_receipt_user_time (user_id, first_seen_at, message_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_message_likes (
    message_id bigint unsigned NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    KEY idx_community_chat_like_user_time (user_id, create_time, message_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_message_deletions (
    message_id bigint unsigned NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    KEY idx_community_chat_deletion_user_time (user_id, create_time, message_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_message_mentions (
    message_id bigint unsigned NOT NULL,
    mentioned_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    sort_order tinyint unsigned NOT NULL DEFAULT 0,
    display_name_snapshot varchar(80) NOT NULL DEFAULT '',
    community_id_snapshot varchar(11) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '',
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, mentioned_user_id),
    KEY idx_community_chat_mention_user_message (mentioned_user_id, message_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_message_images (
    id bigint unsigned NOT NULL AUTO_INCREMENT,
    public_id char(36) NOT NULL,
    owner_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    message_id bigint unsigned DEFAULT NULL,
    object_key varchar(512) NOT NULL,
    content_type varchar(64) NOT NULL,
    file_size int unsigned NOT NULL,
    width int unsigned NOT NULL,
    height int unsigned NOT NULL,
    status varchar(24) NOT NULL DEFAULT 'uploading',
    sort_order tinyint unsigned NOT NULL DEFAULT 0,
    expires_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_community_chat_image_public (public_id),
    UNIQUE KEY uk_community_chat_image_object (object_key),
    KEY idx_community_chat_image_owner_status_expiry (owner_user_id, status, expires_at),
    KEY idx_community_chat_image_message_status_sort (message_id, status, sort_order, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_custom_stickers (
    id bigint unsigned NOT NULL AUTO_INCREMENT,
    public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    object_key varchar(512) NOT NULL,
    content_sha256 char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content_type varchar(64) NOT NULL,
    file_size int unsigned NOT NULL,
    width int unsigned NOT NULL,
    height int unsigned NOT NULL,
    name varchar(40) NOT NULL DEFAULT '',
    status varchar(24) NOT NULL DEFAULT 'uploading',
    sort_order int unsigned NOT NULL DEFAULT 0,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_community_chat_custom_sticker_public (public_id),
    UNIQUE KEY uk_community_chat_custom_sticker_content (user_id, content_sha256),
    KEY idx_community_chat_custom_sticker_owner_status (user_id, status, sort_order, id),
    KEY idx_community_chat_custom_sticker_status_time (status, update_time, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_reads (
    room_id bigint unsigned NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    last_read_message_id bigint unsigned NOT NULL DEFAULT 0,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id),
    KEY idx_community_chat_read_user_time (user_id, update_time, room_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_blocks (
    id char(36) NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    blocked_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_community_chat_block_pair (user_id, blocked_user_id),
    KEY idx_community_chat_block_target_time (blocked_user_id, create_time, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_reports (
    id char(36) NOT NULL,
    reporter_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    message_id bigint unsigned NOT NULL,
    reason_code varchar(32) NOT NULL,
    detail varchar(500) NOT NULL DEFAULT '',
    evidence_snapshot json NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'pending',
    reviewed_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    review_note varchar(500) NOT NULL DEFAULT '',
    reviewed_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_community_chat_reporter_message (reporter_id, message_id),
    KEY idx_community_chat_report_status_time (status, create_time, id),
    KEY idx_community_chat_report_message_time (message_id, create_time, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_moderation_actions (
    id char(36) NOT NULL,
    report_id char(36) DEFAULT NULL,
    actor_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    target_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    message_id bigint unsigned DEFAULT NULL,
    action varchar(32) NOT NULL,
    reason varchar(500) NOT NULL,
    expires_at datetime DEFAULT NULL,
    metadata json DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_community_chat_moderation_report (report_id),
    KEY idx_community_chat_moderation_target_time (target_user_id, create_time, id),
    KEY idx_community_chat_moderation_actor_time (actor_user_id, create_time, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_chat_member_sanctions (
    id char(36) NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    type varchar(16) NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'active',
    expires_at datetime DEFAULT NULL,
    reason varchar(500) NOT NULL,
    created_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    revoked_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    revoked_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_community_chat_sanction_user_status_expiry (user_id, status, expires_at, id),
    KEY idx_community_chat_sanction_status_expiry (status, expires_at, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

export const COMMUNITY_CHAT_MESSAGE_RECALL_COLUMNS = [
  {
    name: 'recalled_at',
    ddl: '`recalled_at` datetime DEFAULT NULL AFTER `edited_at`',
  },
  {
    name: 'recalled_by',
    ddl: '`recalled_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL AFTER `recalled_at`',
  },
];

export const COMMUNITY_CHAT_ROOM_PIN_COLUMNS = [
  {
    name: 'pinned_message_id',
    ddl: '`pinned_message_id` bigint unsigned DEFAULT NULL AFTER `last_message_id`',
  },
  {
    name: 'pinned_by',
    ddl: '`pinned_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL AFTER `pinned_message_id`',
  },
  {
    name: 'pinned_at',
    ddl: '`pinned_at` datetime DEFAULT NULL AFTER `pinned_by`',
  },
];

export const COMMUNITY_CHAT_MESSAGE_PAYLOAD_COLUMNS = [
  {
    name: 'payload_fingerprint',
    ddl: '`payload_fingerprint` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `client_request_id`',
  },
  {
    name: 'message_kind',
    ddl: "`message_kind` varchar(16) NOT NULL DEFAULT 'text' AFTER `reply_to_id`",
  },
  {
    name: 'sticker_source',
    ddl: '`sticker_source` varchar(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `message_kind`',
  },
  {
    name: 'sticker_key',
    ddl: '`sticker_key` varchar(80) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `sticker_source`',
  },
  {
    name: 'mention_everyone',
    ddl: '`mention_everyone` tinyint unsigned NOT NULL DEFAULT 0 AFTER `sticker_key`',
  },
  {
    name: 'read_receipt_enabled',
    ddl: '`read_receipt_enabled` tinyint unsigned NOT NULL DEFAULT 0 AFTER `mention_everyone`',
  },
];

export const COMMUNITY_CHAT_MENTION_SNAPSHOT_COLUMNS = [
  {
    name: 'sort_order',
    ddl: '`sort_order` tinyint unsigned NOT NULL DEFAULT 0 AFTER `mentioned_user_id`',
  },
  {
    name: 'display_name_snapshot',
    ddl: "`display_name_snapshot` varchar(80) NOT NULL DEFAULT '' AFTER `sort_order`",
  },
  {
    name: 'community_id_snapshot',
    ddl: "`community_id_snapshot` varchar(11) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '' AFTER `display_name_snapshot`",
  },
];

async function ensureTableColumns(tableName, columns) {
  const names = columns.map((column) => column.name);
  const placeholders = names.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT column_name AS columnName
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND column_name IN (${placeholders})`,
    [tableName, ...names],
  );
  const existing = new Set(rows.map((row) => row.columnName));
  for (const column of columns) {
    if (!existing.has(column.name)) {
      await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${column.ddl}`);
    }
  }
}

async function ensureCommunityChatMessageRecallColumns() {
  const [rows] = await pool.query(
    `SELECT column_name AS columnName
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'community_chat_messages'
        AND column_name IN ('recalled_at', 'recalled_by')`,
  );
  const existing = new Set(rows.map((row) => row.columnName));
  for (const column of COMMUNITY_CHAT_MESSAGE_RECALL_COLUMNS) {
    if (!existing.has(column.name)) {
      await pool.query(`ALTER TABLE community_chat_messages ADD COLUMN ${column.ddl}`);
    }
  }
}

async function ensureCommunityChatRoomPinColumns() {
  const [rows] = await pool.query(
    `SELECT column_name AS columnName
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'community_chat_rooms'
        AND column_name IN ('pinned_message_id', 'pinned_by', 'pinned_at')`,
  );
  const existing = new Set(rows.map((row) => row.columnName));
  for (const column of COMMUNITY_CHAT_ROOM_PIN_COLUMNS) {
    if (!existing.has(column.name)) {
      await pool.query(`ALTER TABLE community_chat_rooms ADD COLUMN ${column.ddl}`);
    }
  }
}

async function ensureCommunityChatMessagePayloadColumns() {
  await ensureTableColumns('community_chat_messages', COMMUNITY_CHAT_MESSAGE_PAYLOAD_COLUMNS);
}

async function ensureCommunityChatMentionSnapshotColumns() {
  await ensureTableColumns('community_chat_message_mentions', COMMUNITY_CHAT_MENTION_SNAPSHOT_COLUMNS);
}

export const COMMUNITY_CHAT_ROOM_SEED_SQL = `
  INSERT INTO community_chat_rooms
    (slug, name_zh, name_en, description_zh, description_en, type, default_notification_level, sort_order)
  VALUES
    ('general', '轻笺聊天室', 'Light Note Chat', '聊使用问题、实用技巧、功能想法和日常见闻。', 'Discuss product questions, useful workflows, ideas, and everyday topics.', 'text', 'mentions', 10)
  ON DUPLICATE KEY UPDATE
    name_zh = VALUES(name_zh),
    name_en = VALUES(name_en),
    description_zh = VALUES(description_zh),
    description_en = VALUES(description_en),
    type = VALUES(type),
    status = 'active',
    default_notification_level = VALUES(default_notification_level),
    sort_order = VALUES(sort_order)
`;

export const COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL = `
  INSERT IGNORE INTO community_chat_runtime_policy (id, posting_enabled)
  VALUES (1, 1)
`;

let ensurePromise = null;

/**
 * 手工 migration 是发布主路径；启动期保障只负责创建缺失的新表并幂等补齐官方频道。
 */
export function ensureCommunityChatSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      for (const sql of COMMUNITY_CHAT_TABLE_SQL) await pool.query(sql);
      await ensureCommunityChatMessageRecallColumns();
      await ensureCommunityChatRoomPinColumns();
      await ensureCommunityChatMessagePayloadColumns();
      await ensureCommunityChatMentionSnapshotColumns();
      await pool.query(COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL);
      await pool.query(COMMUNITY_CHAT_ROOM_SEED_SQL);
    })().finally(() => {
      ensurePromise = null;
    });
  }
  return ensurePromise;
}
