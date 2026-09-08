import { applicableOrganizeResources, supportsOrganizeCheck } from '@lightnote/shared/organize-capabilities';
import crypto from 'node:crypto';
import path from 'node:path';
import { load } from 'cheerio';
import { marked } from 'marked';
import { parseNoteContent, renderNoteForAi } from '../noteSemantic.js';
import { createBookmarkExactUrlHash } from './bookmarkExactUrlService.js';

export const SUGGESTION_TYPES = ['tags', 'title', 'empty', 'duplicate', 'archive'];
export const RESOURCE_TYPES = ['bookmark', 'note', 'file'];
export const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const normalizeName = (value) =>
  String(value || '')
    .normalize('NFKC')
    .trim();
export function suggestionError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
export function normalizeRunInput(input = {}) {
  if (
    !input ||
    !Array.isArray(input.resourceTypes) ||
    !Array.isArray(input.checks) ||
    (input.items !== undefined && (!Array.isArray(input.items) || input.items.some((i) => !i || typeof i !== 'object')))
  )
    throw suggestionError('ORGANIZE_OPTIONS_INVALID', '请选择有效范围');
  const resourceTypes = [...new Set(input.resourceTypes || [])].sort();
  const checks = [...new Set(input.checks || [])].sort();
  if (
    !resourceTypes.length ||
    resourceTypes.some((v) => !RESOURCE_TYPES.includes(v)) ||
    !checks.length ||
    checks.some((v) => !SUGGESTION_TYPES.includes(v))
  )
    throw suggestionError('ORGANIZE_OPTIONS_INVALID', '请选择资源类型和整理项目');
  const scope = input.scope || 'recent';
  if (!['recent', 'all', 'selected', 'untagged'].includes(scope))
    throw suggestionError('ORGANIZE_SCOPE_INVALID', '处理范围无效');
  const tagMode = input.tagMode || 'untagged';
  if (!['untagged', 'append'].includes(tagMode) || (tagMode === 'append' && scope !== 'selected'))
    throw suggestionError('ORGANIZE_OPTIONS_INVALID', '追加标签仅支持明确选择的资料');
  const items = Array.isArray(input.items)
    ? [
        ...new Map(
          input.items.map((item) => [`${item.type}:${item.id}`, { type: item.type, id: String(item.id || '') }]),
        ).values(),
      ]
    : [];
  if (
    scope === 'selected' &&
    (!items.length ||
      items.length > 1000 ||
      items.some((v) => !resourceTypes.includes(v.type) || !v.id || v.id.length > 128))
  )
    throw suggestionError('ORGANIZE_SELECTION_INVALID', '请选择 1 至 1000 项有效资料');
  if (scope !== 'selected' && items.length)
    throw suggestionError('ORGANIZE_SELECTION_INVALID', '当前范围不能同时指定资料');
  const applicableTypes = applicableOrganizeResources(resourceTypes, checks);
  const applicableItems = items.filter((item) => applicableTypes.includes(item.type));
  if (!applicableTypes.length || (scope === 'selected' && !applicableItems.length))
    throw suggestionError('ORGANIZE_CHECKS_NOT_APPLICABLE', '所选资料没有适用的整理项目，请重新选择');
  return {
    resourceTypes: applicableTypes,
    checks,
    scope,
    items: applicableItems,
    ...(tagMode === 'append' ? { tagMode } : {}),
  };
}
export function inspectNote(row) {
  if (row.type === 'drawing') return { supported: false, empty: false, hasText: false, text: '', contentHash: null };
  const source = String(row.content || '');
  const document = parseNoteContent({ content: source, type: row.type });
  const html = ['md', 'markdown'].includes(row.type) ? marked.parse(source, { async: false }) : source;
  const $ = load(html);
  $('script,style,noscript').remove();
  const text = $.root()
    .text()
    .replace(/[\s\u200b-\u200d\ufeff]/gu, '');
  // 无文字的链接、表格、任务框、附件/嵌入仍然有意义；未知节点宁可保留。
  const meaningful =
    $(
      'img,a[href],video,audio,iframe,object,embed,canvas,svg,input,table,hr,[data-resource-id],[data-attachment-id],[data-file-id],[data-embed],[contenteditable="false"]',
    ).length > 0;
  const knownEmptyTags = new Set([
    'html',
    'head',
    'body',
    'p',
    'div',
    'br',
    'span',
    'b',
    'i',
    'strong',
    'em',
    'u',
    's',
  ]);
  const unknown = $('*')
    .toArray()
    .some((el) => !knownEmptyTags.has(el.tagName));
  const empty = !text && !meaningful && !unknown && !document.images.length;
  // 完整原始正文的保守比较，绝不使用摘要、截断文本或去掉媒体的文字。
  return {
    supported: true,
    hasText: Boolean(text),
    empty,
    text: empty ? '' : renderNoteForAi(document, { maxChars: 6000 }),
    contentHash: empty ? null : hash([row.type, source.replace(/\r\n?/g, '\n').trim()]),
  };
}
export function buildSnapshot(type, row, tags = [], now = Date.now()) {
  const title = String(type === 'file' ? row.file_name || '' : type === 'bookmark' ? row.name || '' : row.title || '');
  const note = type === 'note' ? inspectNote(row) : null;
  const guards =
    type === 'note'
      ? {
          children: Number(row.children || 0),
          pinned: Number(row.is_top || 0),
          references: Number(row.refs || 0),
          todos: Number(row.todos || 0),
          shares: Number(row.shares || 0),
        }
      : {};
  const protectedNote = Object.values(guards).some(Boolean);
  const age = now - new Date(row.update_time || row.create_time || now).getTime();
  const text =
    type === 'note'
      ? note.text
      : type === 'file'
        ? String(row.parsed_text || '').slice(0, 6000)
        : String(row.description || '').slice(0, 6000);
  const source = {
    title,
    text,
    url: type === 'bookmark' ? row.url : undefined,
    folder: String(row.folder_name || ''),
    fileType: type === 'file' ? row.file_type : undefined,
  };
  const versionData =
    type === 'note'
      ? [row.revision, row.title, row.content, row.type, row.parent_id, guards]
      : type === 'file'
        ? [row.file_name, row.file_size, row.file_type, row.obs_key, row.folder_id]
        : [row.name, row.description, row.url];
  const defaultTitle =
    type === 'note'
      ? /^(?:未命名(?:文档|笔记)?|新建文档|untitled(?: document| note)?)$/iu.test(title.trim())
      : type === 'bookmark'
        ? !title.trim() || title.trim() === String(row.url || '').trim()
        : /^(?:[a-f\d-]{24,}|(?:IMG|DSC|Screenshot|微信图片|屏幕截图)[_\s-]?\d[\w\s-]*|\d{10,})$/iu.test(
            path.parse(title).name,
          );
  return {
    type,
    id: String(row.id),
    title,
    tags,
    source,
    ...(type === 'bookmark'
      ? {
          hasArchive: Boolean(row.hasArchive),
          bookmarkMeta: {
            url: row.url,
            name: row.name || '',
            description: row.original_description ?? row.description ?? '',
          },
        }
      : {}),
    version: hash([versionData, tags.map((t) => [t.id, t.name]).sort()]),
    modifiedAt: row.update_time || row.create_time,
    guards,
    protected: protectedNote,
    empty:
      type === 'note' ? note.empty : type === 'file' ? row.file_size != null && Number(row.file_size) === 0 : false,
    emptyEligible:
      type === 'note'
        ? note.empty && age >= 7 * 86400000 && !protectedNote
        : type === 'file' && row.file_size != null && Number(row.file_size) === 0,
    unsupported: type === 'note' && !note.supported,
    defaultTitle: !title.trim() || defaultTitle,
    hasTitleEvidence: type === 'note' ? note.hasText : Boolean(text),
    evidenceLevel: type === 'file' ? (text ? 'parsed' : 'metadata') : 'content',
    duplicateKey:
      type === 'bookmark'
        ? createBookmarkExactUrlHash(row.url)?.toString('hex') || null
        : type === 'note'
          ? note.contentHash
          : hash([normalizeName(title).toLowerCase(), row.file_size, row.file_type]),
    size: type === 'file' ? Number(row.file_size) : undefined,
  };
}
export function buildRuleSuggestions(snapshots, checks, { tagMode = 'untagged' } = {}) {
  const titles = new Map(),
    duplicates = new Map();
  for (const s of snapshots) {
    const key = `${s.type}:${normalizeName(s.title).toLowerCase()}`;
    titles.set(key, [...(titles.get(key) || []), s]);
    if (s.duplicateKey) {
      const d = `${s.type}:${s.duplicateKey}`;
      duplicates.set(d, [...(duplicates.get(d) || []), s]);
    }
  }
  return snapshots.map((s) => {
    const results = [];
    const add = (kind, status, reason, extra = {}) =>
      results.push({
        kind,
        status,
        reason,
        before: kind === 'tags' ? s.tags : kind === 'title' ? s.title : null,
        after: null,
        ...extra,
      });
    const sameTitle = titles.get(`${s.type}:${normalizeName(s.title).toLowerCase()}`) || [];
    const aiKinds = [];
    if (checks.includes('tags') && supportsOrganizeCheck(s.type, 'tags')) {
      if (s.tags.length && tagMode !== 'append') add('tags', 'not_applicable', '已有标签，本次仅补齐无标签资料');
      else if (s.unsupported || s.empty || (s.type === 'note' && !s.hasTitleEvidence))
        add('tags', 'insufficient', '没有可用于分析的内容，可手动添加标签');
      else {
        add('tags', 'queued', '等待分析');
        aiKinds.push('tags');
      }
    }
    if (checks.includes('title') && supportsOrganizeCheck(s.type, 'title')) {
      const needsTitle = s.defaultTitle || (s.type === 'note' && sameTitle.length > 1);
      if (!needsTitle) add('title', 'not_applicable', '当前名称无需调整');
      else if (s.unsupported || !s.hasTitleEvidence) add('title', 'insufficient', '缺少正文依据，可手动填写名称');
      else {
        add('title', 'queued', sameTitle.length > 1 ? '标题重复，分析内容后建议区分名称' : '根据内容补全名称');
        aiKinds.push('title');
      }
    }
    if (checks.includes('empty') && supportsOrganizeCheck(s.type, 'empty')) {
      if (s.unsupported || s.type === 'bookmark')
        add('empty', 'not_applicable', s.unsupported ? '画布不参与空内容检查' : '不根据网页抓取结果判断空资源');
      else if (s.emptyEligible)
        add('empty', 'pending', s.type === 'note' ? '没有有效内容且已闲置至少 7 天' : '文件大小为 0 字节', {
          action: 'trash',
        });
      else if (s.empty)
        add('empty', 'info', s.protected ? '内容为空，但仍被使用或有子页面，建议保留' : '内容为空，仍在 7 天保护期内');
      else add('empty', 'no_suggestion', '没有发现空内容问题');
    }
    if (checks.includes('archive') && supportsOrganizeCheck(s.type, 'archive')) {
      if (s.hasArchive) add('archive', 'no_suggestion', '当前网址已有正文存档，无需重复读取');
      else if (!s.source.url) add('archive', 'info', '书签没有有效网址，无法保存正文');
      else
        add('archive', 'pending', '尚无当前网址的正文存档；确认后在后台读取，失败保留已有内容，不消耗 AI 额度', {
          action: 'archive',
        });
    }
    if (checks.includes('duplicate') && supportsOrganizeCheck(s.type, 'duplicate')) {
      const members = duplicates.get(`${s.type}:${s.duplicateKey}`) || [];
      if (s.unsupported) add('duplicate', 'not_applicable', '画布不参与重复删除判断');
      else if (members.length > 1)
        add(
          'duplicate',
          s.type === 'note' && !s.protected ? 'pending' : 'info',
          s.type === 'file'
            ? '名称、大小和类型相同，仅为疑似重复，请对照内容'
            : s.type === 'bookmark'
              ? '网址完全相同，请使用已有重复网址处理流程'
              : '完整正文相同，请对照后选择保留项',
          {
            action: s.type === 'note' && !s.protected ? 'trash' : s.type === 'bookmark' ? 'duplicate_bookmarks' : null,
            groupKey: s.duplicateKey,
            members: members.map((m) => ({
              id: m.id,
              type: m.type,
              title: m.title,
              version: m.version,
              folder: m.source.folder,
              size: m.size,
              fileType: m.source.fileType,
              url: m.source.url,
              modifiedAt: m.modifiedAt,
              excerpt: m.source.text.slice(0, 160),
              protected: m.protected,
            })),
          },
        );
      else if (s.type === 'note' && sameTitle.length > 1) add('duplicate', 'info', '标题相同但正文不同，不建议删除');
      else add('duplicate', 'no_suggestion', '没有发现重复问题');
    }
    return { snapshot: s, suggestions: results, aiKinds };
  });
}
