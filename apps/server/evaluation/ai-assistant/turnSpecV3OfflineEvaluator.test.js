import { describe, expect, it } from 'vitest';
import {
  evaluateTurnSpecV3OfflineCase,
  runTurnSpecV3OfflineEvaluation,
  TURN_SPEC_V3_OFFLINE_CASES,
} from './turnSpecV3OfflineEvaluator.js';

describe('TurnSpec V3 零 Token 离线门禁', () => {
  it('高频查询全部命中 Manifest 确定性 fast-path，不回退 Planner', () => {
    const report = runTurnSpecV3OfflineEvaluation();
    expect(report).toMatchObject({
      passed: true,
      modelCalls: 0,
      databaseQueries: 0,
      businessToolsExecuted: 0,
      total: TURN_SPEC_V3_OFFLINE_CASES.length,
      deterministicCount: TURN_SPEC_V3_OFFLINE_CASES.length,
      fastPathRate: 1,
      plannerFallbackRate: 0,
    });
    expect(report.results.every((item) => item.planningMode === 'deterministic')).toBe(true);
  });

  it('未知能力失败关闭，不把评测缺口伪装成 Planner 成功', () => {
    expect(evaluateTurnSpecV3OfflineCase({ id: 'missing', capabilityId: 'unknown', claims: {} })).toEqual({
      id: 'missing',
      passed: false,
      reason: 'capability_missing',
    });
  });
});
