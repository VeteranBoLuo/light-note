import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query, getConnection: vi.fn() } }));

// common.js↔router↔handler 循环依赖:先 import common.js 破循环(同其它 handler 测试)
await import('../util/common.js');
const { registerUser } = await import('./userHandle.js');

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
}

describe('registerUser 邮箱已存在(v1.1:改 409 而非 500)', () => {
  beforeEach(() => query.mockReset());

  it('邮箱已存在 → 409,且不创建用户(不 INSERT INTO user)', async () => {
    // 所有 query 都返回「命中一条已存在用户」:SELECT email 非空即走 409 分支提前返回
    query.mockResolvedValue([[{ id: 'exists', email: 'a@b.com' }]]);
    const res = mockRes();
    await registerUser({ headers: {}, body: { email: 'a@b.com', password: 'secret123', signupSource: 'nav' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
    // 关键:提前返回,绝不创建用户
    expect(query.mock.calls.every((c) => !/INSERT INTO user/.test(c[0]))).toBe(true);
  });

  it('弱密码 → 400,不创建用户(记 weak_password,不 INSERT INTO user)', async () => {
    query.mockResolvedValue([[]]); // 邮箱不存在,进入密码校验
    const res = mockRes();
    await registerUser({ headers: {}, body: { email: 'new@b.com', password: '1', signupSource: 'nav' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(query.mock.calls.every((c) => !/INSERT INTO user/.test(c[0]))).toBe(true);
  });
});
