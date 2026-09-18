import { hash } from './sources.js';
import { registerCloudImage } from './references.js';

/** Caller owns the file lock and transaction. Moving bytes does not change their content revision. */
export async function relocateCloudImage(db, file, targetKey, targetName) {
  if (file.obs_key === targetKey) return;
  const oldIdentity = hash(`${file.create_by}:obs:${file.obs_key}`);
  const newIdentity = hash(`${file.create_by}:obs:${targetKey}`);
  const [assets] = await db.query('SELECT * FROM image_assets WHERE identity_hash IN (?,?) ORDER BY id FOR UPDATE', [
    oldIdentity,
    newIdentity,
  ]);
  const asset = assets.find((row) => row.identity_hash === oldIdentity);
  // A retained/deleting asset at the destination is still an owned object, not an overwrite candidate.
  if (assets.some((row) => row.identity_hash === newIdentity))
    throw Object.assign(new Error('目标文件名仍被图片资源占用，请换一个名称'), {
      status: 409,
      code: 'FILE_IMAGE_TARGET_CONFLICT',
    });
  if (!asset) {
    // Legacy/unregistered files join the normal pipeline, without borrowing a preview from another address.
    await registerCloudImage(db, { ...file, obs_key: targetKey, file_name: targetName });
    return;
  }
  let sourceMatches = String(asset.source_id) === String(file.id);
  if (
    !sourceMatches &&
    asset.status !== 'deleting' &&
    asset.source_type === 'cloud_file' &&
    String(asset.owner_user_id) === String(file.create_by)
  ) {
    // Older overwrite uploads recreated files while retaining the asset at the same OBS key.
    // Rebind only an orphaned source that already has an explicit reference from this file.
    const [previousFiles] = await db.query('SELECT id FROM files WHERE id=? FOR UPDATE', [asset.source_id]);
    const [references] = await db.query(
      "SELECT asset_id FROM image_asset_refs WHERE asset_id=? AND ref_type='cloud_file' AND ref_id=? FOR UPDATE",
      [asset.id, String(file.id)],
    );
    sourceMatches = previousFiles.length === 0 && references.length > 0;
  }
  if (
    asset.status === 'deleting' ||
    asset.source_type !== 'cloud_file' ||
    !sourceMatches ||
    String(asset.owner_user_id) !== String(file.create_by)
  )
    throw Object.assign(new Error('图片资源状态已变化，请刷新后重试'), {
      status: 409,
      code: 'FILE_IMAGE_SOURCE_CONFLICT',
    });
  await db.query('UPDATE image_assets SET source_locator=?,identity_hash=?,source_id=? WHERE id=?', [
    targetKey,
    newIdentity,
    String(file.id),
    asset.id,
  ]);
  // Fence workers holding the old locator. Keep completed previews, failed facts and output cleanup ledgers.
  await db.query(
    `UPDATE file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id
     SET a.status='queued',j.status='queued',j.locked_by=NULL,j.locked_at=NULL,
       j.attempts=IF(j.attempts>0,j.attempts-1,0),j.available_at=NOW()
     WHERE a.source_type='image_asset' AND a.file_id=? AND j.status='processing'`,
    [asset.id],
  );
}
