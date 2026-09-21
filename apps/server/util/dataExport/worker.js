import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { finished } from 'node:stream/promises';
import archiver from 'archiver';
import pool from '../../db/index.js';
import { transaction, cleanup } from './service.js';
import { runtime, hostKey, taskDirectory, writeJson, exportError, ensureSpace } from './storage.js';
import { resourcePage, resourceVersion } from './resources.js';
import { copyFile } from './downloads.js';
import { renderNote, createBookmarkWorkbook, defaultReadImage } from './documents.js';
const safeCode = (e) => (/^DATA_EXPORT_[A-Z_]+$/.test(e?.code || '') ? e.code : 'DATA_EXPORT_ITEM_FAILED');
export async function zipDirectory(directory, destination, signal) {
  const archive = archiver('zip', { zlib: { level: 6 }, forceZip64: true });
  const output = fs.createWriteStream(destination, { mode: 0o600 });
  const completion = finished(output);
  completion.catch(() => {});
  const fail = (e) => {
    archive.abort();
    output.destroy(e);
  };
  archive.on('error', fail);
  archive.on('warning', fail);
  const abort = () => fail(exportError('DATA_EXPORT_CANCELLED'));
  signal.addEventListener('abort', abort, { once: true });
  try {
    archive.pipe(output);
    archive.directory(directory, false);
    await archive.finalize();
    await completion;
  } finally {
    signal.removeEventListener('abort', abort);
    archive.abort();
    output.destroy();
  }
}
export async function claimTask() {
  return transaction(async (db) => {
    const [rows] = await db.query(
      `SELECT * FROM data_export_tasks WHERE runtime=? AND host_key=? AND status IN ('queued','running') AND expires_at>NOW() AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY create_time LIMIT 10 FOR UPDATE`,
      [runtime, hostKey],
    );
    for (const t of rows) {
      try {
        await fsp.access(taskDirectory(t.id));
      } catch {
        continue;
      }
      const token = randomUUID();
      await db.query(
        "UPDATE data_export_tasks SET status='running',stage='preparing',lease_token=?,lease_until=DATE_ADD(NOW(),INTERVAL 90 SECOND) WHERE id=?",
        [token, t.id],
      );
      return { ...t, lease_token: token };
    }
    return null;
  });
}
export async function processTask() {
  const task = await claimTask();
  if (!task) return false;
  const controller = new AbortController(),
    signal = controller.signal;
  let checking = false;
  async function heartbeat() {
    if (checking) return;
    checking = true;
    try {
      const [r] = await pool.query(
        "UPDATE data_export_tasks SET lease_until=DATE_ADD(NOW(),INTERVAL 90 SECOND) WHERE id=? AND lease_token=? AND status='running' AND expires_at>NOW()",
        [task.id, task.lease_token],
      );
      if (!r.affectedRows) controller.abort();
    } catch {
      controller.abort();
    } finally {
      checking = false;
    }
  }
  const timer = setInterval(heartbeat, 3000);
  const dir = taskDirectory(task.id),
    work = path.join(dir, 'work-' + task.lease_token),
    options = JSON.parse(task.options_json);
  let workbook;
  try {
    await ensureSpace();
    await fsp.mkdir(work, { recursive: true, mode: 0o700 });
    await pool.query(
      "UPDATE data_export_items i JOIN data_export_tasks t ON t.id=i.task_id SET i.status='pending',i.error_code=NULL WHERE i.task_id=? AND t.lease_token=? AND t.status='running'",
      [task.id, task.lease_token],
    );
    const [notes] = await pool.query(
      "SELECT resource_id,path FROM data_export_items WHERE task_id=? AND kind='notes'",
      [task.id],
    );
    const ctx = {
      options,
      owner: task.owner_id,
      db: pool,
      signal,
      directory: work,
      images: new Map(),
      imageBytes: 0,
      paths: new Map(notes.map((n) => [n.resource_id, n.path])),
      readImage: defaultReadImage,
    };
    let after = 0,
      completed = 0,
      failed = 0,
      bookmarkCount = 0;
    const report = await fsp.open(path.join(work, '导出说明.txt'), 'w', 0o600);
    try {
      for (;;) {
        const [items] = await pool.query(
          'SELECT * FROM data_export_items WHERE task_id=? AND id>? ORDER BY id LIMIT 100',
          [task.id, after],
        );
        if (!items.length) break;
        for (const item of items) {
          signal.throwIfAborted();
          after = item.id;
          let code = null,
            success = false;
          try {
            const [current] = await resourcePage(pool, task.owner_id, item.kind, 0, item.resource_id);
            if (!current) throw exportError('DATA_EXPORT_SOURCE_MISSING');
            const snapshot = path.join(dir, 'snapshots', item.id + '.json');
            let row;
            try {
              row = JSON.parse(await fsp.readFile(snapshot, 'utf8'));
            } catch (e) {
              if (e.code !== 'ENOENT') throw e;
              if (resourceVersion(current) !== item.version) throw exportError('DATA_EXPORT_SOURCE_CHANGED');
              row = current;
              await ensureSpace(Buffer.byteLength(JSON.stringify(row)) * 2);
              await writeJson(snapshot, row);
            }
            const dest = path.join(work, item.path);
            if (!dest.startsWith(work + path.sep)) throw exportError('DATA_EXPORT_INVALID_TREE');
            if (item.kind === 'notes') {
              const rendered = await renderNote(row, item, ctx);
              await fsp.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
              await fsp.writeFile(dest, rendered.content, { mode: 0o600 });
              if (rendered.warnings.length) {
                code = rendered.warnings[0];
                for (const label of rendered.imageFailures || [])
                  await report.write(
                    `${item.title.replace(/[\r\n]/g, ' ')} — ${label.replace(/[\r\n]/g, ' ')}：未能下载，保留原链接\n`,
                  );
              }
            } else if (item.kind === 'files') {
              if (resourceVersion(current) !== item.version) throw exportError('DATA_EXPORT_SOURCE_CHANGED');
              await copyFile(row, dest, AbortSignal.any([signal, AbortSignal.timeout(30 * 60 * 1000)]));
            } else {
              if (!workbook) workbook = createBookmarkWorkbook(path.join(work, '书签.xlsx'));
              workbook.append(row);
              bookmarkCount++;
            }
            success = true;
            completed++;
          } catch (e) {
            if (signal.aborted) throw e;
            code = safeCode(e);
          }
          if (code) {
            failed++;
            await report.write(`${item.title.replace(/[\r\n]/g, ' ')} — ${failureReason(code)} (${code})\n`);
          }
          await pool.query(
            "UPDATE data_export_items i JOIN data_export_tasks t ON t.id=i.task_id SET i.status=?,i.error_code=? WHERE i.id=? AND t.lease_token=? AND t.status='running'",
            [success ? 'completed' : 'failed', code, item.id, task.lease_token],
          );
          const [updated] = await pool.query(
            "UPDATE data_export_tasks SET stage=?,completed=?,failed=? WHERE id=? AND lease_token=? AND status='running'",
            [item.kind, completed, failed, task.id, task.lease_token],
          );
          if (!updated.affectedRows) throw exportError('DATA_EXPORT_CANCELLED');
        }
      }
    } finally {
      await report.close();
    }
    if (workbook) {
      await workbook.commit();
      workbook = null;
    }
    if (!failed) await fsp.rm(path.join(work, '导出说明.txt'));
    if (!completed) throw exportError('DATA_EXPORT_NO_OUTPUT');
    await heartbeat();
    signal.throwIfAborted();
    await pool.query("UPDATE data_export_tasks SET stage='packing' WHERE id=? AND lease_token=?", [
      task.id,
      task.lease_token,
    ]);
    const temp = path.join(dir, 'archive-' + task.lease_token + '.zip');
    await zipDirectory(work, temp, signal);
    await heartbeat();
    signal.throwIfAborted();
    await transaction(async (db) => {
      const [[current]] = await db.query(
        'SELECT status,lease_token,expires_at FROM data_export_tasks WHERE id=? FOR UPDATE',
        [task.id],
      );
      if (
        current?.status !== 'running' ||
        current.lease_token !== task.lease_token ||
        new Date(current.expires_at).getTime() <= Date.now()
      )
        throw exportError('DATA_EXPORT_CANCELLED');
      await fsp.rename(temp, path.join(dir, 'export.zip'));
      await db.query(
        "UPDATE data_export_tasks SET status=?,stage='ready',expires_at=DATE_ADD(NOW(),INTERVAL 24 HOUR),lease_token=NULL,lease_until=NULL WHERE id=?",
        [failed ? 'partial' : 'completed', task.id],
      );
    });
  } catch (e) {
    await pool.query(
      "UPDATE data_export_tasks SET status='failed',stage='failed',error_code=? WHERE id=? AND lease_token=? AND status='running'",
      [safeCode(e), task.id, task.lease_token],
    );
  } finally {
    clearInterval(timer);
    controller.abort();
    if (workbook) await workbook.commit().catch(() => {});
    await pool.query('UPDATE data_export_tasks SET lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?', [
      task.id,
      task.lease_token,
    ]);
    await fsp.rm(work, { recursive: true, force: true });
    await fsp.rm(path.join(dir, 'archive-' + task.lease_token + '.zip'), { force: true });
  }
  return true;
}
export { cleanup };

function failureReason(code) {
  return (
    {
      DATA_EXPORT_SOURCE_CHANGED: '内容已变化，请重新导出',
      DATA_EXPORT_SOURCE_MISSING: '原内容不存在或无法读取',
      DATA_EXPORT_IMAGE_FAILED: '部分图片未能下载，保留原链接',
      DATA_EXPORT_CONVERSION_FAILED: '此内容无法转换',
      DATA_EXPORT_DISK_FULL: '暂存空间不足',
    }[code] || '此项目未能完整导出'
  );
}
