import { describe, it, expect, vi } from 'vitest';
vi.mock('./dailyBriefWorkshop.js', () => ({
  compileWorkshopBriefFacts: vi
    .fn()
    .mockResolvedValue([
      {
        id: 'workshop_due',
        count: 1,
        samples: ['项目 · 今天到期'],
        sources: [{ type: 'research_workspace', id: 'p', title: '项目' }],
      },
    ]),
}));
vi.mock('./resourceInventoryService.js', () => ({
  summarizeUntaggedResources: vi.fn().mockResolvedValue({ total: 2 }),
}));
vi.mock('../resourceInbox.js', async (original) => ({
  ...(await original()),
  queryPendingCount: vi.fn().mockResolvedValue({ pendingTotal: 3 }),
}));
import { getVisitorBrief } from './visitorBriefService.js';
const manifest = { version: 'visitor-resources-v2', rolling: [], notes: [{ id: 'n1' }, { id: 'n2' }], projects: ['p'] };
const database = (role = 'visitor', state = { manifest_json: manifest, data_date: '2026-09-08' }) => ({
  query: vi.fn(async (sql) => {
    if (sql.includes('FROM user ')) return [[{ role, del_flag: 0 }]];
    if (sql.includes('FROM visitor_example_maintenance')) return [state ? [state] : []];
    if (sql.includes('SELECT id,title,type FROM note'))
      return [
        [
          { id: 'n1', title: '一' },
          { id: 'n2', title: '二' },
        ],
      ];
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 4 }]];
    if (sql.includes('SELECT r.resource_id'))
      return [
        [
          { id: 'n1', title: '一', tag_id: 't', tag_name: '学习' },
          { id: 'n2', title: '二', tag_id: 't', tag_name: '学习' },
        ],
      ];
    throw Error('unexpected SQL');
  }),
});
describe('visitor brief is a read-only view', () => {
  it('uses real counts, verified links and saved data date without AI or writes', async () => {
    const db = database();
    const response = await getVisitorBrief(db, { userId: 'v', now: new Date('2026-09-09Z') });
    expect(response).toMatchObject({
      kind: 'visitor_example',
      dataDate: '2026-09-08',
      stale: true,
      brief: { generatedBy: 'example' },
    });
    expect(response.brief.insights).toHaveLength(4);
    expect(response.brief.insights[0].text).toContain('4 项');
    expect(response.brief.insights[0].sources[0].id).toBe('p');
    expect(response.brief.insights[3].factIds).toEqual(['organize_untagged', 'organize_pending']);
    expect(db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });
  it('rejects a formal owner and handles uninstalled examples without inventing content', async () => {
    const db = database('user');
    await expect(getVisitorBrief(db, { userId: 'u' })).rejects.toMatchObject({ code: 'VISITOR_OWNER_INVALID' });
    expect(db.query).toHaveBeenCalledOnce();
    expect((await getVisitorBrief(database('visitor', null), { userId: 'v' })).brief).toBeNull();
  });
});
