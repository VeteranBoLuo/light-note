import { createClient } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const state = vi.hoisted(() => ({ redis: null, loseReply: false }));
vi.mock('./redisClient.js', () => ({
  default: {
    get: (...a) => state.redis.get(...a),
    setEx: (...a) => state.redis.setEx(...a),
    eval: async (...a) => {
      const result = await state.redis.eval(...a);
      if (state.loseReply) {
        state.loseReply = false;
        throw new Error('lost Redis acknowledgement');
      }
      return result;
    },
  },
}));
import {
  createGitHubOAuthChallenge,
  consumeGitHubOAuthChallenge,
  prepareGitHubBinding,
  consumeGitHubBinding,
  finishGitHubBinding,
  GITHUB_OAUTH_CONSENT_VERSION,
} from './githubOAuthState.js';
const socket = process.env.LIGHTNOTE_TEST_REDIS_SOCKET;
describe.skipIf(!socket)('GitHub 确认绑定原子认领（隔离 Redis）', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\/light-note-github-[^/]+\/redis\.sock$/.test(socket))
      throw new Error('Dedicated temporary Redis required');
    state.redis = createClient({ socket: { path: socket } });
    await state.redis.connect();
  });
  beforeEach(async () => {
    await state.redis.flushDb();
    state.loseReply = false;
    vi.stubEnv('GITHUB_CLIENT_ID', 'test-client');
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-secret');
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (state.redis?.isOpen) await state.redis.quit();
  });
  async function prepared() {
    const auth = await createGitHubOAuthChallenge({ consentVersion: GITHUB_OAUTH_CONSENT_VERSION });
    const request = {
      state: new URL(auth.authorizationUrl).searchParams.get('state'),
      nonce: auth.nonce,
      code: 'valid-provider-code',
    };
    await consumeGitHubOAuthChallenge(request);
    await prepareGitHubBinding({
      ...request,
      binding: { version: 2, userId: 'owner', githubId: '123', email: 'owner@example.com', snapshot: 'before' },
    });
    return request;
  }
  const keyFor = (request) => 'oauth:github:state:' + createHash('sha256').update(request.state).digest('hex');
  it('认领和完成写入回包丢失时复核本次结果，不丢失票据', async () => {
    const request = await prepared();
    state.loseReply = true;
    const claim = await consumeGitHubBinding({ ...request, confirm: true });
    state.loseReply = true;
    expect(
      await finishGitHubBinding({
        state: request.state,
        processingId: claim.processingId,
        userId: 'owner',
        githubId: '123',
        accountSnapshot: 'after',
      }),
    ).toBe(true);
    expect(await consumeGitHubBinding({ ...request, confirm: true })).toMatchObject({
      recovered: true,
      userId: 'owner',
    });
  });
  it('处理者崩溃后允许确认方重新认领，旧处理者和取消请求不能覆盖结果', async () => {
    const request = await prepared();
    const first = await consumeGitHubBinding({ ...request, confirm: true });
    await expect(consumeGitHubBinding({ ...request, confirm: true })).rejects.toHaveProperty(
      'code',
      'GITHUB_OAUTH_IN_PROGRESS',
    );
    const raw = JSON.parse(await state.redis.get(keyFor(request)));
    raw.bindingProcessingAt = Date.now() - 31_000;
    await state.redis.setEx(keyFor(request), 290, JSON.stringify(raw));
    expect(await consumeGitHubOAuthChallenge(request)).toMatchObject({ bindingRequired: true });
    await expect(consumeGitHubBinding({ ...request, confirm: false })).rejects.toHaveProperty(
      'code',
      'GITHUB_OAUTH_IN_PROGRESS',
    );
    const next = await consumeGitHubBinding({ ...request, confirm: true });
    expect(next.resumeOnly).toBe(true);
    expect(next.processingId).not.toBe(first.processingId);
    expect(next.bindingExpiresAt).toBe(first.bindingExpiresAt);
    expect(await finishGitHubBinding({ state: request.state, processingId: first.processingId, retry: true })).toBe(
      false,
    );
    expect(await finishGitHubBinding({ state: request.state, processingId: next.processingId, userId: 'owner' })).toBe(
      true,
    );
  });
  it('并发确认只有一方获得写入资格，完成后其余请求恢复相同账号', async () => {
    const request = await prepared();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => consumeGitHubBinding({ ...request, confirm: true })),
    );
    const claimed = results.filter((x) => x.status === 'fulfilled');
    expect(claimed).toHaveLength(1);
    await finishGitHubBinding({
      state: request.state,
      processingId: claimed[0].value.processingId,
      userId: 'owner',
      githubId: '123',
      accountSnapshot: 'after',
    });
    expect(await consumeGitHubBinding({ ...request, confirm: true })).toMatchObject({
      recovered: true,
      userId: 'owner',
      githubId: '123',
      accountSnapshot: 'after',
    });
  });
  it('取消与确认竞争时只有一个结果，已取消票据无法恢复登录', async () => {
    const request = await prepared();
    const results = await Promise.allSettled([
      consumeGitHubBinding({ ...request, confirm: false }),
      consumeGitHubBinding({ ...request, confirm: true }),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const raw = JSON.parse(await state.redis.get(keyFor(request)));
    expect(['cancelled', 'binding_processing']).toContain(raw.status);
    if (raw.status === 'cancelled')
      await expect(consumeGitHubBinding({ ...request, confirm: true })).rejects.toHaveProperty(
        'code',
        'GITHUB_OAUTH_STATE_INVALID',
      );
  });
  it('数据库重试不延长绑定期限；旧处理者不能覆盖新认领', async () => {
    const request = await prepared();
    const first = await consumeGitHubBinding({ ...request, confirm: true });
    await finishGitHubBinding({ state: request.state, processingId: first.processingId, retry: true });
    const next = await consumeGitHubBinding({ ...request, confirm: true });
    expect(next.bindingExpiresAt).toBe(first.bindingExpiresAt);
    expect(await finishGitHubBinding({ state: request.state, processingId: first.processingId, retry: true })).toBe(
      false,
    );
    expect(await state.redis.ttl(keyFor(request))).toBeLessThanOrEqual(300);
  });
  it('不存在或过期的票据不能确认', async () => {
    const request = await prepared();
    await state.redis.del(keyFor(request));
    await expect(consumeGitHubBinding({ ...request, confirm: true })).rejects.toHaveProperty(
      'code',
      'GITHUB_OAUTH_STATE_EXPIRED',
    );
  });
  it('绑定阶段拥有自己的五分钟期限，重试不能延长过期票据', async () => {
    const request = await prepared();
    const key = keyFor(request);
    const raw = JSON.parse(await state.redis.get(key));
    raw.consentAt = Date.now() - 11 * 60_000;
    raw.bindingExpiresAt = Date.now() + 60_000;
    await state.redis.setEx(key, 60, JSON.stringify(raw));
    const claim = await consumeGitHubBinding({ ...request, confirm: true });
    expect(claim.bindingExpiresAt).toBe(raw.bindingExpiresAt);
    raw.status = 'binding';
    raw.bindingExpiresAt = Date.now() - 1;
    await state.redis.setEx(key, 60, JSON.stringify(raw));
    await expect(consumeGitHubBinding({ ...request, confirm: true })).rejects.toHaveProperty(
      'code',
      'GITHUB_OAUTH_STATE_EXPIRED',
    );
  });
});
