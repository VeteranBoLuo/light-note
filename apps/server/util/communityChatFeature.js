const ACCESS_MODES = new Set(['closed', 'invite_only', 'public']);

export const COMMUNITY_CHAT_PRIMARY_ROOM_SLUG = 'general';

const enabledFlag = (value) =>
  ['1', 'true', 'yes', 'on'].includes(
    String(value || '')
      .trim()
      .toLowerCase(),
  );

/**
 * 社区客厅必须显式开启。public 为公开浏览/登录发言，invite_only 保留给未来私密频道；
 * 未知值一律回退 closed，避免配置拼写错误时意外开放。
 */
export function getCommunityChatFeatureState(env = process.env) {
  const requestedAccessMode = String(env.COMMUNITY_CHAT_ACCESS_MODE || 'closed')
    .trim()
    .toLowerCase();
  const accessMode = ACCESS_MODES.has(requestedAccessMode) ? requestedAccessMode : 'closed';
  const rulesVersion = String(env.COMMUNITY_CHAT_RULES_VERSION || '2026-08-v1').trim() || '2026-08-v1';
  const messagingEnabled = accessMode !== 'closed' && enabledFlag(env.COMMUNITY_CHAT_MESSAGING_ENABLED);

  return {
    accessMode,
    waitlistEnabled: enabledFlag(env.COMMUNITY_CHAT_WAITLIST_ENABLED),
    messagingEnabled,
    realtimeEnabled: messagingEnabled && enabledFlag(env.COMMUNITY_CHAT_REALTIME_ENABLED),
    emergencyReadOnly: enabledFlag(env.COMMUNITY_CHAT_EMERGENCY_READ_ONLY),
    rulesVersion: rulesVersion.slice(0, 32),
    notificationsDefaultEnabled: true,
  };
}

export const __test__ = { enabledFlag };
