import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ManorError } from '@lightnote/shared/manor';
const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  overview: vi.fn(),
  players: vi.fn(),
  player: vi.fn(),
  operations: vi.fn(),
  updateRuntime: vi.fn(),
}));
vi.mock('../util/services/manorAdminService.js', () => ({ manorAdminService: mocks }));
vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, msg) => ({ data, status, msg }),
  L: (_req, zh) => zh,
}));
vi.mock('../util/rootRole.js', () => ({
  ensureRootRole: async (req, res) => {
    if (req.user?.role === 'root') return true;
    res.send({ status: 403 });
    return false;
  },
}));
import { getManorAdminStatus, getManorAdminPlayer, updateManorAdminRuntime } from './manorAdminHandle.js';
describe('庄园管理只允许 Root 本人', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status.mockResolvedValue({ mode: 'open' });
  });
  it.each(['user', 'test', 'visitor'])('拒绝 %s 读取或写入管理域', async (role) => {
    const res = { send: vi.fn() };
    const req = { user: { id: 'a', role } };
    await getManorAdminStatus(req, res);
    await updateManorAdminRuntime(req, res);
    expect(res.send).toHaveBeenCalledWith({ status: 403 });
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.updateRuntime).not.toHaveBeenCalled();
  });
  it('代管上下文不能用管理接口切换 owner', async () => {
    const res = { send: vi.fn() };
    await getManorAdminPlayer(
      { user: { id: 'root', role: 'root' }, adminContext: { mode: 'readonly' }, params: { userId: 'a' } },
      res,
    );
    expect(res.send.mock.calls[0][0].status).toBe(403);
    expect(mocks.player).not.toHaveBeenCalled();
  });
  it('部署开关关闭时 Root 仍能读取管理状态，稳定错误不泄露内部信息', async () => {
    const req = { user: { id: 'root', role: 'root' }, params: { userId: 'a' } },
      res = { send: vi.fn() };
    await getManorAdminStatus(req, res);
    expect(res.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { mode: 'open' } });
    mocks.player.mockRejectedValue(new ManorError('MANOR_ADMIN_USER_NOT_FOUND', 404));
    await getManorAdminPlayer(req, res);
    expect(res.send.mock.calls[1][0]).toMatchObject({ status: 404, data: { code: 'MANOR_ADMIN_USER_NOT_FOUND' } });
  });
});
