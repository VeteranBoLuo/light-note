import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __test__,
  deliverCommunityChatMessageNotifications,
  getCommunityChatNotificationSettings,
  normalizeCommunityChatNotificationLevel,
  updateCommunityChatNotificationSettings,
} from './communityChatNotificationService.js';

const PUBLIC_ENV = {
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_RULES_VERSION: 'rules-v1',
};

function createConnection(queryImplementation) {
  return {
    beginTransaction: vi.fn(async () => {}),
    query: vi.fn(queryImplementation),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
}

describe('communityChatNotificationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('没有设置行时返回默认开启、提及档，且不暗中创建设置', async () => {
    const db = { query: vi.fn(async () => [[], []]) };
    const result = await getCommunityChatNotificationSettings({ user: { id: 'user-1', role: 'user' }, db });

    expect(result).toEqual({
      enabled: true,
      level: 'mentions',
      defaultEnabled: true,
      replyCountsAsMention: true,
      channels: {
        inApp: { available: true, enabled: true },
        browser: { available: false, enabled: false },
        android: { available: false, enabled: false },
      },
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('四档范围严格校验并通过单行 upsert 保存', async () => {
    const connection = createConnection(async (sql) => {
      if (String(sql).includes('SELECT global_notification_enabled')) return [[{ enabled: 1 }], []];
      if (String(sql).includes('INSERT INTO community_chat_user_settings')) return [{ affectedRows: 1 }, []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };
    const result = await updateCommunityChatNotificationSettings({
      user: { id: 'user-1', role: 'user' },
      enabled: true,
      level: 'official',
      db,
    });

    expect(result.enabled).toBe(true);
    expect(result.level).toBe('official');
    expect(connection.query.mock.calls[1][1]).toEqual(['user-1', 1, 'official']);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    await expect(
      updateCommunityChatNotificationSettings({
        user: { id: 'user-1', role: 'user' },
        enabled: true,
        level: 'none',
        db,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_NOTIFICATION_LEVEL', status: 400 });
    await expect(
      updateCommunityChatNotificationSettings({
        user: { id: 'user-1', role: 'user' },
        enabled: 1,
        level: 'all',
        db,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_NOTIFICATION_ENABLED', status: 400 });
  });

  it('关闭提醒时清理已有聊天室通知并把当前最新消息设为阅读基线', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT global_notification_enabled')) return [[], []];
      if (text.includes('INSERT INTO community_chat_user_settings')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_reads')) return [{ affectedRows: 1 }, []];
      if (text.includes('UPDATE notification')) return [{ affectedRows: 3 }, []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await updateCommunityChatNotificationSettings({
      user: { id: 'user-1', role: 'user' },
      enabled: false,
      level: 'mentions',
      db,
    });

    expect(result.enabled).toBe(false);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_reads'))).toBe(
      true,
    );
    const purgeCall = connection.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE notification'));
    expect(String(purgeCall?.[0])).toContain("type = 'community_chat'");
    const readBaselineCall = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO community_chat_reads'),
    );
    expect(readBaselineCall?.[1]).toEqual(['user-1', 'general']);
    expect(purgeCall?.[1]).toEqual(['user-1']);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('重新开启时跳过关闭期间的历史消息，但不会清理其他通知', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT global_notification_enabled')) return [[{ enabled: 0 }], []];
      if (text.includes('INSERT INTO community_chat_user_settings')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_reads')) return [{ affectedRows: 1 }, []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    await updateCommunityChatNotificationSettings({
      user: { id: 'user-1', role: 'user' },
      enabled: true,
      level: 'all',
      db,
    });

    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_reads'))).toBe(
      true,
    );
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE notification'))).toBe(false);
  });

  it('回复与显式提及按同一规则幂等投递，同一消息回复并 @ 同一人也由来源键去重', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([{ affectedRows: 1 }, []]) };
    const result = await deliverCommunityChatMessageNotifications({
      messagePublicId: '11111111-1111-4111-8111-111111111111',
      env: PUBLIC_ENV,
      db,
    });

    expect(result).toEqual({ delivered: 1 });
    const [sql, params] = db.query.mock.calls[0];
    const text = String(sql);
    expect(text).toContain('INSERT IGNORE INTO notification');
    expect(text).toContain("'community_chat_message'");
    expect(text).toContain("'delivery', 'in_app_only'");
    expect(text).toContain("'kind', CASE WHEN reply.user_id = recipient.id THEN 'reply' ELSE 'mention' END");
    expect(text).toContain("'mentionEveryone', IF(message.mention_everyone = 1, 1, 0)");
    expect(text).toContain('LEFT JOIN community_chat_messages reply ON reply.id = message.reply_to_id');
    expect(text).toContain('LEFT JOIN community_chat_message_mentions mention ON mention.message_id = message.id');
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(text).toContain('recipient_identity.user_id = reply.user_id');
    expect(text).toContain('recipient_identity.user_id = mention.mentioned_user_id');
    expect(text).toContain('message.mention_everyone = 1');
    expect(text).toContain('message.mention_everyone = 0 OR settings.user_id IS NOT NULL');
    expect(text).toContain('COALESCE(settings.global_notification_enabled, 1) = 1');
    expect(text).toContain('LEFT JOIN community_chat_user_settings settings');
    expect(text).toContain('JOIN community_chat_user_identities recipient_identity');
    expect(text).toContain('JOIN user recipient ON recipient.id = recipient_identity.user_id');
    expect(text).toContain('recipient.id');
    expect(text).toContain("CASE WHEN reply.user_id = recipient.id THEN '有人回复了你' ELSE '有人提及了你' END");
    expect(text).toContain("COALESCE(settings.default_room_level, 'mentions') = 'official'");
    expect(text).toContain("COALESCE(settings.default_room_level, 'mentions') = 'mentions_only'");
    expect(text).toContain("COALESCE(settings.default_room_level, 'mentions') IN ('mentions', 'all')");
    expect(text).toContain("sender.role = 'root'");
    expect(text).toContain("sender_membership.role = 'moderator'");
    expect(text).toContain("JSON_EXTRACT(recipient.preferences, '$.notificationsInApp')");
    expect(text).toContain('community_chat_blocks');
    expect(params).toEqual(['11111111-1111-4111-8111-111111111111']);
  });

  it('邀请制投递继续复核有效成员与规则版本', async () => {
    const db = { query: vi.fn(async () => [{ affectedRows: 0 }, []]) };
    await deliverCommunityChatMessageNotifications({
      messagePublicId: '11111111-1111-4111-8111-111111111111',
      env: { ...PUBLIC_ENV, COMMUNITY_CHAT_ACCESS_MODE: 'invite_only' },
      db,
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(String(sql)).toContain('recipient_membership.rules_version = ?');
    expect(params).toEqual(['11111111-1111-4111-8111-111111111111', 'rules-v1']);
  });

  it('旧值与未知值在只读展示时安全回退到推荐档', () => {
    expect(normalizeCommunityChatNotificationLevel('all')).toBe('all');
    expect(normalizeCommunityChatNotificationLevel('mentions_only')).toBe('mentions_only');
    expect(normalizeCommunityChatNotificationLevel('none')).toBe('mentions');
    expect(__test__.toPublicSettings({ enabled: 1, level: 'garbage' }).level).toBe('mentions');
  });
});
