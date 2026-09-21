import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { normalizeDataExportOptions, DATA_EXPORT_ACTIVE } from '@lightnote/shared/data-export';
import { root, runtime, hostKey, exportError, taskDirectory, ensureSpace, assertSchema } from './storage.js';
import { resourcePage, resourceVersion, buildPaths } from './resources.js';
export async function transaction(fn) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await fn(db);
    await db.commit();
    return result;
  } catch (e) {
    await db.rollback();
    throw e;
  } finally {
    db.release();
  }
}
export function presentTask(t) {
  const expired = new Date(t.expires_at).getTime() <= Date.now();
  return {
    id: t.id,
    status: expired && t.status !== 'cancelled' ? 'expired' : t.status,
    options: JSON.parse(t.options_json),
    total: Number(t.total),
    completed: Number(t.completed),
    failed: Number(t.failed),
    stage: t.stage,
    expiresAt: t.expires_at,
    errorCode: t.error_code,
    canDownload: !expired && ['completed', 'partial'].includes(t.status),
  };
}
export async function ownedTask(owner, id, db = pool) {
  const [[t]] = await db.query(
    'SELECT * FROM data_export_tasks WHERE id=? AND owner_id=? AND runtime=? AND host_key=?',
    [id, owner, runtime, hostKey],
  );
  if (!t) throw exportError('DATA_EXPORT_NOT_FOUND', 404);
  return t;
}
export async function latestTask(owner) {
  await assertSchema(pool);
  const [[t]] = await pool.query(
    'SELECT * FROM data_export_tasks WHERE owner_id=? AND runtime=? AND host_key=? ORDER BY create_time DESC,id DESC LIMIT 1',
    [owner, runtime, hostKey],
  );
  return t ? presentTask(t) : null;
}
export async function createTask(owner, input) {
  const options = normalizeDataExportOptions(input);
  if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(input.requestId || '')) throw exportError('DATA_EXPORT_OPTIONS');
  await assertSchema(pool);
  await ensureSpace();
  let directory;
  try {
    return await transaction(async (db) => {
      const [[account]] = await db.query('SELECT id,role,del_flag FROM user WHERE id=? FOR UPDATE', [owner]);
      if (!account || account.del_flag || ['deleted','visitor'].includes(account.role)) throw exportError('DATA_EXPORT_ACCOUNT_UNAVAILABLE',403);
      const [[receipt]] = await db.query(
        'SELECT * FROM data_export_tasks WHERE owner_id=? AND runtime=? AND host_key=? AND request_id=?',
        [owner, runtime, hostKey, input.requestId],
      );
      if (receipt) {
        if (receipt.options_json !== JSON.stringify(options)) throw exportError('DATA_EXPORT_CONFLICT', 409);
        return presentTask(receipt);
      }
      const [[active]] = await db.query(
        "SELECT * FROM data_export_tasks WHERE owner_id=? AND runtime=? AND host_key=? AND status IN ('queued','running') AND expires_at>NOW() ORDER BY create_time DESC LIMIT 1",
        [owner, runtime, hostKey],
      );
      if (active) return presentTask(active);
      const id = randomUUID();
      directory = taskDirectory(id);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await db.query(
        `INSERT INTO data_export_tasks (id,owner_id,runtime,host_key,request_id,options_json,expires_at) VALUES (?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 24 HOUR))`,
        [id, owner, runtime, hostKey, input.requestId, JSON.stringify(options)],
      );
      let nodes = [],
        folders = [];
      if (options.types.includes('notes'))
        [nodes] = await db.query(
          'SELECT id,title,type,parent_id,sort FROM note WHERE create_by=? AND del_flag=0 ORDER BY sort,id',
          [owner],
        );
      if (options.types.includes('files'))
        [folders] = await db.query(
          'SELECT id,name,parent_id FROM folders WHERE create_by=? AND del_flag=0 ORDER BY sort,id',
          [owner],
        );
      const { paths, filePath } = buildPaths(nodes, folders, options.noteFormat);
      let total = 0;
      for (const kind of options.types) {
        for (let offset = 0; ; offset += 100) {
          const rows = await resourcePage(db, owner, kind, offset);
          for (const row of rows) {
            const dest =
              kind === 'notes' ? paths.get('notes:' + row.id) : kind === 'files' ? filePath(row) : '书签.xlsx';
            await db.query(
              'INSERT INTO data_export_items (task_id,kind,resource_id,title,version,path) VALUES (?,?,?,?,?,?)',
              [id, kind, String(row.id), row.title || '', resourceVersion(row), dest],
            );
            total++;
          }
          if (rows.length < 100) break;
        }
      }
      if (!total) {
        await db.query('DELETE FROM data_export_tasks WHERE id=?', [id]);
        await fs.rm(directory, { recursive: true, force: true });
        return { empty: true };
      }
      await db.query('UPDATE data_export_tasks SET total=? WHERE id=?', [total, id]);
      return presentTask(await ownedTask(owner, id, db));
    });
  } catch (e) {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
    throw e;
  }
}
export async function cancelTask(owner, id) {
  const t = await ownedTask(owner, id);
  if (DATA_EXPORT_ACTIVE.includes(t.status))
    await pool.query(
      "UPDATE data_export_tasks SET status='cancelled',stage='cancelled' WHERE id=? AND status IN ('queued','running')",
      [id],
    );
  return presentTask(await ownedTask(owner, id));
}
export async function failurePage(owner, id, offset = 0) {
  await ownedTask(owner, id);
  if (!Number.isSafeInteger(offset) || offset < 0) throw exportError('DATA_EXPORT_OPTIONS');
  const [rows] = await pool.query(
    'SELECT title,error_code AS code FROM data_export_items WHERE task_id=? AND error_code IS NOT NULL ORDER BY id LIMIT 50 OFFSET ?',
    [id, offset],
  );
  return rows;
}
export async function cleanup() {
  const [rows] = await pool.query(
    `SELECT * FROM data_export_tasks WHERE runtime=? AND host_key=? AND (expires_at<=NOW() OR status IN ('cancelled','failed')) AND (lease_until IS NULL OR lease_until<NOW())`,
    [runtime, hostKey],
  );
  for (const t of rows) {
    const [updated] = await pool.query(
      "UPDATE data_export_tasks SET status=IF(status IN ('cancelled','failed'),status,'expired'),lease_token=NULL WHERE id=? AND (lease_until IS NULL OR lease_until<NOW())",
      [t.id],
    );
    if (updated.affectedRows) await fs.rm(taskDirectory(t.id), { recursive: true, force: true });
  }
  await pool.query(
    'DELETE i FROM data_export_items i JOIN data_export_tasks t ON t.id=i.task_id WHERE t.runtime=? AND t.host_key=? AND t.create_time<DATE_SUB(NOW(),INTERVAL 7 DAY)',
    [runtime, hostKey],
  );
  await pool.query(
    'DELETE FROM data_export_tasks WHERE runtime=? AND host_key=? AND create_time<DATE_SUB(NOW(),INTERVAL 7 DAY)',
    [runtime, hostKey],
  );
  // Filesystem-only leftovers from a rolled back creation are never consumable.
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  for (const id of await fs.readdir(root)) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) continue;
    const stat = await fs.stat(taskDirectory(id));
    if (Date.now() - stat.mtimeMs < 86400000) continue;
    const [[t]] = await pool.query('SELECT id FROM data_export_tasks WHERE id=?', [id]);
    if (!t) await fs.rm(taskDirectory(id), { recursive: true, force: true });
  }
}
