// 非积分资产复用 points_log 的零积分审计行，以类型和实际到账量解释，绝不把 delta 当作资产数量。
// 必须与余额/库存更新使用同一事务；查询只投影公开字段，不返回内部 ref 或管理员备注。
export const ACQUISITION_VERSION = 1;

export function acquisitionMeta(kind, amount, sourceType = 'other') {
  if (!['card', 'storage'].includes(kind) || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('ASSET_ACQUISITION_INVALID');
  }
  if (typeof sourceType !== 'string' || !/^[a-z][a-z0-9_]{0,47}$/.test(sourceType)) {
    throw new Error('ASSET_ACQUISITION_SOURCE_INVALID');
  }
  return {
    acquisitionVersion: ACQUISITION_VERSION,
    assetType: kind === 'card' ? 'makeup_card' : 'storage_mb',
    assetAmount: amount,
    sourceType,
  };
}

export async function recordAssetAcquisition(db, { userId, kind, amount, sourceType = 'other', sourceRef = null }) {
  const meta = acquisitionMeta(kind, amount, sourceType);
  await db.query("INSERT INTO points_log (user_id, delta, reason, ref, meta) VALUES (?, 0, 'asset_grant', ?, ?)", [
    userId,
    sourceRef == null ? null : String(sourceRef).slice(0, 64),
    JSON.stringify(meta),
  ]);
}
