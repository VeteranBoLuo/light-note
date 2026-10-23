import { describe, it, expect, vi } from 'vitest';
const root = vi.hoisted(() => vi.fn());
vi.mock('../util/rootRole.js', () => ({ ensureRootRole: root }));
import { handle } from './publicResourcesHandle.js';
import { PublicResourceError } from '../util/publicResources/core.js';
const response = () => {
  const res = {};
  for (const method of ['set', 'status', 'send']) res[method] = vi.fn().mockReturnValue(res);
  return res;
};
describe('公开资源 HTTP 边界', () => {
  it('所有响应不缓存，拒绝代管且不调用服务', async () => {
    const service = vi.fn(),
      res = response();
    await handle(service)({ adminContext: { id: 'ctx' } }, res);
    expect(service).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it('Root 分区复核实际身份，传给业务的用户始终来自登录请求', async () => {
    root.mockResolvedValueOnce(null);
    const service = vi.fn(),
      res = response();
    await handle(service, true)({ user: { id: 'u' }, params: {}, headers: {} }, res);
    expect(service).not.toHaveBeenCalled();
    const user = { id: 'real', role: 'user' };
    service.mockResolvedValue({ ok: true });
    await handle(service)(
      { user, params: { id: 'public' }, method: 'POST', body: { owner: 'forged' }, headers: {} },
      res,
    );
    expect(service.mock.calls[0][0].user).toBe(user);
  });
  it('只返回稳定错误码，不泄露数据库或原文错误', async () => {
    const res = response();
    await handle(async () => {
      throw new Error('private SQL and title');
    })({ user: { id: 'u' }, params: {}, headers: {} }, res);
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('private SQL');
    expect(res.status).toHaveBeenCalledWith(503);
    const known = response();
    await handle(async () => {
      throw new PublicResourceError('PUBLIC_RESOURCE_VERSION_CONFLICT', 409);
    })({ params: {}, headers: {} }, known);
    expect(known.status).toHaveBeenCalledWith(409);
  });
});
