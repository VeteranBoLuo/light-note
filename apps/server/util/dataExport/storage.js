import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveLightNoteRuntime } from '../databaseConnectionSafety.js';
export const root = path.resolve(
  process.env.DATA_EXPORT_STORAGE_DIR || fileURLToPath(new URL('../../.runtime/data-exports', import.meta.url)),
);
export const runtime = resolveLightNoteRuntime().runtime;
export const hostKey = createHash('sha256').update(`${os.hostname()}:${root}:${runtime}`).digest('hex');
export const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex');
export const exportError = (code, status = 400) => Object.assign(new Error(code), { code, status });
export function taskDirectory(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id))) throw exportError('DATA_EXPORT_NOT_FOUND', 404);
  return path.join(root, id);
}
export async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file + '.tmp', JSON.stringify(data), { mode: 0o600 });
  await fs.rename(file + '.tmp', file);
}
export async function ensureSpace(required = 0) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await fs.statfs(root);
  if (stat.bavail * stat.bsize < required + 512 * 1024 * 1024) throw exportError('DATA_EXPORT_DISK_FULL', 507);
}
export async function assertSchema(db) {
  await db.query(
    'SELECT id,owner_id,runtime,host_key,request_id,options_json,status,stage,total,completed,failed,error_code,lease_token,lease_until,create_time,expires_at FROM data_export_tasks LIMIT 0',
  );
  await db.query(
    'SELECT id,task_id,kind,resource_id,title,version,path,status,error_code FROM data_export_items LIMIT 0',
  );
}
