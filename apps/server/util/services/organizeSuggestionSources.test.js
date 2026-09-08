import { expect, it, vi } from 'vitest';
import { readSuggestionSources, readSuggestionCandidates } from './organizeSuggestionSources.js';
it('文件只使用当前对象的已有就绪正文，不触发解析任务', async () => {
  const db = {
    query: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT r.*'))
        return [
          [{ id: 1, file_name: 'report.pdf', file_size: 1024, file_type: 'application/pdf', obs_key: 'current' }],
        ];
      if (sql.includes('resource_tag_relations')) return [[]];
      if (sql.includes('ai_document_sources'))
        return [
          [
            { file_id: 1, object_key: 'old', content: '旧内容' },
            { file_id: 1, object_key: 'current', content: '报告正文' },
          ],
        ];
      throw Error(sql);
    }),
  };
  const [item] = await readSuggestionSources(db, 'u', 'file');
  expect(item.source.text).toBe('报告正文');
  expect(item).toMatchObject({ empty: false, evidenceLevel: 'parsed' });
  expect(db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  expect(db.query.mock.calls.find(([sql]) => sql.includes('ai_document_sources'))[0]).toContain("ds.status='ready'");
});
it('没有就绪解析的非零文件保留基础建议，不认定为空文件', async () => {
  const db = {
    query: vi.fn(async (sql) =>
      sql.startsWith('SELECT r.*') ? [[{ id: 1, file_name: 'IMG_20260905.png', file_size: 5000, obs_key: 'x' }]] : [[]],
    ),
  };
  expect((await readSuggestionSources(db, 'u', 'file'))[0]).toMatchObject({
    evidenceLevel: 'metadata',
    empty: false,
    emptyEligible: false,
  });
});
it('笔记分享保护按祖先链识别子树，单页分享不误保护同级笔记', async () => {
  const db = {
    query: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT r.*'))
        return [
          [
            {
              id: 'child',
              parent_id: 'root',
              title: '未命名文档',
              content: '',
              type: 'html',
              update_time: '2020-01-01',
            },
            { id: 'other', parent_id: null, title: '未命名文档', content: '', type: 'html', update_time: '2020-01-01' },
          ],
        ];
      if (sql.startsWith('SELECT id,parent_id'))
        return [
          [
            { id: 'root', parent_id: null },
            { id: 'child', parent_id: 'root' },
            { id: 'other', parent_id: null },
          ],
        ];
      if (sql.includes('FROM note_shares')) return [[{ root_note_id: 'root', scope_type: 'subtree' }]];
      if (sql.includes('resource_tag_relations')) return [[]];
      throw Error(sql);
    }),
  };
  const [child, other] = await readSuggestionSources(db, 'u', 'note');
  expect(child).toMatchObject({ protected: true, emptyEligible: false, guards: { shares: 1 } });
  expect(other).toMatchObject({ protected: false, emptyEligible: true, guards: { shares: 0 } });
});

it('跨域笔记引用与待办关联使用统一排序规则，兼容历史异构表', async () => {
  const db = { query: vi.fn().mockResolvedValue([[]]) };
  await readSuggestionSources(db, 'u', 'note', { recent: true, untagged: true });
  const sql = db.query.mock.calls[0][0];
  for (const column of ['r.id', 'r.create_by', 'nr.source_note_id'])
    expect(sql).toContain(`CONVERT(${column} USING utf8mb4) COLLATE utf8mb4_unicode_ci`);
  expect(sql).not.toContain('tr.user_id=r.create_by');
  expect(sql).not.toContain('nr.target_id=r.id');
});

it.each(['bookmark', 'note', 'file'])('预检 %s 只读 ID 和名称，查询包含归属及软删除边界', async (type) => {
  const db = { query: vi.fn().mockResolvedValue([[{ id: 'a', title: '范围测试' }]]) };
  expect(await readSuggestionCandidates(db, 'u', type, { ids: ['a'] })).toHaveLength(1);
  const [sql, args] = db.query.mock.calls[0];
  expect(sql).toMatch(/^SELECT r.id,r.(name|title|file_name) AS title/);
  expect(sql).toContain('r.del_flag=0');
  expect(args).toEqual(['u', ['a'], 100]);
  expect(sql).not.toMatch(/r\.\*|content|snapshot|ai_document|note_resource_refs/);
});

it('正文存档检查只认可当前网址的非空存档，读取阶段不抓网页', async () => {
  const db = {
    query: vi.fn(async (sql) =>
      sql.startsWith('SELECT r.*')
        ? [
            [
              { id: 'a', url: 'https://a.com' },
              { id: 'b', url: 'https://b.com' },
            ],
          ]
        : sql.includes('FROM bookmark_snapshot')
          ? [
              [
                { bookmark_id: 'a', url: 'https://a.com', content: '正文'.repeat(80) },
                { bookmark_id: 'b', url: 'https://old.com', content: '旧正文'.repeat(80) },
              ],
            ]
          : [[]],
    ),
  };
  const [a, b] = await readSuggestionSources(db, 'u', 'bookmark');
  expect(a.hasArchive).toBe(true);
  expect(b.hasArchive).toBe(false);
  expect(db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});

it('标签预检按 owner 与默认图标筛选，完整快照不读取资料关系', async () => {
  const db = { query: vi.fn().mockResolvedValue([[{ id: 't', name: '阅读', title: '阅读', icon_url: '' }]]) };
  await readSuggestionCandidates(db, 'owner', 'tag', { recent: true, limit: 20 });
  expect(db.query.mock.calls[0][0]).toContain("(r.icon_url IS NULL OR r.icon_url REGEXP '^[[:space:]]*$')");
  expect(db.query.mock.calls[0][1]).toEqual(['owner', 20]);
  db.query.mockClear();
  const snapshots = await readSuggestionSources(db, 'owner', 'tag', { ids: ['t'] });
  expect(db.query).toHaveBeenCalledTimes(1);
  expect(snapshots[0]).toMatchObject({ type: 'tag', id: 't', title: '阅读', iconUrl: '' });
});

it('显式标签范围读取图标存在标记，仍限制归属与回收站且不读取图标内容', async () => {
  const db = {
    query: vi.fn().mockResolvedValue([
      [
        { id: 'a', title: '已有', has_custom_icon: 1 },
        { id: 'b', title: '默认', has_custom_icon: 0 },
      ],
    ]),
  };
  const rows = await readSuggestionCandidates(db, 'u', 'tag', { ids: ['a', 'b'], includeCustomIcons: true });
  expect(rows.map((r) => r.hasCustomIcon)).toEqual([true, false]);
  expect(db.query.mock.calls[0][0]).toContain('AS has_custom_icon');
  expect(db.query.mock.calls[0][0]).toContain('WHERE r.user_id=? AND r.del_flag=0 AND r.id IN (?) ORDER BY');
});
