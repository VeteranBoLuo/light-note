import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = {
  setEx: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};
const query = vi.fn();

vi.mock('./redisClient.js', () => ({ default: redis }));
vi.mock('../db/index.js', () => ({ default: { query } }));

const {
  AdminContextError,
  adminContextPublicView,
  createAdminContext,
  getAdminContext,
  getAdminContextMetadata,
  revokeAdminContext,
} = await import('./adminContextStore.js');

describe('adminContextStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.setEx.mockResolvedValue('OK');
    redis.del.mockResolvedValue(1);
    process.env.ADMIN_MAINTENANCE_ENABLED = 'true';
  });

  it('公开上下文只返回最小信息并向维护模式提供云空间能力', () => {
    const visitor = adminContextPublicView({
      id: 'ctx-1',
      subjectUserId: 'visitor-1',
      subjectRole: 'visitor',
      subjectAlias: '游客',
      mode: 'maintain',
      issuedAt: '2026-07-15T00:00:00.000Z',
      expiresAt: '2026-07-15T00:10:00.000Z',
      actorSessionId: 'must-not-leak',
    });
    expect(visitor.capabilities).toContain('bookmark.write');
    expect(visitor.capabilities).toContain('file.write');
    expect(visitor).not.toHaveProperty('actorSessionId');
  });

  it('仅 root 真实会话可签发，且 Redis 只保存令牌哈希键', async () => {
    query.mockResolvedValue([[
      { id: 'user-1', alias: '普通用户', email: 'u@example.com', role: 'user', del_flag: 0 },
    ]]);
    const result = await createAdminContext({
      actor: { id: 'root-1', role: 'root' },
      actorSessionId: 'sid-1',
      subjectUserId: 'user-1',
      mode: 'readonly',
    });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(result.context.actorSessionId).toBe('sid-1');
    expect(result.context.subjectUserId).toBe('user-1');
    expect(redis.setEx).toHaveBeenCalledTimes(2);
    const [key, ttl, raw] = redis.setEx.mock.calls[0];
    expect(key).toMatch(/^admin-context:[0-9a-f]{64}$/);
    expect(key).not.toContain(result.token);
    expect(ttl).toBe(20 * 60);
    expect(JSON.parse(raw).mode).toBe('readonly');
    const [metadataCacheKey, metadataTtl, metadataRaw] = redis.setEx.mock.calls[1];
    expect(metadataCacheKey).toMatch(/^admin-context-meta:[0-9a-f]{64}$/);
    expect(metadataCacheKey).not.toContain(result.token);
    expect(metadataTtl).toBe(20 * 60 + 24 * 60 * 60);
    expect(JSON.parse(metadataRaw).id).toBe(result.context.id);
  });

  it('维护模式使用更短有效期', async () => {
    query.mockResolvedValue([[{ id: 'visitor-1', role: 'visitor', del_flag: 0 }]]);
    await createAdminContext({
      actor: { id: 'root-1', role: 'root' },
      actorSessionId: 'sid-1',
      subjectUserId: 'visitor-1',
      mode: 'maintain',
    });
    expect(redis.setEx.mock.calls[0][1]).toBe(10 * 60);
  });

  it('维护模式未被部署环境显式开启时失败关闭', async () => {
    delete process.env.ADMIN_MAINTENANCE_ENABLED;
    await expect(
      createAdminContext({
        actor: { id: 'root-1', role: 'root' },
        actorSessionId: 'sid-1',
        subjectUserId: 'visitor-1',
        mode: 'maintain',
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_MAINTENANCE_DISABLED' });
    expect(query).not.toHaveBeenCalled();
  });

  it('拒绝非 root、自预览和 root 目标', async () => {
    await expect(
      createAdminContext({
        actor: { id: 'user-1', role: 'user' },
        actorSessionId: 'sid-1',
        subjectUserId: 'user-2',
        mode: 'readonly',
      }),
    ).rejects.toBeInstanceOf(AdminContextError);

    await expect(
      createAdminContext({
        actor: { id: 'root-1', role: 'root' },
        actorSessionId: 'sid-1',
        subjectUserId: 'root-1',
        mode: 'readonly',
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_CONTEXT_TARGET_INVALID' });

    query.mockResolvedValue([[{ id: 'root-2', role: 'root' }]]);
    await expect(
      createAdminContext({
        actor: { id: 'root-1', role: 'root' },
        actorSessionId: 'sid-1',
        subjectUserId: 'root-2',
        mode: 'readonly',
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_CONTEXT_TARGET_INVALID' });
  });

  it('读取损坏或过期上下文时失败关闭', async () => {
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce('{bad json');
    await expect(getAdminContext('expired')).resolves.toBeNull();
    await expect(getAdminContext('broken')).resolves.toBeNull();
  });

  it('活跃令牌过期后仍可读取短期审计元数据', async () => {
    const context = {
      id: 'ctx-expired',
      mode: 'readonly',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    };
    redis.get.mockResolvedValueOnce(JSON.stringify(context));
    await expect(getAdminContextMetadata('expired-token')).resolves.toEqual({
      context,
      expired: true,
    });
  });

  it('撤销上下文同时删除活跃键和审计元数据键', async () => {
    await expect(revokeAdminContext('token')).resolves.toBe(true);
    expect(redis.del).toHaveBeenCalledTimes(2);
    expect(redis.del.mock.calls[0][0]).toMatch(/^admin-context:[0-9a-f]{64}$/);
    expect(redis.del.mock.calls[1][0]).toMatch(/^admin-context-meta:[0-9a-f]{64}$/);
  });
});
