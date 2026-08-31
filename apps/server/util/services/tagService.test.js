import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertData: vi.fn((fields) => ({ id: 'tag-1', ...fields })),
}));

vi.mock('../agent/data.js', () => ({
  insertData: mocks.insertData,
}));

vi.mock('../../db/index.js', () => ({ default: {} }));

const { createTag, normalizeTagDescription } = await import('./tagService.js');

describe('tagService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('创建标签时把说明作为标签元信息写入同一事实源', async () => {
    const connection = {
      query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    await expect(
      createTag({
        userId: 'user-1',
        name: '项目资料',
        description: '  汇集需求、方案和复盘。  ',
        connection,
      }),
    ).resolves.toMatchObject({ id: 'tag-1', name: '项目资料', isNew: true });

    expect(mocks.insertData).toHaveBeenCalledWith({
      name: '项目资料',
      description: '汇集需求、方案和复盘。',
      userId: 'user-1',
    });
  });

  it('拒绝超过数据库与表单契约的标签说明', () => {
    expect(() => normalizeTagDescription('x'.repeat(501))).toThrow('TAG_DESCRIPTION_TOO_LONG');
    expect(normalizeTagDescription('  ')).toBe('');
    expect(normalizeTagDescription(undefined)).toBeUndefined();
  });
});
