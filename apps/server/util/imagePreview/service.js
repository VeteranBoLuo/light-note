import { imageFailure } from './errors.js';
import { queuePreview } from './references.js';
import { IMAGE_PREVIEW_SOURCES, CARD_IMAGE_PROFILE } from '@lightnote/shared';
import pool from '../../db/index.js';
import { createDownloadSignedUrl } from '../obsClient.js';
import { imageError } from './compress.js';
import { imageSourceAdapters } from './sourceAdapters.js';

export function artifactState(artifact) {
  let metadata = {};
  try {
    metadata = JSON.parse(artifact?.preview_metadata_json || '{}');
  } catch {
    /* Legacy rows have no metadata. */
  }
  return {
    ...imageFailure(artifact?.error_code),
    ...(artifact?.status === 'ready' && metadata?.cover === 'absent'
      ? { status: 'unsupported', errorCode: null, failureKind: null, retryable: false }
      : {}),
    presentation: metadata?.presentation === 'long_top' ? 'long_top' : 'full',
  };
}

const signedUrls = new Map();
function cachedSignedUrl(artifact, sign, maxAge = 600, fresh = false) {
  const key = `${artifact.id}:${artifact.artifact_object_key}:${maxAge}`;
  const cached = signedUrls.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now() + 60000) return cached;
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
  { db = pool, sign = createDownloadSignedUrl, readOnly = false, refreshUrl = false } = {},
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
      const [artifacts] = await c.query(
        `SELECT * FROM file_preview_artifacts WHERE source_type='image_asset' AND file_id=?
        AND strategy='image_thumbnail' AND strategy_version<=${CARD_IMAGE_PROFILE.version} AND source_revision=? ORDER BY strategy_version DESC`,
        [asset.id, asset.source_version],
      );
      let current = artifacts.find((a) => Number(a.strategy_version) === CARD_IMAGE_PROFILE.version);
      if (!current && !readOnly) {
        await queuePreview(c, asset);
        current = { status: 'queued', strategy_version: CARD_IMAGE_PROFILE.version };
      }
      await c.commit();
      const artifact =
        current?.status === 'ready' || current?.status === 'failed'
          ? current
          : artifacts.find((a) => a.status === 'ready' && a.artifact_object_key) || current;
      const ready = artifact?.status === 'ready' && artifact.artifact_object_key;
      const signed = ready
        ? cachedSignedUrl(artifact, sign, maxUrlAgeSeconds, refreshUrl)
        : { url: null, expiresAt: null };
      result.push({
        ...state,
        assetId: String(asset.id),
        status:
          current && ['queued', 'processing'].includes(current.status) ? current.status : artifact?.status || 'queued',
        ...signed,
        width: artifact?.image_width || 0,
        height: artifact?.image_height || 0,
        bytes: ready ? artifact?.artifact_size || 0 : 0,
        ...artifactState(artifact),
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
       AND a.strategy='image_thumbnail' AND a.strategy_version<=${CARD_IMAGE_PROFILE.version} AND a.source_revision=i.source_version
      WHERE i.identity_hash IN (?) AND i.owner_user_id=? AND i.status<>'deleting' ORDER BY a.strategy_version DESC`,
      [batch.map((x) => x.key), owner],
    );
    const byKey = new Map();
    for (const row of rows) {
      const previous = byKey.get(row.identity_hash);
      if (
        !previous ||
        (['queued', 'processing'].includes(previous.status) && row.status === 'ready' && row.artifact_object_key)
      )
        byKey.set(
          row.identity_hash,
          previous && ['queued', 'processing'].includes(previous.status) && row.status === 'ready'
            ? { ...row, pending_status: previous.status }
            : row,
        );
    }
    for (const { item, key } of batch) {
      const row = byKey.get(key);
      if (!row) continue;
      const ready = row.status === 'ready' && row.artifact_object_key;
      item.imagePreview = {
        ...item.imagePreview,
        assetId: String(row.asset_id),
        status: row.pending_status || row.status || 'queued',
        ...(ready ? cachedSignedUrl(row, sign) : { url: null, expiresAt: null }),
        width: row.image_width || 0,
        height: row.image_height || 0,
        bytes: row.status === 'ready' ? row.artifact_size || 0 : 0,
        ...artifactState(row),
      };
    }
  }
}

/** Explicit user action, serialized with the authoritative source and current job. */
export async function retryImagePreview(owner, input, { db = pool } = {}) {
  const [item] = validateResolveItems([input]);
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const { asset } = await imageSourceAdapters[item.sourceType].resolve(c, owner, item.sourceId, { readOnly: true });
    if (!asset || asset.status === 'deleting') throw imageError('IMAGE_PREVIEW_NOT_FOUND');
    const [[job]] = await c.query(
      `SELECT j.id,j.status,j.error_code,j.available_at FROM file_preview_jobs j
      JOIN file_preview_artifacts a ON a.id=j.artifact_id
      WHERE a.source_type='image_asset' AND a.file_id=? AND a.source_revision=?
      AND a.strategy='image_thumbnail' AND a.strategy_version=${CARD_IMAGE_PROFILE.version} FOR UPDATE`,
      [asset.id, asset.source_version],
    );
    if (
      job?.status === 'failed' &&
      imageFailure(job.error_code).retryable &&
      new Date(job.available_at).getTime() <= Date.now()
    ) {
      await c.query(
        "UPDATE file_preview_jobs SET status='queued',attempts=0,available_at=DATE_ADD(NOW(),INTERVAL 60 SECOND) WHERE id=? AND status='failed'",
        [job.id],
      );
      await c.query(
        "UPDATE file_preview_artifacts a JOIN file_preview_jobs j ON j.artifact_id=a.id SET a.status='queued',a.error_code=NULL WHERE j.id=?",
        [job.id],
      );
    }
    await c.commit();
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
  return (await resolveImagePreviews(owner, [item], { db, readOnly: true }))[0];
}
