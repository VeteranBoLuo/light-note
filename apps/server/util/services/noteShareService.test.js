import { describe, expect, it, vi } from 'vitest';
import {
  getSharedNotePage,
  listSharedNoteChildren,
  resolveRelativeShareBreadcrumb,
} from './noteShareService.js';

const subtreeTicket = {
  shareId: 'share-1',
  rootNoteId: 'root',
  ownerUserId: 'owner-1',
  scopeType: 'subtree',
};

function breadcrumbRow(...items) {
  return Object.fromEntries(
    items.flatMap((item, index) => [
      [`breadcrumb_${index}_id`, item.id],
      [`breadcrumb_${index}_title`, item.title],
    ]),
  );
}

describe('note share service', () => {
  it('目录分享只暴露从分享根开始的实时父链，单篇分享拒绝后代', () => {
    const ownerBreadcrumb = [
      { id: 'outside', title: '私有上级' },
      { id: 'root', title: '分享根' },
      { id: 'child', title: '公开子页' },
    ];
    expect(resolveRelativeShareBreadcrumb(subtreeTicket, ownerBreadcrumb)).toEqual(ownerBreadcrumb.slice(1));
    expect(() =>
      resolveRelativeShareBreadcrumb({ ...subtreeTicket, scopeType: 'single' }, ownerBreadcrumb),
    ).toThrowError(expect.objectContaining({ code: 'NOTE_SHARE_PAGE_OUT_OF_SCOPE', status: 404 }));
    expect(() =>
      resolveRelativeShareBreadcrumb(subtreeTicket, [
        { id: 'outside', title: '私有目录' },
        { id: 'moved-out', title: '已移出页面' },
      ]),
    ).toThrowError(expect.objectContaining({ code: 'NOTE_SHARE_PAGE_OUT_OF_SCOPE', status: 404 }));
  });

  it('读取页面时先按 owner 父链校验范围，再读取同 owner 正文', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [breadcrumbRow({ id: 'child', title: '子页' }, { id: 'root', title: '分享根' })],
        ])
        .mockResolvedValueOnce([
          [{ id: 'child', parent_id: 'root', title: '子页', content: '# 正文', type: 'markdown', revision: 2 }],
        ]),
    };

    await expect(getSharedNotePage({ db, ticket: subtreeTicket, noteId: 'child' })).resolves.toMatchObject({
      page: { id: 'child', content: '# 正文' },
      breadcrumb: [
        { id: 'root', title: '分享根' },
        { id: 'child', title: '子页' },
      ],
    });
    expect(db.query.mock.calls[1]).toEqual([expect.stringContaining('create_by = ?'), ['child', 'owner-1']]);
  });

  it('目录树只查询当前分享 owner 的直接未删除子页面；单篇分享不查询子节点', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[breadcrumbRow({ id: 'root', title: '分享根' })]])
        .mockResolvedValueOnce([
          [
            {
              id: 'child',
              parent_id: 'root',
              title: '子页',
              type: 'html',
              revision: 1,
              child_count: 2,
            },
          ],
        ]),
    };

    await expect(listSharedNoteChildren({ db, ticket: subtreeTicket, parentId: 'root' })).resolves.toEqual([
      expect.objectContaining({ id: 'child', parentId: 'root', childCount: 2, hasChildren: true }),
    ]);
    expect(db.query.mock.calls[1]).toEqual([expect.stringContaining('child.del_flag = 0'), ['root', 'owner-1']]);

    const singleDb = { query: vi.fn().mockResolvedValueOnce([[breadcrumbRow({ id: 'root', title: '分享根' })]]) };
    await expect(
      listSharedNoteChildren({ db: singleDb, ticket: { ...subtreeTicket, scopeType: 'single' }, parentId: 'root' }),
    ).resolves.toEqual([]);
    expect(singleDb.query).toHaveBeenCalledTimes(1);
  });
});
