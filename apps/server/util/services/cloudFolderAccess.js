function normalizeFolderId(value) {
  if (value == null || String(value).trim() === '') return null;
  const folderId = Number(value);
  if (!Number.isSafeInteger(folderId) || folderId <= 0) {
    throw Object.assign(new Error('目标文件夹无效'), { code: 'FOLDER_ID_INVALID', status: 400 });
  }
  return folderId;
}

export async function assertOwnedCloudFolder(connection, userId, folderId) {
  const normalizedId = normalizeFolderId(folderId);
  if (normalizedId == null) return null;
  const [rows] = await connection.query(
    'SELECT id FROM folders WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1 FOR UPDATE',
    [normalizedId, userId],
  );
  if (!rows.length)
    throw Object.assign(new Error('目标文件夹不存在或不属于当前账号'), { code: 'FOLDER_NOT_FOUND', status: 404 });
  return normalizedId;
}
