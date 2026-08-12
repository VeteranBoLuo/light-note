import { describe, expect, it } from 'vitest';
import { getTrashStorageUsagePercent, getTrashStorageWarnLevel } from './useTrash';

describe('回收站共享容量提示', () => {
  it('按账号总容量比例提示，而不是使用固定 MB 阈值', () => {
    const oneGbWarning = getTrashStorageUsagePercent(160 * 1024 * 1024, 1024);
    const oneGbDanger = getTrashStorageUsagePercent(320 * 1024 * 1024, 1024);
    const twentyGbQuiet = getTrashStorageUsagePercent(500 * 1024 * 1024, 20 * 1024);

    expect(getTrashStorageWarnLevel(oneGbWarning)).toBe('warning');
    expect(getTrashStorageWarnLevel(oneGbDanger)).toBe('danger');
    expect(getTrashStorageWarnLevel(twentyGbQuiet)).toBe('');
  });
});
