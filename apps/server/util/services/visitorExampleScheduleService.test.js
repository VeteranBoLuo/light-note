import { describe, it, expect, vi } from 'vitest';
import {
  visitorDate,
  offsetDate,
  rollingValues,
  exampleHash,
  parseExampleManifest,
  createVisitorExampleMaintenancePoller,
  rollVisitorExamples,
  VISITOR_EXAMPLE_VERSION,
} from './visitorExampleScheduleService.js';
const manifest = () => ({ version: VISITOR_EXAMPLE_VERSION, rolling: [], notes: [], projects: [] });
describe('visitor daily maintenance', () => {
  it('uses Beijing midnight and crosses leap days, month and year boundaries', () => {
    expect(visitorDate(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
    expect(visitorDate(new Date('2026-12-31T15:59:59Z'))).toBe('2026-12-31');
    expect(offsetDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(offsetDate('2028-02-29', 1)).toBe('2028-03-01');
    expect(rollingValues({ type: 'todo', offsets: { due_at: -1, completed_at: null } }, '2027-01-01')).toEqual({
      due_at: '2026-12-31 18:00:00',
      completed_at: null,
    });
    expect(() => rollingValues({ type: 'todo', offsets: { title: 0 } }, '2027-01-01')).toThrow();
  });
  it('rejects duplicate targets and retains a stable hash after protected snapshot serialization', () => {
    const m = manifest();
    m.rolling = [
      { type: 'todo', id: 't' },
      { type: 'todo', id: 't' },
    ];
    expect(() => parseExampleManifest(m)).toThrow();
    const row = { b: 2, a: new Date('2026-01-01Z') };
    expect(exampleHash(row)).toBe(exampleHash(JSON.parse(JSON.stringify(row))));
  });
  it('does no writes when already maintained; rolls back changed objects before updating anything', async () => {
    const state = { enabled: 1, version: VISITOR_EXAMPLE_VERSION, last_date: '2026-09-09', manifest_json: manifest() };
    const conn = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) =>
        sql.includes('FROM user ')
          ? [[{ role: 'visitor', del_flag: 0 }]]
          : sql.includes('FROM visitor_example_maintenance')
            ? [[state]]
            : [[{ id: 't', del_flag: 0, title: 'edited' }]],
      ),
    };
    const pool = { getConnection: async () => conn },
      invalidate = vi.fn();
    expect(await rollVisitorExamples(pool, 'v', { now: new Date('2026-09-09Z'), invalidate })).toEqual({
      changed: false,
    });
    state.last_date = '2026-09-08';
    state.manifest_json.rolling = [
      { type: 'todo', id: 't', expected: exampleHash({ id: 't' }), offsets: { due_at: 0 } },
    ];
    await expect(rollVisitorExamples(pool, 'v', { now: new Date('2026-09-09Z'), invalidate })).rejects.toMatchObject({
      code: 'VISITOR_OBJECT_CHANGED',
    });
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('checks immediately after restart, limits concurrency and backs off without propagating failure', async () => {
    let clock = 0,
      resolve;
    const db = { query: vi.fn(() => new Promise((r) => (resolve = r))) };
    const roll = vi.fn().mockRejectedValue(new Error('private details'));
    const log = vi.fn();
    const poll = createVisitorExampleMaintenancePoller(db, { clock: () => clock, roll, log });
    const first = poll();
    await poll();
    expect(db.query).toHaveBeenCalledOnce();
    resolve([[{ user_id: 'v' }]]);
    await first;
    expect(log.mock.calls.flat().join(' ')).not.toContain('private');
    clock = 60000;
    await poll();
    expect(db.query).toHaveBeenCalledOnce();
    clock = 120000;
    db.query.mockResolvedValue([[]]);
    await poll();
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});
