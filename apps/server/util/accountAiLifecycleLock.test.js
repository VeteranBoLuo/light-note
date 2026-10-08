import { describe, expect, it, vi } from 'vitest';
import { acquireAccountAiLifecycleLock, acquireAccountAiLifecycleConnection } from './accountAiLifecycleLock.js';

describe('account AI lifecycle session lock', () => {
  it('returns a busy connection to the pool before retrying', async () => {
    const busy = { query: vi.fn().mockResolvedValue([[{ acquired: 0 }]]), release: vi.fn() };
    const ready = { query: vi.fn().mockResolvedValue([[{ acquired: 1 }]]), release: vi.fn() };
    const database = {
      getConnection: vi
        .fn()
        .mockResolvedValueOnce(busy)
        .mockImplementation(async () => {
          expect(busy.release).toHaveBeenCalledOnce();
          return ready;
        }),
    };
    const lease = await acquireAccountAiLifecycleConnection(database, 'owner');
    expect(lease.connection).toBe(ready);
    expect(ready.release).not.toHaveBeenCalled();
  });
  it('fails at the wait budget without retaining a connection', async () => {
    const connection = { query: vi.fn().mockResolvedValue([[{ acquired: 0 }]]), release: vi.fn() };
    await expect(
      acquireAccountAiLifecycleConnection({ getConnection: async () => connection }, 'owner', { timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: 'AI_ACCOUNT_LIFECYCLE_BUSY' });
    expect(connection.release).toHaveBeenCalledOnce();
  });
  it('uses bounded opaque account keys and releases at most once', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ acquired: 1 }]])
        .mockResolvedValue([[{ released: 1 }]]),
      destroy: vi.fn(),
    };
    const release = await acquireAccountAiLifecycleLock(connection, 'private-user');
    const name = connection.query.mock.calls[0][1][0];
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).not.toContain('private-user');
    await release();
    await release();
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.query.mock.calls[1][1]).toEqual([name]);
    expect(connection.destroy).not.toHaveBeenCalled();
  });
  it.each([0, null])('fails closed when acquisition returns %s', async (acquired) => {
    const connection = { query: vi.fn().mockResolvedValue([[{ acquired }]]), destroy: vi.fn() };
    await expect(acquireAccountAiLifecycleLock(connection, 'owner')).rejects.toMatchObject({
      code: 'AI_ACCOUNT_LIFECYCLE_BUSY',
    });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });
  it('destroys a session when acquisition outcome is unknown', async () => {
    const connection = { query: vi.fn().mockRejectedValue(new Error('lost response')), destroy: vi.fn() };
    await expect(acquireAccountAiLifecycleLock(connection, 'owner')).rejects.toThrow('lost response');
    expect(connection.destroy).toHaveBeenCalledOnce();
  });
  it.each([0, null, 'error'])('destroys a session on uncertain release (%s)', async (outcome) => {
    const connection = { query: vi.fn().mockResolvedValueOnce([[{ acquired: 1 }]]), destroy: vi.fn() };
    if (outcome === 'error') connection.query.mockRejectedValueOnce(new Error('lost connection'));
    else connection.query.mockResolvedValueOnce([[{ released: outcome }]]);
    const release = await acquireAccountAiLifecycleLock(connection, 'owner');
    await release();
    expect(connection.destroy).toHaveBeenCalledOnce();
  });
});
