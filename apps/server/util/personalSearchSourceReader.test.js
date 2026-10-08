import { expect, it, vi } from 'vitest';
import { readPersonalSearchSource } from './personalSearchSourceReader.js';

it('groups by byte and row budgets, preserves order and reads oversized resources alone', async () => {
  const metadata = Array.from({ length: 105 }, (_, i) => ({ id: String(i), body_bytes: 100 }));
  metadata[0].body_bytes = 700_000;
  metadata[1].body_bytes = 700_000;
  metadata[2].body_bytes = 3_000_000;
  const batches = [];
  const database = {
    query: vi.fn(async (sql, params) => {
      if (sql.includes('body_bytes')) return [metadata];
      const ids = params.slice(1);
      batches.push(ids);
      return [ids.toReversed().map((id) => ({ id, content: `complete ${id}` }))];
    }),
  };
  const rows = [];
  for await (const row of readPersonalSearchSource(database, 'owner', 'note', () => true)) rows.push(row);
  expect(rows.map((row) => row.id)).toEqual(metadata.map((row) => row.id));
  expect(batches.map((batch) => batch.length)).toEqual([1, 1, 1, 50, 50, 2]);
  expect(rows[2].content).toBe('complete 2');
});

it('does not read metadata without capacity and stops fetching more bodies once full', async () => {
  const metadata = Array.from({ length: 100 }, (_, i) => ({ id: String(i), body_bytes: 100 }));
  const database = {
    query: vi.fn(async (sql, params) =>
      sql.includes('body_bytes') ? [metadata] : [params.slice(1).map((id) => ({ id }))],
    ),
  };
  for await (const row of readPersonalSearchSource(database, 'owner', 'todo', () => false)) throw new Error(row.id);
  expect(database.query).not.toHaveBeenCalled();
  let remaining = 1;
  for await (const row of readPersonalSearchSource(database, 'owner', 'todo', () => remaining > 0)) {
    expect(row.id).toBe('0');
    remaining -= 1;
  }
  expect(database.query).toHaveBeenCalledTimes(2);
});

it('skips resources deleted between metadata and body reads while keeping remaining order', async () => {
  const database = {
    query: vi
      .fn()
      .mockResolvedValueOnce([[{ id: '1' }, { id: '2' }, { id: '3' }]])
      .mockResolvedValueOnce([[{ id: '3' }, { id: '1' }]]),
  };
  const rows = [];
  for await (const row of readPersonalSearchSource(database, 'owner', 'bookmark', () => true)) rows.push(row.id);
  expect(rows).toEqual(['1', '3']);
});
