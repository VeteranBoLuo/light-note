const EXPLICIT_WEB_URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/i;
const ASCII_URL_CHARACTER_PATTERN = /[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]/;

function normalizeCandidateUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

function candidateLiterals(value) {
  const raw = String(value || '').trim();
  const normalized = normalizeCandidateUrl(value);
  if (!normalized) return [];
  const literals = new Set();
  for (const candidate of [raw, normalized]) {
    literals.add(candidate);
    if (candidate.endsWith('/')) literals.add(candidate.slice(0, -1));
    const withoutProtocol = candidate.replace(/^https?:\/\//i, '');
    literals.add(withoutProtocol);
    if (withoutProtocol.endsWith('/')) literals.add(withoutProtocol.slice(0, -1));
  }
  return [...literals].filter(Boolean).sort((left, right) => right.length - left.length);
}

function containsBoundedLiteral(message, literal) {
  let offset = 0;
  while (offset <= message.length - literal.length) {
    const index = message.indexOf(literal, offset);
    if (index < 0) return false;
    const before = index > 0 ? message[index - 1] : '';
    const after = message[index + literal.length] || '';
    if (
      (!before || !ASCII_URL_CHARACTER_PATTERN.test(before)) &&
      (!after || !ASCII_URL_CHARACTER_PATTERN.test(after))
    ) {
      return true;
    }
    offset = index + 1;
  }
  return false;
}

/**
 * 只判断用户是否在本轮原话中显式提供了网页地址，不抽取或授权具体目标。
 * 具体工具参数仍需通过 isAgentUrlAllowedByScope() 与原话逐字求交。
 */
export function hasExplicitWebUrl(message) {
  return EXPLICIT_WEB_URL_PATTERN.test(String(message || ''));
}

/**
 * externalWeb 允许未来的广泛联网能力；关闭时，read_url 只能访问用户本轮原话中
 * 明确出现的 URL。边界检查允许中文紧跟链接，也避免把更长域名或路径的前缀误授权。
 */
export function isAgentUrlAllowedByScope({ message, url, externalWeb = false } = {}) {
  if (externalWeb === true) return Boolean(normalizeCandidateUrl(url));
  const text = String(message || '');
  return candidateLiterals(url).some((literal) => containsBoundedLiteral(text, literal));
}
