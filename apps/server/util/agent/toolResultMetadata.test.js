import { describe, expect, it } from 'vitest';
import {
  buildQueryResultMetadata,
  finalizeToolResultMetadata,
  formatToolResultMetadataDisclosure,
} from './toolResultMetadata.js';
import { bindAgentTemporalRanges } from './timeRange.js';

describe('Agent 工具结果元数据', () => {
  it('区分 total、returned 与 limit 截断，禁止把部分结果冒充完整结果', () => {
    expect(buildQueryResultMetadata({ total: 12, returned: 5 })).toMatchObject({
      total: 12,
      returned: 5,
      totalExact: true,
      completeness: 'partial',
      truncated: true,
      truncationReason: 'limit',
    });
    expect(buildQueryResultMetadata({ total: 0, returned: 0 })).toMatchObject({
      completeness: 'complete',
      truncated: false,
    });
  });

  it('最终投影携带已绑定时间口径、稳定 ID 覆盖和文本预算截断', () => {
    const args = { timeRange: '今天' };
    bindAgentTemporalRanges({
      tool: { temporalSlots: [{ name: 'timeRange', label: '创建时间' }] },
      args,
      context: {
        temporalContext: {
          currentInstant: '2026-08-21T04:00:00Z',
          timeZone: 'Asia/Shanghai',
          storageTimeZone: 'Asia/Shanghai',
        },
      },
    });

    expect(
      finalizeToolResultMetadata({
        raw: {
          total: 2,
          items: [{ id: 'n1' }, { id: 'n2' }],
        },
        args,
        dependencyRefs: [
          { type: 'note', id: 'n1' },
          { type: 'note', id: 'n2' },
        ],
        summaryOriginalLength: 100,
        summaryReturnedLength: 60,
      }),
    ).toMatchObject({
      total: 2,
      returned: 2,
      completeness: 'complete',
      stableReferenceCount: 2,
      stableIdCoverage: 'complete',
      resolvedRanges: {
        timeRange: {
          expression: '今天',
          range: { timeZone: 'Asia/Shanghai' },
        },
      },
      summary: { originalLength: 100, returnedLength: 60, truncated: true },
    });
  });

  it('用统一格式披露权威时间口径和部分结果，不依赖具体工具', () => {
    const metadata = buildQueryResultMetadata({
      total: 12,
      returned: 5,
      resolvedRanges: {
        timeRange: {
          expression: '今天',
          range: {
            localStart: '2026-08-21 00:00:00',
            localEnd: '2026-08-21 12:00:00',
            timeZone: 'Asia/Shanghai',
          },
        },
      },
    });

    expect(formatToolResultMetadataDisclosure(metadata, 'zh-CN')).toBe(
      '【已核验查询口径】时间范围: 今天（2026-08-21，截至 12:00 · Asia/Shanghai）；已返回 5/12 条；部分结果 (受返回条数上限限制)',
    );
  });

  it('普通写操作没有查询口径时不生成多余披露', () => {
    expect(
      formatToolResultMetadataDisclosure(
        buildQueryResultMetadata({ total: null, returned: 0, exactTotal: false, coverage: 'complete' }),
      ),
    ).toBe('');
  });
});
