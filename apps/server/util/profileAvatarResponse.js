import { L, resultData } from './common.js';

export function sendProfileAvatar(req, res, source, {
  notFoundCode = 'COMMUNITY_CHAT_AUTHOR_AVATAR_NOT_FOUND',
  cacheControl = 'private, max-age=300',
} = {}) {
  res.set('Cache-Control', cacheControl);
  res.set('X-Content-Type-Options', 'nosniff');
  if (/^https?:\/\//i.test(source)) return res.redirect(302, source);

  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(source);
  const body = match ? Buffer.from(match[2], 'base64') : null;
  if (!match || !body?.length || body.length > 524288) {
    return res.status(404).send(resultData(
      { code: notFoundCode }, 404, L(req, '头像当前不可用', 'Avatar is unavailable'),
    ));
  }
  return res.type(match[1]).send(body);
}
