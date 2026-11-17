import path from 'node:path';
import { NOTE_IMAGE_DIR } from './noteImages.js';
import { isManagedUploadOrigin, managedUploadOrigins, uploadOrigin } from './uploadOrigin.js';
import { isPublicBookmarkIconFileName } from './bookmarkIconStorage.js';
import { adminNoteImageGrant, getAdminContextByDigest } from './adminContextStore.js';

const NOTE_IMAGE_FILE_PATTERN = /^[^/\\\x00-\x1f\[\]]{1,240}\.(?:png|jpe?g|webp|gif)$/iu;
const ADMIN_IMAGE_COOKIE_PREFIX = 'ln-note-preview-';
const CONTEXT_ID = /^[a-f0-9-]{36}$/;

export function isNoteImageFileName(value) {
  return typeof value === 'string' && !value.startsWith('.') &&
    NOTE_IMAGE_FILE_PATTERN.test(value) && !isPublicBookmarkIconFileName(value);
}

export function noteImageFileName(url) {
  try {
    const parsed = new URL(String(url || ''), uploadOrigin());
    if (!isManagedUploadOrigin(parsed.origin)) return '';
    const pathname = decodeURIComponent(parsed.pathname);
    const fileName = path.basename(pathname);
    return pathname === '/uploads/' + fileName && isNoteImageFileName(fileName) ? fileName : '';
  } catch {
    return '';
  }
}

export function noteImageUrlVariants(fileName) {
  const paths = [...new Set(['/uploads/' + fileName, '/uploads/' + encodeURIComponent(fileName)])];
  return [...paths, ...managedUploadOrigins().flatMap((origin) => paths.map((pathname) => origin + pathname))];
}

export async function canReadNoteImage({ db, userId, fileName }) {
  if (!userId || !isNoteImageFileName(fileName)) return false;
  const urls = noteImageUrlVariants(fileName);
  const placeholders = urls.map(() => '?').join(',');
  // Start with the original upload registrations. Historical shared locators
  // with conflicting owners must never yield bytes to either account.
  const [legacy] = await db.query(
    `SELECT DISTINCT n.create_by AS owner
       FROM note_images i INNER JOIN note n ON n.id = i.note_id
      WHERE i.url IN (${placeholders}) AND BINARY i.url IN (${placeholders}) LIMIT 2`,
    [...urls, ...urls],
  );
  if (legacy.length) return legacy.length === 1 && String(legacy[0].owner) === String(userId);
  // The asset ledger retains trusted ownership when a template or a note
  // history version is the remaining reference after the source is deleted.
  const [assets] = await db.query(
    `SELECT 1 FROM image_assets
      WHERE owner_user_id = ? AND source_type = 'note_image' AND storage_kind = 'local'
        AND BINARY source_locator = ? AND status <> 'deleting'
      LIMIT 1`,
    [userId, fileName],
  );
  return assets.length > 0;
}

// Native img elements have no application headers. A verified note request can
// give its root browser a temporary, uploads-only grant for that same context.
export function setAdminNoteImageGrant(req, res, next) {
  const context = req.adminContext;
  const maxAge = Date.parse(context?.expiresAt) - Date.now();
  if (req.adminContextToken && CONTEXT_ID.test(context?.id) && maxAge > 0) {
    res.cookie(ADMIN_IMAGE_COOKIE_PREFIX + context.id, adminNoteImageGrant(req.adminContextToken), {
      httpOnly: true,
      secure: Boolean(req.secure),
      sameSite: 'strict',
      path: '/uploads/',
      maxAge,
    });
  }
  next();
}

export async function canReadAdminNoteImage({ db, req, fileName, readContext = getAdminContextByDigest }) {
  const actor = req.user;
  if (req.adminContext || actor?.role !== 'root' || !actor.sessionId || !isNoteImageFileName(fileName) ||
    req.get('Sec-Fetch-Site') !== 'same-origin' || req.get('Sec-Fetch-Dest') !== 'image') return false;

  const candidates = String(req.headers.cookie || '').split(';').map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(ADMIN_IMAGE_COOKIE_PREFIX)).slice(-8);
  if (!candidates.length) return false;
  const contexts = await Promise.all(candidates.map(async (cookie) => {
    const [id, digest] = cookie.slice(ADMIN_IMAGE_COOKIE_PREFIX.length).split('=', 2);
    if (!CONTEXT_ID.test(id) || !digest) return null;
    const context = await readContext(digest);
    return context && context.id === id && context.actorUserId === actor.id &&
      context.actorSessionId === actor.sessionId && Date.parse(context.expiresAt) > Date.now()
      ? context.subjectUserId : null;
  }));
  const subjectIds = [...new Set(contexts.filter(Boolean))];
  if (!subjectIds.length) return false;
  const [subjects] = await db.query(
    `SELECT id FROM user WHERE id IN (${subjectIds.map(() => '?').join(',')}) AND role <> 'root'`, subjectIds,
  );
  for (const subject of subjects) {
    if (await canReadNoteImage({ db, userId: subject.id, fileName })) return true;
  }
  return false;
}

export function sendNoteImageFile(res, fileName, { shared = false, preview = false } = {}) {
  res.set('Cache-Control', shared || preview ? 'private, no-store' : 'private, no-cache');
  res.set('X-Content-Type-Options', 'nosniff');
  res.vary('Cookie');
  if (!shared) {
    res.vary('X-Session-Id');
    res.vary('X-Admin-Context');
  }
  res.sendFile(fileName, { root: NOTE_IMAGE_DIR, cacheControl: false }, (error) => {
    if (error && !res.headersSent) res.status(404).end();
    else if (error && !res.writableEnded) res.destroy(error);
  });
}
