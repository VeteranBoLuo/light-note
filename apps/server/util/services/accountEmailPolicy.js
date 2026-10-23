import { createHash } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';

export const emailDigest = (value) => createHash('sha256').update(String(value)).digest('hex');
export const normalizeAccountEmail = (value) => (typeof value === 'string' ? value.trim() : '');
export const emailIdentity = (value) => normalizeAccountEmail(value).toLowerCase();
export const isGitHubPlaceholderEmail = (value) => /@users\.noreply\.github\.com$/i.test(normalizeAccountEmail(value));

// 新邮箱保持产品的常规地址规则；巡检另允许 SMTP 标准域名形式，不能把支持范围当成格式错误。
export function parseAccountEmail(value, { healthCheck = false } = {}) {
  const email = normalizeAccountEmail(value);
  if (!email || email.length > 254 || /[\r\n\x00-\x1f\x7f]/.test(email)) return null;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at > 64) return null;
  const local = email.slice(0, at);
  // 引号内的空格和 @ 可以是合法地址，健康检查不能误报。
  if (!/^(?:"(?:[^"\\]|\\.)+"|[^\s@<>(),;:"\\]+)$/.test(local)) return null;
  if (!local.startsWith('"') && (local.startsWith('.') || local.endsWith('.') || local.includes('..'))) return null;
  const domainPart = email.slice(at + 1);
  if (healthCheck && domainPart.startsWith('[') && domainPart.endsWith(']')) {
    const literal = domainPart.slice(1, -1);
    const ipv6 = /^IPv6:/i.test(literal);
    if (isIP(ipv6 ? literal.slice(5) : literal) === (ipv6 ? 6 : 4)) {
      // IP 字面量无需 DNS；无法确认收信能力时保持未知，不主动连接该 IP。
      return { email, domain: null };
    }
    return null;
  }
  const domain = domainToASCII(domainPart).toLowerCase();
  if (!domain || domain.length > 253 || (!healthCheck && !domain.includes('.'))) return null;
  if (!domain.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
  return { email: `${local}@${domain}`, domain };
}

// 仅记录收件人阶段明确的 5.1.1（目标邮箱不存在）；550 本身也可能是反垃圾策略。
export function mailboxNotFoundError(error) {
  return (
    /^RCPT(?: TO)?$/i.test(String(error?.command || '')) &&
    Number(error?.responseCode) >= 500 &&
    Number(error?.responseCode) < 600 &&
    /\b5\.1\.1\b/.test(String(error?.response || ''))
  );
}

export async function inspectEmailDomain(domain, resolver = new Resolver({ timeout: 2000, tries: 1 })) {
  try {
    const mx = await resolver.resolveMx(domain);
    if (mx.length) return mx.every((entry) => !entry.exchange || entry.exchange === '.') ? 'DOMAIN_NO_MAIL' : null;
  } catch (error) {
    if (error.code === 'ENOTFOUND') return 'DOMAIN_NOT_FOUND';
    if (error.code !== 'ENODATA') return null;
  }
  // 没有 MX 仍可通过 A/AAAA 接收邮件，不能直接判无效（RFC 5321 implicit MX）。
  const addresses = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)]);
  if (addresses.some((result) => result.status === 'fulfilled' && result.value.length)) return null;
  if (
    addresses.every((result) => result.status === 'rejected' && ['ENOTFOUND', 'ENODATA'].includes(result.reason?.code))
  )
    return 'DOMAIN_NO_MAIL';
  return null;
}

export function accountEmailSnapshot(user) {
  return emailDigest(
    JSON.stringify([
      user.id,
      user.email,
      user.password,
      user.login_password_set,
      user.github_id,
      user.login_type,
      user.role,
    ]),
  );
}
