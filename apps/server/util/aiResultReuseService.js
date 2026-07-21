import crypto from 'node:crypto';
import { load } from 'cheerio';
import { marked } from 'marked';
import pool from '../db/index.js';
import { auditAgentCitations } from './agent/sourceUtils.js';
import { createAiChangeSet, hashAiChangeState } from './aiChangeSetService.js';
import { getOwnedAiMessage } from './aiConversationService.js';

const REUSE_MODES = new Set(['append', 'merge', 'selection']);
const MAX_NOTE_CONTENT_LENGTH = 1_000_000;
const MAX_REUSABLE_BLOCKS = 120;
const NOTE_VERSION_SQL = `SHA2(CONCAT(
  't', CHAR_LENGTH(COALESCE(title, '')), ':', COALESCE(title, ''),
  '|y', CHAR_LENGTH(COALESCE(type, '')), ':', COALESCE(type, ''),
  '|c', CHAR_LENGTH(COALESCE(content, '')), ':', COALESCE(content, '')
), 256)`;

function reuseError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  return error;
}

function boundedText(value, maxLength) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function normalizeLocale(value) {
  return String(value || '')
    .toLowerCase()
    .startsWith('en')
    ? 'en-US'
    : 'zh-CN';
}

function labels(locale) {
  return normalizeLocale(locale) === 'en-US'
    ? {
        appendHeading: 'AI appended content',
        mergeHeading: 'AI merged content',
        selectionHeading: 'Selected AI answer sections',
        sourceHeading: 'AI answer sources',
        noSources: 'This answer has no saved source references. Please verify it independently.',
        appendTitle: (title) => `AI append: ${title}`,
        mergeTitle: (title) => `AI merge: ${title}`,
        selectionTitle: (title) => `AI selection: ${title}`,
        appendSummary: (count) =>
          `Append the answer and its ${count} source ${count === 1 ? 'reference' : 'references'} to the end of the note.`,
        mergeSummary: (unique, duplicate) =>
          `Merge ${unique} new content blocks, skip ${duplicate} duplicate blocks, and preserve source references.`,
        selectionSummary: (selected, total, sources) =>
          `Apply ${selected} of ${total} answer blocks and preserve all ${sources} saved source references.`,
        appendReason: 'Append the AI answer and preserve its source references',
        mergeReason: 'Merge the AI answer, skip duplicate content, and preserve its source references',
        selectionReason: 'Apply the selected AI answer blocks and preserve the saved source references',
        contentTooLong: 'The answer and its source metadata exceed the 1,000,000-character note limit.',
      }
    : {
        appendHeading: 'AI 追加内容',
        mergeHeading: 'AI 合并内容',
        selectionHeading: 'AI 选段内容',
        sourceHeading: 'AI 回答来源',
        noSources: '本回答没有可保存的来源引用，请自行核验。',
        appendTitle: (title) => `AI 追加：${title}`,
        mergeTitle: (title) => `AI 合并：${title}`,
        selectionTitle: (title) => `AI 选段：${title}`,
        appendSummary: (count) => `把回答及其 ${count} 个来源追加到笔记末尾。`,
        mergeSummary: (unique, duplicate) => `合并 ${unique} 个新内容块，跳过 ${duplicate} 个重复块，并保留来源。`,
        selectionSummary: (selected, total, sources) =>
          `应用回答中的 ${selected}/${total} 个内容块，并完整保留 ${sources} 个已保存来源。`,
        appendReason: '追加 AI 回答并保留引用',
        mergeReason: '合并 AI 回答、跳过重复内容并保留引用',
        selectionReason: '应用选中的 AI 回答片段并保留已保存引用',
        contentTooLong: '回答及其来源信息超过笔记正文 100 万字符上限。',
      };
}

function escapeMarkdownLabel(value) {
  return String(value || '')
    .replace(/[\\[\]]/g, '\\$&')
    .replace(/\r?\n/g, ' ')
    .trim();
}

export function safeSourceHref(source) {
  const raw = String(source?.target?.path || source?.target?.url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') || /^https?:\/\//i.test(raw))
    return raw.replace(/[\s()]/g, (char) => encodeURIComponent(char));
  return '';
}

function formatLocator(locator) {
  if (!locator || typeof locator !== 'object') return '';
  const value = locator.label || locator.value || locator.page || locator.section || locator.paragraph;
  return value == null ? '' : String(value).slice(0, 120);
}

function buildTraceMetadata(message) {
  const sources = Array.isArray(message.sources) ? message.sources : [];
  const evidence = Array.isArray(message.evidence) ? message.evidence : [];
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  return {
    schema: 'light-note-ai-sources-v1',
    requestId: message.requestId,
    traceId: message.traceId,
    savedSources: sources.map((source) => ({
      sourceId: source.sourceId,
      resourceType: source.resourceType,
      resourceId: source.resourceId,
      title: source.title,
      resourceVersion: source.resourceVersion,
      target: source.target,
      coverage: source.coverage,
      capturedAt: source.capturedAt,
    })),
    savedEvidence: evidence.map((item) => ({
      evidenceRef: item.evidenceRef,
      citationKey: item.citationKey,
      sourceId: item.sourceId,
      locator: item.locator,
      excerpt: item.excerpt,
      excerptHash: item.excerptHash,
    })),
    // 保留 v1 既有的 evidence → resource 展平结构，兼容已经解析该字段的旧笔记。
    sources: evidence.map((item) => ({
      evidenceRef: item.evidenceRef,
      citationKey: item.citationKey,
      sourceId: item.sourceId,
      locator: item.locator,
      excerptHash: item.excerptHash,
      resource: sourceById.get(item.sourceId)
        ? {
            type: sourceById.get(item.sourceId).resourceType,
            id: sourceById.get(item.sourceId).resourceId,
            version: sourceById.get(item.sourceId).resourceVersion,
          }
        : null,
    })),
    ...(message.reuseSelection
      ? {
          selection: {
            sourceMessageId: message.id,
            blockIds: message.reuseSelection.blockIds,
            selectedBlockCount: message.reuseSelection.selectedBlockCount,
            totalBlockCount: message.reuseSelection.totalBlockCount,
            citationKeys: message.reuseSelection.citationKeys,
          },
        }
      : {}),
  };
}

function buildReferenceSection(message, locale) {
  const copy = labels(locale);
  const sources = Array.isArray(message.sources) ? message.sources : [];
  const evidence = Array.isArray(message.evidence) ? message.evidence : [];
  const lines = ['---', '', `## ${copy.sourceHeading}`];
  if (!sources.length) {
    lines.push('', `> ${copy.noSources}`);
  } else {
    for (const source of sources) {
      const fallbackTitle = [source.resourceType, source.resourceId].filter(Boolean).join(' ') || 'Source';
      const title = escapeMarkdownLabel(source.title || fallbackTitle);
      const href = safeSourceHref(source);
      const locatorText = evidence
        .filter((item) => item.sourceId === source.sourceId)
        .map((item) => formatLocator(item.locator))
        .filter(Boolean)
        .join(normalizeLocale(locale) === 'en-US' ? ', ' : '、');
      lines.push(
        `- ${href ? `[${title}](${href})` : title}${locatorText ? ` — ${escapeMarkdownLabel(locatorText)}` : ''}`,
      );
    }
  }
  lines.push('', `<!-- ${Buffer.from(JSON.stringify(buildTraceMetadata(message)), 'utf8').toString('base64url')} -->`);
  return lines.join('\n');
}

export function buildReferencedNoteContent(message, { locale = 'zh-CN' } = {}) {
  const content = [String(message?.content || '').trim(), '', buildReferenceSection(message || {}, locale)].join('\n');
  if (content.length > MAX_NOTE_CONTENT_LENGTH) {
    throw reuseError('CONTENT_TOO_LONG', labels(locale).contentTooLong);
  }
  return content;
}

function safeGeneratedHtml(markdown) {
  const raw = marked.parse(String(markdown || ''), { async: false, gfm: true, breaks: false });
  const $ = load(`<div data-ai-result-root>${raw}</div>`, null, false);
  const root = $('[data-ai-result-root]').first();
  root.find('script,style,iframe,object,embed,form,input,button,textarea,select,link,meta').remove();
  root.find('*').each((_, element) => {
    const node = $(element);
    for (const attribute of Object.keys(element.attribs || {})) {
      const lower = attribute.toLowerCase();
      if (lower.startsWith('on') || ['style', 'srcdoc'].includes(lower)) node.removeAttr(attribute);
    }
    for (const attribute of ['href', 'src']) {
      const value = String(node.attr(attribute) || '').trim();
      if (value && !value.startsWith('/') && !/^https?:\/\//i.test(value)) node.removeAttr(attribute);
    }
  });
  return root.html() || '';
}

function semanticText(value, type = 'markdown') {
  let text = String(value || '');
  if (type === 'html') text = load(text, null, false).root().text();
  return text
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/[#>*_`~\[\]()|+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function plainMarkdownText(value) {
  const html = marked.parse(String(value || ''), { async: false, gfm: true, breaks: false });
  return load(String(html), null, false).root().text().replace(/\s+/g, ' ').trim();
}

function reusableBlockKind(token) {
  if (token?.type === 'heading') return 'section';
  if (['list', 'code', 'blockquote', 'table'].includes(token?.type)) return token.type;
  return 'paragraph';
}

function reusableBlockId(index, content) {
  const digest = crypto
    .createHash('sha256')
    .update(String(content || ''))
    .digest('hex')
    .slice(0, 16);
  return `block-${index}-${digest}`;
}

/**
 * 按 Markdown 标题片段与顶层结构块拆分回答。ID 包含顺序与内容摘要，
 * 因此写入时重新解析持久化消息即可识别客户端的过期或伪造选择。
 */
export function extractAiResultReusableBlocks(message) {
  const content = String(message?.content || '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!content) return [];
  const tokens = marked.lexer(content, { gfm: true });
  const rawBlocks = [];
  let section = null;

  const pushRawBlock = (block) => {
    if (rawBlocks.length < MAX_REUSABLE_BLOCKS - 1) {
      rawBlocks.push(block);
      return;
    }
    if (rawBlocks.length === MAX_REUSABLE_BLOCKS - 1) {
      rawBlocks.push({ raw: block.raw, kind: 'group', heading: '' });
      return;
    }
    rawBlocks[MAX_REUSABLE_BLOCKS - 1].raw += `\n\n${block.raw}`;
  };

  const pushSection = () => {
    const raw = String(section?.raw || '').trim();
    if (raw) pushRawBlock({ raw, kind: 'section', heading: section.heading });
    section = null;
  };

  for (const token of tokens) {
    if (token.type === 'space') {
      if (section) section.raw += token.raw || '';
      continue;
    }
    if (token.type === 'heading') {
      pushSection();
      section = { raw: token.raw || '', heading: plainMarkdownText(token.raw || token.text || '') };
      continue;
    }
    if (section) {
      section.raw += token.raw || '';
      continue;
    }
    const raw = String(token.raw || '').trim();
    if (raw) pushRawBlock({ raw, kind: reusableBlockKind(token), heading: '' });
  }
  pushSection();

  return rawBlocks.map((block, index) => {
    const text = plainMarkdownText(block.raw);
    const citationAudit = auditAgentCitations(block.raw, Array.isArray(message?.evidence) ? message.evidence : []);
    return {
      id: reusableBlockId(index, block.raw),
      index,
      kind: block.kind,
      title: boundedText(block.heading || text, 120),
      preview: boundedText(text, 260),
      charCount: block.raw.length,
      citationKeys: citationAudit.citedKeys,
      content: block.raw,
    };
  });
}

function assertReusableMessage(message) {
  if (message.role !== 'assistant' || message.status !== 'completed') {
    throw reuseError('MESSAGE_NOT_SAVABLE', '只能复用已经完成的助手回答');
  }
}

function selectMessageBlocks(message, input) {
  if (!Array.isArray(input.selectedBlockIds) || !input.selectedBlockIds.length) {
    throw reuseError('RESULT_BLOCK_SELECTION_REQUIRED', '请至少选择一个回答片段');
  }
  if (input.selectedBlockIds.length > MAX_REUSABLE_BLOCKS) {
    throw reuseError('RESULT_BLOCK_SELECTION_TOO_LARGE', '一次选择的回答片段过多');
  }
  const selectedIds = input.selectedBlockIds.map((value) => boundedText(value, 80));
  if (
    selectedIds.some((value) => !/^block-\d+-[a-f0-9]{16}$/.test(value)) ||
    new Set(selectedIds).size !== selectedIds.length
  ) {
    throw reuseError('RESULT_BLOCK_SELECTION_INVALID', '回答片段选择无效，请重新打开选段面板');
  }
  const blocks = extractAiResultReusableBlocks(message);
  const wanted = new Set(selectedIds);
  const selected = blocks.filter((block) => wanted.has(block.id));
  if (selected.length !== wanted.size) {
    throw reuseError('RESULT_BLOCK_SELECTION_STALE', '回答内容已变化，请重新选择片段', 409);
  }
  const citationKeys = [...new Set(selected.flatMap((block) => block.citationKeys))];
  return {
    ...message,
    content: selected.map((block) => block.content).join('\n\n'),
    reuseSelection: {
      blockIds: selected.map((block) => block.id),
      selectedBlockCount: selected.length,
      totalBlockCount: blocks.length,
      citationKeys,
    },
  };
}

export async function listAiResultReusableBlocks(identity, input = {}, database = pool) {
  const message = await getOwnedAiMessage(identity, input.conversationId, input.messageId, database);
  assertReusableMessage(message);
  const blocks = extractAiResultReusableBlocks(message);
  return {
    items: blocks.map(({ content: _content, ...block }) => block),
    total: blocks.length,
    sourceCount: Array.isArray(message.sources) ? message.sources.length : 0,
    evidenceCount: Array.isArray(message.evidence) ? message.evidence.length : 0,
  };
}

function uniqueMessageBlocks(messageContent, targetContent, targetType) {
  const existing = semanticText(targetContent, targetType);
  const blocks = String(messageContent || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const kept = [];
  let duplicateCount = 0;
  const seen = new Set();
  for (const block of blocks) {
    const normalized = semanticText(block, 'markdown');
    if (!normalized || existing.includes(normalized) || seen.has(normalized)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(normalized);
    kept.push(block);
  }
  return { kept, duplicateCount, totalCount: blocks.length };
}

function composeTargetContent(target, message, mode, locale) {
  const copy = labels(locale);
  const targetType = target.type === 'md' ? 'markdown' : target.type || 'html';
  let answer = String(message.content || '').trim();
  let uniqueBlockCount = 0;
  let duplicateBlockCount = 0;
  if (mode === 'merge') {
    const blocks = uniqueMessageBlocks(answer, target.content, targetType);
    answer = blocks.kept.join('\n\n');
    uniqueBlockCount = blocks.kept.length;
    duplicateBlockCount = blocks.duplicateCount;
    if (!answer) throw reuseError('NO_NEW_CONTENT', '回答中的内容已存在于目标笔记，无需重复合并', 409);
  }
  const heading =
    mode === 'merge' ? copy.mergeHeading : mode === 'selection' ? copy.selectionHeading : copy.appendHeading;
  const fragmentMarkdown = [`## ${heading}`, '', answer, '', buildReferenceSection(message, locale)].join('\n');
  const fragment = targetType === 'html' ? safeGeneratedHtml(fragmentMarkdown) : fragmentMarkdown;
  const separator = target.content ? (targetType === 'html' ? '<hr>' : '\n\n---\n\n') : '';
  const content = `${String(target.content || '').trimEnd()}${separator}${fragment}`;
  if (content.length > MAX_NOTE_CONTENT_LENGTH) {
    throw reuseError('CONTENT_TOO_LONG', '合并后的笔记正文超过 100 万字符，请选择较短的目标笔记', 400);
  }
  return {
    content,
    uniqueBlockCount: mode === 'merge' ? uniqueBlockCount : null,
    duplicateBlockCount: mode === 'merge' ? duplicateBlockCount : null,
  };
}

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function mapTarget(row) {
  return {
    id: String(row.id),
    title: row.title || '',
    type: row.type === 'md' ? 'markdown' : row.type || 'html',
    contentLength: Number(row.content_length || 0),
    resourceVersion: String(row.resource_version || ''),
    updatedAt: row.update_time,
  };
}

export async function listAiResultNoteTargets(identity, input = {}, database = pool) {
  const keyword = boundedText(input.keyword, 100);
  const limit = Math.max(1, Math.min(50, Number(input.limit) || 30));
  const params = [identity.subjectUserId];
  let where = 'create_by = ? AND del_flag = 0';
  if (keyword) {
    where += " AND title LIKE ? ESCAPE '\\\\'";
    params.push(`%${escapeLike(keyword)}%`);
  }
  params.push(limit);
  const [rows] = await database.query(
    `SELECT id, title, type, CHAR_LENGTH(COALESCE(content, '')) AS content_length,
            ${NOTE_VERSION_SQL} AS resource_version, update_time
       FROM note
      WHERE ${where}
      ORDER BY update_time DESC, id DESC
      LIMIT ?`,
    params,
  );
  return { items: rows.map(mapTarget), total: rows.length };
}

async function loadOwnedTarget(identity, noteId, database) {
  const [rows] = await database.query(
    `SELECT id, title, content, type, ${NOTE_VERSION_SQL} AS resource_version, update_time
       FROM note
      WHERE id = ? AND create_by = ? AND del_flag = 0
      LIMIT 1`,
    [boundedText(noteId, 128), identity.subjectUserId],
  );
  if (!rows.length) throw reuseError('RESOURCE_NOT_FOUND', '目标笔记不存在或无权操作', 404);
  return {
    ...mapTarget({ ...rows[0], content_length: String(rows[0].content || '').length }),
    content: String(rows[0].content || ''),
  };
}

export async function prepareAiResultNoteReuse(identity, input = {}, database = pool) {
  const mode = REUSE_MODES.has(input.mode) ? input.mode : null;
  if (!mode) throw reuseError('REUSE_MODE_INVALID', '结果复用方式无效');
  const message = await getOwnedAiMessage(identity, input.conversationId, input.messageId, database);
  assertReusableMessage(message);
  const reusableMessage = mode === 'selection' ? selectMessageBlocks(message, input) : message;
  const target = await loadOwnedTarget(identity, input.targetNoteId, database);
  const expectedVersion = boundedText(input.targetVersion, 64);
  if (!expectedVersion) throw reuseError('TARGET_VERSION_REQUIRED', '缺少目标笔记版本，请重新选择');
  if (expectedVersion !== target.resourceVersion) {
    throw reuseError('TARGET_VERSION_CONFLICT', '目标笔记已发生变化，请重新加载并生成预览', 409);
  }

  const locale = normalizeLocale(input.locale);
  const copy = labels(locale);
  const composed = composeTargetContent(target, reusableMessage, mode, locale);
  const before = { title: target.title, content: target.content, type: target.type };
  const after = { title: target.title, content: composed.content, type: target.type };
  const requestHash = crypto
    .createHash('sha256')
    .update(
      [
        identity.actorUserId,
        identity.subjectUserId,
        input.conversationId,
        message.id,
        target.id,
        mode,
        ...(reusableMessage.reuseSelection?.blockIds || []),
        target.resourceVersion,
      ].join(':'),
    )
    .digest('hex')
    .slice(0, 48);
  const changeSet = await createAiChangeSet(
    identity,
    {
      conversationId: input.conversationId,
      requestId: `note-reuse:${requestHash}`,
      title:
        mode === 'append'
          ? copy.appendTitle(target.title)
          : mode === 'selection'
            ? copy.selectionTitle(target.title)
            : copy.mergeTitle(target.title),
      summary:
        mode === 'append'
          ? copy.appendSummary(message.sources.length)
          : mode === 'selection'
            ? copy.selectionSummary(
                reusableMessage.reuseSelection.selectedBlockCount,
                reusableMessage.reuseSelection.totalBlockCount,
                message.sources.length,
              )
            : copy.mergeSummary(composed.uniqueBlockCount, composed.duplicateBlockCount),
      items: [
        {
          operation: 'update_note_content',
          resourceType: 'note',
          resourceId: target.id,
          expectedBeforeHash: hashAiChangeState(before),
          before,
          after,
          reason:
            mode === 'append' ? copy.appendReason : mode === 'selection' ? copy.selectionReason : copy.mergeReason,
        },
      ],
    },
    database,
  );

  return {
    changeSetId: changeSet.id,
    preview: {
      mode,
      target: {
        id: target.id,
        title: target.title,
        type: target.type,
        resourceVersion: target.resourceVersion,
      },
      beforeLength: target.content.length,
      afterLength: composed.content.length,
      addedLength: composed.content.length - target.content.length,
      sourceCount: message.sources.length,
      evidenceCount: message.evidence.length,
      uniqueBlockCount: composed.uniqueBlockCount,
      duplicateBlockCount: composed.duplicateBlockCount,
      selectedBlockCount: reusableMessage.reuseSelection?.selectedBlockCount ?? null,
      totalBlockCount: reusableMessage.reuseSelection?.totalBlockCount ?? null,
      selectedCitationCount: reusableMessage.reuseSelection ? reusableMessage.reuseSelection.citationKeys.length : null,
      undoSupported: true,
      versionCheck: 'content_hash',
    },
  };
}

export const __testing = {
  buildReferenceSection,
  composeTargetContent,
  selectMessageBlocks,
  safeGeneratedHtml,
  semanticText,
  uniqueMessageBlocks,
};
