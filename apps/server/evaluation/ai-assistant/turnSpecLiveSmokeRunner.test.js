import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTurnSpecSmokeArgs, selectTurnSpecProvider } from './turnSpecLiveSmokeRunner.js';

describe('TurnSpec V2 Provider A/B runner', () => {
  it('默认对两家 Provider 的关键用例重复 20 次，且必须显式 --live 才联网', () => {
    expect(parseTurnSpecSmokeArgs([])).toEqual({
      live: false,
      repeat: 20,
      format: 'text',
      suite: 'quick',
      provider: 'both',
    });
    expect(parseTurnSpecSmokeArgs(['--live', '--provider', 'qwen', '--repeat', '3'])).toMatchObject({
      live: true,
      provider: 'qwen',
      repeat: 3,
    });
  });

  it('先过契约与灾难性失败门禁，再按协议失败、延迟和成本选择', () => {
    const base = {
      strictPassRate: 1,
      catastrophicFailureCount: 0,
      protocolFailureRate: 0,
      candidateTools: { p95: 8 },
      costCny: 1,
    };
    expect(
      selectTurnSpecProvider([
        { ...base, provider: { provider: 'deepseek', model: 'd' }, latencyMs: { p95: 800 } },
        { ...base, provider: { provider: 'qwen', model: 'q' }, latencyMs: { p95: 500 } },
      ]),
    ).toMatchObject({ provider: 'qwen', model: 'q' });
    expect(
      selectTurnSpecProvider([
        { ...base, provider: { provider: 'deepseek', model: 'd' }, strictPassRate: 1, latencyMs: { p95: 800 } },
        { ...base, provider: { provider: 'qwen', model: 'q' }, strictPassRate: 0.96, latencyMs: { p95: 100 } },
      ]),
    ).toMatchObject({ provider: 'deepseek', model: 'd' });
    expect(
      selectTurnSpecProvider([
        {
          ...base,
          provider: { provider: 'deepseek', model: 'd' },
          strictPassRate: 0.94,
          latencyMs: { p95: 1 },
        },
      ]),
    ).toEqual({ provider: null, reason: 'no_provider_meets_contract_gate' });
  });

  it('额外工具调用属于灾难性失败，不能被平均通过率掩盖', () => {
    const report = selectTurnSpecProvider([
      {
        provider: { provider: 'qwen', model: 'q' },
        strictPassRate: 0.99,
        catastrophicFailureCount: 1,
        protocolFailureRate: 0,
        candidateTools: { p95: 2 },
        latencyMs: { p95: 100 },
        costCny: 0.1,
      },
    ]);
    expect(report).toEqual({ provider: null, reason: 'no_provider_meets_contract_gate' });
  });

  it('仓库基线只保存无正文汇总，且默认模型来自契约正确率优先的真实评测', () => {
    const baseline = JSON.parse(
      fs.readFileSync(new URL('./turn-spec-provider-baseline.json', import.meta.url), 'utf8'),
    );
    expect(baseline).toMatchObject({
      syntheticOnly: true,
      containsRealUserContent: false,
      businessToolsExecuted: 0,
      decision: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    });
    expect(baseline.reports.every((item) => item.strictPassRate >= baseline.gate.minimumStrictPassRate)).toBe(true);
    expect(baseline.reports.every((item) => item.catastrophicFailureCount === 0)).toBe(true);
  });
});
