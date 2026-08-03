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
      provider: { provider: 'deepseek', model: 'synthetic-model' },
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
              errors: [],
              durationMs: 1,
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            },
          ],
        },
      ],
      progress: { completedCases: 1, totalCases: 1 },
      execution: { mode: 'plan_only', toolsExecuted: 0, businessDataReads: 0, businessDataWrites: 0 },
    };
    mocks.runSuite.mockImplementationOnce(async (options) => {
      await options.onProgress(completedReport);
      return completedReport;
    });

    await expect(
      service.startAiLiveSmokeRun({ triggeredBy: 'root-1', suite: 'full', repeat: 1 }),
    ).resolves.toMatchObject({
      id: 'synthetic-run-id',
      status: 'queued',
      suite: 'full',
      caseCount: 37,
    });
    await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledOnce());
    expect(mocks.runSuite).toHaveBeenCalledWith(
      expect.objectContaining({
        live: true,
        suite: 'full',
        repeat: 1,
        format: 'json',
        onProgress: expect.any(Function),
      }),
    );
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

  it('其他实例持有全局锁时拒绝重复启动', async () => {
    mocks.connectionQuery.mockResolvedValueOnce([[{ acquired: 0 }]]).mockResolvedValueOnce([[{ released: null }]]);
    await expect(service.startAiLiveSmokeRun({ triggeredBy: 'root-1', repeat: 1 })).rejects.toMatchObject({
      code: 'RUN_ALREADY_ACTIVE',
    });
    expect(mocks.runSuite).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
