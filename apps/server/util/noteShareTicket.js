import crypto from 'node:crypto';
import redisClient from './redisClient.js';

const TICKET_TTL_SECONDS = 30 * 60;
const KEY_PREFIX = 'note-share:session:';

function ticketKey(token) {
  const digest = crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
  return `${KEY_PREFIX}${digest}`;
}

export async function issueNoteShareTicket({ shareId, rootNoteId, ownerUserId, scopeType }) {
  const token = crypto.randomBytes(32).toString('base64url');
  await redisClient.setEx(
    ticketKey(token),
    TICKET_TTL_SECONDS,
    JSON.stringify({
      shareId: String(shareId),
      rootNoteId: String(rootNoteId),
      ownerUserId: String(ownerUserId),
      scopeType: String(scopeType),
    }),
  );
  return { token, expiresIn: TICKET_TTL_SECONDS };
}

export async function readNoteShareTicket(token) {
  const normalized = String(token || '').trim();
  if (normalized.length < 32 || normalized.length > 128) return null;
  const raw = await redisClient.get(ticketKey(normalized));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value?.shareId || !value?.rootNoteId || !value?.ownerUserId || !NOTE_SCOPE_SET.has(value.scopeType)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

const NOTE_SCOPE_SET = new Set(['single', 'subtree']);
