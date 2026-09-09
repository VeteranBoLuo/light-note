import { describe, it, expect } from 'vitest';
import { buildSnapshot, buildRuleSuggestions, inspectNote, normalizeRunInput } from './organizeSuggestionRules.js';
const now = Date.parse('2026-09-05T00:00:00Z');
const note = (extra = {}) =>
  buildSnapshot(
    'note',
    { id: 'n', title: '未命名文档', type: 'html', content: '', update_time: '2026-08-01', ...extra },
    [],
    now,
  );
const findings = (snapshots, checks = ['tags', 'title', 'empty', 'duplicate']) =>
  buildRuleSuggestions(snapshots, checks);
describe('多类型整理规则', () => {
  it.each([
    '<img src="a.png">',
    '<a href="/attachment/1"></a>',
    '<iframe src="video"></iframe>',
    '<p data-resource-id="1"></p>',
    '<p data-attachment-id="1"></p>',
    '<input type="checkbox">',
    '<table><tr><td></td></tr></table>',
    '<custom-embed></custom-embed>',
  ])('媒体或结构内容不判空：%s', (content) => {
    expect(note({ content }).emptyEligible).toBe(false);
  });
  it('空 HTML 和空白是真空，7 天前不能清理', () => {
    expect(note({ content: '<p><br></p>' }).emptyEligible).toBe(true);
    expect(note({ update_time: new Date(now - 7 * 86400000 + 1) }).emptyEligible).toBe(false);
    expect(note({ update_time: new Date(now - 7 * 86400000) }).emptyEligible).toBe(true);
  });
  it.each(['children', 'is_top', 'refs', 'todos', 'shares'])('使用中的笔记不能清理：%s', (guard) => {
    const row = note({ [guard]: 1 });
    expect(row.emptyEligible).toBe(false);
    expect(findings([row])[0].suggestions.find((s) => s.kind === 'empty').action).toBeUndefined();
  });
  it('画布和任务清单不判空，画布不参与重复删除', () => {
    expect(note({ type: 'drawing' })).toMatchObject({ unsupported: true, empty: false, duplicateKey: null });
    expect(note({ type: 'markdown', content: '- [ ] ' }).empty).toBe(false);
  });
  it('重复比较完整正文，保留媒体、链接和任务状态差异', () => {
    const prefix = '<p>' + '正文'.repeat(5000) + '</p>';
    for (const [a, b] of [
      ['<img src="a">', '<img src="b">'],
      ['<a href="a">link</a>', '<a href="b">link</a>'],
      ['<input type="checkbox">', '<input type="checkbox" checked>'],
    ]) {
      expect(note({ content: prefix + a }).duplicateKey).not.toBe(note({ content: prefix + b }).duplicateKey);
    }
    expect(note({ content: prefix }).duplicateKey).toBe(note({ id: 'other', content: prefix }).duplicateKey);
  });
  it('重名但正文不同只建议区分标题，不建议清理', () => {
    const result = findings([
      note({ content: '<p>Vue 组件通信</p>' }),
      note({ id: '2', content: '<p>React hooks</p>' }),
    ]);
    expect(result[0].aiKinds).toEqual(['tags', 'title']);
    expect(result[0].suggestions.find((s) => s.kind === 'duplicate')).toMatchObject({ status: 'info' });
    expect(result[0].suggestions.find((s) => s.kind === 'duplicate').action).toBeUndefined();
  });
  it('普通短标题不被当作默认标题', () => {
    expect(findings([note({ title: 'CSS', content: '样式' })], ['title'])[0].aiKinds).toEqual([]);
  });
  it('纯规则检查不创建 AI 工作，标签和标题共用一个资源证据', () => {
    const resources = [note({ content: 'Vue 组件通信' })];
    expect(findings(resources, ['empty', 'duplicate'])[0].aiKinds).toEqual([]);
    expect(findings(resources)[0].aiKinds).toEqual(['tags', 'title']);
    expect(findings([note()])[0].aiKinds).toEqual([]);
  });
  it('已有标签不覆盖，标签建议可以单独选择', () => {
    const s = note({ content: '正文' });
    s.tags = [{ id: 't', name: '现有' }];
    expect(findings([s], ['tags'])[0]).toMatchObject({ aiKinds: [], suggestions: [{ status: 'not_applicable' }] });
  });
  it('文件缺少解析不等于空文件，同名同大小只有对照提示', () => {
    const make = (id, size) =>
      buildSnapshot('file', { id, file_name: 'IMG_20260905.pdf', file_size: size, file_type: 'application/pdf' });
    expect(make('1', 1024)).toMatchObject({ empty: false, emptyEligible: false, evidenceLevel: 'metadata' });
    expect(make('1', null).empty).toBe(false);
    expect(make('1', 0).emptyEligible).toBe(true);
    const s = findings([make('1', 1024), make('2', 1024)], ['title', 'duplicate'])[0].suggestions;
    expect(s.some((entry) => entry.kind === 'title')).toBe(false);
    expect(s[0]).toMatchObject({ kind: 'duplicate', status: 'info', action: null });
  });
  it('抓取失败的书签不提供空资源清理，重复使用原始 URL', () => {
    const s = buildSnapshot('bookmark', { id: '1', name: 'https://example.com', url: 'https://example.com' });
    expect(findings([s], ['empty'])[0].suggestions).toEqual([]);
    expect(s.duplicateKey).not.toBe(buildSnapshot('bookmark', { id: '2', url: 'https://example.com/' }).duplicateKey);
  });
  it('全部资源不限 20 项，选择去重并严格校验', () => {
    expect(normalizeRunInput({ resourceTypes: ['file'], checks: ['empty'], scope: 'all' }).scope).toBe('all');
    expect(
      normalizeRunInput({
        resourceTypes: ['note'],
        checks: ['title'],
        scope: 'selected',
        items: Array.from({ length: 31 }, (_, i) => ({ type: 'note', id: String(i + 1) })),
      }).items,
    ).toHaveLength(31);
    for (const input of [
      null,
      { resourceTypes: 'note', checks: ['tags'] },
      { resourceTypes: ['note'], checks: ['tags'], scope: 'selected', items: [null] },
    ])
      expect(() => normalizeRunInput(input)).toThrow();
  });
});

it('标题预检只冻结笔记，混合资源的 AI 项目按适用性裁剪', () => {
  expect(
    normalizeRunInput({ resourceTypes: ['bookmark', 'note', 'file'], checks: ['title'], scope: 'all' }),
  ).toMatchObject({ resourceTypes: ['note'], checks: ['title'] });
  expect(() => normalizeRunInput({ resourceTypes: ['file'], checks: ['title'] })).toThrow('没有适用');
  expect(
    normalizeRunInput({
      resourceTypes: ['bookmark', 'note', 'file'],
      checks: ['title'],
      scope: 'selected',
      items: [
        { type: 'file', id: 'f' },
        { type: 'note', id: 'n' },
      ],
    }).items,
  ).toEqual([{ type: 'note', id: 'n' }]);
  const bookmark = buildSnapshot('bookmark', { id: 'b', name: '', description: 'Useful text' });
  expect(findings([bookmark], ['title', 'tags'])[0].aiKinds).not.toContain('title');
  expect(findings([note({ content: 'Useful text' })], ['title'])[0].aiKinds).toEqual(['title']);
});

it.each(['bookmark', 'note'])('显式追加模式让已有标签的 %s 继续分析，旧任务仍跳过', (type) => {
  const snapshot = buildSnapshot(
    type,
    { id: '1', name: 'Vue', title: 'Vue', type: 'html', content: '<p>Vue 组件开发</p>', description: 'Vue 组件开发' },
    [{ id: 't', name: 'Vue' }],
  );
  expect(buildRuleSuggestions([snapshot], ['tags'])[0].aiKinds).toEqual([]);
  expect(buildRuleSuggestions([snapshot], ['tags'], { tagMode: 'append' })[0].aiKinds).toEqual(['tags']);
});
it('追加模式只接受显式范围并在归一化后保留，旧选项不改变幂等形状', () => {
  const input = {
    resourceTypes: ['bookmark'],
    checks: ['tags'],
    scope: 'selected',
    items: [{ type: 'bookmark', id: 'b' }],
  };
  expect(normalizeRunInput({ ...input, tagMode: 'append' }).tagMode).toBe('append');
  expect(normalizeRunInput(input)).not.toHaveProperty('tagMode');
  expect(() => normalizeRunInput({ ...input, scope: 'all', items: [], tagMode: 'append' })).toThrow();
  expect(() => normalizeRunInput({ ...input, tagMode: 'replace' })).toThrow();
});

it('仅正文存档也可创建书签整理，排除笔记与文件且不调用 AI', () => {
  expect(
    normalizeRunInput({ resourceTypes: ['bookmark', 'note', 'file'], checks: ['archive'], scope: 'all' }).resourceTypes,
  ).toEqual(['bookmark']);
  const rows = buildRuleSuggestions(
    [
      buildSnapshot('bookmark', { id: 'b', url: 'https://example.com' }),
      buildSnapshot('bookmark', { id: 'saved', url: 'https://example.org', hasArchive: true }),
    ],
    ['archive'],
  );
  expect(rows[0].suggestions[0]).toMatchObject({ kind: 'archive', status: 'queued' });
  expect(rows[0].aiKinds).toEqual([]);
  expect(rows[1].suggestions[0]).toMatchObject({ status: 'no_suggestion' });
});

it('标签图标是独立免费检查，名称和图标变化进入版本，关系无关', () => {
  const tag = buildSnapshot('tag', { id: 't', name: '学习', icon_url: '' });
  const entries = buildRuleSuggestions([tag], ['tag_icon', 'tags', 'empty']);
  expect(entries[0].aiKinds).toEqual([]);
  expect(entries[0].suggestions.map((s) => s.kind)).toEqual(['tag_icon']);
  expect(buildSnapshot('tag', { id: 't', name: '工作', icon_url: '' }).version).not.toBe(tag.version);
  expect(buildSnapshot('tag', { id: 't', name: '学习', icon_url: 'custom' }).version).not.toBe(tag.version);
  expect(() => normalizeRunInput({ resourceTypes: ['tag'], checks: ['tag_icon'], scope: 'untagged' })).toThrow();
  expect(
    normalizeRunInput({ resourceTypes: ['tag', 'note'], checks: ['tag_icon'], scope: 'all' }).resourceTypes,
  ).toEqual(['tag']);
});
