import crypto from 'node:crypto';
import redisClient from '../redisClient.js';

const TICKET_TTL_SECONDS = 15 * 60;
const KEY_PREFIX = 'file-preview:share-ticket:';

function ticketKey(token) {
  const digest = crypto
    .createHash('sha256')
    .update(String(token || ''), 'utf8')
    .digest('hex');
  return `${KEY_PREFIX}${digest}`;
}

export async function issueFilePreviewShareTicket({ shareId, fileId, ownerUserId }) {
  const token = crypto.randomBytes(32).toString('base64url');
  await redisClient.setEx(
    ticketKey(token),
    TICKET_TTL_SECONDS,
    JSON.stringify({
      shareId: String(shareId),
      fileId: String(fileId),
      ownerUserId: String(ownerUserId),
    }),
  );
  return { token, expiresIn: TICKET_TTL_SECONDS };
}

export async function readFilePreviewShareTicket(token) {
  const normalized = String(token || '').trim();
  if (normalized.length < 32 || normalized.length > 128) return null;
  const raw = await redisClient.get(ticketKey(normalized));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value?.shareId || !value?.fileId || !value?.ownerUserId) return null;
    return value;
  } catch {
    return null;
  }
}
