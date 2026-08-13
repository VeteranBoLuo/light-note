import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_CHAT_PRESENCE_AVATAR_TOKEN_TTL_MS,
  issueCommunityChatPresenceAvatarToken,
  verifyCommunityChatPresenceAvatarToken,
} from './presenceAvatarToken.js';

const env = { SESSION_SECRET: 'community-chat-presence-test-secret-0001' };

describe('community chat presence avatar token', () => {
  it('用短期加密票据隐藏内部账号 ID', () => {
    const token = issueCommunityChatPresenceAvatarToken('private-user-id', { env, now: 1000 });
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('private-user-id');
    expect(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).not.toContain('private-user-id');
    expect(verifyCommunityChatPresenceAvatarToken(token, { env, now: 2000 })).toEqual({
      userId: 'private-user-id',
      expiresAt: 1000 + COMMUNITY_CHAT_PRESENCE_AVATAR_TOKEN_TTL_MS,
    });
  });

  it('拒绝篡改和过期票据', () => {
    const token = issueCommunityChatPresenceAvatarToken('user-a', { env, now: 1000 });
    const tampered = `${token.slice(0, -2)}${token.at(-2) === 'A' ? 'B' : 'A'}${token.at(-1)}`;
    expect(() => verifyCommunityChatPresenceAvatarToken(tampered, { env, now: 2000 })).toThrow(
      'COMMUNITY_CHAT_PRESENCE_AVATAR_INVALID',
    );
    expect(() =>
      verifyCommunityChatPresenceAvatarToken(token, {
        env,
        now: 1000 + COMMUNITY_CHAT_PRESENCE_AVATAR_TOKEN_TTL_MS + 1,
      }),
    ).toThrow('COMMUNITY_CHAT_PRESENCE_AVATAR_EXPIRED');
  });
});
