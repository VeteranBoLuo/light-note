import { describe, expect, it } from 'vitest';
import {
  aiResourceExclusionSql,
  appendTransientExclusion,
  transientExcludedIds,
} from './aiResourcePreferencePolicy.js';

describe('AI resource preference policy', () => {
  it('生成按用户和资源 ID 绑定的永久排除条件', () => {
    const sql = aiResourceExclusionSql({
      alias: 'n',
      ownerColumn: 'create_by',
      resourceType: 'note',
    });
    expect(sql).toContain('arp.user_id = n.create_by');
    expect(sql).toContain("arp.resource_type = 'note'");
    expect(sql).toContain('arp.resource_id = CAST(n.id AS CHAR)');
  });

  it('临时排除会去重、限制类型并使用参数化占位符', () => {
    const scope = {
      excludedResourceIds: [
        { type: 'note', id: 'n-1' },
        { type: 'note', id: 'n-1' },
        { type: 'bookmark', id: 'b-1' },
      ],
    };
    expect(transientExcludedIds(scope, 'note')).toEqual(['n-1']);
    const params = ['user-1'];
    const sql = appendTransientExclusion('WHERE create_by = ?', params, scope, 'note', 'note.id');
    expect(sql).toContain('CAST(note.id AS CHAR) NOT IN (?)');
    expect(params).toEqual(['user-1', 'n-1']);
  });

  it('拒绝将未知类型拼接进 SQL', () => {
    expect(() =>
      aiResourceExclusionSql({ alias: 'x', ownerColumn: 'user_id', resourceType: 'unknown' }),
    ).toThrow('AI_RESOURCE_TYPE_INVALID');
  });
});
