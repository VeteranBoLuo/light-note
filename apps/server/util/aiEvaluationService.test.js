import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  getConnection: vi.fn(),
  connectionQuery: vi.fn(),
  release: vi.fn(),
  runSuite: vi.fn(),
  ensureSchema: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: { query: mocks.poolQuery, getConnection: mocks.getConnection },
}));
vi.mock('./common.js', () => ({ generateUUID: () => 'synthetic-run-id' }));
vi.mock('./aiEvaluationSchema.js', () => ({ ensureAiEvaluationSchema: mocks.ensureSchema }));
vi.mock('../evaluation/ai-assistant/liveSmokeRunner.js', () => ({ runLiveSmokeSuite: mocks.runSuite }));

const service = await import('./aiEvaluationService.js');

describe('AI 冒烟异步运行服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureSchema.mockResolvedValue(undefined);
    mocks.poolQuery.mockResolvedValue([[]]);
    mocks.getConnection.mockResolvedValue({ query: mocks.connectionQuery, release: mocks.release });
  });

  it('持有数据库全局锁执行，完成后写入无正文统计并释放锁', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([[{ acquired: 1 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ released: 1 }]]);
    const completedReport = {
      passed: true,
      depth: 'answer',
      provider: { provider: 'deepseek', model: 'synthetic-model' },
      layers: {
        planning: { passed: 1, failed: 0, skipped: 0 },
        toolContract: { passed: 1, failed: 0, skipped: 0 },
        answer: { passed: 1, failed: 0, skipped: 0 },
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
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
              layers: {
                planning: { status: 'passed', passed: true, errors: [] },
                toolContract: { status: 'passed', passed: true, errors: [] },
                answer: { status: 'passed', passed: true, errors: [], answerLength: 12 },
              },
              modelCalls: 2,
              errors: [],
              durationMs: 1,
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            },
          ],
        },
      ],
      progress: { completedCases: 1, totalCases: 1 },
      execution: { mode: 'plan_contract_answer', toolsExecuted: 0, businessDataReads: 0, businessDataWrites: 0 },
    };
    mocks.runSuite.mockImplementationOnce(async (options) => {
      await options.onProgress(completedReport);
      return completedReport;
    });

    await expect(
      service.startAiLiveSmokeRun({ triggeredBy: 'root-1', suite: 'full', repeat: 1, depth: 'answer' }),
    ).resolves.toMatchObject({
      id: 'synthetic-run-id',
      status: 'queued',
      suite: 'full',
      depth: 'answer',
      caseCount: 41,
    });
    await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledOnce());
    expect(mocks.runSuite).toHaveBeenCalledWith(
      expect.objectContaining({
        live: true,
        suite: 'full',
        repeat: 1,
        depth: 'answer',
        format: 'json',
        onProgress: expect.any(Function),
      }),
    );
    expect(mocks.connectionQuery.mock.calls[2]?.[1]?.at(-1)).toContain('"depth":"answer"');
    const resultWrites = mocks.poolQuery.mock.calls.filter(([sql]) => String(sql).includes('result_json'));
    expect(resultWrites).toHaveLength(2);
    expect(resultWrites[0]?.[1]).toContain(15);
    expect(JSON.stringify(resultWrites)).not.toContain('synthetic prompt');
  });

  it('拒绝未登记的测试集且不会访问数据库', async () => {
    await expect(
      service.startAiLiveSmokeRun({ triggeredBy: 'root-1', suite: 'unknown', repeat: 1 }),
    ).rejects.toMatchObject({ code: 'SUITE_NOT_SUPPORTED' });
    expect(mocks.ensureSchema).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('拒绝未知评测深度且不会访问数据库', async () => {
    await expect(
      service.startAiLiveSmokeRun({ triggeredBy: 'root-1', suite: 'quick', repeat: 1, depth: 'execute' }),
    ).rejects.toMatchObject({ code: 'DEPTH_NOT_SUPPORTED' });
    expect(mocks.ensureSchema).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('其他实例持有全局锁时拒绝重复启动', async () => {
    mocks.connectionQuery.mockResolvedValueOnce([[{ acquired: 0 }]]).mockResolvedValueOnce([[{ released: null }]]);
    await expect(service.startAiLiveSmokeRun({ triggeredBy: 'root-1', repeat: 1 })).rejects.toMatchObject({
      code: 'RUN_ALREADY_ACTIVE',
    });
    expect(mocks.runSuite).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
