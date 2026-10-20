import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ reputation: {}, write: vi.fn() }));
vi.mock('../common.js', () => ({ resultData: (data, status, msg) => ({ data, status, msg }) }));
vi.mock('./services/ipReputation.js', () => ({
  getIpReputation: async () => state.reputation,
  recordIpRequest: vi.fn(),
}));
vi.mock('./services/securityLogService.js', () => ({ writeSecurityEvent: (...args) => state.write(...args) }));
vi.mock('./detectors/behaviorDetector.js', () => ({
  detectRequestBehavior: () => ({ evidence: [] }),
  detectResponseBehavior: () => [],
}));
vi.mock('./services/securityPolicyService.js', () => ({
  applySecurityPolicies: async ({ evidenceList }) => ({
    evidenceList: evidenceList.map((e) => ({ ...e, policyMode: 'block', exceptionIds: [] })),
  }),
}));
import { attackMonitor } from './attackMonitor.js';
import { automaticBanReason, automaticProbeEvidence } from './services/autoResponsePolicy.js';
import { SECURITY_CONFIG } from './rules.js';
const source = '8.8.8.8';
async function request({ path = '/bookmark/list', role = 'visitor', authenticated = false, query = {} } = {}) {
  const req = {
    method: 'GET',
    path,
    headers: {},
    ip: source,
    query,
    user: { id: 'actor', role, isAuthenticated: authenticated },
  };
  const res = { on: vi.fn(), send: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await attackMonitor(req, res, next);
  return { req, res, next };
}
beforeEach(() => {
  state.write.mockReset().mockResolvedValue('event');
  state.reputation = {
    is_banned: 1,
    banned_until: new Date(Date.now() + 3600000),
    ban_reason: automaticBanReason(['a'.repeat(32), 'b'.repeat(32)]),
  };
  SECURITY_CONFIG.blockEnabled = true;
});
describe('automatic source restriction request boundary', () => {
  it('allows ordinary authenticated members sharing the source while retaining visitor restrictions', async () => {
    expect((await request({ role: 'user', authenticated: true })).next).toHaveBeenCalledOnce();
    const visitor = await request();
    expect(visitor.next).not.toHaveBeenCalled();
    expect(visitor.res.status).toHaveBeenCalledWith(403);
  });
  it.each([
    { path: '/.env' },
    { path: '/console/api_server', query: { apis: '../../../../../../.env' } },
    { path: '/console/api_server', query: { apis: '../../../../../../proc/self/environ' } },
  ])('keeps the actual detector evidence eligible for clear probes: $path', async (options) => {
    state.reputation = {};
    const result = await request(options);
    expect(result.res.status).toHaveBeenCalledWith(403);
    const args = state.write.mock.calls[0][0];
    expect(automaticProbeEvidence(args.context, args.evidenceList, args.decision, args.statusCode)).toBeTruthy();
  });
  it('still blocks actual attack signatures from authenticated accounts without auto-restricting their IP', async () => {
    const result = await request({ path: '/.env', role: 'user', authenticated: true });
    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(403);
    const args = state.write.mock.calls[0][0];
    expect(automaticProbeEvidence(args.context, args.evidenceList, args.decision, args.statusCode)).toBeNull();
  });
  it('does not exempt members from manually applied source restrictions', async () => {
    state.reputation.ban_reason = 'manual';
    expect((await request({ role: 'user', authenticated: true })).next).not.toHaveBeenCalled();
  });
});
