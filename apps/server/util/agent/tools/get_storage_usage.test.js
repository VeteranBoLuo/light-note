import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const getUserSpaceMb = vi.fn();
vi.mock('../../../db/index.js', () => ({ default: { query } }));
vi.mock('../../growth.js', () => ({ getUserSpaceMb }));

const { default: tool } = await import('./get_storage_usage.js');

describe('get_storage_usage 共享容量', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query
      .mockResolvedValueOnce([[{ fileCount: 2, totalSize: 10 * 1024 * 1024 }]])
      .mockResolvedValueOnce([[{ fileCount: 1, totalSize: 5 * 1024 * 1024 }]])
      .mockResolvedValueOnce([[{ category: 'image', c: 2 }]]);
    getUserSpaceMb.mockResolvedValue(1024);
  });

  it('把正常区与回收站共同计入已用容量并返回剩余空间', async () => {
    const result = await tool.execute({}, { userId: 'u1', userRole: 'user' });

    expect(result.totalSize).toBe(15 * 1024 * 1024);
    expect(result.quotaBytes).toBe(1024 * 1024 * 1024);
    expect(result.remainingSize).toBe(1009 * 1024 * 1024);
    expect(tool.transform(result)).toContain('彻底删除后才会释放容量');
    expect(tool.summarize(result)).toContain('含回收站');
  });
});
