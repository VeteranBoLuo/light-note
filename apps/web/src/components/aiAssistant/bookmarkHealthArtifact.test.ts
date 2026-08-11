import { describe, expect, it } from 'vitest';
import { createBookmarkHealthArtifactFromSummary } from './bookmarkHealthArtifact';
import { normalizeAiArtifacts } from '@/types/aiArtifact';

describe('bookmarkHealthArtifact', () => {
  it('把真实运行进度投影为任务卡，保留无法判断数量', () => {
    const artifact = createBookmarkHealthArtifactFromSummary({
      runId: 'run-1',
      running: true,
      total: 214,
      checked: 86,
      alive: 81,
      suspectCount: 3,
      unknown: 2,
      suspect: [{ id: 'b1', name: '失效页', url: 'https://example.com/404', hasSnapshot: true }],
    });
    expect(artifact).toMatchObject({
      id: 'bookmark-health:run-1',
      status: 'running',
      data: { checked: 86, total: 214, alive: 81, suspect: 3, unknown: 2 },
    });
  });

  it('没有历史记录时保持待启动，不伪装成刚完成的全正常结果', () => {
    const artifact = createBookmarkHealthArtifactFromSummary({ total: 12, checked: 0, suspect: [] });
    expect(artifact.status).toBe('queued');
    expect(artifact.data.lastCheckedAt).toBeUndefined();
  });

  it('从本地或云会话恢复时重新收紧字段，损坏的 suspects 不会让卡片崩溃', () => {
    const [artifact] = normalizeAiArtifacts([
      {
        id: 'forged',
        kind: 'job',
        schemaVersion: 1,
        status: 'running',
        titleKey: 'forged.title',
        generatedAt: '2026-08-10T12:00:00.000Z',
        revision: 1,
        data: {
          jobType: 'bookmark_health',
          jobId: 'run-safe',
          total: 2,
          checked: 1,
          alive: 1,
          suspect: 0,
          unknown: 0,
          pollAfterMs: 10,
          suspects: 'broken',
        },
      },
    ]);
    expect(artifact).toMatchObject({
      id: 'bookmark-health:run-safe',
      titleKey: 'ai.artifact.bookmarkHealth.title',
      data: { pollAfterMs: 1500, suspects: [] },
    });
  });
});
