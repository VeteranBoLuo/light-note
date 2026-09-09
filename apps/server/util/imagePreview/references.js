import { CARD_IMAGE_PROFILE } from '@lightnote/shared';
import { extractManagedImages } from './extract.js';
import { localImageLocator, hash } from './sources.js';
import { imageError } from './compress.js';

export const generationEnabled = () => process.env.IMAGE_PREVIEW_GENERATION_ENABLED !== 'false';
export async function queuePreview(db, asset) {
  if (!generationEnabled() || asset.status === 'deleting') return;
  await db.query(
    `INSERT INTO file_preview_artifacts
    (source_type,file_id,owner_user_id,strategy,strategy_version,format_id,source_etag,source_size,source_revision)
    VALUES ('image_asset',?,?,'image_thumbnail',${CARD_IMAGE_PROFILE.version},'card',?,?,?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [asset.id, asset.owner_user_id, asset.source_version, asset.source_size || 0, asset.source_version],
  );
  await db.query(
    `INSERT IGNORE INTO file_preview_jobs (artifact_id)
    SELECT id FROM file_preview_artifacts WHERE source_type='image_asset' AND file_id=?
      AND strategy='image_thumbnail' AND strategy_version=${CARD_IMAGE_PROFILE.version} AND source_revision=?`,
    [asset.id, asset.source_version],
  );
}
export async function registerAsset(
  db,
  { owner, sourceType, sourceId, locator, storage, version, size = 0, reconciled = false },
) {
  const identity = hash(`${owner}:${storage}:${locator}`);
  await db.query(
    `INSERT INTO image_assets
    (owner_user_id,source_type,source_id,identity_hash,storage_kind,source_locator,source_version,source_size,reconciled,status,cleanup_after)
    VALUES (?,?,?,?,?,?,?,?,?,'pending_delete',DATE_ADD(NOW(),INTERVAL 24 HOUR))
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [
      owner,
      sourceType,
      String(sourceId),
      identity,
      storage,
      locator,
      version || hash(`${storage}:${locator}`),
      size,
      Number(reconciled),
    ],
  );
  const [[asset]] = await db.query('SELECT * FROM image_assets WHERE identity_hash=? FOR UPDATE', [identity]);
  if (asset.status === 'deleting') throw imageError('IMAGE_SOURCE_DELETING');
  await queuePreview(db, asset);
  return asset;
}
export async function replaceReferences(db, refType, refId, assetIds) {
  const [old] = await db.query('SELECT asset_id FROM image_asset_refs WHERE ref_type=? AND ref_id=?', [
    refType,
    String(refId),
  ]);
  const desired = new Set(assetIds.map(String));
  const previous = new Set(old.map((r) => String(r.asset_id)));
  const added = [...desired].filter((id) => !previous.has(id));
  const removed = [...previous].filter((id) => !desired.has(id));
  const ids = [...added, ...removed].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (!ids.length) return;
  if (ids.length) {
    const [assets] = await db.query('SELECT id,status FROM image_assets WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
    if (assets.some((a) => a.status === 'deleting' && assetIds.map(String).includes(String(a.id))))
      throw imageError('IMAGE_SOURCE_DELETING');
  }
  for (const id of removed)
    await db.query('DELETE FROM image_asset_refs WHERE asset_id=? AND ref_type=? AND ref_id=?', [
      id,
      refType,
      String(refId),
    ]);
  for (const id of added) {
    await db.query('INSERT IGNORE INTO image_asset_refs (asset_id,ref_type,ref_id) VALUES (?,?,?)', [
      id,
      refType,
      String(refId),
    ]);
    await db.query("UPDATE image_assets SET status='active',cleanup_after=NULL WHERE id=? AND status<>'deleting'", [
      id,
    ]);
  }
  for (const id of removed)
    await db.query(
      `UPDATE image_assets a SET status='pending_delete',
    cleanup_after=COALESCE(cleanup_after,DATE_ADD(NOW(),INTERVAL 24 HOUR))
    WHERE id=? AND status<>'deleting' AND NOT EXISTS(SELECT 1 FROM image_asset_refs r WHERE r.asset_id=a.id)`,
      [id],
    );
}
export async function syncContentReferences(db, { owner, refType, refId, content, type = 'html' }) {
  const ids = [];
  for (const url of extractManagedImages(content, type)) {
    const locator = localImageLocator(url);
    if (!locator) continue;
    // Only previously owned upload records or registered assets establish ownership.
    const [owned] = await db.query(
      `SELECT ni.id FROM note_images ni JOIN note n ON n.id=ni.note_id
      WHERE n.create_by=? AND (ni.url=? OR ni.url=?) LIMIT 1`,
      [owner, url, `https://boluo66.top/uploads/${locator}`],
    );
    const [[existing]] = await db.query('SELECT * FROM image_assets WHERE identity_hash=?', [
      hash(`${owner}:local:${locator}`),
    ]);
    if (!owned.length && !existing) continue;
    const asset =
      existing ||
      (await registerAsset(db, { owner, sourceType: 'note_image', sourceId: locator, locator, storage: 'local' }));
    ids.push(String(asset.id));
  }
  await replaceReferences(db, refType, refId, ids);
}
export async function syncNoteImageReferences(db, noteId) {
  const [[note]] = await db.query('SELECT id,create_by,content,type FROM note WHERE id=?', [String(noteId)]);
  if (!note) return;
  await syncContentReferences(db, {
    owner: note.create_by,
    refType: 'note',
    refId: note.id,
    content: note.content,
    type: note.type,
  });
}
export async function registerCloudImage(db, file) {
  if (!/\.(png|jpe?g|gif|webp)$/i.test(file.file_name || file.fileName || '') || !file.obs_key) return null;
  const asset = await registerAsset(db, {
    owner: file.create_by,
    sourceType: 'cloud_file',
    sourceId: file.id,
    locator: file.obs_key,
    storage: 'obs',
    size: Number(file.file_size || 0),
    reconciled: true,
  });
  await replaceReferences(db, 'cloud_file', file.id, [asset.id]);
  return asset;
}
export async function syncCloudImageById(db, id) {
  const [[file]] = await db.query('SELECT * FROM files WHERE id=?', [id]);
  return file ? registerCloudImage(db, file) : null;
}
export async function removeImageReferences(db, refType, ids) {
  for (const id of ids) await replaceReferences(db, refType, id, []);
}
