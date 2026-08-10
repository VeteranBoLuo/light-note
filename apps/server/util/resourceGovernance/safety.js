import { createHash } from 'node:crypto';
import path from 'node:path';
import { promises as fsP } from 'node:fs';
import pool from '../../db/index.js';
import { escapeLikePattern, NOTE_IMAGE_DIR } from '../noteImages.js';
import { resolveBookmarkIconUploadDir } from '../bookmarkIconStorage.js';

const SAFE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);
const SHARED_BOOKMARK_ICON_RE = /^bookmark-icon-[a-f0-9]{64}\.(?:png|svg|jpe?g|gif|webp|ico)$/i;
const NOTE_IMAGE_RE = /^note-[^/\\]+\.(?:png|svg|jpe?g|gif|webp|ico)$/i;

export function governanceFingerprint(issueCode, resourceType, stableTarget) {
  return createHash('sha256')
    .update(`${String(issueCode || '')}\0${String(resourceType || '')}\0${String(stableTarget || '')}`)
    .digest('hex');
}

export function evidenceHash(finding) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: String(finding?.id || ''),
        issueCode: String(finding?.issue_code || finding?.issueCode || ''),
        risk: String(finding?.risk_level || finding?.riskLevel || ''),
        observations: Number(finding?.observation_count || finding?.observationCount || 0),
        lastVerifiedAt: finding?.last_verified_at || finding?.lastVerifiedAt || null,
        evidence: parseJson(finding?.evidence_json ?? finding?.evidenceJson ?? finding?.evidence),
      }),
    )
    .digest('hex');
}

export function parseJson(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function classifyLocalImage(fileName) {
  const normalized = String(fileName || '');
  if (!normalized || normalized !== path.basename(normalized)) return 'unsupported';
  if (!SAFE_IMAGE_EXTENSIONS.has(path.extname(normalized).toLowerCase())) return 'unsupported';
  if (NOTE_IMAGE_RE.test(normalized)) return 'note';
  if (SHARED_BOOKMARK_ICON_RE.test(normalized)) return 'bookmark_icon';
  // 旧书签图标无法从文件名单独恢复可信 bookmarkId，禁止通用治理直接删除。
  return 'unsupported';
}

export function resolveGovernedImageRoots(env = process.env) {
  return [...new Set([path.resolve(NOTE_IMAGE_DIR), path.resolve(resolveBookmarkIconUploadDir(env))])];
}

export function resolveGovernedImagePath(root, fileName) {
  const resolvedRoot = path.resolve(String(root || ''));
  const normalized = String(fileName || '');
  if (!resolvedRoot || !normalized || normalized !== path.basename(normalized)) return null;
  const resolvedPath = path.resolve(resolvedRoot, normalized);
  if (path.dirname(resolvedPath) !== resolvedRoot) return null;
  return resolvedPath;
}

export async function hasAnyLocalImageReference(fileName, { db = pool } = {}) {
  const normalized = String(fileName || '');
  if (!normalized || normalized !== path.basename(normalized)) return true;
  const escaped = escapeLikePattern(normalized);
  const likeTail = `%/${escaped}%`;
  // 故意把软删除/回收站资源也算引用：只要还能恢复或仍有数据库关系，物理文件就必须保留。
  const checks = [
    ['SELECT 1 FROM note_images WHERE url LIKE ? LIMIT 1', [likeTail]],
    // note_images 是当前写链路的权威登记，但历史数据可能在正文已有图片、登记行尚未补齐。
    // 物理删除属于不可逆操作，因此再检查当前正文和可恢复版本，宁可多保留也不漏掉用户可见引用。
    ['SELECT 1 FROM note WHERE content LIKE ? LIMIT 1', [`%${escaped}%`]],
    ['SELECT 1 FROM note_versions WHERE content LIKE ? LIMIT 1', [`%${escaped}%`]],
    ['SELECT 1 FROM note_template WHERE content LIKE ? LIMIT 1', [`%${escaped}%`]],
    ['SELECT 1 FROM bookmark WHERE icon_url LIKE ? LIMIT 1', [likeTail]],
  ];
  for (const [sql, params] of checks) {
    const [rows] = await db.query(sql, params);
    if (rows?.length) return true;
  }
  return false;
}

export async function inspectLocalImage(locator, { db = pool, now = new Date(), env = process.env } = {}) {
  const parsed = parseJson(locator, null);
  const fileName = String(parsed?.fileName || '');
  const root = String(parsed?.root || '');
  const roots = resolveGovernedImageRoots(env);
  const resolvedRoot = path.resolve(root || '.');
  if (!roots.includes(resolvedRoot)) return { eligible: false, resultCode: 'IMAGE_ROOT_NOT_ALLOWED' };
  const filePath = resolveGovernedImagePath(resolvedRoot, fileName);
  if (!filePath) return { eligible: false, resultCode: 'IMAGE_PATH_INVALID' };
  const kind = classifyLocalImage(fileName);
  if (kind === 'unsupported') return { eligible: false, resultCode: 'IMAGE_KIND_UNSUPPORTED' };

  let stat;
  try {
    stat = await fsP.lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { eligible: false, missing: true, resultCode: 'IMAGE_ALREADY_MISSING' };
    return { eligible: false, resultCode: 'IMAGE_STAT_FAILED' };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return { eligible: false, resultCode: 'IMAGE_NOT_REGULAR_FILE' };
  }
  const minAgeMs = 24 * 60 * 60 * 1000;
  if (now.getTime() - stat.mtimeMs < minAgeMs) {
    return { eligible: false, resultCode: 'IMAGE_COOLDOWN_ACTIVE', bytes: stat.size, mtime: stat.mtime };
  }
  if (await hasAnyLocalImageReference(fileName, { db })) {
    return { eligible: false, referenced: true, resultCode: 'IMAGE_REFERENCED', bytes: stat.size, mtime: stat.mtime };
  }
  return {
    eligible: true,
    resultCode: 'IMAGE_UNREFERENCED',
    fileName,
    filePath,
    kind,
    bytes: Number(stat.size || 0),
    mtime: stat.mtime,
    mtimeMs: Number(stat.mtimeMs || 0),
    inode: Number(stat.ino || 0),
    device: Number(stat.dev || 0),
  };
}

export function hasExistingOwnerRow(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

export async function verifyOwnerMissing(ownerId, { db = pool } = {}) {
  const normalized = String(ownerId || '').trim();
  if (!normalized) return false;
  const [rows] = await db.query('SELECT id FROM user WHERE id = ? LIMIT 1', [normalized]);
  // 用户行只要存在（包括 del_flag=1），就绝不能视为无主资源。
  return !hasExistingOwnerRow(rows);
}
