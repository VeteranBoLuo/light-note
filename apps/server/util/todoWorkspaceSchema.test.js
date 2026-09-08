import { describe, it, expect, vi } from 'vitest';
vi.mock('../db/index.js', () => ({ default: {} }));
import { ensureTodoWorkspaceSchema } from './todoWorkspaceSchema.js';
describe('todo workspace schema', () => {
  it('runs session-dependent migration statements on one connection and releases it', async () => {
    const connection = { query: vi.fn().mockResolvedValue([[]]), release: vi.fn() };
    await ensureTodoWorkspaceSchema({ getConnection: vi.fn().mockResolvedValue(connection) });
    const statements = connection.query.mock.calls.map(([sql]) => sql);
    expect(statements.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS todo_lists'))).toBe(true);
    expect(statements.filter(sql => sql.startsWith('PREPARE todo_stmt')).length).toBe(4);
    expect(connection.release).toHaveBeenCalledOnce();
  });
  it('stops and releases when a schema statement fails', async () => {
    const connection = { query: vi.fn().mockRejectedValue(new Error('schema failure')), release: vi.fn() };
    await expect(ensureTodoWorkspaceSchema({ getConnection: vi.fn().mockResolvedValue(connection) })).rejects.toThrow('schema failure');
    expect(connection.query).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
