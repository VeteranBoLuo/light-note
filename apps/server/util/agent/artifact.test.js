import { describe, expect, it } from 'vitest';
import { createBookmarkHealthArtifact, normalizeAgentArtifacts } from './artifact.js';

describe('Agent artifacts', () => {
  it('死链任务把正常、疑似和未知数量投影为受控字段', () => {
    const artifact = createBookmarkHealthArtifact({
      runId: 'run-1',
      running: true,
      total: 214,
      checked: 86,
      alive: 81,
      suspectCount: 3,
      unknown: 2,
      suspect: [{ id: 'bookmark-1', name: '旧链接', url: 'https://example.com/old', hasSnapshot: true }],
    });
    expect(artifact).toMatchObject({
      id: 'bookmark-health:run-1',
      status: 'running',
      data: { total: 214, checked: 86, alive: 81, suspect: 3, unknown: 2 },
    });
  });

  it('未知 artifact 不会透传到客户端', () => {
    expect(normalizeAgentArtifacts([{ id: 'raw', kind: 'admin-secret', schemaVersion: 1 }])).toEqual([]);
  });

  it('业务投影的 id 和标题由服务端模板固定，不接受任意覆盖', () => {
    const [artifact] = normalizeAgentArtifacts([
      {
        ...createBookmarkHealthArtifact({ runId: 'run-safe', total: 2, checked: 1, running: true }),
        id: 'forged-id',
        titleKey: 'admin.secret.title',
      },
    ]);
    expect(artifact).toMatchObject({
      id: 'bookmark-health:run-safe',
      titleKey: 'ai.artifact.bookmarkHealth.title',
    });
  });
});
