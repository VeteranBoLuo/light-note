import { describe, expect, it } from 'vitest';
import { calculateThreat } from './threatScorer.js';

const evidence = [
  {
    ruleCode: 'NUMERIC_PARAM_ANOMALY',
    detector: 'signature',
    attackType: 'PARAM_ANOMALY',
    ruleName: '数值参数异常',
    scoreDelta: 12,
    confidence: 70,
    severity: 'medium',
  },
];

describe('calculateThreat', () => {
  it('默认不把 IP 历史信誉分计入当前请求威胁分', () => {
    const result = calculateThreat(evidence, { risk_score: 100 });

    expect(result.threatScore).toBe(12);
    expect(result.severity).toBe('low');
  });

  it('仅在明确开启时把 IP 信誉作为辅助分数', () => {
    const result = calculateThreat(evidence, { risk_score: 100 }, { includeReputation: true });

    expect(result.threatScore).toBe(37);
    expect(result.severity).toBe('medium');
  });
});
