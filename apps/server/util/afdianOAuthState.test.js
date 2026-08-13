import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = new Map();
const redis = {
  setEx: vi.fn(async (key, _ttl, value) => values.set(key, value)),
  getDel: vi.fn(async (key) => {
    const value = values.get(key) || null;
    values.delete(key);
    return value;
  }),
};
vi.mock('./redisClient.js', () => ({ default: redis }));

const { createAfdianOAuthState, consumeAfdianOAuthState } = await import('./afdianOAuthState.js');

beforeEach(() => {
  values.clear();
  vi.clearAllMocks();
});

describe('爱发电 OAuth state', () => {
  it('只保存摘要键并绑定当前轻笺用户与会话，且只能消费一次', async () => {
    const { state } = await createAfdianOAuthState({ userId: 'user-1', sessionId: 'session-1' });
    expect(state).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect([...values.keys()][0]).not.toContain(state);

    await expect(consumeAfdianOAuthState({ state, userId: 'user-1', sessionId: 'session-1' })).resolves.toBeUndefined();
    await expect(consumeAfdianOAuthState({ state, userId: 'user-1', sessionId: 'session-1' })).rejects.toMatchObject({
      code: 'AFDIAN_OAUTH_STATE_EXPIRED',
    });
  });

  it('拒绝跨账号或跨会话消费', async () => {
    const { state } = await createAfdianOAuthState({ userId: 'user-1', sessionId: 'session-1' });
    await expect(consumeAfdianOAuthState({ state, userId: 'user-2', sessionId: 'session-1' })).rejects.toMatchObject({
      code: 'AFDIAN_OAUTH_STATE_INVALID',
    });
  });
});
