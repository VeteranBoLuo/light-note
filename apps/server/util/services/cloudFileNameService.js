import path from 'node:path';

// 调用方先持有账号锁；数据库判等，并使用 current read 避免事务旧快照漏掉刚提交的名称。
export async function uniqueCloudFileName(connection, userId, requestedName, { includeDeleted = true } = {}) {
  const deletionFilter = includeDeleted ? 'del_flag IN (0, 1)' : 'del_flag = 0';
  const extension = path.extname(requestedName);
  const base = requestedName.slice(0, requestedName.length - extension.length) || '文件';
  for (let start = 0; start < 1000;) {
    // 常见的无冲突名称仍只检查一次；冲突后分批检查，避免每个后缀一次数据库往返。
    const size = start === 0 ? 1 : Math.min(32, 1000 - start);
    const candidates = Array.from({ length: size }, (_, offset) => {
      const index = start + offset;
      const suffix = index === 0 ? '' : ` (${index})`;
      return `${base.slice(0, Math.max(1, 255 - extension.length - suffix.length))}${suffix}${extension}`;
    });
    if (start === 0) {
      const [rows] = await connection.query(
        `SELECT id FROM files WHERE create_by = ? AND file_name = ? AND ${deletionFilter} LIMIT 1 FOR UPDATE`,
        [userId, candidates[0]],
      );
      if (!rows.length) return candidates[0];
    } else {
      // 由数据库判等，保留现有大小写、重音与回收站占名语义；不能用 JS Set 比较文件名。
      const [rows] = await connection.query(
        `SELECT ${candidates.map((_, index) => `MAX(file_name = ?) AS occupied${index}`).join(', ')}
         FROM files WHERE create_by = ? AND ${deletionFilter}
         AND file_name IN (${candidates.map(() => '?').join(', ')}) FOR UPDATE`,
        [...candidates, userId, ...candidates],
      );
      const free = candidates.findIndex((_, index) => !Number(rows[0]?.[`occupied${index}`]));
      if (free !== -1) return candidates[free];
    }
    start += size;
  }
  throw Object.assign(new Error('同名文件过多，请修改名称后重试'), { code: 'FILE_NAME_CONFLICT', status: 409 });
}
