import { IMAGE_PREVIEW_SOURCES } from '@lightnote/shared';
import pool from '../../db/index.js';
import { createDownloadSignedUrl } from '../obsClient.js';
import { imageError } from './compress.js';
import { imageSourceAdapters } from './sourceAdapters.js';

const signedUrls = new Map();
function cachedSignedUrl(artifact, sign, maxAge = 600) {
  const key = `${artifact.id}:${artifact.artifact_object_key}:${maxAge}`;
  const cached = signedUrls.get(key);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached;
  const result = {
    url: sign({ objectKey: artifact.artifact_object_key, expires: maxAge }).url,
    expiresAt: Date.now() + maxAge * 1000,
  };
  signedUrls.set(key, result);
  while (signedUrls.size > 2000) signedUrls.delete(signedUrls.keys().next().value);
  return result;
}
export function previewDescriptor(sourceType, sourceId) {
  return {
    sourceType,
    sourceId: String(sourceId),
    profile: 'card',
    assetId: null,
    status: 'queued',
    url: null,
    expiresAt: null,
  };
}
export function validateResolveItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw imageError('IMAGE_PREVIEW_REQUEST_INVALID');
  return items.map((item) => {
    if (
      !item ||
      Object.keys(item).some((k) => !['sourceType', 'sourceId', 'profile'].includes(k)) ||
      !IMAGE_PREVIEW_SOURCES.includes(item.sourceType) ||
      !/^[\w-]{1,255}$/.test(String(item.sourceId || '')) ||
      (item.profile && item.profile !== 'card')
    )
      throw imageError('IMAGE_PREVIEW_REQUEST_INVALID');
    return { sourceType: item.sourceType, sourceId: String(item.sourceId), profile: 'card' };
  });
}
export async function resolveImagePreviews(
  owner,
  items,
  { db = pool, sign = createDownloadSignedUrl, readOnly = false } = {},
) {
  const result = [];
  for (const item of validateResolveItems(items)) {
    const state = previewDescriptor(item.sourceType, item.sourceId);
    const disabled =
      process.env[item.sourceType === 'note' ? 'IMAGE_PREVIEW_NOTES_ENABLED' : 'IMAGE_PREVIEW_CLOUD_ENABLED'] ===
      'false';
    if (disabled) {
      result.push({ ...state, status: 'disabled' });
      continue;
    }
    const c = await db.getConnection();
    try {
      await c.beginTransaction();
      const { asset, maxUrlAgeSeconds } = await imageSourceAdapters[item.sourceType].resolve(c, owner, item.sourceId, {
        readOnly,
      });
      if (!asset || asset.status === 'deleting') {
        await c.commit();
        result.push({ ...state, status: 'unsupported' });
        continue;
      }
      const [[artifact]] = await c.query(
        `SELECT * FROM file_preview_artifacts WHERE source_type='image_asset' AND file_id=?
        AND strategy='image_thumbnail' AND strategy_version=1 AND source_revision=?`,
        [asset.id, asset.source_version],
      );
      await c.commit();
      const ready = artifact?.status === 'ready' && artifact.artifact_object_key;
      const signed = ready ? cachedSignedUrl(artifact, sign, maxUrlAgeSeconds) : { url: null, expiresAt: null };
      result.push({
        ...state,
        assetId: String(asset.id),
        status: artifact?.status || 'queued',
        ...signed,
        width: artifact?.image_width || 0,
        height: artifact?.image_height || 0,
        bytes: artifact?.artifact_size || 0,
        errorCode: artifact?.error_code || null,
      });
    } catch (e) {
      await c.rollback();
      if (e.code === 'IMAGE_PREVIEW_NOT_FOUND') result.push({ ...state, status: 'unavailable' });
      else throw e;
    } finally {
      c.release();
    }
  }
  return result;
}

/** One read per page; never enqueue or fetch original metadata on the list hot path. */
export async function hydrateImagePreviewStates(items, owner, { db = pool, sign = createDownloadSignedUrl } = {}) {
  const keyed = [];
  for (const item of items) {
    const descriptor = item.imagePreview;
    if (!descriptor) continue;
    const disabled =
      process.env[descriptor.sourceType === 'note' ? 'IMAGE_PREVIEW_NOTES_ENABLED' : 'IMAGE_PREVIEW_CLOUD_ENABLED'] ===
      'false';
    if (disabled) {
      item.imagePreview = { ...descriptor, status: 'disabled' };
      continue;
    }
    const key = imageSourceAdapters[descriptor.sourceType]?.identity(item, owner);
    if (key) keyed.push({ item, key });
  }
  for (let offset = 0; offset < keyed.length; offset += 100) {
    const batch = keyed.slice(offset, offset + 100);
    const [rows] = await db.query(
      `SELECT i.identity_hash,i.id AS asset_id,a.* FROM image_assets i
      LEFT JOIN file_preview_artifacts a ON a.source_type='image_asset' AND a.file_id=i.id
       AND a.strategy='image_thumbnail' AND a.strategy_version=1 AND a.source_revision=i.source_version
      WHERE i.identity_hash IN (?) AND i.owner_user_id=? AND i.status<>'deleting'`,
      [batch.map((x) => x.key), owner],
    );
    const byKey = new Map(rows.map((r) => [r.identity_hash, r]));
    for (const { item, key } of batch) {
      const row = byKey.get(key);
      if (!row) continue;
      const ready = row.status === 'ready' && row.artifact_object_key;
      item.imagePreview = {
        ...item.imagePreview,
        assetId: String(row.asset_id),
        status: row.status || 'queued',
        ...(ready ? cachedSignedUrl(row, sign) : { url: null, expiresAt: null }),
        width: row.image_width || 0,
        height: row.image_height || 0,
        bytes: row.artifact_size || 0,
      };
    }
  }
}
