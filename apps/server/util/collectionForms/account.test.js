import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ getSession: vi.fn(), candidates: vi.fn() }));
vi.mock('../auth.js', () => ({ getRequestSidCandidates: state.candidates }));
vi.mock('../sessionStore.js', () => ({ getSession: state.getSession }));
import { readCollectionAccount } from './account.js';
beforeEach(() => {
  vi.clearAllMocks();
});
it('只从可信会话取得账号，Cookie 优先，失效后尝试备用会话', async () => {
  state.candidates.mockReturnValue(['cookie-session', 'header-session']);
  state.getSession.mockImplementation(async (sid) =>
    sid === 'cookie-session' ? { user_id: 'cookie-user', role: 'visitor' } : { user_id: 'header-user' },
  );
  expect(await readCollectionAccount({ headers: {}, body: { userId: 'forged' } })).toEqual({ id: 'cookie-user' });
  expect(state.getSession).toHaveBeenCalledTimes(1);
  state.getSession.mockImplementation(async (sid) => (sid === 'header-session' ? { user_id: 'header-user' } : null));
  expect(await readCollectionAccount({ headers: {} })).toEqual({ id: 'header-user' });
  state.getSession.mockResolvedValue(null);
  expect(await readCollectionAccount({ headers: {} })).toBeNull();
});
it('管理员代入上下文不可参与或领取奖励', async () => {
  await expect(readCollectionAccount({ headers: { 'x-admin-context': 'context' } })).rejects.toMatchObject({
    status: 403,
  });
  expect(state.getSession).not.toHaveBeenCalled();
});
