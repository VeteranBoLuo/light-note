import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query: mocks.query } }));

const {
  COMMUNITY_CHAT_ROOM_SEED_SQL,
  COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL,
  COMMUNITY_CHAT_TABLE_SQL,
  ensureCommunityChatSchema,
} = await import('./communityChatSchema.js');

describe('ensureCommunityChatSchema', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue([[], []]);
  });

  it('幂等创建访问、消息互动、个人删除、图片、治理与运行策略共十六张表并补齐默认数据', async () => {
    await ensureCommunityChatSchema();

    expect(COMMUNITY_CHAT_TABLE_SQL).toHaveLength(16);
    expect(mocks.query).toHaveBeenCalledTimes(21);
    expect(
      mocks.query.mock.calls.slice(0, 16).every(([sql]) => String(sql).includes('CREATE TABLE IF NOT EXISTS')),
    ).toBe(true);
    expect(String(mocks.query.mock.calls[16][0])).toContain('information_schema.COLUMNS');
    expect(String(mocks.query.mock.calls[17][0])).toContain('ADD COLUMN `recalled_at`');
    expect(String(mocks.query.mock.calls[18][0])).toContain('ADD COLUMN `recalled_by`');
    expect(mocks.query.mock.calls[19][0]).toBe(COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL);
    expect(mocks.query.mock.calls[20][0]).toBe(COMMUNITY_CHAT_ROOM_SEED_SQL);
    expect(COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL).toContain('VALUES (1, 1)');
    expect(COMMUNITY_CHAT_ROOM_SEED_SQL).toContain("('general'");
    expect(COMMUNITY_CHAT_ROOM_SEED_SQL).not.toContain("('announcements'");
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
    expect(baseline).toContain('CREATE TABLE `community_chat_message_likes`');
    expect(baseline).toContain('CREATE TABLE `community_chat_message_deletions`');
    expect(assertions).toContain('missing_community_chat_interaction_table');
    expect(COMMUNITY_CHAT_TABLE_SQL.join('\n')).toContain('CREATE TABLE IF NOT EXISTS community_chat_message_likes');
    expect(COMMUNITY_CHAT_TABLE_SQL.join('\n')).toContain(
      'CREATE TABLE IF NOT EXISTS community_chat_message_deletions',
    );
    expect(notificationsMigration).toContain('idx_community_chat_mention_user_message');
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
