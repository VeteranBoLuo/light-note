const SOURCE_TYPES = new Set(['note', 'bookmark', 'file', 'knowledge', 'document', 'tag', 'folder', 'web']);

const SOURCE_TARGETS = new Set([
  'note-detail',
  'bookmark-url',
  'bookmark-edit',
  'bookmark-snapshot',
  'cloud-file',
  'cloud-folder',
  'help-article',
  'knowledge-admin',
  'tag-detail',
  'web-url',
  'temporary-document',
]);

const TARGETS_REQUIRING_ID = new Set([
  'note-detail',
  'bookmark-edit',
  'bookmark-snapshot',
  'cloud-file',
  'cloud-folder',
  'help-article',
  'knowledge-admin',
  'tag-detail',
]);

function boundedText(value, maxLength) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function normalizeSourceUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function inferTarget(type, url) {
  if (type === 'note') return 'note-detail';
  if (type === 'bookmark') return url ? 'bookmark-url' : 'bookmark-edit';
  if (type === 'file') return 'cloud-file';
  if (type === 'tag') return 'tag-detail';
  if (type === 'folder') return 'cloud-folder';
  if (type === 'web') return 'web-url';
  return undefined;
}

export function resolveKnowledgeSourceTarget(source, userRole) {
  if (source?.status === 'public' && source?.category === '帮助中心') return 'help-article';
  if (source?.status === 'internal' && userRole === 'root') return 'knowledge-admin';
  return undefined;
}

export function normalizeAgentSource(input) {
  if (!input || typeof input !== 'object') return null;
  const type = String(input.type || '').trim();
  if (!SOURCE_TYPES.has(type)) return null;

  const url = normalizeSourceUrl(input.url);
  const fileId = boundedText(input.fileId, 255) || undefined;
  const documentId = boundedText(input.documentId, 255) || undefined;
  let id = boundedText(input.id, 255);
  if (!id && type === 'document') id = documentId || fileId || '';
  if (!id && type === 'web') id = url;

  let target = SOURCE_TARGETS.has(input.target) ? input.target : inferTarget(type, url);
  if (target === 'bookmark-url' && !url) target = id ? 'bookmark-edit' : undefined;
  if (target === 'cloud-file' && type === 'document' && !fileId) target = undefined;
  if (target === 'web-url' && !url) return null;
  if (target === 'temporary-document' && !url) target = undefined;
  if (target && TARGETS_REQUIRING_ID.has(target) && !id) return null;

  // 临时文档的签名 URL 可能过期，仍保留其静态来源信息；其他来源必须有稳定标识或安全 URL。
  if (!id && !url) return null;
  if (type === 'knowledge' && !id) return null;

  const title = boundedText(input.title || input.name || input.fileName || input.file_name || url || '未命名', 160);
  if (!title) return null;
  const excerpt = boundedText(input.excerpt || input.content || input.description, 240);
  const locatorValue = boundedText(input.locatorValue, 160);
  const category = boundedText(input.category, 50);

  return {
    type,
    id,
    title,
    ...(url ? { url } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(target ? { target } : {}),
    ...(documentId ? { documentId } : {}),
    ...(fileId ? { fileId } : {}),
    ...(['temporary', 'cloud'].includes(input.sourceType) ? { sourceType: input.sourceType } : {}),
    ...(['page', 'section', 'row', 'paragraph'].includes(input.locatorType) ? { locatorType: input.locatorType } : {}),
    ...(locatorValue ? { locatorValue } : {}),
    ...(category ? { category } : {}),
    ...(['public', 'internal'].includes(input.status) ? { status: input.status } : {}),
    ...(typeof input.hasSnapshot === 'boolean' ? { hasSnapshot: input.hasSnapshot } : {}),
  };
}

function sourceIdentity(source) {
  if (source.type === 'document') return `document:${source.documentId || source.fileId || source.id}`;
  if (source.type === 'web') return `web:${source.url}`;
  return `${source.type}:${source.id}`;
}

export function dedupeAgentSources(inputs) {
  const seen = new Set();
  const output = [];
  for (const input of Array.isArray(inputs) ? inputs : []) {
    const source = normalizeAgentSource(input);
    if (!source) continue;
    const identity = sourceIdentity(source);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    output.push(source);
  }
  return output;
}

function defaultRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  return raw?.id ? [raw] : [];
}

function defaultSourceFromRow(tool, row) {
  const type = tool.sourceType;
  const url = type === 'bookmark' ? row.url : undefined;
  const target =
    typeof tool.sourceTarget === 'function'
      ? tool.sourceTarget(row)
      : tool.sourceTarget || inferTarget(type, normalizeSourceUrl(url));
  return {
    type,
    id: row.id ?? row.slug ?? row.fileId ?? row.file_id,
    title: row.title || row.name || row.fileName || row.file_name,
    url,
    excerpt: row.excerpt || row.content || row.description,
    target,
    hasSnapshot: typeof row.hasSnapshot === 'boolean' ? row.hasSnapshot : undefined,
  };
}

export function resolveToolSources(tool, raw, args, ctx) {
  try {
    const candidates =
      typeof tool?.toSources === 'function'
        ? tool.toSources(raw, args, ctx)
        : tool?.sourceType
          ? (typeof tool.sourceRows === 'function' ? tool.sourceRows(raw) : defaultRows(raw))
              .slice(0, 10)
              .map((row) => defaultSourceFromRow(tool, row))
          : [];
    return dedupeAgentSources(candidates).slice(0, 10);
  } catch (error) {
    console.error(`[Agent] 来源提取失败 tool=${tool?.name || 'unknown'}:`, error?.message || error);
    return [];
  }
}
