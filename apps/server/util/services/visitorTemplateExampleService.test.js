import { describe, it, expect, vi } from 'vitest';
import { load } from 'cheerio';
import { templateNoteBodies } from '../../scripts/visitorExamples/templateNotes.mjs';
import { visitorNotes } from '../../scripts/visitorExamples/notes.mjs';
import { planVisitorTemplateExamples, applyVisitorTemplateExamples } from './visitorTemplateExampleService.js';
import { applyOwnedNoteContentChange } from './noteService.js';
import { sanitizePersistedNoteContent } from '../noteHtmlSanitizer.js';
vi.mock('./noteService.js', () => ({ applyOwnedNoteContentChange: vi.fn() }));

const fixture = () =>
  visitorNotes
    .filter((n) => ['daily', 'weekly', 'meeting'].includes(n.key))
    .map((n) => ({
      id: n.key,
      title: n.title,
      type: n.type,
      revision: 3,
      del_flag: 0,
      content:
        n.body +
        (n.type === 'html'
          ? '<h2>相关资料与项目</h2><ul><li><a href="/noteLibrary/related">参考笔记</a></li><li><a href="/toolbox/research_workspace?workspace=project&entry=workshop">项目</a></li></ul>'
          : '\n\n## 相关资料与项目\n\n- [参考笔记](/noteLibrary/related)\n- [项目](/toolbox/research_workspace?workspace=project&entry=workshop)\n'),
    }));
const nextRows = (plan) => plan.map((n) => ({ id: n.id, title: n.title, ...n.after, revision: n.before.revision + 1 }));

describe('legacy visitor template format repair', () => {
  it('repairs the frozen legacy samples without altering unrelated content', () => {
    const plan = planVisitorTemplateExamples(fixture());
    for (const item of plan) {
      const template = templateNoteBodies[item.template];
      const $ = load(item.after.content),
        original = load(template);
      expect(item.after.type).toBe('html');
      const headings = (doc) =>
        doc('.note-template-card > h2, .note-template-callout > h2')
          .map((_, n) => doc(n).text())
          .get();
      expect(headings($)).toEqual(headings(original));
      for (const selector of ['.note-template-grid', '.note-template-card', '.note-template-callout'])
        expect($(selector).length).toBe(original(selector).length);
      expect(
        $('th')
          .map((_, n) => $(n).text())
          .get(),
      ).toEqual(
        original('th')
          .map((_, n) => original(n).text())
          .get(),
      );
      expect(item.after.content).not.toContain('{{');
      expect(sanitizePersistedNoteContent(item.after.content, 'html')).toBe(item.after.content);
      expect(
        $('a')
          .map((_, n) => $(n).attr('href'))
          .get(),
      ).toEqual(['/noteLibrary/related', '/toolbox/research_workspace?workspace=project&entry=workshop']);
    }
    expect(planVisitorTemplateExamples(nextRows(plan)).every((n) => !n.changed)).toBe(true);
    expect(visitorNotes.find((n) => n.key === 'markdown').type).toBe('markdown');
    expect(visitorNotes.find((n) => n.key === 'mindmap').type).toBe('markdown');
  });
  it.each(['prose', 'append', 'link', 'missing', 'duplicate'])('refuses unsafe %s changes before any write', (kind) => {
    const rows = fixture();
    if (kind === 'prose') rows[0].content = rows[0].content.replace('三段模拟访谈', '人工修改');
    if (kind === 'append') rows[0].content += '\n人工补充内容';
    if (kind === 'link') rows[0].content = rows[0].content.replace('/noteLibrary/related', 'https://example.com');
    if (kind === 'missing') rows.pop();
    if (kind === 'duplicate') rows.push(rows[0]);
    expect(() => planVisitorTemplateExamples(rows)).toThrow(/VISITOR_SAMPLE_/);
  });
  it('rechecks visitor ownership and the complete plan before reusing transactional note writes', async () => {
    const rows = fixture(),
      expected = planVisitorTemplateExamples(rows);
    const connection = {
      query: vi.fn(async (sql) => (sql.includes('FROM user') ? [[{ id: 'v', role: 'visitor', del_flag: 0 }]] : [rows])),
    };
    applyOwnedNoteContentChange.mockClear();
    expect(await applyVisitorTemplateExamples(connection, 'v', expected)).toBe(3);
    expect(applyOwnedNoteContentChange).toHaveBeenCalledTimes(3);
    expect(applyOwnedNoteContentChange).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ snapshotReason: 'visitor_template_fix', userId: 'v' }),
    );
    rows[0].revision++;
    applyOwnedNoteContentChange.mockClear();
    await expect(applyVisitorTemplateExamples(connection, 'v', expected)).rejects.toThrow('VISITOR_SAMPLE_CONFLICT');
    expect(applyOwnedNoteContentChange).not.toHaveBeenCalled();
    connection.query.mockResolvedValueOnce([[{ id: 'v', role: 'user', del_flag: 0 }]]);
    await expect(applyVisitorTemplateExamples(connection, 'v', expected)).rejects.toThrow('VISITOR_OWNER_INVALID');
  });
});
