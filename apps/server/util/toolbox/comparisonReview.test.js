import { expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { reviewComparisonCell } from './comparisonReview.js';
const table = () => ({
  columns: [{ label: 'Price', type: 'auto', rule: '' }],
  rows: [{ sourceId: 'note:a', title: 'Source', cells: [{ value: '29', status: 'conflict', quotes: ['29', '39'] }] }],
});
function fixture({ version = 1, status = 'unsaved', exists = true } = {}) {
  const artifact = {
    id: 'a',
    job_id: 'j',
    artifact_version: version,
    meta_json: JSON.stringify({ comparisonTable: table() }),
  };
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi
      .fn()
      .mockResolvedValueOnce([exists ? [artifact] : []])
      .mockResolvedValueOnce([[{ save_status: status }]])
      .mockResolvedValue([{ affectedRows: 1 }]),
  };
  return { connection, database: { getConnection: async () => connection } };
}
const input = { version: 1, sourceId: 'note:a', columnIndex: 0, value: '39' };
it('persists the reviewed value, original and evidence atomically without billing', async () => {
  const { database, connection } = fixture();
  await expect(reviewComparisonCell({ userId: 'owner', artifactId: 'a', input, database })).resolves.toEqual({
    version: 2,
  });
  expect(connection.query.mock.calls[0][1]).toEqual(['a', 'owner']);
  const meta = JSON.parse(connection.query.mock.calls[2][1][1]);
  expect(meta.comparisonTable.rows[0].cells[0]).toMatchObject({
    value: '39',
    originalValue: '29',
    quotes: ['29', '39'],
    edited: true,
    reviewed: true,
  });
  expect(connection.query.mock.calls[2][1][0]).toContain('39');
  expect(connection.commit).toHaveBeenCalledOnce();
});
it.each([
  [{ version: 2 }, 'TOOLBOX_COMPARISON_CONFLICT'],
  [{ status: 'saved' }, 'TOOLBOX_COMPARISON_SAVED'],
  [{ status: 'saving' }, 'TOOLBOX_COMPARISON_SAVED'],
  [{ exists: false }, 'TOOLBOX_ARTIFACT_NOT_FOUND'],
])('rejects stale, saved and unavailable results', async (options, code) => {
  const { database, connection } = fixture(options);
  await expect(reviewComparisonCell({ userId: 'owner', artifactId: 'a', input, database })).rejects.toMatchObject({
    code,
  });
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalledOnce();
});
