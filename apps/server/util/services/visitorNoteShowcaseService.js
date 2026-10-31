import { load } from 'cheerio';
import { Marked } from 'marked';
import { noteMathMarkedExtension } from '@lightnote/shared/note-math';
import { buildShowcaseNotes, SHOWCASE_TITLES } from '../../scripts/visitorExamples/showcaseNotes.mjs';
import { sanitizePersistedNoteContent } from '../noteHtmlSanitizer.js';
import { registerAsset } from '../imagePreview/references.js';
import { applyOwnedNoteContentChange } from './noteService.js';
import { assertVisitorOwner, exampleHash, exampleError } from './visitorExampleScheduleService.js';

const VERSION = 'visitor-note-showcase-v2';
const MANAGED_IMAGE = /^https:\/\/boluo66\.top\/uploads\/note-visitor-[a-z0-9-]+\.(?:png|webp)$/;
const parser = new Marked(noteMathMarkedExtension());
const esc = (text) =>
  String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const rendered = (note) => (note.type === 'markdown' ? parser.parse(note.content, { async: false }) : note.content);
const links = (note) => {
  const $ = load(rendered(note));
  return new Map(
    $('a[href]')
      .map((_, a) => [[String($(a).attr('href')), $(a).text()]])
      .get(),
  );
};
const imageSources = (note) =>
  load(rendered(note))('img[src]')
    .map((_, n) => n.attribs.src)
    .get();
const fields = (row) => ({
  id: String(row.id),
  title: row.title,
  type: row.type,
  content: row.content,
  revision: Number(row.revision),
});

/**
 * 三张托管示例图可整体换成同内容的 WebP 展示副本：每项把当前托管地址换成按 WebP 内容摘要命名的新地址，
 * 正文中的其他图片仍必须原样保留。旧图文件不删除，历史版本继续引用。
 */
function imageReplacementsOf(list) {
  if (!Array.isArray(list)) throw exampleError('VISITOR_SHOWCASE_PLAN_INVALID');
  const sources = new Set();
  for (const item of list) {
    if (
      !item ||
      !MANAGED_IMAGE.test(item.from) ||
      !MANAGED_IMAGE.test(item.to) ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      !item.to.endsWith(`-${item.sha256.slice(0, 24)}.webp`) ||
      !Number.isInteger(item.size) ||
      item.size < 1 ||
      item.from === item.to ||
      sources.has(item.from)
    )
      throw exampleError('VISITOR_SHOWCASE_PLAN_INVALID');
    sources.add(item.from);
  }
  return list;
}

function contextFor(rows, replaced = new Map()) {
  const byTitle = new Map();
  for (const row of rows) {
    if (byTitle.has(row.title)) throw exampleError('VISITOR_SHOWCASE_AMBIGUOUS');
    byTitle.set(row.title, row);
  }
  const target = (title) => {
    const row = byTitle.get(title);
    if (!row) throw exampleError('VISITOR_SHOWCASE_NOTE_MISSING');
    return row;
  };
  const firstImage = (title) => {
    const src = imageSources(target(title))[0];
    if (!src || !MANAGED_IMAGE.test(src)) throw exampleError('VISITOR_SHOWCASE_IMAGE_INVALID');
    return replaced.get(src) || src;
  };
  return {
    note: (title, label = title) =>
      `<a href="/noteLibrary/${esc(target(title).id)}" data-ln-resource-type="note" data-ln-resource-id="${esc(target(title).id)}">${esc(label)}</a>`,
    mdNote: (title) => `[${title}](/noteLibrary/${target(title).id})`,
    images: {
      welcome: firstImage('欢迎使用轻笺笔记'),
      weekend: firstImage('周末散步：把生活留在一页里'),
      inspiration: firstImage('一张灵感板的配色观察'),
    },
  };
}

export function buildVisitorShowcasePlan(owner, rows, { images = [] } = {}) {
  const replacements = imageReplacementsOf(images);
  const replaced = new Map(replacements.map((item) => [item.from, item.to]));
  const context = contextFor(rows, replaced);
  // 换图项必须对应当前托管图（或已换好的地址），不能静默落空。
  const current = new Set(Object.values(context.images));
  if (replacements.some((item) => !current.has(item.to))) throw exampleError('VISITOR_SHOWCASE_IMAGE_INVALID');
  const definitions = buildShowcaseNotes(context);
  const changes = SHOWCASE_TITLES.map((title) => {
    const matches = rows.filter((n) => n.title === title);
    if (matches.length !== 1 || !['html', 'markdown'].includes(matches[0].type))
      throw exampleError('VISITOR_SHOWCASE_NOTE_INVALID');
    const before = fields(matches[0]);
    const definition = definitions[title];
    let content = definition.body;
    const existing = links(before);
    const nextLinks = links({ type: definition.type, content });
    const remaining = [...existing].filter(([href]) => !nextLinks.has(href));
    if (remaining.length) {
      content +=
        definition.type === 'html'
          ? `<div class="note-template-page ln-note-layout"><div class="ln-note-closing"><h2>相关资料与项目</h2><ul>${remaining.map(([href, label]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join('')}</ul></div></div>`
          : `\n\n## 相关资料与项目\n\n${remaining.map(([href, label]) => `- [${label.replaceAll('[', '').replaceAll(']', '').replaceAll('\n', ' ')}](${href})`).join('\n')}\n`;
    }
    content = sanitizePersistedNoteContent(content, definition.type, 'visitor-showcase');
    const after = { type: definition.type, content };
    const afterLinks = links(after);
    if ([...existing.keys()].some((href) => !afterLinks.has(href))) throw exampleError('VISITOR_SHOWCASE_LINK_LOST');
    const beforeImages = new Set(imageSources(before)),
      afterImages = new Set(imageSources(after));
    if ([...beforeImages].some((url) => !afterImages.has(replaced.get(url) || url)))
      throw exampleError('VISITOR_SHOWCASE_IMAGE_LOST');
    return { id: before.id, title, before, after };
  });
  const plan = {
    version: VERSION,
    owner: String(owner),
    changes,
    ...(replacements.length ? { images: replacements } : {}),
  };
  return { ...plan, hash: exampleHash(plan) };
}

export function validateVisitorShowcasePlan(plan) {
  if (
    !plan ||
    plan.version !== VERSION ||
    typeof plan.owner !== 'string' ||
    !Array.isArray(plan.changes) ||
    plan.changes.length !== SHOWCASE_TITLES.length ||
    new Set(plan.changes.map((n) => n.id)).size !== SHOWCASE_TITLES.length ||
    new Set(plan.changes.map((n) => n.title)).size !== SHOWCASE_TITLES.length ||
    plan.changes.some(
      (n) =>
        !SHOWCASE_TITLES.includes(n.title) ||
        n.id !== n.before?.id ||
        n.title !== n.before.title ||
        !['html', 'markdown'].includes(n.before.type) ||
        !['html', 'markdown'].includes(n.after?.type) ||
        typeof n.before.content !== 'string' ||
        typeof n.after.content !== 'string' ||
        !Number.isInteger(n.before.revision) ||
        n.before.revision < 1,
    )
  )
    throw exampleError('VISITOR_SHOWCASE_PLAN_INVALID');
  if (plan.images !== undefined) imageReplacementsOf(plan.images);
  const { hash, ...body } = plan;
  if (hash !== exampleHash(body)) throw exampleError('VISITOR_SHOWCASE_PLAN_CHANGED');
  return plan;
}

export async function readVisitorShowcasePlan(db, owner, options) {
  await assertVisitorOwner(db, owner);
  const [rows] = await db.query(
    'SELECT id,title,type,content,revision FROM note WHERE create_by=? AND del_flag=0 ORDER BY id',
    [owner],
  );
  return buildVisitorShowcasePlan(owner, rows, options);
}

// Compare every target before the first write. The caller owns commit/rollback and the receipt.
export async function applyVisitorShowcasePlan(connection, input) {
  const plan = validateVisitorShowcasePlan(input);
  await assertVisitorOwner(connection, plan.owner, true);
  const pending = [];
  for (const item of plan.changes) {
    const [[row]] = await connection.query(
      'SELECT id,title,type,content,revision FROM note WHERE id=? AND create_by=? AND del_flag=0 FOR UPDATE',
      [item.id, plan.owner],
    );
    if (!row) throw exampleError('VISITOR_SHOWCASE_CONFLICT');
    const current = fields(row);
    const installed = { ...item.before, ...item.after, revision: item.before.revision + 1 };
    if (exampleHash(current) === exampleHash(installed)) continue;
    if (exampleHash(current) !== exampleHash(item.before)) throw exampleError('VISITOR_SHOWCASE_CONFLICT');
    if (item.before.type !== item.after.type || item.before.content !== item.after.content) pending.push(item);
  }
  // 新图须先登记为游客账号的托管资产，正文改写时的引用同步才会认领它们（与 v2 安装一致）。
  if (pending.length)
    for (const image of plan.images || []) {
      const locator = image.to.slice(image.to.lastIndexOf('/') + 1);
      await registerAsset(connection, {
        owner: plan.owner,
        sourceType: 'note_image',
        sourceId: locator,
        locator,
        storage: 'local',
        version: image.sha256,
        size: image.size,
        reconciled: true,
      });
    }
  for (const item of pending)
    await applyOwnedNoteContentChange(connection, {
      userId: plan.owner,
      noteId: item.id,
      before: item.before,
      after: item.after,
      snapshotReason: 'visitor_showcase',
    });
  return pending.map((n) => n.id);
}
