import { describe, it, expect } from 'vitest';
import {
  automaticProbeEvidence,
  automaticBanReason,
  automaticBanEvents,
  effectiveSourceReputation,
  isAutoResponseSource,
} from './autoResponsePolicy.js';
const context = { method: 'GET', path: '/.env', sourceIp: '8.8.8.8', visitorActor: true };
const evidence = {
  ruleCode: 'SENSITIVE_PATH_PROBE',
  matchedField: 'path',
  detector: 'signature',
  policyMode: 'block',
  scoreDelta: 55,
  confidence: 86,
  exceptionIds: [],
};
const decision = { blocked: true };
describe('conservative automatic source policy', () => {
  it.each(['/.env', '/.env/public/.env', '/config/.env.production'])('accepts direct secret probes %s', (path) =>
    expect(automaticProbeEvidence({ ...context, path }, [evidence], decision, 403)).toBe(evidence),
  );
  it.each(['/docs/.env.example', '/bookmark/.env', '/api/note/.env', '/user/.env', '/console/api_server'])(
    'does not infer a probe from business routes %s',
    (path) => expect(automaticProbeEvidence({ ...context, path }, [evidence], decision, 403)).toBeNull(),
  );
  it.each([
    { visitorActor: false },
    { method: 'POST' },
    { sourceIp: '127.0.0.1' },
    { sourceIp: '10.0.0.1' },
    { sourceIp: '::1' },
    { sourceIp: '100.64.1.2' },
    { sourceIp: '192.168.1.1' },
    { sourceIp: '203.0.113.9' },
    { sourceIp: '169.254.169.254' },
  ])('keeps uncertain identities/methods/addresses for review %j', (patch) =>
    expect(automaticProbeEvidence({ ...context, ...patch }, [evidence], decision, 403)).toBeNull(),
  );
  it.each([
    { policyMode: 'observe' },
    { policyMode: 'off' },
    { confidence: 84 },
    { confidence: undefined },
    { scoreDelta: undefined },
    { scoreDelta: 49 },
    { exceptionIds: [1] },
    { matchedField: 'body.path' },
    { ruleCode: 'BRUTE_FORCE' },
    { detector: 'behavior' },
  ])('does not promote excluded evidence %j', (patch) =>
    expect(automaticProbeEvidence(context, [{ ...evidence, ...patch }], decision, 403)).toBeNull(),
  );
  it('requires an actually blocked request', () => {
    expect(automaticProbeEvidence(context, [evidence], { blocked: false }, 403)).toBeNull();
    expect(automaticProbeEvidence(context, [evidence], decision, 200)).toBeNull();
  });
  it('accepts only targeted traversal on the scanner endpoint', () => {
    const e = {
      ...evidence,
      ruleCode: 'PATH_TRAVERSAL',
      matchedField: 'query.apis',
      matchedValuePreview: '../../../../proc/self/environ',
    };
    expect(automaticProbeEvidence({ ...context, path: '/console/api_server' }, [e], decision, 403)).toBe(e);
    expect(automaticProbeEvidence({ ...context, path: '/bookmark/query' }, [e], decision, 403)).toBeNull();
    expect(
      automaticProbeEvidence(
        { ...context, path: '/console/api_server' },
        [{ ...e, matchedValuePreview: '../photos/cat.png' }],
        decision,
        403,
      ),
    ).toBeNull();
  });
  it('protects authenticated members sharing an automatic-ban IP while preserving manual bans', () => {
    const auto = { is_banned: 1, ban_reason: automaticBanReason(['a'.repeat(32), 'b'.repeat(32)]) };
    expect(automaticBanEvents(auto.ban_reason)).toHaveLength(2);
    for (const role of ['user', 'test', 'root'])
      expect(effectiveSourceReputation({ user: { role, isAuthenticated: true } }, auto).is_banned).toBe(0);
    expect(effectiveSourceReputation({ user: { role: 'visitor', isAuthenticated: false } }, auto).is_banned).toBe(1);
    expect(effectiveSourceReputation({ user: { role: 'user', isAuthenticated: false } }, auto).is_banned).toBe(1);
    expect(
      effectiveSourceReputation(
        { user: { role: 'user', isAuthenticated: true } },
        { is_banned: 1, ban_reason: 'manual' },
      ).is_banned,
    ).toBe(1);
  });
  it.each([
    'login',
    'registerUser',
    'sendEmail',
    'verifyCode',
    'configPassword',
    'github/authorize',
    'github',
    'logout',
    'extension/exchange',
  ])('preserves exact authentication recovery %s', (name) => {
    const ban = { is_banned: 1, ban_reason: automaticBanReason(['a'.repeat(32), 'b'.repeat(32)]) };
    expect(
      effectiveSourceReputation({ method: 'POST', path: `/user/${name}`, user: { role: 'visitor' } }, ban).is_banned,
    ).toBe(0);
    expect(
      effectiveSourceReputation({ method: 'POST', path: `/user/${name}/evil`, user: { role: 'visitor' } }, ban)
        .is_banned,
    ).toBe(1);
  });
  it('does not treat malformed restriction text as a scoped automatic ban', () => {
    expect(automaticBanEvents('SECURITY_AUTO_PROBE_V1:foo,bar fake')).toEqual([]);
    expect(isAutoResponseSource('224.0.0.1')).toBe(false);
  });
});

it.each(['me', 'getUserInfo'])('preserves GET authentication initialization %s', (name) => {
  const ban = { is_banned: 1, ban_reason: automaticBanReason(['a'.repeat(32), 'b'.repeat(32)]) };
  expect(effectiveSourceReputation({ method: 'GET', path: `/api/user/${name}` }, ban).is_banned).toBe(0);
  expect(effectiveSourceReputation({ method: 'GET', path: `/api/user/${name}/evil` }, ban).is_banned).toBe(1);
});
