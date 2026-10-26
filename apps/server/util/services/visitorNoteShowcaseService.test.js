import { describe, it, expect, vi } from 'vitest';
import { load } from 'cheerio';
import { Marked } from 'marked';
import { noteMathMarkedExtension, readNoteMath } from '@lightnote/shared/note-math';
import { BUILTIN_NOTE_BODIES } from '@lightnote/shared/note-templates';
import { visitorNotes } from '../../scripts/visitorExamples/notes.mjs';
import { buildNoteBodies } from '../../scripts/visitorExamples/manifestV2.mjs';
import { SHOWCASE_TITLES } from '../../scripts/visitorExamples/showcaseNotes.mjs';
import {
  buildVisitorShowcasePlan,
  validateVisitorShowcasePlan,
  applyVisitorShowcasePlan,
} from './visitorNoteShowcaseService.js';
import { applyOwnedNoteContentChange } from './noteService.js';
import { sanitizePersistedNoteContent } from '../noteHtmlSanitizer.js';
import { exampleHash } from './visitorExampleScheduleService.js';
vi.mock('./noteService.js', () => ({ applyOwnedNoteContentChange: vi.fn() }));

const urls = Object.fromEntries(
  ['welcome', 'weekend', 'inspiration'].map((key) => [key, `https://boluo66.top/uploads/note-visitor-test-${key}.png`]),
);
function fixture() {
  const old = buildNoteBodies(urls);
  return [
    ...visitorNotes.map((n, i) => ({ id: `note-${i}`, title: n.title, type: n.type, content: n.body, revision: 3 })),
    { id: 'weekend', title: '周末散步：把生活留在一页里', type: 'html', revision: 2 },
    { id: 'inspiration', title: '一张灵感板的配色观察', type: 'html', revision: 2 },
    { id: 'drawing', title: '手绘笔记示例', type: 'drawing', content: '{"elements":[]}', revision: 3 },
  ].map((n) => {
    const content = old[n.title]
      ? {
          type: 'html',
          content: old[n.title].replaceAll(/\{\{ref:note:\w+\}\}/g, '<a href="/noteLibrary/original">原有入口</a>'),
        }
      : { type: n.type, content: n.content };
    if (content.type === 'html') content.content = sanitizePersistedNoteContent(content.content, 'html');
    return {
      ...n,
      ...content,
      content:
        content.content +
        (content.type === 'html'
          ? '<h2>相关资料与项目</h2><ul><li><a href="/cloudSpace?fileId=7">原文件</a></li><li><a href="/toolbox/research_workspace?workspace=project&entry=workshop">原项目</a></li></ul>'
          : '\n\n## 相关资料与项目\n\n- [原文件](/cloudSpace?fileId=7)\n- [原项目](/toolbox/research_workspace?workspace=project&entry=workshop)\n'),
    };
  });
}
const parser = new Marked(noteMathMarkedExtension());
const render = (n) => (n.type === 'html' ? n.content : parser.parse(n.content, { async: false }));
const hrefs = (n) =>
  load(render(n))('a[href]')
    .map((_, a) => a.attribs.href)
    .get();
const resign = (plan) => {
  const { hash, ...body } = plan;
  return { ...body, hash: exampleHash(body) };
};

describe('visitor note showcase', () => {
  it('updates exactly the intended notes, keeps original links/images and stores only formula source', () => {
    const rows = fixture(),
      plan = buildVisitorShowcasePlan('visitor', rows);
    expect(validateVisitorShowcasePlan(plan)).toBe(plan);
    expect(plan.changes.map((n) => n.title)).toEqual(SHOWCASE_TITLES);
    expect(plan.changes.some((n) => ['手绘笔记示例'].includes(n.title))).toBe(false);
    for (const item of plan.changes) {
      expect(hrefs(item.after)).toEqual(expect.arrayContaining(hrefs(item.before)));
      expect(item.after.content).not.toMatch(/<script|<svg|class="katex|data-mermaid-source|\{\{ref:/);
      expect(sanitizePersistedNoteContent(item.after.content, item.after.type)).toBe(item.after.content);
    }
    const rich = plan.changes.find((n) => n.title === '富文本样式示例').after;
    const $ = load(rich.content);
    expect($('input[type=checkbox]').length).toBe(3);
    expect($('input[checked]').length).toBe(1);
    expect($('pre.language-javascript').text()).toContain('console.log(record.nextStep)');
    const math = $('[data-ln-math="block"]');
    expect(readNoteMath(math.attr('data-ln-math'), math.attr('data-ln-latex')).source).toBe(
      String.raw`r = \frac{3}{4} = 75\%`,
    );
    expect($('.ln-media-text').length).toBe(1);
    const quick = plan.changes.find((n) => n.title === 'Markdown 语法速查表').after;
    expect(quick.type).toBe('markdown');
    expect(render(quick)).toContain('<code>nextStep</code>');
    expect(load(render(quick))('input[type=checkbox]').length).toBe(3);
    const diagrams = plan.changes.find((n) => n.title === '思维导图示例').after;
    expect(load(render(diagrams))('code.language-mermaid').length).toBe(4);
  });
  it('keeps report examples on the same shared layouts as their built-in templates', () => {
    const plan = buildVisitorShowcasePlan('visitor', fixture());
    for (const [key, title] of [
      ['daily', '日报示例'],
      ['weekly', '周报示例'],
      ['meeting', '会议纪要示例'],
    ]) {
      const note = plan.changes.find((item) => item.title === title).after;
      const $ = load(note.content),
        source = load(BUILTIN_NOTE_BODIES[key].exampleContent['zh-CN']);
      const headings = (doc) =>
        doc('.ln-note-layout h2')
          .map((_, node) => doc(node).text())
          .get();
      expect(note.type).toBe('html');
      expect(headings($)).toEqual(headings(source));
      expect($('table').length).toBe(source('table').length);
      expect($('input[type=checkbox]').length).toBe(source('input[type=checkbox]').length);
    }
  });
  it('is stable when planning from already optimized content', () => {
    const rows = fixture(),
      first = buildVisitorShowcasePlan('visitor', rows);
    for (const item of first.changes)
      Object.assign(
        rows.find((n) => n.id === item.id),
        item.after,
        { revision: item.before.revision + 1 },
      );
    const second = buildVisitorShowcasePlan('visitor', rows);
    expect(second.changes.every((n) => n.before.content === n.after.content && n.before.type === n.after.type)).toBe(
      true,
    );
  });
  it.each(['duplicate', 'missing', 'image'])('fails closed on %s inventory', (kind) => {
    const rows = fixture();
    if (kind === 'duplicate') rows.push({ ...rows[0] });
    if (kind === 'missing') rows.splice(0, 1);
    if (kind === 'image') rows.find((n) => n.title === '一张灵感板的配色观察').content = '<p>image missing</p>';
    expect(() => buildVisitorShowcasePlan('visitor', rows)).toThrow(/VISITOR_SHOWCASE_/);
  });
  it('validates all revisions before writing, reuses note history and skips a repeated apply', async () => {
    const rows = fixture(),
      plan = buildVisitorShowcasePlan('visitor', rows);
    const db = {
      query: vi.fn(async (sql, params) =>
        sql.includes('FROM user')
          ? [[{ id: 'visitor', role: 'visitor', del_flag: 0 }]]
          : [[rows.find((n) => n.id === params[0])]],
      ),
    };
    rows.find((n) => n.title === SHOWCASE_TITLES.at(-1)).revision++;
    applyOwnedNoteContentChange.mockClear();
    await expect(applyVisitorShowcasePlan(db, plan)).rejects.toThrow('VISITOR_SHOWCASE_CONFLICT');
    expect(applyOwnedNoteContentChange).not.toHaveBeenCalled();
    rows.find((n) => n.title === SHOWCASE_TITLES.at(-1)).revision--;
    expect(await applyVisitorShowcasePlan(db, plan)).toHaveLength(17);
    expect(applyOwnedNoteContentChange).toHaveBeenCalledTimes(17);
    expect(applyOwnedNoteContentChange).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ snapshotReason: 'visitor_showcase', userId: 'visitor' }),
    );
    for (const n of plan.changes)
      Object.assign(
        rows.find((r) => r.id === n.id),
        n.after,
        { revision: n.before.revision + 1 },
      );
    applyOwnedNoteContentChange.mockClear();
    expect(await applyVisitorShowcasePlan(db, plan)).toHaveLength(0);
    expect(applyOwnedNoteContentChange).not.toHaveBeenCalled();
    const second = buildVisitorShowcasePlan('visitor', rows);
    expect(await applyVisitorShowcasePlan(db, second)).toHaveLength(0);
  });
  it('rejects modified plans, drawing writes and non-visitor ownership', async () => {
    const plan = buildVisitorShowcasePlan('visitor', fixture());
    const edited = structuredClone(plan);
    edited.changes[0].after.content += 'manual';
    expect(() => validateVisitorShowcasePlan(edited)).toThrow('VISITOR_SHOWCASE_PLAN_CHANGED');
    edited.changes[0].after.type = 'drawing';
    expect(() => validateVisitorShowcasePlan(resign(edited))).toThrow('VISITOR_SHOWCASE_PLAN_INVALID');
    const db = { query: vi.fn().mockResolvedValue([[{ id: 'visitor', role: 'user', del_flag: 0 }]]) };
    await expect(applyVisitorShowcasePlan(db, plan)).rejects.toThrow('VISITOR_OWNER_INVALID');
  });
});
