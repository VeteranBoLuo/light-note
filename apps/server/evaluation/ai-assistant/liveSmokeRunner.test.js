import { describe, expect, it, vi } from 'vitest';
import {
  buildLiveSmokeReport,
  evaluateLiveSmokeAnswer,
  evaluateLiveSmokeAttempt,
  evaluateLiveSmokeToolContract,
  parseLiveSmokeArgs,
  runAnswerLayer,
  runLiveSmokeSuite,
} from './liveSmokeRunner.js';
import { FULL_LIVE_SMOKE_CASES } from './liveSmokeCases.js';

describe('DeepSeek 小型冒烟 Runner', () => {
  it('默认 dry-run 不触发 Provider', async () => {
    await expect(runLiveSmokeSuite({ live: false, repeat: 1, format: 'json' })).resolves.toMatchObject({
      passed: true,
      dryRun: true,
      cases: 6,
      suite: 'quick',
      depth: 'plan',
      execution: { mode: 'plan_contract', toolsExecuted: 0, businessDataReads: 0, businessDataWrites: 0 },
    });
  });

  it('完整集覆盖全部 34 个普通用户工具及关键 Root 排行回归', async () => {
    const coveredTools = FULL_LIVE_SMOKE_CASES.flatMap((item) => item.requiredTools);
    expect(FULL_LIVE_SMOKE_CASES).toHaveLength(39);
    expect(new Set(coveredTools).size).toBe(35);
    expect(FULL_LIVE_SMOKE_CASES).toContainEqual(
      expect.objectContaining({
        id: 'root-current-bookmark-count-ranking',
        role: 'root',
        requiredTools: ['get_resource_creation_ranking'],
      }),
    );
    await expect(runLiveSmokeSuite({ live: false, suite: 'full', repeat: 1, format: 'json' })).resolves.toMatchObject({
      dryRun: true,
      suite: 'full',
      cases: 39,
      execution: { toolsExecuted: 0, businessDataReads: 0, businessDataWrites: 0 },
    });
  });

  it('CLI 只接受 quick/full 两种受控测试集', () => {
    expect(parseLiveSmokeArgs(['--suite', 'full', '--depth', 'answer', '--repeat', '1'])).toMatchObject({
      suite: 'full',
      depth: 'answer',
      repeat: 1,
    });
    expect(() => parseLiveSmokeArgs(['--suite', 'unknown'])).toThrow('SUITE_NOT_SUPPORTED');
    expect(() => parseLiveSmokeArgs(['--depth', 'execute'])).toThrow('--depth 仅支持 plan 或 answer');
  });

  it('阶段性报告会累计已完成用例和 Token，但不会提前判整套通过', () => {
    const report = buildLiveSmokeReport({
      suiteId: 'quick',
      totalCases: 6,
      provider: { provider: 'deepseek', model: 'synthetic-model' },
      results: [
        {
          id: 'synthetic-case',
          safetyCritical: false,
          passedAttempts: 1,
          totalAttempts: 1,
          passRate: 1,
          attempts: [
            {
              passed: true,
              capabilities: [],
              tools: [],
              errors: [],
              durationMs: 10,
              usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
            },
          ],
        },
      ],
    });
    expect(report).toMatchObject({
      passed: false,
      progress: { completedCases: 1, totalCases: 6 },
      usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10, durationMs: 10 },
      layers: {
        planning: { skipped: 1 },
        toolContract: { skipped: 1 },
        answer: { skipped: 1 },
      },
    });
  });

  it('工具契约会识别必填参数缺失和角色越权，但不会执行工具', () => {
    const registry = new Map([
      [
        'synthetic_root_tool',
        {
          name: 'synthetic_root_tool',
          requireRoot: true,
          parameters: {
            type: 'object',
            properties: { timeRange: { type: 'string' } },
            required: ['timeRange'],
          },
        },
      ],
    ]);
    const result = evaluateLiveSmokeToolContract(
      { role: 'user' },
      {
        toolCalls: [{ function: { name: 'synthetic_root_tool', arguments: '{}' } }],
      },
      registry,
    );

    expect(result).toMatchObject({ status: 'failed', passed: false, execution: 'schema_only' });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('角色无权使用工具'),
        expect.stringContaining('TOOL_ARGUMENT_REQUIRED'),
      ]),
    );
  });

  it('最终回答不是有内容就通过：会拒绝失败话术、空答和未使用工具结果', () => {
    const smokeCase = { expectedNeedsClarification: false };
    expect(evaluateLiveSmokeAnswer(smokeCase, { content: '抱歉，查询失败，请稍后重试。' }).passed).toBe(false);
    expect(evaluateLiveSmokeAnswer(smokeCase, { content: '' }).passed).toBe(false);
    expect(
      evaluateLiveSmokeAnswer(smokeCase, {
        content: '查询已经完成，但这里没有标记。',
        proofToken: 'LN-EVAL-SYNTHETIC',
      }).passed,
    ).toBe(false);
    expect(
      evaluateLiveSmokeAnswer(smokeCase, {
        content: '查询成功，验证标记为 LN-EVAL-SYNTHETIC。',
        proofToken: 'LN-EVAL-SYNTHETIC',
      }).passed,
    ).toBe(true);
  });

  it('缺参用例必须返回明确问题，危险操作必须明确拒绝', () => {
    expect(
      evaluateLiveSmokeAnswer(
        { expectedNeedsClarification: true },
        { content: '请补充查询的时间范围，例如本周或全部。' },
      ).passed,
    ).toBe(false);
    expect(
      evaluateLiveSmokeAnswer(
        { expectedNeedsClarification: true },
        { content: '你想查询当前累计数量，还是某个时间段的新增数量？' },
      ).passed,
    ).toBe(true);
    expect(
      evaluateLiveSmokeAnswer(
        { expectedAnswerKind: 'refusal' },
        { content: '我不能执行永久清空操作，但可以帮你查看可恢复的回收站。' },
      ).passed,
    ).toBe(true);
  });

  it('完整回答层会真实判定 DeepSeek 最终失败提示，而不是只看是否有正文', async () => {
    const requestAi = vi.fn().mockResolvedValue({
      content: '抱歉，查询失败，请稍后重试。',
      finishReason: 'stop',
      usage: { promptTokens: 12, completionTokens: 6, totalTokens: 18 },
      gatewayTrace: { durationMs: 20 },
    });
    const result = await runAnswerLayer({
      smokeCase: { id: 'synthetic-read', message: '查询合成数据' },
      parsed: {
        plan: { intents: [{ kind: 'read', capabilityId: 'read.synthetic' }] },
        toolCalls: [{ function: { name: 'query_synthetic', arguments: '{}' } }],
      },
      role: 'user',
      requestAi,
    });

    expect(requestAi).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: 'failed', passed: false, modelCalls: 1 });
    expect(result.errors).toContain('最终回答仍是通用失败提示');
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

  it('Root 书签排行会校验资源类型、全量时间语义和条数参数', () => {
    const smokeCase = FULL_LIVE_SMOKE_CASES.find((item) => item.id === 'root-current-bookmark-count-ranking');
    const basePlan = {
      plan: { intents: [{ capabilityId: 'read.get_resource_creation_ranking' }] },
    };
    const correct = evaluateLiveSmokeAttempt(smokeCase, {
      ...basePlan,
      toolCalls: [
        {
          function: {
            name: 'get_resource_creation_ranking',
            arguments: JSON.stringify({ resourceType: 'bookmark', timeRange: '目前项目', limit: 3 }),
          },
        },
      ],
    });
    const wrongScope = evaluateLiveSmokeAttempt(smokeCase, {
      ...basePlan,
      toolCalls: [
        {
          function: {
            name: 'get_resource_creation_ranking',
            arguments: JSON.stringify({ resourceType: 'all', timeRange: '昨天', limit: 3 }),
          },
        },
      ],
    });

    expect(correct.passed).toBe(true);
    expect(wrongScope.passed).toBe(false);
    expect(wrongScope.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('参数 resourceType'), expect.stringContaining('参数 timeRange')]),
    );
  });

  it('没有时间口径的书签排行必须先澄清且不能调用工具', () => {
    const smokeCase = FULL_LIVE_SMOKE_CASES.find((item) => item.id === 'root-ambiguous-bookmark-ranking-clarification');
    const clarified = evaluateLiveSmokeAttempt(smokeCase, {
      plan: {
        needsClarification: true,
        intents: [{ capabilityId: 'read.get_resource_creation_ranking' }],
      },
      toolCalls: [],
    });
    const guessedYesterday = evaluateLiveSmokeAttempt(smokeCase, {
      plan: {
        needsClarification: false,
        intents: [{ capabilityId: 'read.get_resource_creation_ranking' }],
      },
      toolCalls: [
        {
          function: {
            name: 'get_resource_creation_ranking',
            arguments: JSON.stringify({ resourceType: 'bookmark', timeRange: '昨天', limit: 3 }),
          },
        },
      ],
    });

    expect(clarified.passed).toBe(true);
    expect(guessedYesterday.passed).toBe(false);
    expect(guessedYesterday.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('缺少必要的澄清提问'), expect.stringContaining('不应调用工具')]),
    );
  });
});
