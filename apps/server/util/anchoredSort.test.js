import { describe, expect, it, vi } from 'vitest';
import { AnchoredSortError, moveOwnedResourceByAnchors } from './anchoredSort.js';

function createConnection(rows) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce([rows])
      .mockImplementation(async () => [{ affectedRows: 1 }]),
  };
}

describe('anchored resource sorting', () => {
  it('moves inside the loaded prefix without renumbering the untouched tail', async () => {
    const connection = createConnection([
      { id: 'a', isTop: 0, sort: 0 },
      { id: 'b', isTop: 0, sort: 1 },
      { id: 'c', isTop: 0, sort: 2 },
      { id: 'unloaded', isTop: 0, sort: 3 },
    ]);

    const result = await moveOwnedResourceByAnchors(connection, {
      resourceType: 'bookmark',
      userId: 'u1',
      id: 'a',
      previousId: 'b',
      nextId: 'c',
    });

    expect(result).toMatchObject({ id: 'a', moved: true, updatedCount: 2 });
    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE bookmark SET sort = ?'), [
      0,
      'b',
      'u1',
    ]);
    expect(connection.query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE bookmark SET sort = ?'), [
      1,
      'a',
      'u1',
    ]);
    expect(connection.query.mock.calls.some(([, params]) => params?.includes('unloaded'))).toBe(false);
  });

  it('reindexes duplicate legacy sort values while preserving the requested order', async () => {
    const connection = createConnection([
      { id: 'a', isTop: 1, sort: 0 },
      { id: 'b', isTop: 1, sort: 0 },
      { id: 'c', isTop: 1, sort: 0 },
      { id: 'normal', isTop: 0, sort: 0 },
    ]);

    await moveOwnedResourceByAnchors(connection, {
      resourceType: 'note',
      userId: 'u1',
      id: 'a',
      previousId: 'b',
      nextId: 'c',
    });

    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE note SET sort = ?'), [
      1,
      'a',
      'u1',
    ]);
    expect(connection.query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE note SET sort = ?'), [
      2,
      'c',
      'u1',
    ]);
  });

  it('rejects stale or cross-group anchors instead of moving to an arbitrary position', async () => {
    const connection = createConnection([
      { id: 'pinned', isTop: 1, sort: 0 },
      { id: 'a', isTop: 0, sort: 0 },
      { id: 'b', isTop: 0, sort: 1 },
    ]);

    await expect(
      moveOwnedResourceByAnchors(connection, {
        resourceType: 'bookmark',
        userId: 'u1',
        id: 'a',
        previousId: 'pinned',
        nextId: 'missing',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_SORT_ANCHOR',
    });
    expect(AnchoredSortError.prototype).toBeInstanceOf(Error);
  });
});
