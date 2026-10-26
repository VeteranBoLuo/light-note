import { describe, expect, it, vi } from 'vitest';
const service = vi.hoisted(() => vi.fn());
vi.mock('../util/services/cloudSpacePreferenceService.js', () => ({ cloudSpacePreference: service }));
vi.mock('../util/common.js', () => ({ resultData: (data, status = 200, msg = '') => ({ data, status, msg }) }));
import { getCloudSpacePreference, saveCloudSpacePreference } from './cloudSpacePreferenceHandle.js';
function response() {
  return { set: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), send: vi.fn() };
}
describe('cloud display preference HTTP boundary', () => {
  it.each([getCloudSpacePreference, saveCloudSpacePreference])(
    'rejects administrator context before accessing account data',
    async (handler) => {
      service.mockClear();
      const res = response();
      await handler({ user: { id: 'target' }, adminContext: { mode: 'maintain' } }, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(service).not.toHaveBeenCalled();
    },
  );
  it('takes identity from authenticated user and returns a private non-cacheable response', async () => {
    service.mockResolvedValueOnce({ includeDescendants: true });
    const res = response();
    const user = { id: 'owner', role: 'user' };
    await saveCloudSpacePreference({ user, body: { includeDescendants: true } }, res);
    expect(service).toHaveBeenCalledWith({ user, input: { includeDescendants: true }, write: true });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200, data: { includeDescendants: true } }));
  });
  it('does not expose internal database errors', async () => {
    service.mockRejectedValueOnce(new Error('private database diagnostics'));
    const res = response();
    await getCloudSpacePreference({ user: { id: 'owner' } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('private database');
  });
});
