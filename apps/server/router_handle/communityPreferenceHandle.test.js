import { describe, expect, it, vi } from 'vitest';
vi.mock('../util/common.js', () => ({ resultData: (data, status = 200, msg = '') => ({ data, status, msg }) }));
import { createPreferenceHandler } from './communityPreferenceHandle.js';
function response() {
  const res = { set: vi.fn(), status: vi.fn(), send: vi.fn() };
  Object.values(res).forEach((f) => f.mockReturnValue(res));
  return res;
}
describe('community preference HTTP boundary', () => {
  it('rejects administrator impersonation before the service', async () => {
    const service = vi.fn();
    const res = response();
    await createPreferenceHandler(service)({ user: { id: 'other' }, adminContext: { mode: 'maintain' } }, res);
    expect(service).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it('does not expose database exceptions and uses no-store', async () => {
    const res = response();
    await createPreferenceHandler(async () => {
      throw new Error('sensitive connection details');
    })({ user: { id: 'owner' } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('sensitive');
  });
});
