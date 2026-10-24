import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./schema.js', () => ({ publicResourceSchemaReady: vi.fn().mockResolvedValue(true) }));
import { combinedSearch, searchQueryScope } from './combinedSearch.js';
const env = { PUBLIC_RESOURCES_ENABLED: 'true' };
const user = { id: 'reader', role: 'user' };
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
function database() {
  let active = 0,
    peak = 0;
  const calls = [];
  return {
    calls,
    get peak() {
      return peak;
    },
    async query(sql, params = []) {
      calls.push({ sql, params });
      active++;
      peak = Math.max(peak, active);
      try {
        await pause();
        if (sql.startsWith('SELECT id,role')) return [[{ ...user, del_flag: '0' }]];
        if (sql.startsWith('SELECT ? AS type'))
          return [
            [
              { type: 'bookmark', origin: 'personal', count: 2 },
              { type: 'note', origin: 'personal', count: 1 },
              { type: 'file', origin: 'personal', count: 0 },
              { type: 'todo', origin: 'personal', count: 0 },
              { type: 'bookmark', origin: 'public', count: 1 },
              { type: 'note', origin: 'public', count: 1 },
            ],
          ];
        if (sql.includes('combined_search'))
          return [
            [
              { id: 'mine', type: 'bookmark', origin: 'personal', score: 100 },
              { id: 'public-id', type: 'note', origin: 'public', score: 60 },
            ],
          ];
        if (sql.includes('FROM public_resource_publications'))
          return [
            [
              {
                public_id: 'public-id',
                kind: 'note',
                body: '获批摘要',
                description: '',
                title: '获批标题',
                author_name: '作者',
              },
            ],
          ];
        if (sql.includes('FROM bookmark b'))
          return [[{ id: 'mine', name: '个人标题', url: 'https://example.org', description: '个人摘要' }]];
        return [[]];
      } finally {
        active--;
      }
    },
  };
}
beforeEach(() => vi.clearAllMocks());
describe('combined search read scheduling', () => {
  it('overlaps independent reads, stays within three queries and preserves ranked origin order', async () => {
    const db = database();
    const result = await combinedSearch({ user, db, env, input: { keyword: '标题', types: ['bookmark', 'note'] } });
    expect(db.peak).toBe(3);
    expect(result.items.map((item) => item.origin)).toEqual(['personal', 'public']);
    expect(result).toMatchObject({
      total: 5,
      personalTotal: 3,
      publicTotal: 2,
      personalTypeTotals: { note: 1, bookmark: 2 },
    });
    const counts = db.calls.filter(({ sql }) => sql.includes('COUNT(*) AS count'));
    expect(counts).toHaveLength(1);
    expect(counts[0].params.filter((p) => p === 'personal')).toHaveLength(4);
    expect(counts[0].params.filter((p) => p === 'public')).toHaveLength(2);
    const publicRead = db.calls.find(({ sql }) => sql.includes('LEFT(r.body,240) AS body'));
    expect(publicRead.sql).toContain('p.withdrawn=0');
    expect(publicRead.sql).toContain('community_chat_blocks');
    expect(result.items[1].raw).toBeUndefined();
  });
  it('continuation pages do not fetch counts, tag options or tag matches', async () => {
    const db = database();
    const result = await combinedSearch({
      user,
      db,
      env,
      input: { keyword: '标题', types: ['bookmark'], includeMetadata: false },
    });
    expect(result.total).toBeUndefined();
    expect(db.calls.some(({ sql }) => sql.includes('COUNT(*) AS count') || /^SELECT name\s+FROM tag/u.test(sql))).toBe(
      false,
    );
  });
  it('a failed query releases its slot; queued reads complete without leaking concurrency', async () => {
    const db = {
      query: vi.fn(async (value) => {
        await pause();
        if (value === 1) throw new Error('fail');
        return value;
      }),
    };
    const scoped = searchQueryScope(db, 2);
    const result = await Promise.allSettled([0, 1, 2, 3, 4].map((value) => scoped.query(value)));
    expect(result.map((item) => item.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'fulfilled', 'fulfilled']);
    expect(db.query).toHaveBeenCalledTimes(5);
  });
});
