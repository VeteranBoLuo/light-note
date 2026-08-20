import { describe, expect, it, vi } from 'vitest';
import {
  evaluateTurnSpecV3SmokeAttempt,
  parseTurnSpecV3SmokeArgs,
  runTurnSpecV3LiveSmoke,
  TURN_SPEC_V3_SMOKE_CASES,
} from './turnSpecV3LiveSmokeRunner.js';
import { getAgentV3CapabilityById } from '../../util/agent/runtime/v3/capabilityManifest.js';

describe('TurnSpec V3 低成本真实语义冒烟', () => {
  it('默认 dry-run，真实模式必须点名且最多选择两个用例', () => {
    expect(parseTurnSpecV3SmokeArgs([])).toEqual({
      live: false,
      repeat: 1,
      format: 'text',
      provider: 'deepseek',
      caseIds: [],
    });
    expect(() => parseTurnSpecV3SmokeArgs(['--live'])).toThrow(/显式指定 --case/u);
    expect(() => parseTurnSpecV3SmokeArgs(['--live', '--case', 'a', '--case', 'b', '--case', 'c'])).toThrow(
      /最多选择 2 个/u,
    );
  });

  it('严格核验能力、时间约束与结构化指代，而不是只看模型是否返回', () => {
    const smokeCase = TURN_SPEC_V3_SMOKE_CASES.find((item) => item.id === 'todo-reminder-at');
    const valid = {
      requestKind: 'answer',
      continuationMode: 'independent',
      topicEpochAction: 'advance',
      missingSlots: [],
      goals: [{ id: 'todo', capabilityId: 'todo.query' }],
      temporalConstraints: [
        { goalId: 'todo', slot: 'planDate', argumentValue: '2026-08-20' },
        { goalId: 'todo', slot: 'reminderAt', argumentValue: '2026-08-20 16:00' },
      ],
    };
    expect(evaluateTurnSpecV3SmokeAttempt(smokeCase, valid)).toMatchObject({ passed: true });
    expect(
      evaluateTurnSpecV3SmokeAttempt(smokeCase, {
        ...valid,
        temporalConstraints: valid.temporalConstraints.slice(0, 1),
      }),
    ).toMatchObject({ passed: false, errors: ['temporal_mismatch:todo.query.reminderAt'] });
  });

  it('用例中的能力与时间槽必须来自 Capability Manifest', () => {
    for (const smokeCase of TURN_SPEC_V3_SMOKE_CASES) {
      for (const capabilityId of smokeCase.expectedCapabilities) {
        expect(getAgentV3CapabilityById(capabilityId), `${smokeCase.id}:${capabilityId}`).toBeTruthy();
      }
      for (const expected of smokeCase.expectedTemporal || []) {
        const capability = getAgentV3CapabilityById(expected.capabilityId);
        expect(
          capability?.temporalSlots.some((slot) => slot.name === expected.slot),
          `${smokeCase.id}:${expected.capabilityId}.${expected.slot}`,
        ).toBe(true);
      }
    }
  });

  it('dry-run 不加载模型、工具或数据库依赖，也不执行业务工具', async () => {
    const requestAi = vi.fn();
    const report = await runTurnSpecV3LiveSmoke(parseTurnSpecV3SmokeArgs([]), { requestAi });
    expect(report).toMatchObject({
      passed: true,
      dryRun: true,
      businessToolsExecuted: 0,
      maximumModelCalls: TURN_SPEC_V3_SMOKE_CASES.length * 2,
    });
    expect(requestAi).not.toHaveBeenCalled();
  });

  it('执行函数本身也限制真实调用范围，不能绕过 CLI 成本门禁', async () => {
    const requestAi = vi.fn();
    await expect(
      runTurnSpecV3LiveSmoke(
        { live: true, repeat: 1, format: 'text', provider: 'deepseek', caseIds: [] },
        { requestAi },
      ),
    ).rejects.toThrow(/显式选择用例/u);
    await expect(
      runTurnSpecV3LiveSmoke(
        {
          live: true,
          repeat: 1,
          format: 'text',
          provider: 'deepseek',
          caseIds: ['today-note-artifact', 'todo-reminder-at', 'selected-bookmark-analysis'],
        },
        { requestAi },
      ),
    ).rejects.toThrow(/最多选择 2 个/u);
    expect(requestAi).not.toHaveBeenCalled();
  });
});
