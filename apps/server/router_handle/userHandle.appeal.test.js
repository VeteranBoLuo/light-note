import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query, getConnection: vi.fn() } }));

// common.js↔router↔handler 循环依赖:先 import common.js 破循环(同其它 handler 测试)
await import('../util/common.js');
const { submitAppeal } = await import('./userHandle.js');

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
}

describe('submitAppeal(封禁申诉)', () => {
  beforeEach(() => query.mockReset());

  it('游客 → 403,不写库', async () => {
    const res = mockRes();
    await submitAppeal({ user: { role: 'visitor', id: 'v' }, body: { content: 'x' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('内容为空 → 400', async () => {
    const res = mockRes();
    await submitAppeal({ user: { role: 'admin', id: 'u1' }, body: { content: '   ' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('待处理申诉 ≥5 → 429', async () => {
    query.mockResolvedValueOnce([[{ c: 5 }]]);
    const res = mockRes();
    await submitAppeal({ user: { role: 'admin', id: 'u1' }, body: { content: '申诉内容' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 429 }));
  });

  it('正常提交:服务端强制 type=封禁申诉 / status=pending 写入 opinion', async () => {
    query.mockResolvedValueOnce([[{ c: 0 }]]); // pending count
    query.mockResolvedValueOnce([{}]); // insert
    const res = mockRes();
    await submitAppeal({ user: { role: 'admin', id: 'u1' }, body: { content: '我要申诉', phone: '123', type: '伪造', status: 'replied' } }, res);
    const insertCall = query.mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO opinion');
    const row = insertCall[1][0];
    expect(row.type).toBe('封禁申诉'); // 前端传的 '伪造' 被忽略
    expect(row.status).toBe('pending'); // 前端传的 'replied' 被忽略
    expect(row.user_id).toBe('u1');
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });
});
