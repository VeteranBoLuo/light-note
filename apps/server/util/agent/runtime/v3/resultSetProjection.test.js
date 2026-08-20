import { describe, expect, it } from 'vitest';
import { projectAgentV3ResultSet } from './resultSetProjection.js';

const capability = Object.freeze({ id: 'bookmark.query', domains: ['bookmark'], resultKind: 'bookmark_list' });

describe('V3 ResultSet 投影', () => {
  it('只接受真实工具返回的稳定引用，不根据 resultKind 名称猜测集合', () => {
    expect(
      projectAgentV3ResultSet({ capability, result: { status: 'success', summary: '共 3 条结果' } }),
    ).toBeNull();
    expect(
      projectAgentV3ResultSet({
        capability,
        result: { status: 'success', sources: [{ type: 'bookmark', id: 'bookmark-1' }] },
      }),
    ).toMatchObject({ status: 'success', refs: [{ type: 'bookmark', id: 'bookmark-1' }] });
  });

  it('只有工具明确完成引用投影时，空引用才代表权威空结果', () => {
    expect(
      projectAgentV3ResultSet({
        capability,
        result: { status: 'success', dependencyRefs: [], referenceProjectionComplete: true },
      }),
    ).toMatchObject({ status: 'empty', refs: [] });
    expect(projectAgentV3ResultSet({ capability, result: { status: 'error' } })).toBeNull();
  });
});
