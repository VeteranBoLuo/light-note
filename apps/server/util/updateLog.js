const UPDATE_LOG_IMAGE_ROUTE_PREFIX = '/api/updateLog/image/';

export const UPDATE_LOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const UPDATE_LOG_IMAGE_TYPES = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
});

export function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [...fallback];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function stripLegacyHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

export function formatDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return year >= 1000 && year <= 9999 ? `${year}-${month}-${day}` : '';
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return '';

  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return '';
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function normalizeUpdateLogRecord(row = {}) {
  const highlights = parseJsonArray(row.highlights).map(stripLegacyHtml).filter(Boolean);
  const tags = parseJsonArray(row.tags).map(stripLegacyHtml).filter(Boolean);
  const imageKeys = parseJsonArray(row.image_keys ?? row.imageKeys)
    .map(String)
    .filter(Boolean);
  const title = stripLegacyHtml(row.title || row.label || '');
  const publishDate = formatDateOnly(row.publish_date || row.publishDate || row.time);
  const contentMarkdown = String(row.content_markdown ?? row.contentMarkdown ?? '');
  const summary = stripLegacyHtml(row.summary || '');

  return {
    id: String(row.id || ''),
    title,
    publishDate,
    summary,
    highlights,
    tags,
    contentMarkdown,
    imageKeys,
    status: row.status === 'draft' ? 'draft' : 'published',
    sort: Number(row.sort || 0),
    createdTime: row.created_time || row.createdTime || '',
    updatedTime: row.updated_time || row.updatedTime || '',
    // 兼容工作台现有的更新摘要读模型，迁移期间不要求所有调用方同步切换字段。
    label: title,
    time: publishDate,
    list: highlights,
  };
}

export function normalizeLegacyUpdateLogs(rawContent) {
  let entries = rawContent;
  if (typeof entries === 'string') {
    try {
      entries = JSON.parse(entries);
    } catch {
      entries = [];
    }
  }
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry, index) =>
      normalizeUpdateLogRecord({
        id: `legacy-${index + 1}`,
        title: entry?.label,
        publishDate: entry?.time,
        summary: '',
        highlights: Array.isArray(entry?.list) ? entry.list : [],
        tags: [],
        contentMarkdown: '',
        imageKeys: [],
        status: 'published',
        sort: index,
      }),
    )
    .reverse();
}

export function normalizeUpdateLogInput(body = {}) {
  const title = stripLegacyHtml(body.title || '').replace(/\s+/g, ' ');
  const publishDate = formatDateOnly(body.publishDate);
  const summary = stripLegacyHtml(body.summary || '').replace(/\s+/g, ' ');
  const contentMarkdown = String(body.contentMarkdown || '');
  const status = body.status === 'published' ? 'published' : 'draft';
  const highlights = (Array.isArray(body.highlights) ? body.highlights : [])
    .map((item) => stripLegacyHtml(item || '').replace(/\s+/g, ' '))
    .filter(Boolean);
  const tags = (Array.isArray(body.tags) ? body.tags : [])
    .map((item) => stripLegacyHtml(item || '').replace(/\s+/g, ' '))
    .filter(Boolean);

  if (!title || title.length > 200) {
    return { error: 'INVALID_TITLE' };
  }
  if (!publishDate) {
    return { error: 'INVALID_PUBLISH_DATE' };
  }
  if (summary.length > 500) {
    return { error: 'SUMMARY_TOO_LONG' };
  }
  if (contentMarkdown.length > 200000) {
    return { error: 'CONTENT_TOO_LONG' };
  }
  if (highlights.length > 30 || highlights.some((item) => item.length > 500)) {
    return { error: 'INVALID_HIGHLIGHTS' };
  }
  if (tags.length > 12 || tags.some((item) => item.length > 30)) {
    return { error: 'INVALID_TAGS' };
  }
  if (status === 'published' && !contentMarkdown.trim() && highlights.length === 0) {
    return { error: 'EMPTY_PUBLISHED_CONTENT' };
  }

  return {
    value: {
      title,
      publishDate,
      summary,
      highlights,
      tags: [...new Set(tags)],
      contentMarkdown,
      status,
    },
  };
}

export function updateLogImageObjectKey(logId, fileName) {
  return `update-logs/${logId}/${fileName}`;
}

export function updateLogImagePublicUrl(logId, objectKey) {
  const prefix = `update-logs/${logId}/`;
  if (!String(objectKey).startsWith(prefix)) return '';
  const fileName = String(objectKey).slice(prefix.length);
  if (!fileName || fileName.includes('/')) return '';
  return `${UPDATE_LOG_IMAGE_ROUTE_PREFIX}${encodeURIComponent(logId)}/${encodeURIComponent(fileName)}`;
}

export function extractUpdateLogImageKeys(markdown = '', logId = '') {
  if (!markdown || !logId) return [];
  const escapedId = encodeURIComponent(String(logId));
  const pattern = new RegExp(
    `${UPDATE_LOG_IMAGE_ROUTE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${escapedId}/([^\\s)"'<>]+)`,
    'g',
  );
  const keys = new Set();
  let match;
  while ((match = pattern.exec(String(markdown)))) {
    try {
      const fileName = decodeURIComponent(match[1]);
      if (!fileName || fileName.includes('/') || fileName.includes('\\')) continue;
      keys.add(updateLogImageObjectKey(logId, fileName));
    } catch {
      // 非法 URL 编码不进入资源集合，保存校验会把它视为普通不可用链接。
    }
  }
  return [...keys];
}

export function validateUpdateLogImage(file) {
  if (!file) return { error: 'IMAGE_REQUIRED' };
  const extension = UPDATE_LOG_IMAGE_TYPES[String(file.mimetype || '').toLowerCase()];
  if (!extension) return { error: 'IMAGE_TYPE_UNSUPPORTED' };
  const size = Number(file.size || 0);
  if (!Number.isFinite(size) || size <= 0 || size > UPDATE_LOG_IMAGE_MAX_BYTES) {
    return { error: 'IMAGE_SIZE_INVALID' };
  }
  return { value: { extension, size, contentType: String(file.mimetype).toLowerCase() } };
}
