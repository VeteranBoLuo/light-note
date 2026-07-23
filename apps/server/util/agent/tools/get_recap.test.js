import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db/index.js', () => ({ default: { query: mocks.query } }));

const { default: tool } = await import('./get_recap.js');

describe('get_recap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('一次返回本周、那年今日与尘封收藏，支撑真实的本周回顾', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            type: 'note',
            id: 'note-1',
            title: '本周笔记',
            url: null,
            create_time: '2026-07-23T00:00:00.000Z',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            type: 'bookmark',
            id: 'bookmark-1',
            title: '尘封书签',
            url: 'https://example.com',
            create_time: '2025-01-01T00:00:00.000Z',
          },
        ],
      ]);

    const raw = await tool.execute({}, { userId: 'user-1' });
    const output = tool.transform(raw);

    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(raw.weekly).toHaveLength(1);
    expect(output).toContain('最近 7 天新增内容');
    expect(output).toContain('本周笔记');
    expect(output).toContain('尘封回顾');
    expect(tool.summarize(raw)).toContain('最近7天 1 条');
  });
});
