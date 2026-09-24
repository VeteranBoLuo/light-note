// 管理员复现摘要。只显式投影结构化参数，不递归复制请求或模型上下文。
const QUERY_KEYS = new Set(['id', 'v', 'p', 'page', 'aid', 'bvid']);
const OPERATIONS = new Set(['polish', 'rewrite', 'summarize', 'expand', 'proofread', 'title', 'outline', 'translate']);

export function diagnosticUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    let redacted = Boolean(url.username || url.password || url.hash);
    url.username = '';
    url.password = '';
    url.hash = '';
    const query = new URLSearchParams();
    for (const [key, item] of url.searchParams) {
      if (QUERY_KEYS.has(key) && /^[a-zA-Z0-9_-]{1,64}$/.test(item)) query.append(key, item);
      else redacted = true;
    }
    url.search = query.toString();
    return { url: url.href, urlRedacted: redacted };
  } catch {
    return null;
  }
}

export function buildAiInputDiagnostics(request = {}) {
  const input = request.input || {};
  const fields = {};
  if (request.skillId === 'bookmark.parse_url') {
    Object.assign(fields, diagnosticUrl(input.url));
    fields.pageContextProvided = Boolean(input.pageContext);
  }
  if (request.skillId === 'note.transform_text' && OPERATIONS.has(input.operation)) fields.operation = input.operation;
  if (['concise', 'balanced', 'detailed'].includes(input.detailLevel)) fields.detailLevel = input.detailLevel;
  if (Number.isSafeInteger(input.targetLength) && input.targetLength >= 50 && input.targetLength <= 10000) {
    fields.targetLength = input.targetLength;
  }
  if (Array.isArray(input.resourceTypes)) {
    fields.resourceTypes = [
      ...new Set(input.resourceTypes.filter((type) => ['note', 'bookmark', 'file', 'todo'].includes(type))),
    ];
  }
  return Object.keys(fields).length ? { version: 1, ...fields } : null;
}

// 读取时再次投影白名单，防止未来字段或异常历史数据意外外泄。
export function readAiInputDiagnostics(value, skillId) {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (!data || data.version !== 1) return null;
    const result = buildAiInputDiagnostics({ skillId, input: { ...data, pageContext: data.pageContextProvided } });
    if (result?.url) result.urlRedacted = result.urlRedacted || data.urlRedacted === true;
    return result;
  } catch {
    return null;
  }
}
