import { describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../agent/data.js', () => ({ generateUUID: vi.fn() }));
vi.mock('../notification.js', () => ({ createNotification: vi.fn() }));
const { listPublicFeatureRequests, listAdminFeatureRequests } = await import('./featureRequestService.js');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe('共建列表的并发读取与返回契约', () => {
  it('公开列表等待全部查询；筛选后的 total 不代替未筛选的状态汇总', async () => {
    const gates = [deferred(), deferred(), deferred()];
    const query = vi.fn().mockImplementation(() => gates[query.mock.calls.length - 1].promise);
    let finished = false;
    const result = listPublicFeatureRequests({
      viewerUserId: 'viewer',
      filters: { keyword: 'term' },
      pagination: { currentPage: 2, pageSize: 5 },
      db: { query },
    }).then((value) => {
      finished = true;
      return value;
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][1]).toEqual(['viewer', 'viewer', '%term%', '%term%', 5, 5]);
    expect(query.mock.calls[1][1]).toEqual(['%term%', '%term%']);
    expect(query.mock.calls[2][1]).toBeUndefined();
    gates[1].resolve([[{ total: '6' }]]);
    gates[0].resolve([[{ id: 'visible', viewer_voted: 1 }]]);
    await Promise.resolve();
    expect(finished).toBe(false);
    gates[2].resolve([[{ progress_status: 'evaluating', total: '10' }]]);
    await expect(result).resolves.toMatchObject({
      items: [{ id: 'visible', viewer_voted: 1 }],
      total: 6,
      currentPage: 2,
      pageSize: 5,
      summary: { evaluating: 10 },
    });
  });
  it.each([0, 1, 2])('公开列表第 %i 个查询失败时拒绝整个读取，不返回部分成功数据', async (failureIndex) => {
    const failure = new Error('fixture failure');
    const query = vi.fn().mockImplementation(() => {
      const index = query.mock.calls.length - 1;
      return index === failureIndex ? Promise.reject(failure) : Promise.resolve(index === 1 ? [[{ total: 0 }]] : [[]]);
    });
    await expect(listPublicFeatureRequests({ db: { query } })).rejects.toBe(failure);
    expect(query).toHaveBeenCalledTimes(3);
  });
});


describe('管理员建议列表头像复用', () => {
  it('同一查询恢复公开头像，匿名与官方建议仍隐藏公开头像，保留私有字段', async () => {
    const rows = [
      { id: 'visible', submitter_avatar: 1, owner_avatar: 'full-avatar', owner_alias: 'owner' },
      { id: 'anonymous', submitter_avatar: null, owner_avatar: 'private-avatar' },
      { id: 'official', submitter_avatar: null, owner_avatar: 'official-avatar' },
      { id: 'missing-user', submitter_avatar: 1, owner_avatar: null },
    ];
    const query = vi.fn().mockResolvedValueOnce([rows]).mockResolvedValueOnce([[{ total: '4' }]]);
    const result = await listAdminFeatureRequests({ db: {query}, pagination: {currentPage: 2, pageSize: 5} });
    expect(result).toEqual({items: [
      {id: 'visible', submitter_avatar: 'full-avatar', owner_avatar: 'full-avatar', owner_alias: 'owner'},
      {id: 'anonymous', submitter_avatar: null, owner_avatar: 'private-avatar'},
      {id: 'official', submitter_avatar: null, owner_avatar: 'official-avatar'},
      {id: 'missing-user', submitter_avatar: null, owner_avatar: null},
    ],total: 4,currentPage: 2,pageSize: 5});
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toEqual(['', '', 5, 5]);
    expect(rows[0].submitter_avatar).toBe(1);
  });
  it('空页保留总量和筛选条件', async () => {
    const query = vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{total: 3}]]);
    const result = await listAdminFeatureRequests({ db: {query}, filters: {keyword: 'term', moderationStatus: 'published'} });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(3);
    expect(query.mock.calls[1][1]).toEqual(['published','%term%','%term%','%term%']);
  });
});
