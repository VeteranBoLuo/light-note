import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), getConnection: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: db }));

import { __testing, invalidatePersonalKnowledgeCache, searchPersonalKnowledge } from './personalKnowledgeSearch.js';

const TTL = 180_000;
const note = { id: 'note-1', title: 'alpha', content: 'alpha memory', type: 'markdown', update_time: '2026-09-01' };
let documentLoads;

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('personal knowledge cache lifetime', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T00:00:00Z'));
    await invalidatePersonalKnowledgeCache();
    vi.resetAllMocks();
    documentLoads = 0;
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('ORDER BY update_time DESC LIMIT 3000')) {
        documentLoads += 1;
        return [[note]];
      }
      if (sql.includes('title AS resource_title')) return [[note]];
      return [[]];
    });
    db.getConnection.mockImplementation(async () => ({
      beginTransaction: async () => {},
      query: async () => [[]],
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }));
  });

  afterEach(async () => {
    await invalidatePersonalKnowledgeCache();
    vi.useRealTimers();
  });

  it('releases expired indexes without another request or database work', async () => {
    const bundle = await __testing.loadBundle('expiry');
    await vi.advanceTimersByTimeAsync(TTL - 1);
    expect(__testing.cache.get('expiry')).toBe(bundle);
    const calls = db.query.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1);
    expect(__testing.cache.has('expiry')).toBe(false);
    expect(db.query).toHaveBeenCalledTimes(calls);
    expect(bundle.index.search('alpha')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not evict a replacement at the old index deadline', async () => {
    const old = await __testing.loadBundle('replacement');
    await vi.advanceTimersByTimeAsync(TTL / 2);
    await invalidatePersonalKnowledgeCache('replacement', { persist: false });
    const fresh = await __testing.loadBundle('replacement');
    expect(fresh).not.toBe(old);
    await vi.advanceTimersByTimeAsync(TTL / 2);
    expect(__testing.cache.get('replacement')).toBe(fresh);
    await vi.advanceTimersByTimeAsync(TTL / 2);
    expect(__testing.cache.has('replacement')).toBe(false);
  });

  it('expires users independently and does not extend TTL on a hit', async () => {
    const first = await __testing.loadBundle('first');
    await vi.advanceTimersByTimeAsync(60_000);
    const second = await __testing.loadBundle('second');
    expect(await __testing.loadBundle('first')).toBe(first);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(__testing.cache.has('first')).toBe(false);
    expect(__testing.cache.get('second')).toBe(second);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(__testing.cache.size).toBe(0);
  });

  it('deduplicates concurrent rebuilds and preserves search results after expiry', async () => {
    const before = await searchPersonalKnowledge({ userId: 'concurrent', query: 'alpha' });
    expect(before.hits).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(TTL);
    const [one, two] = await Promise.all([__testing.loadBundle('concurrent'), __testing.loadBundle('concurrent')]);
    expect(one).toBe(two);
    expect(documentLoads).toBe(2);
    expect(await searchPersonalKnowledge({ userId: 'concurrent', query: 'alpha' })).toEqual(before);
  });

  it.each([false, true])('preserves in-flight authority checks across expiry (removed=%s)', async (removed) => {
    await __testing.loadBundle('in-flight');
    const entered = deferred();
    const resume = deferred();
    const query = db.query.getMockImplementation();
    db.query.mockImplementation(async (sql, params) => {
      if (sql.includes('title AS resource_title')) {
        entered.resolve();
        await resume.promise;
        if (removed) return [[]];
      }
      return query(sql, params);
    });
    const search = searchPersonalKnowledge({ userId: 'in-flight', query: 'alpha' });
    await entered.promise;
    await vi.advanceTimersByTimeAsync(TTL);
    expect(__testing.cache.has('in-flight')).toBe(false);
    resume.resolve();
    expect((await search).hits).toHaveLength(removed ? 0 : 1);
    expect(documentLoads).toBe(1);
  });

  it('cancels the expiry timer when the cache is invalidated', async () => {
    expect(vi.getTimerCount()).toBe(0);
    await __testing.loadBundle('clear');
    expect(vi.getTimerCount()).toBe(1);
    await invalidatePersonalKnowledgeCache();
    expect(__testing.cache.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
