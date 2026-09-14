import { beforeEach, describe, expect, it, vi } from 'vitest';
const record = vi.hoisted(() => vi.fn());
vi.mock('../util/common.js', () => ({ resultData: (data, status = 200, msg) => ({ data, status, msg }) }));
vi.mock('../util/services/resourceReuseService.js', async (original) => ({
  ...(await original()),
  recordResourceReuse: record,
}));
const { recordResourceOpen } = await import('./resourceReuseHandle.js');
const req = () => ({
  user: { id: 'owner', role: 'user', isAuthenticated: true },
  body: { resourceType: 'note', resourceId: 'n' },
});
const res = () => ({ send: vi.fn(), status: vi.fn().mockReturnThis() });
beforeEach(() => {
  record.mockReset().mockResolvedValue({ accepted: true });
});
describe('资料使用上报权限与失败边界', () => {
  it.each(['visitor', 'root', 'test', 'deleted'])('不采集 %s', async (role) => {
    const r = req();
    r.user.role = role;
    const response = res();
    await recordResourceOpen(r, response);
    expect(record).not.toHaveBeenCalled();
    expect(response.send.mock.calls[0][0].data.accepted).toBe(false);
  });
  it.each(['adminContext', 'isAdminPreview', 'suppressConversionTracking'])('不采集 %s 请求', async (key) => {
    await recordResourceOpen({ ...req(), [key]: true }, res());
    expect(record).not.toHaveBeenCalled();
  });
  it('拒绝伪造身份和额外载荷，仅使用认证账号', async () => {
    const response = res();
    await recordResourceOpen(req(), response);
    expect(record).toHaveBeenCalledWith('owner', { resourceType: 'note', resourceId: 'n' });
    record.mockClear();
    const bad = res();
    await recordResourceOpen({ ...req(), body: { ...req().body, owner: 'other' } }, bad);
    expect(bad.status).toHaveBeenCalledWith(400);
    expect(record).not.toHaveBeenCalled();
  });
  it('未认证和停用不记录；数据库失败不返回内部错误', async () => {
    await recordResourceOpen({ ...req(), user: { ...req().user, isAuthenticated: false } }, res());
    await recordResourceOpen({ ...req(), user: { ...req().user, isDeletedOrDisabled: true } }, res());
    expect(record).not.toHaveBeenCalled();
    record.mockRejectedValue(Object.assign(new Error('private body'), { code: 'ER_NO_SUCH_TABLE' }));
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = res();
      await recordResourceOpen(req(), response);
      expect(response.status).toHaveBeenCalledWith(503);
      expect(JSON.stringify(response.send.mock.calls)).not.toContain('private body');
    } finally {
      log.mockRestore();
    }
  });
});
