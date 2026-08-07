import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../../../db/index.js';
import { applySecurityPolicies, clearSecurityPolicyCache } from './securityPolicyService.js';

const evidence = (ruleCode, scoreDelta = 12) => ({
  ruleCode,
  detector: 'signature',
  attackType: 'PARAM_ANOMALY',
  ruleName: ruleCode,
  matchedField: 'body.count',
  fieldContext: 'body',
  scoreDelta,
  confidence: 80,
  severity: 'medium',
});

describe('applySecurityPolicies', () => {
  beforeEach(() => {
    clearSecurityPolicyCache();
    pool.query.mockReset();
  });

  it('默认仅对高置信内置规则启用拦截模式', async () => {
    pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

    const result = await applySecurityPolicies({
      context: { method: 'POST', path: '/search', userId: 'u1', sourceIp: '1.1.1.1' },
      evidenceList: [
        evidence('SENSITIVE_PATH_PROBE', 55),
        evidence('COMMAND_INJECTION', 55),
        evidence('NUMERIC_PARAM_ANOMALY'),
      ],
    });

    expect(result.evidenceList.map((item) => [item.ruleCode, item.policyMode])).toEqual([
      ['SENSITIVE_PATH_PROBE', 'block'],
      ['COMMAND_INJECTION', 'observe'],
      ['NUMERIC_PARAM_ANOMALY', 'observe'],
    ]);
  });

  it('按接口应用覆盖，并允许精确例外降为观察', async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          {
            rule_code: 'NUMERIC_PARAM_ANOMALY',
            mode: 'block',
            route_pattern: '/search/*',
            request_method: 'POST',
            version: 2,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 7,
            subject_type: 'user',
            subject_value: 'u1',
            rule_code: 'NUMERIC_PARAM_ANOMALY',
            route_pattern: '/search/*',
            request_method: 'POST',
            effect: 'observe_only',
          },
        ],
      ]);

    const result = await applySecurityPolicies({
      context: { method: 'POST', path: '/search/preview', userId: 'u1', sourceIp: '1.1.1.1' },
      evidenceList: [evidence('NUMERIC_PARAM_ANOMALY')],
    });

    expect(result.evidenceList[0]).toMatchObject({ policyMode: 'observe', policyVersion: 2, exceptionIds: [7] });
  });

  it('同一作用域存在多版覆盖时优先采用最新版本', async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          { id: 2, rule_code: 'NUMERIC_PARAM_ANOMALY', mode: 'block', route_pattern: '/search/*', version: 2 },
          { id: 1, rule_code: 'NUMERIC_PARAM_ANOMALY', mode: 'observe', route_pattern: '/search/*', version: 1 },
        ],
      ])
      .mockResolvedValueOnce([[]]);

    const result = await applySecurityPolicies({
      context: { method: 'POST', path: '/search/preview', userId: 'u2', sourceIp: '2.2.2.2' },
      evidenceList: [evidence('NUMERIC_PARAM_ANOMALY')],
    });

    expect(result.evidenceList[0]).toMatchObject({ policyMode: 'block', policyVersion: 2 });
  });
});
