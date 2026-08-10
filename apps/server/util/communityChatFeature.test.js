import { describe, expect, it } from 'vitest';
import { getCommunityChatFeatureState } from './communityChatFeature.js';

describe('getCommunityChatFeatureState', () => {
  it('缺省和未知配置都失败关闭聊天室能力，但注册用户提醒偏好默认开启', () => {
    expect(getCommunityChatFeatureState({})).toEqual({
      accessMode: 'closed',
      waitlistEnabled: false,
      messagingEnabled: false,
      realtimeEnabled: false,
      emergencyReadOnly: false,
      rulesVersion: '2026-08-v1',
      notificationsDefaultEnabled: true,
    });
    expect(getCommunityChatFeatureState({ COMMUNITY_CHAT_ACCESS_MODE: 'typo-open' }).accessMode).toBe('closed');
  });

  it('只有显式邀请制与消息开关同时开启才开放文本试点，并独立控制申请与实时能力', () => {
    expect(
      getCommunityChatFeatureState({
        COMMUNITY_CHAT_ACCESS_MODE: 'invite_only',
        COMMUNITY_CHAT_WAITLIST_ENABLED: '1',
        COMMUNITY_CHAT_MESSAGING_ENABLED: 'true',
        COMMUNITY_CHAT_REALTIME_ENABLED: 'true',
        COMMUNITY_CHAT_RULES_VERSION: '2026-08-pilot-v2',
      }),
    ).toEqual({
      accessMode: 'invite_only',
      waitlistEnabled: true,
      messagingEnabled: true,
      realtimeEnabled: true,
      emergencyReadOnly: false,
      rulesVersion: '2026-08-pilot-v2',
      notificationsDefaultEnabled: true,
    });
  });

  it('公共模式允许显式开启消息，但仍不会越过独立的消息总开关', () => {
    expect(
      getCommunityChatFeatureState({
        COMMUNITY_CHAT_ACCESS_MODE: 'public',
        COMMUNITY_CHAT_MESSAGING_ENABLED: 'true',
      }),
    ).toMatchObject({ accessMode: 'public', messagingEnabled: true });
    expect(getCommunityChatFeatureState({ COMMUNITY_CHAT_ACCESS_MODE: 'public' })).toMatchObject({
      accessMode: 'public',
      messagingEnabled: false,
    });
  });

  it('关闭访问时即使误开 realtime 也不会宣称实时能力可用', () => {
    expect(getCommunityChatFeatureState({ COMMUNITY_CHAT_REALTIME_ENABLED: '1' }).realtimeEnabled).toBe(false);
  });

  it('环境级紧急只读必须显式开启，与消息总开关独立', () => {
    expect(
      getCommunityChatFeatureState({
        COMMUNITY_CHAT_ACCESS_MODE: 'public',
        COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
        COMMUNITY_CHAT_EMERGENCY_READ_ONLY: 'true',
      }),
    ).toMatchObject({ messagingEnabled: true, emergencyReadOnly: true });
    expect(getCommunityChatFeatureState({ COMMUNITY_CHAT_EMERGENCY_READ_ONLY: '1' })).toMatchObject({
      messagingEnabled: false,
      emergencyReadOnly: true,
    });
  });

  it('仅误开 realtime 而未开消息试点时仍保持失败关闭', () => {
    expect(
      getCommunityChatFeatureState({
        COMMUNITY_CHAT_ACCESS_MODE: 'invite_only',
        COMMUNITY_CHAT_REALTIME_ENABLED: '1',
      }),
    ).toMatchObject({ messagingEnabled: false, realtimeEnabled: false });
  });
});
