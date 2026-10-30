function parse(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

// 「上次备份」只由导出 Worker 写入；前端整体保存偏好时不能覆盖或伪造它。
export function preserveDataBackupPreference(incoming, persisted) {
  const next = parse(incoming);
  const saved = parse(persisted);
  if (Object.hasOwn(saved, 'dataBackup')) next.dataBackup = saved.dataBackup;
  else delete next.dataBackup;
  return JSON.stringify(next);
}
