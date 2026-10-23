import { noteSnapshot, bookmarkSnapshot } from '../communityFeed/resources.js';
import { requireBookmarkUrl } from '../bookmarkUrl.js';
import { digest, fail, first, PublicResourceError } from './core.js';
import { PUBLIC_RESOURCE_KINDS, PUBLIC_RESOURCE_LIMITS } from '@lightnote/shared/public-resources';

export function sourceInput(input) {
  if (
    !PUBLIC_RESOURCE_KINDS.includes(input.kind) ||
    typeof input.sourceId !== 'string' ||
    !input.sourceId.trim() ||
    input.sourceId.length > 64
  )
    fail('INVALID_INPUT');
}
function rejectUrlSecrets(value) {
  const url = new URL(value);
  const fragment = url.hash.slice(1);
  const hashQuery = fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment;
  const keys = [...url.searchParams.keys(), ...new URLSearchParams(hashQuery).keys()];
  const sensitive =
    /^(?:token|accessToken|refreshToken|idToken|shareToken|authToken|authorization|auth|ticket|accessTicket|shareTicket|shareKey|password|passcode|pwd|secret|apiKey|signature|xAmzSignature|xAmzCredential|xAmzSecurityToken|xGoogSignature|authKey|sessionId|sid|jwt)$/i;
  if (keys.some((key) => sensitive.test(key.replace(/[^a-z0-9]/gi, '')))) fail('INVALID_URL');
  // File-share tickets live in the path, including the legacy /share/:id/:token form.
  if (/^\/share\/(?:[^/]+\/)?[a-z0-9_-]{32,128}(?:\/|$)/i.test(decodeURIComponent(url.pathname))) fail('INVALID_URL');
  return value;
}
export function publicMaterial(kind, source) {
  const title = String(source.title || '').trim();
  if (!title || title.length > PUBLIC_RESOURCE_LIMITS.title) fail('INVALID_TITLE');
  try {
    const body =
      kind === 'note' ? noteSnapshot({ ...source, type: source.type === 'md' ? 'markdown' : source.type }) : '';
    const url =
      kind === 'bookmark'
        ? requireBookmarkUrl(rejectUrlSecrets(bookmarkSnapshot(source.url)), { allowTextExtraction: false })
            .canonicalUrl
        : '';
    if (url.length > PUBLIC_RESOURCE_LIMITS.url) fail('INVALID_URL');
    const description = kind === 'bookmark' ? String(source.description || '').trim() : '';
    if (description.length > PUBLIC_RESOURCE_LIMITS.description) fail('DESCRIPTION_TOO_LONG');
    const material = { kind, title, body, url, description };
    return { ...material, fingerprint: digest(material) };
  } catch (error) {
    if (error?.code?.startsWith('PUBLIC_RESOURCE_')) throw error;
    if (error?.code?.includes('TEXT_ONLY')) fail('TEXT_ONLY');
    if (error?.code?.includes('TOO_LARGE')) fail('TOO_LARGE');
    if (error?.code?.includes('EMPTY')) fail('EMPTY');
    fail('INVALID_URL');
  }
}
export async function loadSource(db, owner, kind, sourceId, { lock = false } = {}) {
  sourceInput({ kind, sourceId });
  const row = await first(
    db,
    kind === 'note'
      ? `SELECT title,content,type FROM note WHERE id=? AND create_by=? AND del_flag=0${lock ? ' FOR UPDATE' : ''}`
      : `SELECT name AS title,url,description FROM bookmark WHERE id=? AND user_id=? AND del_flag=0${lock ? ' FOR UPDATE' : ''}`,
    [sourceId, owner],
  );
  if (!row) fail('SOURCE_UNAVAILABLE', 404);
  return publicMaterial(kind, row);
}
export async function lockLiveSource(db, publication) {
  const note = publication.kind === 'note';
  const row = await first(
    db,
    `SELECT id FROM ${note ? 'note' : 'bookmark'} WHERE id=? AND ${note ? 'create_by' : 'user_id'}=? AND del_flag=0 FOR UPDATE`,
    [publication.source_id, publication.owner_id],
  );
  if (!row) fail('UNAVAILABLE', 404);
}

// Reuse the exact submission boundary before listing candidates. Only keys leave this helper.
// Read bounded batches, never one query per item or unbounded note bodies.
export async function supportedSourceKeys(db, owner, items) {
  const supported = new Set();
  for (const kind of PUBLIC_RESOURCE_KINDS) {
    const ids = [...new Set(items.filter((item) => item.kind === kind).map((item) => String(item.sourceId)))];
    for (let offset = 0; offset < ids.length; offset += 40) {
      const batch = ids.slice(offset, offset + 40),
        placeholders = batch.map(() => '?').join(',');
      const [rows] = await db.query(
        kind === 'note'
          ? `SELECT id,title,content,type FROM note WHERE create_by=? AND del_flag=0 AND OCTET_LENGTH(content)<=200000 AND id IN (${placeholders})`
          : `SELECT id,name AS title,url,description FROM bookmark WHERE user_id=? AND del_flag=0 AND CHAR_LENGTH(url)<=2048 AND COALESCE(CHAR_LENGTH(description),0)<=? AND id IN (${placeholders})`,
        [owner, ...(kind === 'bookmark' ? [PUBLIC_RESOURCE_LIMITS.description] : []), ...batch],
      );
      for (const row of rows) {
        try {
          publicMaterial(kind, row);
          supported.add(`${kind}:${row.id}`);
        } catch (error) {
          if (!(error instanceof PublicResourceError)) throw error;
        }
      }
    }
  }
  return supported;
}
