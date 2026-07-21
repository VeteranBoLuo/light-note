import { describe, expect, it, vi } from 'vitest';

vi.unmock('./redisClient.js');

describe('NODE_ENV=test 基础设施隔离', () => {
  it('未显式 mock 时数据库适配器 fail-fast，不创建真实连接', async () => {
    const { default: pool } = await import('../db/index.js');
    expect(() => pool.getConnection()).toThrow(/TEST_DATABASE_DISABLED/);
    expect(() => pool.query('SELECT 1')).toThrow(/TEST_DATABASE_DISABLED/);
  });

  it('未显式 mock 时 Redis 适配器 fail-fast，不创建真实连接', async () => {
    const { default: redisClient } = await import('./redisClient.js');
    expect(redisClient.isOpen).toBe(false);
    await expect(redisClient.get('test')).rejects.toMatchObject({ code: 'TEST_REDIS_DISABLED' });
  });
});
