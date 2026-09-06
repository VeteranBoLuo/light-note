import { describe, expect, it, vi } from 'vitest';
import {
  createOrganizeAiSuggestionBatch,
  listOrganizeAiSuggestionBatches,
  organizeAiSuggestionServiceInternals as internals,
} from './organizeAiSuggestionService.js';
const groupId = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
const input = {
  resourceType: 'note',
  scope: 'selected',
  resourceIds: ['note-1'],
  requestId: 'f56a4180-65aa-42ec-a945-5fd21dec0538',
  groupId,
};
describe('整理任务关联', () => {
  it('旧请求哈希保持兼容，同一个请求不能改绑到其他整理组', () => {
    const old = internals.normalizeRequest({ ...input, groupId: undefined });
    expect(internals.payloadHash(old)).toBe(internals.payloadHash({ ...old, groupId: null }));
    expect(internals.payloadHash(old)).not.toBe(internals.payloadHash(internals.normalizeRequest(input)));
    expect(() => internals.normalizeRequest({ ...input, groupId: 'bad-id' })).toThrow();
    expect(internals.mapBatch({ id: 'old' }).groupId).toBeNull();
  });
  it('分组查询始终限定当前账号并返回持久关联', async () => {
    const query = vi.fn(async () => [[{ id: 'b1', group_id: groupId, resource_type: 'note', total: 20 }]]);
    const result = await listOrganizeAiSuggestionBatches({ query }, { userId: 'u1', groupId });
    expect(query.mock.calls[0][0]).toContain('user_id = ? AND group_id = ?');
    expect(query.mock.calls[0][1].slice(0, 2)).toEqual(['u1', groupId]);
    expect(result.items[0]).toMatchObject({ groupId, progress: { total: 20 } });
  });
  it('创建事务保存 group_id，重试返回同一组结果而不重复插入', async () => {
    let saved;
    const query = vi.fn(async (sql, params) => {
      if (sql.includes('FROM user')) return [[{ id: 'u1', role: 'user', del_flag: 0 }]];
      if (sql.includes('payload_hash AS payloadHash')) return [saved ? [saved] : []];
      if (sql.includes('FROM note WHERE create_by'))
        return [[{ id: 'note-1', title: '标题', type: 'html', content: '正文', revision: 1 }]];
      if (sql.includes('FROM resource_tag_relations')) return [[]];
      if (sql.includes('INSERT INTO organize_ai_tag_batches')) {
        saved = {
          id: params[0],
          payloadHash: params[3],
          resourceType: 'note',
          scopeMode: 'selected',
          groupId: params[7],
          total: 1,
          status: 'queued',
        };
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO organize_ai_tag_suggestions')) return [{ affectedRows: 1 }];
      throw new Error('unexpected query');
    });
    const db = { query, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn() };
    const first = await createOrganizeAiSuggestionBatch(db, { userId: 'u1', input });
    const retry = await createOrganizeAiSuggestionBatch(db, { userId: 'u1', input });
    expect(first.groupId).toBe(groupId);
    expect(retry).toMatchObject({ id: first.id, groupId });
    expect(query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO organize_ai_tag_batches'))).toHaveLength(1);
  });
});
