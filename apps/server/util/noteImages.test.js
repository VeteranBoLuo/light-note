import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const unlink = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query: poolQuery } }));
vi.mock('node:fs', () => ({ promises: { unlink } }));

const { extractNoteImageUrls, filterOwnedImageUrls, cleanupOrphanNoteImages, collectUsedImageNames } = await import(
  './noteImages.js'
);

describe('extractNoteImageUrls', () => {
  it('从 html 与 markdown 正文提取本站上传图片并去重', () => {
    const html =
      '<p><img src="https://boluo66.top/uploads/note-1-a.png"><img src="https://boluo66.top/uploads/note-1-a.png"></p>';
    const md = '![图](https://boluo66.top/uploads/note-2-b.jpg) 与外链 ![x](https://other.com/c.png)';
    expect(extractNoteImageUrls(html)).toEqual(['https://boluo66.top/uploads/note-1-a.png']);
    expect(extractNoteImageUrls(md)).toEqual(['https://boluo66.top/uploads/note-2-b.jpg']);
  });

  it('外链图片与空内容不产生结果', () => {
    expect(extractNoteImageUrls('<img src="https://cdn.example.com/x.png">')).toEqual([]);
    expect(extractNoteImageUrls('')).toEqual([]);
    expect(extractNoteImageUrls(null)).toEqual([]);
  });
});

describe('filterOwnedImageUrls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('空入参短路,不触碰数据库', async () => {
    expect(await filterOwnedImageUrls({ urls: [], userId: 'u1' })).toEqual([]);
    expect(await filterOwnedImageUrls({ urls: ['x'], userId: '' })).toEqual([]);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('按归属过滤并支持传入事务连接', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ url: 'https://boluo66.top/uploads/a.png' }]]) // note_images 命中 a
        .mockResolvedValueOnce([[{ n: 0 }]]), // b 的模板归属也未命中
    };
    const result = await filterOwnedImageUrls({
      urls: ['https://boluo66.top/uploads/a.png', 'https://boluo66.top/uploads/b.png'],
      userId: 'u1',
      connection,
    });
    expect(result).toEqual(['https://boluo66.top/uploads/a.png']);
    expect(poolQuery).not.toHaveBeenCalled();
    const [, params] = connection.query.mock.calls[0];
    expect(params.at(-1)).toBe('u1');
  });

  it('note_images 无行但自己模板正文引用时,归属仍成立(源笔记已彻底删除场景)', async () => {
    poolQuery
      .mockResolvedValueOnce([[]]) // note_images 无任何行(源笔记已彻底删除)
      .mockResolvedValueOnce([[{ n: 1 }]]); // 自己模板正文包含该 URL
    const result = await filterOwnedImageUrls({
      urls: ['https://boluo66.top/uploads/note-1-a.png'],
      userId: 'u1',
    });
    expect(result).toEqual(['https://boluo66.top/uploads/note-1-a.png']);
    const [tplSql, tplParams] = poolQuery.mock.calls[1];
    expect(tplSql).toMatch(/note_template/);
    expect(tplParams[0]).toBe('u1'); // 只认当前用户自己的模板
  });
});

describe('collectUsedImageNames', () => {
  beforeEach(() => vi.clearAllMocks());

  it('引用集合覆盖书签图标、笔记图片与模板正文(仅模板引用的图片不会被判失效)', async () => {
    poolQuery
      .mockResolvedValueOnce([[{ icon_url: 'https://boluo66.top/uploads/bookmark-1.png?v=2' }]])
      .mockResolvedValueOnce([[{ url: 'https://boluo66.top/uploads/note-2-b.jpg' }]])
      .mockResolvedValueOnce([[{ content: '<img src="https://boluo66.top/uploads/note-3-only-tpl.png">' }]]);
    const names = await collectUsedImageNames();
    expect(names.has('bookmark-1')).toBe(true); // 查询串裁剪
    expect(names.has('note-2-b')).toBe(true);
    expect(names.has('note-3-only-tpl')).toBe(true); // 仅被模板引用也算已使用
    expect(names.has('unrelated')).toBe(false);
  });
});

describe('cleanupOrphanNoteImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unlink.mockResolvedValue();
  });

  it('URL 仍被其他笔记引用时不删物理文件', async () => {
    poolQuery.mockResolvedValueOnce([[{ n: 2 }]]); // note_images 残留引用
    await cleanupOrphanNoteImages(['https://boluo66.top/uploads/note-1-a.png']);
    expect(unlink).not.toHaveBeenCalled();
    expect(poolQuery).toHaveBeenCalledTimes(1); // 笔记引用命中即短路,不再查模板
  });

  it('URL 仍被模板正文引用时不删物理文件', async () => {
    poolQuery.mockResolvedValueOnce([[{ n: 0 }]]).mockResolvedValueOnce([[{ n: 1 }]]);
    await cleanupOrphanNoteImages(['https://boluo66.top/uploads/note-1-a.png']);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('两处均无引用才删除,且 LIKE 通配符已转义', async () => {
    poolQuery.mockResolvedValueOnce([[{ n: 0 }]]).mockResolvedValueOnce([[{ n: 0 }]]);
    await cleanupOrphanNoteImages(['https://boluo66.top/uploads/note-100%_a.png']);
    expect(unlink).toHaveBeenCalledTimes(1);
    const likeParam = poolQuery.mock.calls[1][1][0];
    expect(likeParam).toBe('%note-100\\%\\_a.png%');
  });

  it('重复 URL 去重,单个失败不影响其余', async () => {
    poolQuery
      .mockRejectedValueOnce(new Error('db down')) // 第一个 URL 查询失败被吞
      .mockResolvedValueOnce([[{ n: 0 }]])
      .mockResolvedValueOnce([[{ n: 0 }]]);
    await cleanupOrphanNoteImages([
      'https://boluo66.top/uploads/x.png',
      'https://boluo66.top/uploads/x.png',
      'https://boluo66.top/uploads/y.png',
    ]);
    expect(unlink).toHaveBeenCalledTimes(1); // 仅 y.png 被删
  });
});
