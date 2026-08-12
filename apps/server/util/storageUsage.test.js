import { describe, expect, it, vi } from 'vitest';
import {
  getAccountedStorageBytes,
  getActiveReplacementBytes,
  getProjectedStorageBytes,
  getStorageUsageBreakdown,
  storageBytesToMb,
} from './storageUsage.js';

describe('云空间共享容量口径', () => {
  it('正常文件和回收站文件共同计入容量', async () => {
    const db = { query: vi.fn().mockResolvedValue([[{ used: 30 * 1024 * 1024 }]]) };

    await expect(getAccountedStorageBytes(db, 'u1')).resolves.toBe(30 * 1024 * 1024);
    expect(db.query.mock.calls[0][0]).toContain('del_flag IN (0, 1)');
    expect(db.query.mock.calls[0][1]).toEqual(['u1']);
  });

  it('返回正常区、回收站和共享总量拆分', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue([
          [{ activeBytes: 10 * 1024 * 1024, trashBytes: 5 * 1024 * 1024, totalBytes: 15 * 1024 * 1024 }],
        ]),
    };

    await expect(getStorageUsageBreakdown(db, 'u1')).resolves.toEqual({
      activeBytes: 10 * 1024 * 1024,
      trashBytes: 5 * 1024 * 1024,
      totalBytes: 15 * 1024 * 1024,
    });
  });

  it('同名覆盖只计算新旧文件差额', async () => {
    const db = { query: vi.fn().mockResolvedValue([[{ used: 8 * 1024 * 1024 }]]) };
    const replacementBytes = await getActiveReplacementBytes(db, 'u1', ['a.png', 'a.png', 'b.png']);
    const projected = getProjectedStorageBytes({
      usedBytes: 100 * 1024 * 1024,
      incomingBytes: 6 * 1024 * 1024,
      replacementBytes,
    });

    expect(projected).toBe(98 * 1024 * 1024);
    expect(db.query.mock.calls[0][1]).toEqual(['u1', 'a.png', 'b.png']);
    expect(storageBytesToMb(projected)).toBe(98);
  });
});
