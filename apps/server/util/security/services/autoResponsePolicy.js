import { isIP } from 'node:net';

export const AUTO_RESPONSE_ACTOR = 'system:security-auto-v1';
const BAN_PREFIX = 'SECURITY_AUTO_PROBE_V1:';
const decode = (value) => {
  let result = String(value || '');
  for (let i = 0; i < 2; i++) {
    try {
      result = decodeURIComponent(result);
    } catch {
      return '';
    }
  }
  return result.replace(/\\/g, '/');
};
const sensitiveTarget = (value) =>
  /(?:^|\/)\.env(?:\.(?:local|production|development|backup))?(?:$|\/)|(?:^|\/)proc\/self\/environ$|(?:^|\/)etc\/passwd$/i.test(
    value,
  );

// Start with publicly routable IPv4 only. Uncertain/reserved sources stay for manual review.
export function isAutoResponseSource(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function automaticProbeEvidence(context, evidenceList, decision, statusCode) {
  if (
    context.visitorActor !== true ||
    !isAutoResponseSource(context.sourceIp) ||
    !['GET', 'HEAD'].includes(context.method) ||
    !decision.blocked ||
    Number(statusCode) !== 403
  )
    return null;
  const path = decode(context.path).replace(/^\/api\//, '/');
  // Business resource routes and content fields are never automatic-ban evidence.
  if (/^\/(?:bookmark|note|noteLibrary|file|cloudSpace|chat|toolbox|search|user|todo|community)(?:\/|$)/i.test(path))
    return null;
  return (
    evidenceList.find((e) => {
      if (
        e.detector !== 'signature' ||
        e.policyMode !== 'block' ||
        !(Number(e.confidence) >= 85) ||
        !(Number(e.scoreDelta) >= 50) ||
        e.exceptionIds?.length
      )
        return false;
      if (e.ruleCode === 'SENSITIVE_PATH_PROBE') return e.matchedField === 'path' && sensitiveTarget(path);
      if (e.ruleCode !== 'PATH_TRAVERSAL') return false;
      const value = decode(e.matchedValuePreview);
      return (
        (e.matchedField === 'path' || (path === '/console/api_server' && e.matchedField === 'query.apis')) &&
        /(?:^|\/)\.\.\//.test(value) &&
        sensitiveTarget(value)
      );
    }) || null
  );
}

export function automaticBanReason(eventIds) {
  return `${BAN_PREFIX}${eventIds.join(',')} 连续两次明确敏感文件探测，仅限制游客来源1小时`;
}
export function automaticBanEvents(reason) {
  const match = /^SECURITY_AUTO_PROBE_V1:([a-f0-9]{32}),([a-f0-9]{32}) /.exec(String(reason || ''));
  return match ? match.slice(1) : [];
}
export const isAutomaticProbeBan = (reputation) => automaticBanEvents(reputation?.ban_reason).length === 2;

export function effectiveSourceReputation(req, reputation) {
  if (req.user?.role === 'root') return { ...reputation, is_banned: 0, banned_until: null };
  if (!isAutomaticProbeBan(reputation)) return reputation;
  const member = req.user?.isAuthenticated === true && ['user', 'test'].includes(req.user.role);
  const authPath = String(req.path || '').replace(/^\/api\//, '/');
  const recovery =
    (req.method === 'POST' &&
      /^\/user\/(?:login|registerUser|sendEmail|verifyCode|configPassword|github(?:\/authorize)?|logout|extension\/exchange)\/?$/.test(
        authPath,
      )) ||
    (req.method === 'GET' && /^\/user\/(?:me|getUserInfo)\/?$/.test(authPath));
  return member || recovery ? { ...reputation, is_banned: 0, banned_until: null } : reputation;
}
