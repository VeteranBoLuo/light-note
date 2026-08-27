import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query: mocks.query } }));

const {
  COMMUNITY_CHAT_ROOM_SEED_SQL,
  COMMUNITY_CHAT_ROOM_PIN_COLUMNS,
  COMMUNITY_CHAT_MESSAGE_PAYLOAD_COLUMNS,
  COMMUNITY_CHAT_MENTION_SNAPSHOT_COLUMNS,
  COMMUNITY_CHAT_POLL_SELECTION_COLUMNS,
  COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL,
  COMMUNITY_CHAT_TABLE_SQL,
  ensureCommunityChatSchema,
} = await import('./communityChatSchema.js');

describe('ensureCommunityChatSchema', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue([[], []]);
  });

  it('幂等创建社区身份、消息、投票、已读回执与治理表，并补齐增量字段和默认数据', async () => {
    await ensureCommunityChatSchema();

    expect(COMMUNITY_CHAT_TABLE_SQL).toHaveLength(24);
    expect(mocks.query).toHaveBeenCalledTimes(47);
    expect(
      mocks.query.mock.calls.slice(0, 24).every(([sql]) => String(sql).includes('CREATE TABLE IF NOT EXISTS')),
    ).toBe(true);
    const sqlCalls = mocks.query.mock.calls.map(([sql]) => String(sql));
    for (const column of [
      'recalled_at',
      'recalled_by',
      'pinned_message_id',
      'pinned_by',
      'pinned_at',
      'payload_fingerprint',
      'message_kind',
      'sticker_source',
      'sticker_key',
      'mention_everyone',
      'read_receipt_enabled',
      'selection_mode',
      'max_selections',
      'sort_order',
      'display_name_snapshot',
      'community_id_snapshot',
    ]) {
      expect(sqlCalls.some((sql) => sql.includes(`ADD COLUMN \`${column}\``))).toBe(true);
    }
    expect(
      mocks.query.mock.calls.find(
        ([, params]) => Array.isArray(params) && params[0] === 'community_chat_messages',
      )?.[1],
    ).toEqual([
      'community_chat_messages',
      'payload_fingerprint',
      'message_kind',
      'sticker_source',
      'sticker_key',
      'mention_everyone',
      'read_receipt_enabled',
    ]);
    expect(mocks.query.mock.calls.at(-2)?.[0]).toBe(COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL);
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe(COMMUNITY_CHAT_ROOM_SEED_SQL);
    expect(COMMUNITY_CHAT_ROOM_PIN_COLUMNS.map((column) => column.name)).toEqual([
      'pinned_message_id',
      'pinned_by',
      'pinned_at',
    ]);
    expect(COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL).toContain('VALUES (1, 1)');
    expect(COMMUNITY_CHAT_ROOM_SEED_SQL).toContain("('general'");
    expect(COMMUNITY_CHAT_ROOM_SEED_SQL).not.toContain("('announcements'");
    expect(COMMUNITY_CHAT_MESSAGE_PAYLOAD_COLUMNS.map((column) => column.name)).toEqual([
      'payload_fingerprint',
      'message_kind',
      'sticker_source',
      'sticker_key',
      'mention_everyone',
      'read_receipt_enabled',
    ]);
    expect(COMMUNITY_CHAT_MENTION_SNAPSHOT_COLUMNS.map((column) => column.name)).toEqual([
      'sort_order',
      'display_name_snapshot',
      'community_id_snapshot',
    ]);
    expect(COMMUNITY_CHAT_POLL_SELECTION_COLUMNS.map((column) => column.name)).toEqual([
      'selection_mode',
      'max_selections',
    ]);
  });

  it('建表失败时不会继续写入频道种子', async () => {
    mocks.query.mockRejectedValueOnce(Object.assign(new Error('ddl failed'), { code: 'ER_DDL' }));

    await expect(ensureCommunityChatSchema()).rejects.toMatchObject({ code: 'ER_DDL' });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('手工 migration、基线 dump 与只读断言保持同一组基础表和通知默认值', async () => {
    const [
      migration,
      textMigration,
      governanceMigration,
      singleRoomMigration,
      accountIdCollationMigration,
      runtimePolicyMigration,
      notificationsMigration,
      imagesMigration,
      interactionsMigration,
      pinMigration,
      profileMigration,
      identityMentionStickerMigration,
      pollReceiptMigration,
      multipleChoicePollMigration,
      baseline,
      assertions,
    ] = await Promise.all([
      readFile(new URL('../migrations/20260809_community_chat_foundation.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260809_community_chat_text_mvp.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260809_community_chat_governance.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260809_community_chat_single_room.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260809_community_chat_account_id_collation.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260809_community_chat_runtime_policy.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260809_community_chat_notifications.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260809_community_chat_images.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260810_community_chat_message_interactions.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260810_community_chat_message_pin.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260811_community_chat_member_profiles.sql', import.meta.url), 'utf8'),
      readFile(
        new URL('../migrations/20260813_community_chat_identity_mentions_stickers.sql', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../migrations/20260826_community_chat_polls_read_receipts.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/20260827_community_chat_multiple_choice_polls.sql', import.meta.url), 'utf8'),
      readFile(new URL('../tag_db.sql', import.meta.url), 'utf8'),
      readFile(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8'),
    ]);
    expect(notificationsMigration).toContain("'mentions_only'");
    const tableNames = [
      'community_chat_rooms',
      'community_chat_access_requests',
      'community_chat_members',
      'community_chat_user_settings',
      'community_chat_access_audit',
    ];

    for (const tableName of tableNames) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS \`${tableName}\``);
      expect(baseline).toContain(`CREATE TABLE \`${tableName}\``);
      expect(assertions).toContain(`'${tableName}'`);
    }
    for (const tableName of ['community_chat_messages', 'community_chat_reads']) {
      expect(textMigration).toContain(`CREATE TABLE IF NOT EXISTS \`${tableName}\``);
      expect(baseline).toContain(`CREATE TABLE \`${tableName}\``);
      expect(assertions).toContain(`'${tableName}'`);
      expect(COMMUNITY_CHAT_TABLE_SQL.some((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${tableName}`))).toBe(
        true,
      );
    }
    for (const tableName of [
      'community_chat_blocks',
      'community_chat_reports',
      'community_chat_moderation_actions',
      'community_chat_member_sanctions',
    ]) {
      expect(governanceMigration).toContain(`CREATE TABLE IF NOT EXISTS \`${tableName}\``);
      expect(baseline).toContain(`CREATE TABLE \`${tableName}\``);
      expect(assertions).toContain(`'${tableName}'`);
      expect(COMMUNITY_CHAT_TABLE_SQL.some((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${tableName}`))).toBe(
        true,
      );
    }
    expect(runtimePolicyMigration).toContain('CREATE TABLE IF NOT EXISTS `community_chat_runtime_policy`');
    expect(runtimePolicyMigration).toContain('`posting_enabled` tinyint unsigned NOT NULL DEFAULT 1');
    expect(runtimePolicyMigration).toContain('INSERT IGNORE INTO `community_chat_runtime_policy`');
    expect(baseline).toContain('CREATE TABLE `community_chat_runtime_policy`');
    expect(assertions).toContain('missing_community_chat_runtime_policy_table');
    expect(COMMUNITY_CHAT_TABLE_SQL.join('\n')).toContain('CREATE TABLE IF NOT EXISTS community_chat_runtime_policy');
    for (const [migrationSource, tableName] of [
      [notificationsMigration, 'community_chat_message_mentions'],
      [imagesMigration, 'community_chat_message_images'],
    ]) {
      expect(migrationSource).toContain(`CREATE TABLE IF NOT EXISTS \`${tableName}\``);
      expect(baseline).toContain(`CREATE TABLE \`${tableName}\``);
      expect(assertions).toContain(`'${tableName}'`);
      expect(COMMUNITY_CHAT_TABLE_SQL.some((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${tableName}`))).toBe(
        true,
      );
    }
    expect(imagesMigration).toContain('uk_community_chat_image_public');
    expect(imagesMigration).toContain('idx_community_chat_image_owner_status_expiry');
    expect(interactionsMigration).toContain('CREATE TABLE IF NOT EXISTS `community_chat_message_likes`');
    expect(interactionsMigration).toContain('CREATE TABLE IF NOT EXISTS `community_chat_message_deletions`');
    expect(interactionsMigration).toContain('`recalled_at`');
    expect(interactionsMigration).toContain('`recalled_by`');
    expect(pinMigration).toContain('`pinned_message_id`');
    expect(pinMigration).toContain('`pinned_by`');
    expect(pinMigration).toContain('`pinned_at`');
    expect(baseline).toContain('`pinned_message_id` bigint unsigned DEFAULT NULL');
    expect(assertions).toContain('community_chat_rooms.pinned_message_id');
    expect(baseline).toContain('CREATE TABLE `community_chat_message_likes`');
    expect(baseline).toContain('CREATE TABLE `community_chat_message_deletions`');
    expect(assertions).toContain('missing_community_chat_interaction_table');
    expect(COMMUNITY_CHAT_TABLE_SQL.join('\n')).toContain('CREATE TABLE IF NOT EXISTS community_chat_message_likes');
    expect(COMMUNITY_CHAT_TABLE_SQL.join('\n')).toContain(
      'CREATE TABLE IF NOT EXISTS community_chat_message_deletions',
    );
    expect(profileMigration).toContain('CREATE TABLE IF NOT EXISTS community_chat_member_profiles');
    expect(profileMigration).toContain('featured_achievements json DEFAULT NULL');
    expect(baseline).toContain('CREATE TABLE `community_chat_member_profiles`');
    expect(assertions).toContain('missing_community_chat_profile_table');
    expect(COMMUNITY_CHAT_TABLE_SQL.join('\n')).toContain('CREATE TABLE IF NOT EXISTS community_chat_member_profiles');
    expect(notificationsMigration).toContain('idx_community_chat_mention_user_message');
    expect(identityMentionStickerMigration).toContain('CREATE TABLE IF NOT EXISTS `community_chat_user_identities`');
    expect(identityMentionStickerMigration).toContain('`payload_fingerprint`');
    expect(identityMentionStickerMigration).toContain('`mention_everyone`');
    expect(identityMentionStickerMigration).toContain('`display_name_snapshot`');
    expect(identityMentionStickerMigration).toContain('CREATE TABLE IF NOT EXISTS `community_chat_custom_stickers`');
    expect(baseline).toContain('CREATE TABLE `community_chat_user_identities`');
    expect(baseline).toContain('CREATE TABLE `community_chat_custom_stickers`');
    expect(baseline).toContain("`mention_everyone` tinyint unsigned NOT NULL DEFAULT '0'");
    expect(assertions).toContain('community_chat_messages.mention_everyone');
    expect(assertions).toContain('missing_community_chat_identity_table');
    expect(assertions).toContain('missing_community_chat_custom_sticker_table');
    for (const tableName of [
      'community_chat_polls',
      'community_chat_poll_options',
      'community_chat_poll_votes',
      'community_chat_poll_multi_votes',
      'community_chat_message_read_receipts',
    ]) {
      expect(pollReceiptMigration).toContain(`CREATE TABLE IF NOT EXISTS \`${tableName}\``);
      expect(baseline).toContain(`CREATE TABLE \`${tableName}\``);
      expect(assertions).toContain(`'${tableName}'`);
      expect(COMMUNITY_CHAT_TABLE_SQL.join('\n')).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
    expect(pollReceiptMigration).toContain('`read_receipt_enabled` tinyint unsigned NOT NULL DEFAULT 0');
    expect(multipleChoicePollMigration).toContain("COLUMN_NAME='selection_mode'");
    expect(multipleChoicePollMigration).toContain("COLUMN_NAME='max_selections'");
    expect(multipleChoicePollMigration).toContain('CREATE TABLE IF NOT EXISTS `community_chat_poll_multi_votes`');
    expect(baseline).toContain("`read_receipt_enabled` tinyint unsigned NOT NULL DEFAULT '0'");
    expect(assertions).toContain('invalid_community_chat_read_receipt');
    expect(assertions).toContain('invalid_community_chat_poll_message');
    expect(assertions).toContain('invalid_community_chat_poll_option_count');
    expect(assertions).toContain('invalid_community_chat_poll_selection');
    expect(assertions).toContain('invalid_community_chat_poll_selection_column');
    expect(assertions).toContain('invalid_community_chat_poll_multi_vote_count');
    expect(assertions).toContain('invalid_community_chat_read_receipt_flag');
    expect(assertions).toContain('invalid_community_chat_poll_receipt_index');
    expect(assertions).toContain("'idx_community_chat_poll_option_message', 1, 'message_id,id'");
    expect(assertions).toContain("'idx_community_chat_poll_vote_user_time', 1, 'user_id,update_time,message_id'");
    expect(assertions).toContain("'idx_community_chat_poll_multi_vote_user_time', 1, 'user_id,update_time,message_id'");
    expect(assertions).toContain("COALESCE(voter.del_flag, '1')<>'0'");
    expect(assertions).toContain("COALESCE(reader.del_flag, '1')<>'0'");
    expect(assertions).toContain("COALESCE(author.role, '')<>'root'");
    expect(assertions).not.toContain('poll.ends_at_utc<=message.create_time');
    expect(textMigration).toContain('uk_community_chat_message_request');
    expect(textMigration).toContain('last_read_message_id');
    expect(singleRoomMigration).toContain("('general'");
    expect(singleRoomMigration).toContain("SET `status` = 'archived'");
    expect(singleRoomMigration).toContain('GREATEST(`last_read_message_id`');
    expect(singleRoomMigration).toContain('UPDATE `community_chat_messages`');
    for (const tableName of [
      'community_chat_access_requests',
      'community_chat_members',
      'community_chat_user_settings',
      'community_chat_access_audit',
    ]) {
      expect(accountIdCollationMigration).toContain(`ALTER TABLE \`${tableName}\``);
    }
    for (const columnName of ['user_id', 'reviewed_by', 'invited_by', 'actor_user_id', 'target_user_id']) {
      expect(accountIdCollationMigration).toContain(
        `\`${columnName}\` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci`,
      );
    }
    for (const schemaSource of [migration, textMigration, governanceMigration, baseline]) {
      expect(schemaSource).toContain('varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL');
    }
    expect(COMMUNITY_CHAT_TABLE_SQL.join('\n')).toContain(
      'user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL',
    );
    expect(assertions).toContain('invalid_community_chat_account_id_collation');
    for (const [column, defaultValue] of [
      ['global_notification_enabled', 1],
      ['browser_notification_enabled', 0],
      ['android_notification_enabled', 0],
    ]) {
      const definition = `\`${column}\` tinyint unsigned NOT NULL DEFAULT ${defaultValue}`;
      expect(migration).toContain(definition);
      expect(baseline).toContain(definition);
    }
    expect(assertions).toContain("'global_notification_enabled' column_name, '1' default_value");
  });
});
