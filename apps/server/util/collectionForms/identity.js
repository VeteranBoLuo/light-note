import crypto from 'node:crypto';
import { FormError } from '@lightnote/shared/collection-forms';

const COOKIE = 'ln_collection_visitor';
const TTL = 180 * 24 * 60 * 60 * 1000;
export function identityConfigured(env = process.env) {
  return String(env.COLLECTION_FORMS_IDENTITY_SECRET || '').trim().length >= 32;
}
export function requireIdentityConfig() {
  if (!identityConfigured()) throw new FormError('重复提交防护暂不可用，请稍后重试', 503);
}
function signature(value) {
  return crypto
    .createHmac('sha256', process.env.COLLECTION_FORMS_IDENTITY_SECRET.trim())
    .update('collection:v1:' + value)
    .digest('hex');
}
export function readIdentity(req) {
  if (!identityConfigured()) return null;
  const raw = String(req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);
  const match = /^([a-f0-9]{48})\.(\d{13})\.([a-f0-9]{64})$/.exec(raw || '');
  if (!match || Number(match[2]) <= Date.now() || Number(match[2]) > Date.now() + TTL + 60000) return null;
  const expected = signature(`${match[1]}.${match[2]}`);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(match[3])) ? match[1] : null;
}
export function renewIdentity(res, identity) {
  requireIdentityConfig();
  const id = identity || crypto.randomBytes(24).toString('hex');
  const value = `${id}.${Date.now() + TTL}`;
  res.cookie(COOKIE, `${value}.${signature(value)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/public/forms',
    maxAge: TTL,
  });
}
export function respondentHash(formId, identity) {
  return crypto.createHash('sha256').update(`collection:${formId}:${identity}`).digest('hex');
}
export function sameOrigin(req) {
  try {
    const origin = new URL(req.headers.origin);
    if (!['http:', 'https:'].includes(origin.protocol)) return false;
    if (origin.host === req.get('host') && origin.protocol === `${req.protocol}:`) return true;
    const loopback = (name) => ['localhost', '127.0.0.1', '[::1]'].includes(name);
    // Vite rewrites Host to the local API port. This exception never applies in production.
    return (
      process.env.NODE_ENV !== 'production' &&
      loopback(origin.hostname) &&
      loopback(new URL(`http://${req.get('host')}`).hostname)
    );
  } catch {
    return false;
  }
}
