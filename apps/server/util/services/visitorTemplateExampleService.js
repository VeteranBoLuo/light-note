import { load } from 'cheerio';
import { marked } from 'marked';
import { visitorNotes } from '../../scripts/visitorExamples/notes.mjs';
import { templateNoteBodies } from '../../scripts/visitorExamples/templateNotes.mjs';
import { sanitizePersistedNoteContent } from '../noteHtmlSanitizer.js';
import { applyOwnedNoteContentChange } from './noteService.js';
import { assertVisitorOwner, exampleError, exampleHash } from './visitorExampleScheduleService.js';

// v1/v2 manifests stay immutable so their install receipts and recovery hashes remain valid.
const samples = visitorNotes
  .filter((note) => Object.hasOwn(templateNoteBodies, note.key))
  .map((note) => ({ ...note, type: 'html', body: templateNoteBodies[note.key] }));
const safeHref = (href) =>
  /^\/(?:noteLibrary\/[\w-]+|manage\/editBookmark\/[\w-]+|cloudSpace\?fileId=\d+|toolbox\/research_workspace\?workspace=[\w-]+&entry=workshop)$/.test(
    href,
  );

function relatedHtml(suffix, type) {
  if (!suffix) return '';
  if (type === 'markdown') {
    if (!/^\n\n## 相关资料与项目\n\n(?:- \[[^\]\n]+\]\([^\s)]+\)\n)+\s*$/.test(suffix))
      throw exampleError('VISITOR_SAMPLE_EDITED');
    suffix = marked.parse(suffix, { async: false });
  }
  const $ = load(suffix, null, false);
  const nodes = $.root().children();
  if (
    nodes.length !== 2 ||
    nodes[0].tagName !== 'h2' ||
    $(nodes[0]).text() !== '相关资料与项目' ||
    nodes[1].tagName !== 'ul'
  )
    throw exampleError('VISITOR_SAMPLE_EDITED');
  // Only the generated link list can follow the known prose. Refuse appended manual content.
  for (const node of $.root().contents().toArray())
    if (node.type === 'text' && node.data.trim()) throw exampleError('VISITOR_SAMPLE_EDITED');
  const list = $(nodes[1]);
  if (
    !list.children().length ||
    list
      .children()
      .toArray()
      .some((li) => li.tagName !== 'li')
  )
    throw exampleError('VISITOR_SAMPLE_EDITED');
  for (const li of list.children().toArray()) {
    const links = $(li).children();
    if (
      links.length !== 1 ||
      links[0].tagName !== 'a' ||
      links.children().length ||
      !safeHref(links.attr('href') || '')
    )
      throw exampleError('VISITOR_SAMPLE_LINK_INVALID');
    if ($(li).clone().children().remove().end().text().trim()) throw exampleError('VISITOR_SAMPLE_EDITED');
  }
  if (list.clone().children().remove().end().text().trim()) throw exampleError('VISITOR_SAMPLE_EDITED');
  return sanitizePersistedNoteContent($.html(), 'html', 'visitor-template-links');
}

export function planVisitorTemplateExamples(rows) {
  return samples.map((sample) => {
    const matches = rows.filter((row) => row.title === sample.title && Number(row.del_flag || 0) === 0);
    if (matches.length !== 1) throw exampleError('VISITOR_SAMPLE_MISSING_OR_AMBIGUOUS');
    const row = matches[0];
    const body = sanitizePersistedNoteContent(sample.body, 'html', 'visitor-template-example');
    const legacy = visitorNotes.find((note) => note.key === sample.key);
    const previousBody =
      legacy.type === 'html'
        ? sanitizePersistedNoteContent(legacy.body, 'html', 'visitor-template-legacy')
        : legacy.body;
    const installed = row.type === 'html' && row.content.startsWith(body);
    if (!installed && (row.type !== legacy.type || !row.content.startsWith(previousBody)))
      throw exampleError('VISITOR_SAMPLE_EDITED');
    const suffix = row.content.slice((installed ? body : previousBody).length);
    const related = relatedHtml(suffix, installed ? 'html' : legacy.type);
    const content = sanitizePersistedNoteContent(body + related, 'html', 'visitor-template-example');
    const beforeLinks = load(row.type === 'markdown' ? marked.parse(row.content, { async: false }) : row.content)('a')
      .map((_, a) => a.attribs.href)
      .get()
      .sort();
    const afterLinks = load(content)('a')
      .map((_, a) => a.attribs.href)
      .get()
      .sort();
    if (JSON.stringify(beforeLinks) !== JSON.stringify(afterLinks)) throw exampleError('VISITOR_SAMPLE_LINK_CHANGED');
    return {
      id: String(row.id),
      title: row.title,
      template: sample.key,
      before: { title: row.title, type: row.type, content: row.content, revision: Number(row.revision) },
      after: { type: 'html', content },
      changed: row.type !== 'html' || row.content !== content,
    };
  });
}

export async function readVisitorTemplateExamples(db, owner, lock = false) {
  await assertVisitorOwner(db, owner, lock);
  const [rows] = await db.query(
    `SELECT id,title,type,content,revision,del_flag FROM note WHERE create_by=? AND del_flag=0 AND title IN (?,?,?)${lock ? ' FOR UPDATE' : ''}`,
    [owner, ...samples.map((note) => note.title)],
  );
  return planVisitorTemplateExamples(rows);
}

// Caller owns the transaction and saves a protected receipt before committing.
export async function applyVisitorTemplateExamples(connection, owner, expected) {
  const current = await readVisitorTemplateExamples(connection, owner, true);
  if (exampleHash(current) !== exampleHash(expected)) throw exampleError('VISITOR_SAMPLE_CONFLICT');
  for (const item of current.filter((note) => note.changed))
    await applyOwnedNoteContentChange(connection, {
      userId: owner,
      noteId: item.id,
      before: item.before,
      after: item.after,
      snapshotReason: 'visitor_template_fix',
    });
  return current.filter((note) => note.changed).length;
}
