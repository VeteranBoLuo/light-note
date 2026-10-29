import { beforeEach, expect, it, vi } from 'vitest';
import { MANOR_VERSION } from '@lightnote/shared/manor';
import { getManor, runManorCommand } from './manorApi';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/http/request', () => ({ apiBaseGet: http.get, apiBasePost: http.post }));
const snapshot = { version: MANOR_VERSION, revision: 2, state: {}, quests: [] };
const command = { requestId: 'old-receipt-retry', version: 'knowledge-manor-v2', revision: 1, action: 'buySeed', args: ['radish', 1] };
beforeEach(() => { http.get.mockReset(); http.post.mockReset(); });

it('当前页面拒绝混用其他规则版本的存档和命令回包', async () => {
  http.get.mockResolvedValue({ status: 200, data: { ...snapshot, version: 'future-version' } });
  http.post.mockResolvedValue({ status: 200, data: { ...snapshot, version: 'knowledge-manor-v1' } });
  await expect(getManor()).rejects.toMatchObject({ code: 'MANOR_VERSION_UNSUPPORTED' });
  await expect(runManorCommand(command)).rejects.toMatchObject({ code: 'MANOR_VERSION_UNSUPPORTED', receiptUnconfirmed: true });
});
it('旧请求恢复仍携带原版本和请求号，接受当前版本返回的原收据', async () => {
  http.post.mockResolvedValue({ status: 200, data: { ...snapshot, replayed: true, result: true } });
  expect(await runManorCommand(command)).toMatchObject({ replayed: true, result: true });
  expect(http.post).toHaveBeenCalledWith('/api/growth/manor/commands', command, { silent: true });
});
it('读取继续保留后台调度和取消信号，明确拒绝保留业务错误码', async () => {
  http.get.mockResolvedValueOnce({ status: 200, data: snapshot });
  const controller = new AbortController();
  expect(await getManor(controller.signal, true)).toEqual(snapshot);
  expect(http.get).toHaveBeenLastCalledWith('/api/growth/manor', undefined, expect.objectContaining({ signal: controller.signal, activity: 'background' }));
  http.post.mockResolvedValueOnce({ status: 409, data: { code: 'MANOR_REVISION_CONFLICT' } });
  await expect(runManorCommand(command)).rejects.toMatchObject({ code: 'MANOR_REVISION_CONFLICT', status: 409 });
});
it('保留维护与限流业务码，交给宿主恢复原请求和显示提示', async () => {
  for (const [status, code] of [[423, 'MANOR_MAINTENANCE'], [429, 'MANOR_RATE_LIMITED']] as const) {
    http.post.mockResolvedValueOnce({ status, data: { code } });
    await expect(runManorCommand(command)).rejects.toMatchObject({ code, status });
  }
});
