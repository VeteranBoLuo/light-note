import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), getConnection: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: db }));

import { __testing, invalidatePersonalKnowledgeCache, searchPersonalKnowledge } from './personalKnowledgeSearch.js';

import { indexClient } from './personalSearchIndexClient.js';
afterAll(() => indexClient.close());

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
      if (sql.includes('FROM note') && !sql.includes('title AS resource_title')) {
        if (sql.includes('AND id IN')) documentLoads += 1;
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

  it('persists a second invalidation arriving after the first database commit but before its acknowledgement', async () => {
    const committed = deferred(), acknowledge = deferred();
    let commits = 0, updates = 0;
    db.getConnection.mockImplementation(async () => ({
      beginTransaction: async () => {},
      query: async (sql) => { if (sql.includes('INSERT INTO ai_content_generations')) updates += 1; return [{ affectedRows: 1 }]; },
      commit: async () => { if (++commits === 1) { committed.resolve(); await acknowledge.promise; } },
      rollback: async () => {}, release: () => {},
    }));
    const first = invalidatePersonalKnowledgeCache('commit-race', { persist: true });
    await committed.promise;
    const second = invalidatePersonalKnowledgeCache('commit-race', { persist: true });
    acknowledge.resolve();
    await Promise.all([first, second]);
    expect(updates).toBe(2);
    expect(commits).toBe(2);
  });

  it('releases expired indexes without another request or database work', async () => {
    const bundle = await __testing.loadBundle('expiry');
    await vi.advanceTimersByTimeAsync(TTL - 1);
    expect(__testing.cache.get('expiry')).toBe(bundle);
    const calls = db.query.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1);
    expect(__testing.cache.has('expiry')).toBe(false);
    expect(db.query).toHaveBeenCalledTimes(calls);
    expect(await bundle.index.search('alpha')).toHaveLength(1);
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
  it('bounds cold reads and rechecks generations after waiting', async () => {
    vi.useRealTimers();
    const entered = deferred(),
      resume = deferred();
    const query = db.query.getMockImplementation();
    let held = false;
    db.query.mockImplementation(async (sql, params) => {
      if (!held && params?.[0] === 'gate-first' && sql.includes('AND id IN')) {
        held = true;
        entered.resolve();
        await resume.promise;
      }
      return query(sql, params);
    });
    const firstPromise = __testing.loadBundle('gate-first');
    await entered.promise;
    const pending = __testing.loadBundle('gate-second');
    const duplicate = __testing.loadBundle('gate-second');
    await new Promise(setImmediate);
    expect(documentLoads).toBe(0);
    await invalidatePersonalKnowledgeCache('gate-second', { persist: false });
    resume.resolve();
    const [first, second, same] = await Promise.all([firstPromise, pending, duplicate]);
    expect(second).toBe(same);
    expect(second.localGeneration).toBe(1);
    expect(documentLoads).toBe(2);
    expect(await first.index.search('alpha')).toHaveLength(1);
    expect(await second.index.search('alpha')).toHaveLength(1);
  });

  it('releases admission after a build lifecycle fails so another account can proceed', async () => {
    const query = db.query.getMockImplementation();
    let generationReads = 0;
    db.query.mockImplementation(async (sql, params) => {
      if (params?.[0] === 'gate-failure' && sql.includes('SELECT generation')) {
        generationReads += 1;
        if (generationReads === 2) throw new Error('database temporarily unavailable');
      }
      return query(sql, params);
    });
    await expect(__testing.loadBundle('gate-failure')).rejects.toThrow('database temporarily unavailable');
    expect(await (await __testing.loadBundle('gate-recovery')).index.search('alpha')).toHaveLength(1);
  });
  it('cold rebuilds do not borrow a write connection or persist duplicate private bodies', async () => {
    const first = await __testing.loadBundle('read-only-build');
    expect(await first.index.search('alpha')).toHaveLength(1);
    await invalidatePersonalKnowledgeCache('read-only-build', { persist: false });
    const rebuilt = await __testing.loadBundle('read-only-build');
    expect(await rebuilt.index.search('alpha')).toHaveLength(1);
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(db.query.mock.calls.every(([sql]) => !/^\s*(INSERT|UPDATE|DELETE)/iu.test(sql))).toBe(true);
  });
});
