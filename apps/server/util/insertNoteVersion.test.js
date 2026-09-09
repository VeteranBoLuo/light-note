import { describe, it, expect, vi } from 'vitest';
import { insertNoteVersion } from './insertNoteVersion.js';
describe('note version identity compatibility', () => {
  it('keeps a generated string ID for legacy tables and image references', async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ Type: 'varchar(255)', Extra: '' }]])
      .mockResolvedValueOnce([{ insertId: 0 }]);
    const id = await insertNoteVersion({ query }, { note_id: 'note-1', content: 'snapshot' });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(query.mock.calls[1][1][0].id).toBe(id);
  });
  it('uses the database ID for current auto-increment tables', async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ Type: 'bigint(20) unsigned', Extra: 'auto_increment' }]])
      .mockResolvedValueOnce([{ insertId: 42 }]);
    expect(await insertNoteVersion({ query }, { note_id: 'note-1' })).toBe(42);
    expect(query.mock.calls[1][1][0].id).toBeNull();
  });
});
