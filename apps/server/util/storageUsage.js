const BYTES_PER_MB = 1024 * 1024;

function normalizeBytes(value) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
}

function normalizeFileNames(fileNames) {
  return [
    ...new Set((Array.isArray(fileNames) ? fileNames : []).map((name) => String(name || '').trim()).filter(Boolean)),
  ];
}

/**
 * 云空间共享容量口径：正常文件与回收站文件共同占用账号容量。
 * del_flag 只有 0（正常）和 1（回收站）会被计入，物理删除后自然释放。
 */
export async function getAccountedStorageBytes(db, userId) {
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(file_size), 0) AS used
       FROM files
      WHERE create_by = ? AND del_flag IN (0, 1)`,
    [userId],
  );
  return normalizeBytes(rows?.[0]?.used);
}

/** 返回共享容量及正常区/回收站拆分，供展示使用。 */
export async function getStorageUsageBreakdown(db, userId) {
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN del_flag = 0 THEN file_size ELSE 0 END), 0) AS activeBytes,
       COALESCE(SUM(CASE WHEN del_flag = 1 THEN file_size ELSE 0 END), 0) AS trashBytes,
       COALESCE(SUM(CASE WHEN del_flag IN (0, 1) THEN file_size ELSE 0 END), 0) AS totalBytes
     FROM files
     WHERE create_by = ? AND del_flag IN (0, 1)`,
    [userId],
  );
  const row = rows?.[0] || {};
  const activeBytes = normalizeBytes(row.activeBytes);
  const trashBytes = normalizeBytes(row.trashBytes);
  const reportedTotal = normalizeBytes(row.totalBytes);
  return {
    activeBytes,
    trashBytes,
    totalBytes: Math.max(reportedTotal, activeBytes + trashBytes),
  };
}

/**
 * 同名覆盖只应按新旧文件差额占用容量；否则接近上限时替换成更小文件也会被误拒绝。
 */
export async function getActiveReplacementBytes(db, userId, fileNames) {
  const names = normalizeFileNames(fileNames);
  if (!names.length) return 0;
  const placeholders = names.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(file_size), 0) AS used
       FROM files
      WHERE create_by = ? AND del_flag = 0 AND file_name IN (${placeholders})`,
    [userId, ...names],
  );
  return normalizeBytes(rows?.[0]?.used);
}

export function storageBytesToMb(bytes) {
  return Number((normalizeBytes(bytes) / BYTES_PER_MB).toFixed(2));
}

export function getProjectedStorageBytes({ usedBytes, incomingBytes, replacementBytes = 0 }) {
  return Math.max(0, normalizeBytes(usedBytes) - normalizeBytes(replacementBytes) + normalizeBytes(incomingBytes));
}

export { BYTES_PER_MB };
