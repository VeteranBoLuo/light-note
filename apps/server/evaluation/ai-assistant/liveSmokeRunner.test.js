import { describe, expect, it } from 'vitest';
import { evaluateLiveSmokeAttempt, parseLiveSmokeArgs, runLiveSmokeSuite } from './liveSmokeRunner.js';
import { FULL_LIVE_SMOKE_CASES } from './liveSmokeCases.js';

describe('DeepSeek 小型冒烟 Runner', () => {
  it('默认 dry-run 不触发 Provider', async () => {
    await expect(runLiveSmokeSuite({ live: false, repeat: 1, format: 'json' })).resolves.toMatchObject({
      passed: true,
      dryRun: true,
      cases: 6,
      suite: 'quick',
      execution: { mode: 'plan_only', toolsExecuted: 0, businessDataReads: 0, businessDataWrites: 0 },
    });
  });

  it('完整集覆盖全部 34 个普通用户工具且不重复', async () => {
    const coveredTools = FULL_LIVE_SMOKE_CASES.flatMap((item) => item.requiredTools);
    expect(FULL_LIVE_SMOKE_CASES).toHaveLength(37);
    expect(new Set(coveredTools).size).toBe(34);
    await expect(runLiveSmokeSuite({ live: false, suite: 'full', repeat: 1, format: 'json' })).resolves.toMatchObject({
      dryRun: true,
      suite: 'full',
      cases: 37,
      execution: { toolsExecuted: 0, businessDataReads: 0, businessDataWrites: 0 },
    });
  });

  it('CLI 只接受 quick/full 两种受控测试集', () => {
    expect(parseLiveSmokeArgs(['--suite', 'full', '--repeat', '1'])).toMatchObject({ suite: 'full', repeat: 1 });
    expect(() => parseLiveSmokeArgs(['--suite', 'unknown'])).toThrow('SUITE_NOT_SUPPORTED');
  });

  it('依赖任务会拒绝同轮提前创建笔记', () => {
    const result = evaluateLiveSmokeAttempt(
      {
        requiredCapabilities: ['read.read_url', 'note.create'],
        requiredTools: ['read_url'],
        forbiddenTools: ['create_note'],
      },
      {
        plan: { intents: [{ capabilityId: 'read.read_url' }, { capabilityId: 'note.create' }] },
        toolCalls: [{ function: { name: 'read_url' } }, { function: { name: 'create_note' } }],
      },
    );
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('不应提前调用工具 create_note');
  });
});
