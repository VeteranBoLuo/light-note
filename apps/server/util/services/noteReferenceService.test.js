import { describe, it, expect, vi } from 'vitest';
import { RESOURCE_REF_TEST_VECTORS } from '@lightnote/shared';
import {
  parseResourceHref,
  extractOwnedResourceRefs,
  validateOwnedResourceRefs,
  syncNoteResourceRefs,
  resolveOwnedResourceRefSummaries,
  normalizeResourceRef,
  normalizeResourceRefList,
  getResourceRefNavigation,
  listOwnedResourceBacklinks,
  deleteNoteResourceRefs,
  deleteNoteResourceRefsForNotes,
} from './noteReferenceService.js';

// 按 SQL 关键词返回不同结果的 fake connection(mysql2 风格 [rows, fields])。
// note_resource_refs 的旧行含 target_name_snapshot(sync 计算 toUpdateSnapshot 需要)。
function fakeConn(handlers = {}) {
  const query = vi.fn((sql) => {
    const s = String(sql);
    if (/FROM note_resource_refs\s+r[\s\S]*INNER JOIN note\s+n/i.test(s))
      return Promise.resolve([handlers.backlinkRows || []]);
    if (/SELECT[\s\S]*FROM note_resource_refs/i.test(s)) return Promise.resolve([handlers.oldRows || []]);
    if (/DELETE FROM note_resource_refs/i.test(s))
      return Promise.resolve([{ affectedRows: handlers.deleteAffected ?? 1 }]);
    if (/INSERT INTO note_resource_refs/i.test(s)) return Promise.resolve([{ affectedRows: 1 }]);
    if (/UPDATE note_resource_refs/i.test(s)) return Promise.resolve([{ affectedRows: 1 }]);
    if (/FROM bookmark/i.test(s)) return Promise.resolve([handlers.bookmarkRows || []]);
    if (/FROM note\s+WHERE/i.test(s)) return Promise.resolve([handlers.noteRows || []]);
    if (/FROM files/i.test(s)) return Promise.resolve([handlers.fileRows || []]);
    return Promise.resolve([[]]);
  });
  return { query };
}

describe('noteReferenceService', () => {
  describe('parseResourceHref(消费 @lightnote/shared 共享向量,前后端同口径)', () => {
    for (const { href, ref } of RESOURCE_REF_TEST_VECTORS) {
      it(`parse: ${href}`, () => {
        expect(parseResourceHref(href)).toEqual(ref);
      });
    }
  });

  describe('extractOwnedResourceRefs · HTML 走 cheerio 只取 a[href]', () => {
    it('三类型 + 去重 + 外链/危险协议过滤', () => {
      const content =
        '<a href="/noteLibrary/n1">a</a><a href="/noteLibrary/n1">dup</a>' +
        '<a href="/manage/editBookmark/b1">b</a>' +
        '<a href="https://x.com/noteLibrary/z">ext</a>' +
        '<a href="javascript:alert(1)">js</a>';
      expect(extractOwnedResourceRefs({ content, type: 'html' })).toEqual([
        { type: 'note', id: 'n1' },
        { type: 'bookmark', id: 'b1' },
      ]);
    });
    it('data-href 不被误判为链接(只有真实 a[href] 才算)', () => {
      const content = '<span data-href="/noteLibrary/fake">x</span><a href="/noteLibrary/real">r</a>';
      expect(extractOwnedResourceRefs({ content, type: 'html' })).toEqual([{ type: 'note', id: 'real' }]);
    });
    it('a 上的 data-mce-href 不产生额外/错误关系', () => {
      const content = '<a href="/noteLibrary/n1" data-mce-href="/noteLibrary/n1">x</a>';
      expect(extractOwnedResourceRefs({ content, type: 'html' })).toEqual([{ type: 'note', id: 'n1' }]);
    });
    it('script/style 文本中的 href= 不被误判', () => {
      const content = '<script>var s = "href=\\"/noteLibrary/fake\\""</script><a href="/manage/editBookmark/b1">b</a>';
      expect(extractOwnedResourceRefs({ content, type: 'html' })).toEqual([{ type: 'bookmark', id: 'b1' }]);
    });
  });

  describe('extractOwnedResourceRefs · Markdown 走 marked 结构化 token', () => {
    it('标准链接(md 归一)', () => {
      const content = '看 [笔记](/noteLibrary/n2) 和 [文件](/cloudSpace?fileId=f2) 与 [外链](https://a.com)';
      expect(extractOwnedResourceRefs({ content, type: 'md' })).toEqual([
        { type: 'note', id: 'n2' },
        { type: 'file', id: 'f2' },
      ]);
    });
    it('fenced code 中的链接不产生关系', () => {
      const content = '```\n[x](/noteLibrary/fake)\n```\n\n[real](/noteLibrary/real)';
      expect(extractOwnedResourceRefs({ content, type: 'markdown' })).toEqual([{ type: 'note', id: 'real' }]);
    });
    it('inline code 中的链接不产生关系', () => {
      const content = '`[x](/noteLibrary/fake)` 但 [real](/manage/editBookmark/b9) 是真的';
      expect(extractOwnedResourceRefs({ content, type: 'markdown' })).toEqual([{ type: 'bookmark', id: 'b9' }]);
    });
    it('原生 HTML anchor 是编辑器会渲染的真实链接，也应产生关系', () => {
      const content =
        '<span data-href="/noteLibrary/fake">伪链接</span> ' +
        '<a href="/noteLibrary/html-note">笔记</a> ' +
        '<a href="/cloudSpace?fileId=html-file">文件</a>';
      expect(extractOwnedResourceRefs({ content, type: 'markdown' })).toEqual([
        { type: 'note', id: 'html-note' },
        { type: 'file', id: 'html-file' },
      ]);
    });
    it('fenced / inline code 中的原生 HTML anchor 不产生关系', () => {
      const content =
        '```html\n<a href="/noteLibrary/fenced-fake">代码</a>\n```\n\n' +
        '`<a href="/noteLibrary/inline-fake">代码</a>`\n\n' +
        '<a href="/noteLibrary/real-html">真实链接</a>';
      expect(extractOwnedResourceRefs({ content, type: 'markdown' })).toEqual([{ type: 'note', id: 'real-html' }]);
    });
  });

  describe('extractOwnedResourceRefs · 边界', () => {
    it('空/无链接返回空', () => {
      expect(extractOwnedResourceRefs({ content: '', type: 'html' })).toEqual([]);
      expect(extractOwnedResourceRefs({ content: '纯文本无链接', type: 'markdown' })).toEqual([]);
    });
    it('超长正文(超过写入上限)抛错,交调用方回滚——绝不截断后同步', () => {
      const content = '<a href="/noteLibrary/n1">x</a>' + 'a'.repeat(1_000_001);
      expect(() => extractOwnedResourceRefs({ content, type: 'html' })).toThrow(/CONTENT_TOO_LONG/);
    });
    it('上限内的链接(即使靠后)仍被完整识别', () => {
      const content = 'a'.repeat(900_000) + '<a href="/noteLibrary/deep">x</a>';
      expect(extractOwnedResourceRefs({ content, type: 'html' })).toEqual([{ type: 'note', id: 'deep' }]);
    });
  });

  describe('validateOwnedResourceRefs(归属+del_flag)', () => {
    it('只返回校验通过的,越权/不存在被过滤', async () => {
      const conn = fakeConn({ bookmarkRows: [{ id: 'b1', name: 'BM', url: 'https://example.com' }], noteRows: [] });
      const valid = await validateOwnedResourceRefs(conn, {
        userId: 'u1',
        refs: [
          { type: 'bookmark', id: 'b1' },
          { type: 'note', id: 'n404' },
        ],
      });
      expect(valid).toEqual([{ type: 'bookmark', id: 'b1', name: 'BM', url: 'https://example.com' }]);
    });
    it('空 refs 不查库', async () => {
      const conn = fakeConn();
      expect(await validateOwnedResourceRefs(conn, { userId: 'u1', refs: [] })).toEqual([]);
      expect(conn.query).not.toHaveBeenCalled();
    });
  });

  describe('N1 请求 ref 归一与显式导航语义', () => {
    it('只接受 shared canonical 规则允许的 type/id，并去重保序', () => {
      expect(normalizeResourceRef({ type: 'file', id: 'folder/escape' })).toBeNull();
      expect(
        normalizeResourceRefList([
          { type: 'note', id: 'n1' },
          { type: 'note', id: 'n1' },
          { type: 'bookmark', id: 'b1' },
        ]),
      ).toEqual({
        refs: [
          { type: 'note', id: 'n1' },
          { type: 'bookmark', id: 'b1' },
        ],
        invalid: false,
        tooMany: false,
      });
    });

    it('无效项与超限不被悄悄当作不可用资源', () => {
      expect(normalizeResourceRefList([{ type: 'note', id: '' }]).invalid).toBe(true);
      expect(
        normalizeResourceRefList(Array.from({ length: 101 }, (_, index) => ({ type: 'note', id: `n-${index}` })))
          .tooMany,
      ).toBe(true);
    });

    it('三类资源返回前端统一导航可消费的 target', () => {
      expect(getResourceRefNavigation({ type: 'note', id: 'n1' })).toEqual({ target: 'note-detail' });
      expect(getResourceRefNavigation({ type: 'bookmark', id: 'b1' })).toEqual({ target: 'bookmark-url' });
      expect(getResourceRefNavigation({ type: 'file', id: 'f1' })).toEqual({ target: 'cloud-file', fileId: 'f1' });
    });
  });

  describe('syncNoteResourceRefs(toInsert / toUpdateSnapshot / toDelete)', () => {
    it('新增有效引用 → insert;已有同名不更新', async () => {
      const conn = fakeConn({
        oldRows: [{ target_type: 'note', target_id: 'old1', target_name_snapshot: '旧名' }],
        noteRows: [{ id: 'old1', name: '旧名' }],
        bookmarkRows: [{ id: 'new1', name: 'NB' }],
      });
      const res = await syncNoteResourceRefs(conn, {
        userId: 'u1',
        noteId: 'note-x',
        refs: [
          { type: 'note', id: 'old1' },
          { type: 'bookmark', id: 'new1' },
        ],
      });
      expect(res).toEqual({ inserted: 1, updated: 0, deleted: 0 });
    });
    it('正文移除链接 → delete', async () => {
      const conn = fakeConn({ oldRows: [{ target_type: 'note', target_id: 'gone', target_name_snapshot: 'x' }] });
      const res = await syncNoteResourceRefs(conn, { userId: 'u1', noteId: 'note-x', refs: [] });
      expect(res).toEqual({ inserted: 0, updated: 0, deleted: 1 });
    });
    it('仍保留的可用目标改名 → 只更新快照,不删再插', async () => {
      const conn = fakeConn({
        oldRows: [{ target_type: 'note', target_id: 'n1', target_name_snapshot: '旧标题' }],
        noteRows: [{ id: 'n1', name: '新标题' }],
      });
      const res = await syncNoteResourceRefs(conn, {
        userId: 'u1',
        noteId: 'note-x',
        refs: [{ type: 'note', id: 'n1' }],
      });
      expect(res).toEqual({ inserted: 0, updated: 1, deleted: 0 });
      const upd = conn.query.mock.calls.find(([sql]) => /UPDATE note_resource_refs/.test(String(sql)));
      expect(upd[1]).toEqual(['新标题', 'note-x', 'note', 'n1']);
      expect(conn.query.mock.calls.some(([sql]) => /DELETE FROM note_resource_refs/.test(String(sql)))).toBe(false);
    });
    it('目标软删但正文仍引用 → 保留旧关系与旧快照(不删/不插/不更新)', async () => {
      const conn = fakeConn({
        oldRows: [{ target_type: 'note', target_id: 'soft', target_name_snapshot: '旧名' }],
        noteRows: [], // 软删 → del_flag=1,查不到
      });
      const res = await syncNoteResourceRefs(conn, {
        userId: 'u1',
        noteId: 'note-x',
        refs: [{ type: 'note', id: 'soft' }],
      });
      expect(res).toEqual({ inserted: 0, updated: 0, deleted: 0 });
      expect(
        conn.query.mock.calls.some(([sql]) => /(DELETE FROM|INSERT INTO|UPDATE) note_resource_refs/.test(String(sql))),
      ).toBe(false);
    });
    it('目标恢复后再保存 → 重新可用并更新快照', async () => {
      const conn = fakeConn({
        oldRows: [{ target_type: 'note', target_id: 'rec', target_name_snapshot: '软删时旧名' }],
        noteRows: [{ id: 'rec', name: '恢复后名称' }], // del_flag=0 恢复
      });
      const res = await syncNoteResourceRefs(conn, {
        userId: 'u1',
        noteId: 'note-x',
        refs: [{ type: 'note', id: 'rec' }],
      });
      expect(res).toEqual({ inserted: 0, updated: 1, deleted: 0 });
    });
    it('越权/不存在的新引用不写关系', async () => {
      const conn = fakeConn({ oldRows: [], noteRows: [] });
      const res = await syncNoteResourceRefs(conn, {
        userId: 'u1',
        noteId: 'note-x',
        refs: [{ type: 'note', id: 'n404' }],
      });
      expect(res).toEqual({ inserted: 0, updated: 0, deleted: 0 });
    });
    it('缺 userId/noteId 直接空结果,不查库', async () => {
      const conn = fakeConn();
      expect(await syncNoteResourceRefs(conn, { userId: '', noteId: 'x', refs: [] })).toEqual({
        inserted: 0,
        updated: 0,
        deleted: 0,
      });
      expect(conn.query).not.toHaveBeenCalled();
    });
    it('连续保存按每次正文的最终集合收敛，不残留上一次关系', async () => {
      const stored = [];
      const conn = {
        query: vi.fn(async (sql, params = []) => {
          const statement = String(sql);
          if (/SELECT[\s\S]*FROM note_resource_refs/i.test(statement)) return [stored.map((row) => ({ ...row }))];
          if (/FROM note\s+WHERE/i.test(statement)) return [[{ id: 'n1', name: '笔记 N1' }]];
          if (/FROM bookmark/i.test(statement)) return [[{ id: 'b1', name: '书签 B1' }]];
          if (/DELETE FROM note_resource_refs/i.test(statement)) {
            const [, type, id] = params;
            const index = stored.findIndex((row) => row.target_type === type && row.target_id === id);
            if (index >= 0) stored.splice(index, 1);
            return [{ affectedRows: index >= 0 ? 1 : 0 }];
          }
          if (/INSERT INTO note_resource_refs/i.test(statement)) {
            const [, , type, id, name] = params;
            stored.push({ target_type: type, target_id: id, target_name_snapshot: name });
            return [{ affectedRows: 1 }];
          }
          return [{ affectedRows: 1 }];
        }),
      };

      await expect(
        syncNoteResourceRefs(conn, { userId: 'u1', noteId: 'source-1', refs: [{ type: 'note', id: 'n1' }] }),
      ).resolves.toEqual({
        inserted: 1,
        updated: 0,
        deleted: 0,
      });
      await expect(
        syncNoteResourceRefs(conn, { userId: 'u1', noteId: 'source-1', refs: [{ type: 'bookmark', id: 'b1' }] }),
      ).resolves.toEqual({
        inserted: 1,
        updated: 0,
        deleted: 1,
      });
      expect(stored).toEqual([{ target_type: 'bookmark', target_id: 'b1', target_name_snapshot: '书签 B1' }]);
    });
  });

  describe('resolveOwnedResourceRefSummaries', () => {
    it('保序映射 available/title', async () => {
      const conn = fakeConn({ noteRows: [{ id: 'n1', name: '标题1' }] });
      const out = await resolveOwnedResourceRefSummaries(conn, {
        userId: 'u1',
        refs: [
          { type: 'note', id: 'n1' },
          { type: 'note', id: 'n404' },
        ],
      });
      expect(out).toEqual([
        { type: 'note', id: 'n1', title: '标题1', available: true },
        { type: 'note', id: 'n404', title: null, available: false },
      ]);
    });

    it('书签只在归属校验通过后携带原网址', async () => {
      const conn = fakeConn({ bookmarkRows: [{ id: 'b1', name: '书签', url: 'https://example.com/path' }] });
      await expect(
        resolveOwnedResourceRefSummaries(conn, { userId: 'u1', refs: [{ type: 'bookmark', id: 'b1' }] }),
      ).resolves.toEqual([
        { type: 'bookmark', id: 'b1', title: '书签', url: 'https://example.com/path', available: true },
      ]);
    });
  });

  describe('listOwnedResourceBacklinks(N2)', () => {
    it('目标与源笔记都属于当前主体时，只回传标题、更新时间和内部 id', async () => {
      const conn = fakeConn({
        bookmarkRows: [{ id: 'b1', name: '目标书签' }],
        backlinkRows: [
          { id: 'source-1', title: '引用笔记一', update_time: '2026-07-23 09:00:00' },
          { id: 'source-2', title: '引用笔记二', update_time: '2026-07-22 09:00:00' },
        ],
      });
      const out = await listOwnedResourceBacklinks(conn, {
        userId: 'u1',
        targetType: 'bookmark',
        targetId: 'b1',
        limit: 1,
      });
      expect(out).toEqual({
        available: true,
        items: [{ id: 'source-1', title: '引用笔记一', updateTime: '2026-07-23 09:00:00' }],
        hasMore: true,
      });
      const query = conn.query.mock.calls.find(([sql]) =>
        /FROM note_resource_refs\s+r[\s\S]*INNER JOIN note\s+n/i.test(String(sql)),
      );
      expect(query[1]).toEqual(['u1', 'u1', 'bookmark', 'b1', 2]);
      expect(String(query[0])).not.toMatch(/\bcontent\b/i);
    });

    it('目标已删除、越权或不存在时统一空结果，且不查询源反链', async () => {
      const conn = fakeConn({ bookmarkRows: [] });
      await expect(
        listOwnedResourceBacklinks(conn, { userId: 'u1', targetType: 'bookmark', targetId: 'missing', limit: 5 }),
      ).resolves.toEqual({ available: false, items: [], hasMore: false });
      expect(
        conn.query.mock.calls.some(([sql]) =>
          /FROM note_resource_refs\s+r[\s\S]*INNER JOIN note\s+n/i.test(String(sql)),
        ),
      ).toBe(false);
    });
  });

  describe('deleteNoteResourceRefs / deleteNoteResourceRefsForNotes', () => {
    it('删除源笔记全部关系', async () => {
      const conn = fakeConn({ deleteAffected: 3 });
      expect(await deleteNoteResourceRefs(conn, { userId: 'u1', noteId: 'note-x' })).toEqual({ deleted: 3 });
    });
    it('批量删除,去重并过滤空值,只发一条 IN 删除', async () => {
      const conn = fakeConn({ deleteAffected: 5 });
      const res = await deleteNoteResourceRefsForNotes(conn, ['n1', 'n2', 'n1', '', null]);
      expect(res).toEqual({ deleted: 5 });
      const del = conn.query.mock.calls.find(([sql]) => /DELETE FROM note_resource_refs/.test(String(sql)));
      expect(del[1]).toEqual(['n1', 'n2']);
    });
    it('空 noteIds 不查库', async () => {
      const conn = fakeConn();
      expect(await deleteNoteResourceRefsForNotes(conn, [])).toEqual({ deleted: 0 });
      expect(conn.query).not.toHaveBeenCalled();
    });
  });
});
