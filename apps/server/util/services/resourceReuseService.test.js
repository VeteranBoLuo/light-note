import { describe, expect, it, vi } from 'vitest';
import { normalizeResourceReuseInput, recordResourceReuse } from './resourceReuseService.js';

describe('资料再次使用输入', () => {
  it.each([
    null,
    [],
    {},
    { resourceType: '__proto__', resourceId: 'id' },
    { resourceType: 'note', resourceId: {} },
    { resourceType: 'note', resourceId: 'private title/url' },
    { resourceType: 'file', resourceId: '12oops' },
    { resourceType: 'file', resourceId: 1.5 },
    { resourceType: 'note', resourceId: 'id', userId: 'other' },
    { resourceType: 'note', resourceId: 'id', createdAt: 'yesterday' },
  ])('拒绝畸形、额外字段与非白名单类型 %#', (body) => expect(normalizeResourceReuseInput(body)).toBeNull());
  it('三类资料只保留当次查验参数', () => {
    expect(normalizeResourceReuseInput({ resourceType: 'file', resourceId: 12 })).toEqual({
      resourceType: 'file',
      resourceId: '12',
    });
  });
});

describe('资料里程碑事务', () => {
  function fixture({ user = true, existing = false, failure = false } = {}) {
    const c = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi.fn(async ({ sql }) => {
        if (sql.includes('FOR UPDATE')) return [user ? [{ id: 'owner' }] : []];
        if (sql.startsWith('SELECT 1')) return [existing ? [{}] : []];
        if (failure) throw Object.assign(new Error('private SQL'), { code: 'ER_QUERY_TIMEOUT' });
        return [{ affectedRows: 1 }];
      }),
    };
    return { c, db: { getConnection: async () => c } };
  }
  it('先锁账号再写里程碑，已记录不重复写入', async () => {
    const f = fixture({ existing: true });
    expect(await recordResourceReuse('owner', { resourceType: 'note', resourceId: 'n' }, f)).toEqual({
      accepted: true,
    });
    expect(f.c.query).toHaveBeenCalledTimes(2);
    expect(f.c.commit).toHaveBeenCalledOnce();
  });
  it('停用或注销账号无持久化写入', async () => {
    const f = fixture({ user: false });
    expect(await recordResourceReuse('owner', { resourceType: 'note', resourceId: 'n' }, f)).toEqual({
      accepted: false,
    });
    expect(f.c.query).toHaveBeenCalledTimes(1);
    expect(f.c.rollback).toHaveBeenCalledOnce();
  });
  it('异常回滚并释放连接', async () => {
    const f = fixture({ failure: true });
    await expect(recordResourceReuse('owner', { resourceType: 'note', resourceId: 'n' }, f)).rejects.toMatchObject({
      code: 'ER_QUERY_TIMEOUT',
    });
    expect(f.c.commit).not.toHaveBeenCalled();
    expect(f.c.rollback).toHaveBeenCalledOnce();
    expect(f.c.release).toHaveBeenCalledOnce();
  });
});
