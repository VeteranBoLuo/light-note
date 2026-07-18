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
