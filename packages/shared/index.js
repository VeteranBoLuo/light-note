// 轻笺前后端共享契约 —— 单一来源,改这里前后端同步生效。
// 这些是 resultData 的「业务 status」(HTTP 始终 200,除少数显式 res.status)。
export const STATUS = Object.freeze({
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BANNED: 423,
  SERVER_ERROR: 500,
  // 游客只读预览:写操作返回此状态,前端弹注册软引导。
  // 红线:不可用 401/403/'visitor' 代替(前端会当成会话过期/硬错误)。
  PREVIEW: 'preview',
  // 会话失效 / 游客身份信号。
  VISITOR: 'visitor',
});

export const BOOKMARK_URL_STATE = Object.freeze({
  VALID: 'valid',
  NORMALIZED: 'normalized',
  NEEDS_CONFIRMATION: 'needs_confirmation',
  INVALID: 'invalid',
});

export const BOOKMARK_URL_CODE = Object.freeze({
  OK: 'OK',
  EMPTY: 'EMPTY',
  TOO_LONG: 'TOO_LONG',
  INVALID_FORMAT: 'INVALID_FORMAT',
  UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
  CREDENTIALS_NOT_ALLOWED: 'CREDENTIALS_NOT_ALLOWED',
  URL_TOO_LONG: 'URL_TOO_LONG',
  CANDIDATE_CONFIRMATION_REQUIRED: 'CANDIDATE_CONFIRMATION_REQUIRED',
});

const MAX_BOOKMARK_URL_LENGTH = 255;
const MAX_BOOKMARK_INPUT_LENGTH = 4000;
const MAX_BOOKMARK_URL_CANDIDATES = 5;
const TRAILING_PUNCTUATION = /[，。；！？、）》】」』〉,.;!?)\]}]+$/u;
const FORBIDDEN_URL_CHARACTERS = /[\u0000-\u001f\u007f<>"'`]/u;

function cleanBookmarkUrlInput(value) {
  return String(value || '')
    .replace(/[\u200b-\u200d\ufeff]/gu, '')
    .trim();
}

function stripTrailingPunctuation(value) {
  return String(value || '').replace(TRAILING_PUNCTUATION, '');
}

function parseHttpUrlCandidate(value, { allowEncodedSchemeWhitespaceRepair = false } = {}) {
  let input = stripTrailingPunctuation(cleanBookmarkUrlInput(value));
  if (!input || /\s/u.test(input) || FORBIDDEN_URL_CHARACTERS.test(input)) return null;

  if (allowEncodedSchemeWhitespaceRepair) {
    input = input.replace(/^(https?:\/\/)(?:(?:%20|%09|%0a|%0d)+)/iu, '$1');
  }
  if (/^\/\//u.test(input)) input = `https:${input}`;

  const hasScheme = /^[a-z][a-z\d+.-]*:/iu.test(input);
  if (!hasScheme) input = `https://${input}`;

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (!parsed.hostname || parsed.username || parsed.password) return null;
  const hostname = parsed.hostname.replace(/^\[/u, '').replace(/\]$/u, '').toLowerCase();
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname);
  const isIpv6 = hostname.includes(':');
  if (!hostname.includes('.') && hostname !== 'localhost' && !isIpv4 && !isIpv6) return null;
  const canonicalUrl = parsed.pathname === '/' && !parsed.search && !parsed.hash ? parsed.origin : parsed.href;
  if (FORBIDDEN_URL_CHARACTERS.test(canonicalUrl) || canonicalUrl.length > MAX_BOOKMARK_URL_LENGTH) return null;
  return canonicalUrl;
}

function addCandidate(target, value, source, options = {}) {
  const url = parseHttpUrlCandidate(value, options);
  if (!url || target.some((candidate) => candidate.url === url)) return false;
  target.push({ url, source });
  return true;
}

function extractBookmarkUrlCandidates(input) {
  const candidates = [];
  const prepared = input.replace(/\b(https?)\s*:\s*\/\s*\/\s*/giu, '$1://');
  const consumedExplicitRanges = [];

  const explicitPattern = /https?:\/\/[^\s<>"'`，。；！？、（）【】《》]+/giu;
  for (const match of prepared.matchAll(explicitPattern)) {
    const added = addCandidate(candidates, match[0], 'explicit', { allowEncodedSchemeWhitespaceRepair: true });
    if (added) consumedExplicitRanges.push([match.index, match.index + match[0].length]);
    if (candidates.length >= MAX_BOOKMARK_URL_CANDIDATES) return candidates;
  }

  const domainSource = [...prepared];
  for (const [start, end] of consumedExplicitRanges) {
    for (let index = start; index < end; index += 1) domainSource[index] = ' ';
  }
  const domainPattern = /(^|[^\p{L}\p{N}@._-])((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,63})(?::\d{1,5})?(?:[/?#][^\s<>"'`，。；！？、（）【】《》]*)?)/giu;
  for (const match of domainSource.join('').matchAll(domainPattern)) {
    addCandidate(candidates, match[2], 'domain');
    if (candidates.length >= MAX_BOOKMARK_URL_CANDIDATES) return candidates;
  }
  return candidates;
}

function invalidBookmarkUrl(code, input = '') {
  return {
    state: BOOKMARK_URL_STATE.INVALID,
    code,
    originalInput: input,
    canonicalUrl: '',
    candidates: [],
  };
}

/**
 * 确定性解析用户输入的书签地址。AI 只能补名称/描述/标签，不参与最终 URL 判定。
 *
 * - 纯网址（含裸域名、`https:example.com`）会安全规范化；
 * - 分享文案、协议后空格、多地址文本只提取候选，必须由用户确认；
 * - 无候选、非 HTTP(S)、带账号密码或超长地址直接判无效。
 */
export function resolveBookmarkUrlInput(
  value,
  { allowTextExtraction = true, maxInputLength = MAX_BOOKMARK_INPUT_LENGTH } = {},
) {
  const input = cleanBookmarkUrlInput(value);
  if (!input) return invalidBookmarkUrl(BOOKMARK_URL_CODE.EMPTY);
  if (input.length > maxInputLength) return invalidBookmarkUrl(BOOKMARK_URL_CODE.TOO_LONG, input);

  const protocol = input.match(/^([a-z][a-z\d+.-]*):/iu)?.[1]?.toLowerCase();
  if (protocol && !['http', 'https'].includes(protocol)) {
    return invalidBookmarkUrl(BOOKMARK_URL_CODE.UNSUPPORTED_PROTOCOL, input);
  }
  if (/^https?:\/\/[^/\s]*@/iu.test(input)) {
    return invalidBookmarkUrl(BOOKMARK_URL_CODE.CREDENTIALS_NOT_ALLOWED, input);
  }
  if (input.length > MAX_BOOKMARK_URL_LENGTH && !/\s/u.test(input)) {
    return invalidBookmarkUrl(BOOKMARK_URL_CODE.URL_TOO_LONG, input);
  }

  const exactUrl = parseHttpUrlCandidate(input);
  if (exactUrl) {
    return {
      state: exactUrl === input ? BOOKMARK_URL_STATE.VALID : BOOKMARK_URL_STATE.NORMALIZED,
      code: BOOKMARK_URL_CODE.OK,
      originalInput: input,
      canonicalUrl: exactUrl,
      candidates: [],
    };
  }

  if (!allowTextExtraction) return invalidBookmarkUrl(BOOKMARK_URL_CODE.INVALID_FORMAT, input);
  const candidates = extractBookmarkUrlCandidates(input);
  if (candidates.length) {
    return {
      state: BOOKMARK_URL_STATE.NEEDS_CONFIRMATION,
      code: BOOKMARK_URL_CODE.CANDIDATE_CONFIRMATION_REQUIRED,
      originalInput: input,
      canonicalUrl: '',
      candidates,
    };
  }
  return invalidBookmarkUrl(BOOKMARK_URL_CODE.INVALID_FORMAT, input);
}

// ————————————————————————————————————————————————————————————————
// 笔记内联提及(N0)· 站内资源引用 canonical 协议(D3)。前后端唯一事实源:
//   note     -> /noteLibrary/{id}
//   bookmark -> /manage/editBookmark/{id}
//   file     -> /cloudSpace?fileId={id}
// 纯字符串处理,无 DOM / DB / marked / cheerio 依赖。exact + safe:
//   - 只接受站内相对路径,拒绝外链 / 协议 / 协议相对(//)。
//   - note / bookmark 不接受任何 query 或 hash;file 只接受恰好一个 fileId 参数,且无 hash。
//   - id 必须 URI 解码成功、非空、长度 <= 255、不含正/反斜杠或控制字符(防路由分段逃逸)。
// ————————————————————————————————————————————————————————————————

export const RESOURCE_REF_TYPES = Object.freeze(['note', 'bookmark', 'file']);

const MAX_RESOURCE_ID_LENGTH = 255; // 与 note.id / bookmark.id / files.id 的 VARCHAR(255) 对齐
// 会改变路由分段或不可能出现在真实资源 id 中的危险字符:控制字符、DEL、正/反斜杠。
const UNSAFE_RESOURCE_ID_CHARS = /[\u0000-\u001f\u007f/\\]/;

/** 把历史类型值 `md` 归一为 `markdown`;其余原样字符串化。笔记类型归一的单一事实源。 */
export function normalizeNoteType(type) {
  if (type === 'md') return 'markdown';
  return type == null ? '' : String(type);
}

/** 校验并解码单个资源 id;非法(编码失败/空/超长/含危险字符)返回 null。 */
function normalizeResourceId(rawSegment) {
  if (typeof rawSegment !== 'string' || rawSegment === '') return null;
  let decoded;
  try {
    decoded = decodeURIComponent(rawSegment);
  } catch {
    return null; // 非法百分号编码,如 %ZZ
  }
  if (!decoded || decoded.length > MAX_RESOURCE_ID_LENGTH) return null;
  if (UNSAFE_RESOURCE_ID_CHARS.test(decoded)) return null;
  return decoded;
}

/**
 * 解析 canonical href 为 { type, id };不符合 exact 协议或 id 不安全时返回 null。
 * @param {unknown} href
 * @returns {{type:'note'|'bookmark'|'file', id:string}|null}
 */
export function parseResourceHref(href) {
  if (typeof href !== 'string') return null;
  const raw = href.trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return null; // 仅站内相对路径
  if (raw.includes('#')) return null; // 首期不支持锚点

  const qIndex = raw.indexOf('?');
  const path = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const query = qIndex === -1 ? '' : raw.slice(qIndex + 1);

  let m = path.match(/^\/noteLibrary\/([^/]+)$/);
  if (m) {
    if (query) return null; // note 不接受 query
    const id = normalizeResourceId(m[1]);
    return id ? { type: 'note', id } : null;
  }
  m = path.match(/^\/manage\/editBookmark\/([^/]+)$/);
  if (m) {
    if (query) return null; // bookmark 不接受 query
    const id = normalizeResourceId(m[1]);
    return id ? { type: 'bookmark', id } : null;
  }
  if (path === '/cloudSpace') {
    if (!query) return null;
    // 只接受恰好一个 fileId 参数,拒绝额外 / 重复参数
    const pairs = query.split('&');
    if (pairs.length !== 1) return null;
    const eq = pairs[0].indexOf('=');
    if (eq === -1) return null;
    if (pairs[0].slice(0, eq) !== 'fileId') return null;
    const id = normalizeResourceId(pairs[0].slice(eq + 1));
    return id ? { type: 'file', id } : null;
  }
  return null;
}

/** 由 { type, id } 构造 canonical href;id 缺失/超长/含危险字符时返回 ''(与 parse 对称)。 */
export function buildResourceHref(ref) {
  if (!ref || typeof ref.id !== 'string' || !ref.id) return '';
  if (ref.id.length > MAX_RESOURCE_ID_LENGTH || UNSAFE_RESOURCE_ID_CHARS.test(ref.id)) return '';
  const id = encodeURIComponent(ref.id);
  switch (ref.type) {
    case 'note':
      return `/noteLibrary/${id}`;
    case 'bookmark':
      return `/manage/editBookmark/${id}`;
    case 'file':
      return `/cloudSpace?fileId=${id}`;
    default:
      return '';
  }
}

/** 由安全 ref 生成 HTML anchor 的增强属性(仅增强,非事实源)。 */
export function buildResourceAnchorAttrs(ref) {
  return { 'data-ln-resource-type': ref.type, 'data-ln-resource-id': ref.id };
}

/** 把一组 href 归一为去重、保序的引用集合(前端装饰 / 后端同步共用口径)。 */
export function dedupeResourceRefs(hrefs) {
  const seen = new Set();
  const out = [];
  for (const href of hrefs || []) {
    const ref = parseResourceHref(href);
    if (!ref) continue;
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/**
 * 前后端共享测试向量:任一端改协议都会让双方 parse 断言同时失败,杜绝漂移。
 * 覆盖三类合法 + 外链/协议/编码错误/分段逃逸/额外·重复 query/空·超长 id/危险协议。
 */
export const RESOURCE_REF_TEST_VECTORS = Object.freeze([
  // 合法
  { href: '/noteLibrary/abc-123', ref: { type: 'note', id: 'abc-123' } },
  { href: '/manage/editBookmark/bk-9', ref: { type: 'bookmark', id: 'bk-9' } },
  { href: '/cloudSpace?fileId=f-7', ref: { type: 'file', id: 'f-7' } },
  {
    href: '/noteLibrary/550e8400-e29b-41d4-a716-446655440000',
    ref: { type: 'note', id: '550e8400-e29b-41d4-a716-446655440000' },
  },
  { href: '/noteLibrary/id%20with%20space', ref: { type: 'note', id: 'id with space' } },
  // 外链 / 协议 / 协议相对
  { href: 'https://example.com/noteLibrary/x', ref: null },
  { href: '//evil.com/noteLibrary/x', ref: null },
  { href: 'javascript:alert(1)', ref: null },
  // 缺失 / 多段 / 非详情路径
  { href: '/noteLibrary', ref: null },
  { href: '/noteLibrary/a/b', ref: null },
  { href: '/cloudSpace', ref: null },
  { href: '/manage/bookmarkMg', ref: null },
  // note / bookmark 带 query 或 hash(非 exact)
  { href: '/noteLibrary/n1?unexpected=1', ref: null },
  { href: '/manage/editBookmark/b1?x=1', ref: null },
  { href: '/noteLibrary/n1#frag', ref: null },
  // file 额外 / 重复 / 缺失参数,或带 hash
  { href: '/cloudSpace?fileId=f1&extra=1', ref: null },
  { href: '/cloudSpace?fileId=f1&fileId=f2', ref: null },
  { href: '/cloudSpace?folderId=x&fileId=f8', ref: null },
  { href: '/cloudSpace?fileId=', ref: null },
  { href: '/cloudSpace?fileId=f1#frag', ref: null },
  // 编码错误 / 分段逃逸 / 超长 id
  { href: '/noteLibrary/%ZZ', ref: null },
  { href: '/noteLibrary/id-with%2Fslash', ref: null },
  { href: `/noteLibrary/${'a'.repeat(256)}`, ref: null },
]);
