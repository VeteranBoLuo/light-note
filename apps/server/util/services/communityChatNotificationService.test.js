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

  it('三级范围严格校验并通过单行 upsert 保存', async () => {
    const db = { query: vi.fn(async () => [{ affectedRows: 1 }, []]) };
    const result = await updateCommunityChatNotificationSettings({
      user: { id: 'user-1', role: 'user' },
      enabled: true,
      level: 'official',
      db,
    });

    expect(result.enabled).toBe(true);
    expect(result.level).toBe('official');
    expect(db.query.mock.calls[0][1]).toEqual(['user-1', 1, 'official']);
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

  it('把官方、提及、引用和全部档一次性幂等投递为仅站内通知', async () => {
    const db = { query: vi.fn(async () => [{ affectedRows: 3 }, []]) };
    const result = await deliverCommunityChatMessageNotifications({
      messagePublicId: '11111111-1111-4111-8111-111111111111',
      env: PUBLIC_ENV,
      db,
    });

    expect(result).toEqual({ delivered: 3 });
    const [sql, params] = db.query.mock.calls[0];
    const text = String(sql);
    expect(text).toContain('INSERT IGNORE INTO notification');
    expect(text).toContain("'community_chat_message'");
    expect(text).toContain("'delivery', 'in_app_only'");
    expect(text).toContain("COALESCE(settings.default_room_level, 'mentions') = 'mentions'");
    expect(text).toContain("COALESCE(settings.default_room_level, 'mentions') = 'all'");
    expect(text).toContain('COALESCE(settings.global_notification_enabled, 1) = 1');
    expect(text).toContain('LEFT JOIN community_chat_user_settings settings');
    expect(text).toContain('recipient.id');
    expect(text).toContain('community_chat_message_mentions');
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
    expect(normalizeCommunityChatNotificationLevel('none')).toBe('mentions');
    expect(__test__.toPublicSettings({ enabled: 1, level: 'garbage' }).level).toBe('mentions');
  });
});
