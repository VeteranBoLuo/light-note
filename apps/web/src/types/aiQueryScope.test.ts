import { describe, expect, it } from 'vitest';
import { normalizeAiQueryScopes } from './aiQueryScope';

describe('AI 查询口径公开投影', () => {
  it('保留安全计数、两层完整性和用户本地时间范围', () => {
    expect(
      normalizeAiQueryScopes([
        {
          schemaVersion: 1,
          tool: 'query_notes',
          total: 2,
          returned: 1,
          totalExact: true,
          completeness: 'partial',
          truncated: true,
          truncationReason: 'limit',
          stableReferenceCount: 1,
          stableIdCoverage: 'complete',
          projection: { completeness: 'partial', truncated: true, truncationReason: 'result_budget' },
          resolvedRanges: [
            {
              slot: 'timeRange',
              expression: '今天',
              description: '今天（2026-08-21 · Asia/Shanghai）',
              localStart: '2026-08-21 00:00:00',
              localEndExclusive: '2026-08-22 00:00:00',
              timeZone: 'Asia/Shanghai',
            },
          ],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        tool: 'query_notes',
        total: 2,
        returned: 1,
        completeness: 'partial',
        projection: { completeness: 'partial', truncated: true, truncationReason: 'result_budget' },
        resolvedRanges: [expect.objectContaining({ slot: 'timeRange', timeZone: 'Asia/Shanghai' })],
      }),
    ]);
  });

  it('拒绝畸形记录、私有字段和伪造时区，不把未知总量冒充精确总量', () => {
    const scopes = normalizeAiQueryScopes([
      { schemaVersion: 0, tool: 'query_notes' },
      {
        schemaVersion: 1,
        tool: 'query_bookmarks',
        total: 'not-a-count',
        returned: 3,
        totalExact: true,
        completeness: 'partial',
        truncated: false,
        truncationReason: null,
        stableReferenceCount: 3,
        stableIdCoverage: 'complete',
        projection: { completeness: 'complete', truncated: false, truncationReason: null },
        raw: { password: 'secret' },
        resolvedRanges: [
          {
            slot: 'timeRange',
            description: '今天',
            timeZone: '<script>alert(1)</script>',
            storageTimeZone: 'UTC',
          },
        ],
      },
    ]);

    expect(scopes).toEqual([
      expect.objectContaining({ tool: 'query_bookmarks', total: null, totalExact: false, resolvedRanges: [] }),
    ]);
    expect(JSON.stringify(scopes)).not.toContain('password');
    expect(JSON.stringify(scopes)).not.toContain('storageTimeZone');
  });
});
