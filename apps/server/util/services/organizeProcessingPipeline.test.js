import { describe, expect, it, vi } from 'vitest';
import {
  runOrganizeInspection,
  runOrganizeDirect,
  readOrganizeOverview,
  reclassifyCachedIcons,
} from './organizeProcessingPipeline.js';
import { buildSnapshot } from './organizeSuggestionRules.js';
vi.mock('../tagIconService.js', () => ({
  prepareTagIconRoute: vi.fn(() => ({ needsAi: false, keywords: ['book'] })),
  recommendTagIcons: vi.fn(),
  estimateTagIconTokens: () => 0,
}));
import { prepareTagIconRoute } from '../tagIconService.js';
const options = { resourceTypes: ['tag'], checks: ['tag_icon'], scope: 'all', items: [] };
const run = {
  id: 'r',
  user_id: 'u',
  run_version: 3,
  status: 'running',
  rule_phase: 'completed',
  options_json: options,
  summary_json: { total: 2 },
};
const source = buildSnapshot('tag', { id: 't', name: 'Reading', icon_url: '' });
const item = {
  id: 'i',
  run_id: 'r',
  user_id: 'u',
  resource_id: 't',
  resource_type: 'tag',
  snapshot_json: source,
  version_hash: source.version,
  rule_status: 'checked',
  ai_status: 'not_needed',
};
function database(handler) {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    query: vi.fn(async (sql, args = []) => {
      const result = handler(sql, args);
      if (result !== undefined) return result;
      if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
}
function directDb(kind = 'prepare', custom = () => undefined) {
  const job = {
    id: 'j',
    run_id: 'r',
    user_id: 'u',
    item_id: 'i',
    kind,
    lane: 'direct',
    status: 'queued',
    prepared_json: { keywords: ['book'], version: source.version },
    attempts: 0,
  };
  return database((sql, args) => {
    const result = custom(sql, args);
    if (result !== undefined) return result;
    if (sql.startsWith('SELECT * FROM organize_suggestion_runs')) return [[run]];
    if (sql.startsWith('SELECT * FROM organize_processing_jobs')) return [[job]];
    if (sql.startsWith('SELECT * FROM organize_suggestion_items')) return [[item]];
    if (sql.startsWith('SELECT item_id FROM organize_processing_jobs')) return [[{ item_id: 'i' }]];
    if (sql.startsWith('SELECT id FROM organize_processing_jobs')) return [[{ id: 'j' }]];
  });
}
const inserts = (db) =>
  db.query.mock.calls
    .filter(([sql]) => sql.includes('INSERT IGNORE INTO organize_processing_jobs'))
    .map(([, args]) => ({ kind: args[5], lane: args[6], status: args[7], prepared: JSON.parse(args[8]) }));
describe('light checks and processing gate', () => {
  it('only checks candidates and waits for the last batch to open processing', async () => {
    const checking = { ...run, status: 'preparing', rule_phase: 'pending' };
    let remaining = 1;
    const db = database((sql) => {
      if (sql.startsWith('SELECT * FROM organize_suggestion_runs')) return [[checking]];
      if (sql.startsWith('SELECT * FROM organize_suggestion_items')) return [[item]];
      if (sql.startsWith('SELECT COUNT(*) total')) return [[{ total: remaining }]];
    });
    const candidates = vi.fn(async () => [{ id: 't', type: 'tag', title: 'Reading' }]);
    await runOrganizeInspection('w', db, { candidates });
    expect(candidates).toHaveBeenCalledWith(db, 'u', 'tag', expect.objectContaining({ ids: ['t'] }));
    expect(inserts(db)).toEqual([{ kind: 'prepare', lane: 'direct', status: 'queued', prepared: null }]);
    expect(db.query.mock.calls.some(([sql]) => sql.includes("SET rule_phase='completed'"))).toBe(false);
    remaining = 0;
    await runOrganizeInspection('w', db, { candidates });
    expect(db.query.mock.calls.some(([sql]) => sql.includes("SET rule_phase='completed'"))).toBe(true);
  });
  it('does not claim free work before checks finish', async () => {
    const db = database((sql) => (sql.startsWith('SELECT * FROM organize_suggestion_runs') ? [[]] : undefined));
    const icons = vi.fn(),
      read = vi.fn();
    expect(await runOrganizeDirect('w', db, { icons, source: read })).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(icons).not.toHaveBeenCalled();
    expect(db.query.mock.calls[0][0]).toContain("rule_phase='completed'");
  });
});
describe('routing and delivery', () => {
  it('persists free keywords and does not put cached icons in the AI queue', async () => {
    const db = directDb();
    await runOrganizeDirect('w', db, {
      source: async () => source,
      route: () => ({ needsAi: false, keywords: ['book'] }),
    });
    expect(inserts(db)).toEqual([
      { kind: 'tag_icon', lane: 'direct', status: 'queued', prepared: { keywords: ['book'], version: source.version } },
    ]);
    expect(db.query.mock.calls.some(([sql]) => sql.includes("ai_status='queued'"))).toBe(false);
  });
  it('uncached translation creates exactly one AI work item', async () => {
    const db = directDb();
    await runOrganizeDirect('w', db, { source: async () => source, route: () => ({ needsAi: true }) });
    expect(inserts(db)).toEqual([{ kind: 'analysis', lane: 'ai', status: 'queued', prepared: null }]);
  });
  it('a free icon job uses its saved keywords and delivers a reviewable result', async () => {
    const db = directDb('tag_icon');
    const icons = vi.fn(async () => [
      { iconName: 'lucide:book', iconUrl: 'data:image/svg+xml;base64,fixture', color: 'currentColor' },
    ]);
    await runOrganizeDirect('w', db, { source: async () => source, icons });
    expect(icons).toHaveBeenCalledWith('Reading', ['book']);
    const saved = db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE organize_suggestions SET status=?'));
    expect(saved[1][0]).toBe('pending');
  });
  it('external changes become conflicts without searching or overwriting suggestions', async () => {
    const db = directDb('tag_icon');
    const icons = vi.fn();
    await runOrganizeDirect('w', db, { source: async () => ({ ...source, version: 'changed' }), icons });
    expect(icons).not.toHaveBeenCalled();
    expect(
      db.query.mock.calls.some(
        ([sql, args]) => sql.startsWith('UPDATE organize_processing_jobs SET status=?') && args[0] === 'conflict',
      ),
    ).toBe(true);
  });
  it('expired delivery leases cannot save results', async () => {
    const db = directDb('tag_icon', (sql) =>
      sql.startsWith('SELECT id FROM organize_processing_jobs') ? [[]] : undefined,
    );
    await runOrganizeDirect('w', db, { source: async () => source, icons: async () => [] });
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('INSERT IGNORE INTO organize_suggestions'))).toBe(false);
  });
  it('partial source-read failure does not become a clean duplicate check', async () => {
    let count = 0;
    const db = directDb('compare', (sql) =>
      sql.startsWith('SELECT COUNT(*) total') ? [[{ total: count++ ? 1 : 0 }]] : undefined,
    );
    await runOrganizeDirect('w', db);
    expect(
      db.query.mock.calls.some(
        ([sql, args]) =>
          sql.startsWith('UPDATE organize_processing_jobs SET status=?') &&
          args[0] === 'failed' &&
          args[1] === 'ORGANIZE_EVIDENCE_INCOMPLETE',
      ),
    ).toBe(true);
  });
  it('new cache hits move out of a paused AI queue', async () => {
    const db = database((sql) => {
      if (sql.startsWith('SELECT * FROM organize_suggestion_runs')) return [[{ ...run, status: 'paused' }]];
      if (sql.startsWith('SELECT i.*')) return [[{ ...item, ai_status: 'queued' }]];
    });
    vi.mocked(prepareTagIconRoute).mockReturnValue({ needsAi: false, keywords: ['book'] });
    expect(await reclassifyCachedIcons('w', db)).toBe(true);
    expect(db.query.mock.calls.some(([sql]) => sql.includes("SET lane='direct'"))).toBe(true);
  });
});
it('overview counts all objects and distinct manual targets independently of tabs', async () => {
  const db = database((sql) => {
    if (sql.startsWith('SELECT item_id'))
      return [
        [
          { item_id: 'a', kind: 'prepare', lane: 'direct', status: 'completed' },
          { item_id: 'a', kind: 'duplicate', lane: 'direct', status: 'waiting' },
          { item_id: 'a', kind: 'analysis', lane: 'ai', status: 'running' },
        ],
      ];
    if (sql.startsWith('SELECT i.id,'))
      return [
        [
          ...Array.from({ length: 6 }, (_, i) => ({
            id: String(i),
            resource_available: 1,
            rule_status: 'completed',
            ai_status: 'completed',
            manual: 1,
          })),
        ],
      ];
    if (sql.includes('manual_objects')) return [[{ pending: 15, manual_objects: 6, retry_files: 2 }]];
  });
  const result = await readOrganizeOverview(db, run, [{ rule_status: 'completed', total: 2 }]);
  expect(result.direct).toMatchObject({ total: 1, completed: 0, waiting: 1 });
  expect(result.ai).toMatchObject({ total: 1, running: 1 });
  expect(result.review).toMatchObject({ pending: 15, manualObjects: 6, retryFiles: 2 });
});
it('returns the same exclusive outcomes for review counts and per-item grouping', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    resource_type: 'tag',
    resource_available: 1,
    rule_status: 'completed',
    ai_status: 'completed',
    pending: i < 3 ? 1 : 0,
    manual: i >= 3 ? 1 : 0,
    work_open: i >= 5 ? 1 : 0,
  }));
  const db = database((sql) => {
    if (sql.startsWith('SELECT item_id')) return [[]];
    if (sql.startsWith('SELECT i.id,')) return [rows];
    if (sql.includes('manual_objects')) return [[{ pending: 3, manual_objects: 7, retry_files: 0 }]];
  });
  const itemOutcomes = new Map();
  const result = await readOrganizeOverview(db, { ...run, status: 'completed' }, [], itemOutcomes);
  expect(result.review.manualObjects).toBe(2);
  expect(result.review.outcomes).toMatchObject({ review: 3, manual: 2, unfinished: 5 });
  expect(itemOutcomes.get('5')).toEqual({ type: 'tag', outcome: 'unfinished' });
  expect(itemOutcomes.get('3')).toEqual({ type: 'tag', outcome: 'manual' });
});
