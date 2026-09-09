import { createProgressReporter } from './progress.js';
import { registerAsset } from '../imagePreview/references.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pool from '../../db/index.js';
import { createNote } from '../services/noteService.js';
import { listActiveInheritedNoteShares } from '../services/noteShareService.js';
import { loadOwnedNoteTree, assertValidNoteParentFromSnapshot } from '../services/noteTreeService.js';
import { NOTE_IMAGE_DIR } from '../noteImages.js';
import { NOTE_IMPORT_LIMITS } from '@lightnote/shared/note-transfer';
import { taskDirectory, localImportTaskIds, publishImportImage, readJson, importError } from './storage.js';

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
export async function ownedTask(db, owner, id, lock = false) {
  const [[task]] = await db.query(
    `SELECT * FROM note_import_tasks WHERE id=? AND owner_id=?${lock ? ' FOR UPDATE' : ''}`,
    [id, owner],
  );
  if (!task || task.error_code === 'NOTE_IMPORT_DISMISSED') throw importError('NOTE_IMPORT_NOT_FOUND', 404);
  return task;
}
export async function targetFingerprint(db, owner, parentId) {
  const tree = await loadOwnedNoteTree(owner, { db });
  assertValidNoteParentFromSnapshot(tree, { parentId });
  const shares = await listActiveInheritedNoteShares({ db, userId: owner, parentId });
  return {
    shared: shares.length > 0,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(shares.map((s) => [s.shareId, s.rootNoteId, String(s.expiresAt)]).sort()))
      .digest('hex'),
  };
}
export async function getImportTask(owner, id) {
  const task = await ownedTask(pool, owner, id);
  const [items] = await pool.query(
    'SELECT id,title,source_name,type,status,selected,warnings,warning_details,image_count,error_code,note_id FROM note_import_items WHERE task_id=? ORDER BY position',
    [id],
  );
  return {
    id: task.id,
    status:
      !['parsing', 'queued', 'running'].includes(task.status) && new Date(task.expires_at) < new Date()
        ? 'expired'
        : task.status,
    uploadBytes: Number(task.upload_bytes),
    progress: task.progress_json ? JSON.parse(task.progress_json) : null,
    finishedAt: task.finished_at || null,
    parentId: task.parent_id,
    errorCode: task.error_code,
    createTime: task.create_time,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      sourceName: i.source_name,
      type: i.type,
      status: i.status,
      selected: !!i.selected,
      warnings: JSON.parse(i.warnings),
      warningDetails: i.warning_details ? JSON.parse(i.warning_details) : null,
      imageCount: i.image_count,
      errorCode: i.error_code,
      noteId: i.note_id,
    })),
  };
}
// Hide task history without removing notes or the idempotency evidence.
export async function dismissImport(owner, id) {
  await transaction(async (db) => {
    const task = await ownedTask(db, owner, id, true);
    if (
      ['parsing', 'queued', 'running'].includes(task.status) ||
      (task.lease_until && new Date(task.lease_until) > new Date())
    )
      throw importError('NOTE_IMPORT_ACTIVE', 409);
    await db.query(
      "UPDATE note_import_tasks SET status='failed',error_code='NOTE_IMPORT_DISMISSED',expires_at=DATE_ADD(NOW(),INTERVAL 7 DAY) WHERE id=?",
      [id],
    );
  });
}
export async function createImportTask(owner) {
  const id = randomUUID();
  await transaction(async (db) => {
    await db.query('SELECT id FROM user WHERE id=? FOR UPDATE', [owner]);
    const [[{ count }]] = await db.query(
      "SELECT COUNT(*) AS count FROM note_import_tasks WHERE owner_id=? AND status NOT IN ('completed','expired','failed')",
      [owner],
    );
    if (count >= 5) throw importError('NOTE_IMPORT_TASK_LIMIT', 409);
    await db.query(
      'INSERT INTO note_import_tasks (id,owner_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 24 HOUR))',
      [id, owner],
    );
    await fs.mkdir(taskDirectory(id), { recursive: true, mode: 0o700 });
  });
  return { id };
}
export async function startImport(owner, id, input) {
  await transaction(async (db) => {
    await db.query('SELECT id FROM user WHERE id=? FOR UPDATE', [owner]);
    const task = await ownedTask(db, owner, id, true);
    if (['queued', 'running'].includes(task.status)) return;
    if (!['review', 'paused', 'completed'].includes(task.status) || new Date(task.expires_at) < new Date())
      throw importError('NOTE_IMPORT_STATE', 409);
    const [active] = await db.query(
      "SELECT id FROM note_import_tasks WHERE owner_id=? AND id<>? AND status IN ('queued','running','parsing') LIMIT 1",
      [owner, id],
    );
    if (active.length) throw importError('NOTE_IMPORT_ALREADY_RUNNING', 409);
    const parentId = input.parentId || null;
    if (task.status !== 'review' && parentId !== task.parent_id) throw importError('NOTE_IMPORT_TARGET_FROZEN', 409);
    const target = await targetFingerprint(db, owner, parentId);
    if (target.shared && input.shareExposureAcknowledged !== true)
      throw importError('NOTE_SHARE_EXPOSURE_CONFIRMATION_REQUIRED', 409);
    if (task.status === 'review') {
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > NOTE_IMPORT_LIMITS.documents)
        throw importError('NOTE_IMPORT_SELECTION');
      const [rows] = await db.query('SELECT id,status FROM note_import_items WHERE task_id=?', [id]);
      const known = new Map(rows.map((r) => [r.id, r]));
      const seen = new Set();
      await db.query('UPDATE note_import_items SET selected=0 WHERE task_id=?', [id]);
      for (const i of input.items) {
        if (
          !known.has(i.id) ||
          known.get(i.id).status !== 'ready' ||
          seen.has(i.id) ||
          typeof i.title !== 'string' ||
          !i.title.trim() ||
          i.title.trim().length > 255
        )
          throw importError('NOTE_IMPORT_SELECTION');
        seen.add(i.id);
        await db.query('UPDATE note_import_items SET title=?,selected=1 WHERE task_id=? AND id=?', [
          i.title.trim(),
          id,
          i.id,
        ]);
      }
    } else {
      await db.query(
        "UPDATE note_import_items SET status='ready',error_code=NULL WHERE task_id=? AND selected=1 AND status='failed' AND error_code<>'NOTE_IMPORT_PARSE_FAILED'",
        [id],
      );
    }
    await db.query(
      "UPDATE note_import_tasks SET progress_json=NULL,finished_at=NULL,status='queued',parent_id=?,share_fingerprint=?,stop_requested=0,error_code=NULL,expires_at=DATE_ADD(NOW(),INTERVAL 7 DAY) WHERE id=?",
      [parentId, target.fingerprint, id],
    );
  });
}
async function parseIsolated(directory, report) {
  return new Promise((resolve, reject) => {
    // No application credentials or unrestricted filesystem/network helpers are supplied to the parser.
    const child = fork(fileURLToPath(new URL('./parseProcess.js', import.meta.url)), [directory], {
      execArgv: ['--max-old-space-size=512'],
      env: { PATH: process.env.PATH || '', NODE_ENV: 'production' },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    let failure = 'NOTE_IMPORT_PARSE_FAILED';
    const timeout = setTimeout(() => {
      failure = 'NOTE_IMPORT_PARSE_TIMEOUT';
      child.kill('SIGKILL');
    }, 60000);
    child.on('message', (m) => {
      if (m?.errorCode) failure = m.errorCode;
      if (m?.progress) report(m.progress);
    });
    child.once('error', () => {
      clearTimeout(timeout);
      reject(importError(failure));
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(importError(failure));
    });
  });
}
export async function processImportTask() {
  const localIds = await localImportTaskIds({ readyOnly: true });
  if (!localIds.length) return false;
  const claimed = await transaction(async (db) => {
    const [[task]] = await db.query(
      "SELECT * FROM note_import_tasks WHERE id IN (?) AND status IN ('parsing','queued','running') AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY create_time LIMIT 1 FOR UPDATE",
      [localIds],
    );
    if (!task) return null;
    const token = randomUUID();
    await db.query(
      'UPDATE note_import_tasks SET lease_token=?,lease_until=DATE_ADD(NOW(),INTERVAL 120 SECOND) WHERE id=?',
      [token, task.id],
    );
    return { ...task, lease_token: token };
  });
  if (!claimed) return false;
  const { id, owner_id: owner, lease_token: token } = claimed;
  const directory = taskDirectory(id);
  const report = createProgressReporter(async (progress) => {
    const [result] = await pool.query(
      "UPDATE note_import_tasks SET progress_json=? WHERE id=? AND lease_token=? AND lease_until>NOW() AND status IN ('parsing','running')",
      [JSON.stringify(progress), id, token],
    );
    if (!result.affectedRows) throw importError('NOTE_IMPORT_LEASE_LOST', 409);
  });
  const update = async (status, code = null) =>
    pool.query(
      "UPDATE note_import_tasks SET status=?,error_code=?,progress_json=NULL,finished_at=IF(? IN ('completed','failed'),NOW(),finished_at),lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
      [status, code, status, id, token],
    );
  try {
    if (claimed.status === 'parsing') {
      try {
        await parseIsolated(directory, report);
      } finally {
        await report.flush();
      }
      const items = await readJson(path.join(directory, 'parsed.json'));
      await transaction(async (db) => {
        const task = await ownedTask(db, owner, id, true);
        if (task.lease_token !== token) throw importError('NOTE_IMPORT_LEASE_LOST', 409);
        for (const item of items)
          await db.query(
            'INSERT IGNORE INTO note_import_items (id,task_id,title,source_name,type,status,selected,warnings,image_count,error_code,position,warning_details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [
              item.id,
              id,
              item.title,
              item.sourceName,
              item.type,
              item.errorCode ? 'failed' : 'ready',
              item.errorCode ? 0 : 1,
              JSON.stringify(item.warnings),
              item.images.length,
              item.errorCode || null,
              item.position,
              JSON.stringify(item.warningDetails || []),
            ],
          );
        await db.query(
          "UPDATE note_import_tasks SET status='review',progress_json=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
          [id, token],
        );
      });
      return true;
    }
    if (claimed.stop_requested) {
      await update('paused');
      return true;
    }
    const [started] = await pool.query(
      "UPDATE note_import_tasks SET status='running',progress_json=NULL WHERE id=? AND lease_token=? AND lease_until>NOW()",
      [id, token],
    );
    if (!started.affectedRows) throw importError('NOTE_IMPORT_LEASE_LOST', 409);
    const [[item]] = await pool.query(
      "SELECT * FROM note_import_items WHERE task_id=? AND selected=1 AND status='ready' ORDER BY position LIMIT 1",
      [id],
    );
    if (!item) {
      await pool.query(
        'UPDATE note_import_tasks SET expires_at=DATE_ADD(NOW(),INTERVAL 7 DAY) WHERE id=? AND lease_token=?',
        [id, token],
      );
      await update('completed');
      return true;
    }
    const payload = await readJson(path.join(directory, `${item.id}.json`));
    const [[counts]] = await pool.query(
      "SELECT COUNT(*) AS total,SUM(status IN ('completed','failed')) AS done FROM note_import_items WHERE task_id=? AND selected=1",
      [id],
    );
    const progress = {
      currentItemId: item.id,
      currentFile: item.source_name,
      filesDone: Number(counts?.done || 0),
      filesTotal: Number(counts?.total || 0),
      imagesDone: 0,
      imagesTotal: payload.images.length,
    };
    await report({ ...progress, stage: 'publishing_images' });
    const assets = [];
    let content = payload.content;
    for (const key of payload.images) {
      const filename = `import-${id}-${key}`;
      await publishImportImage(path.join(directory, 'assets', key), path.join(NOTE_IMAGE_DIR, filename));
      const url = `https://boluo66.top/uploads/${filename}`;
      content = content.replaceAll(`https://note-import.invalid/${key}`, url);
      const size = (await fs.stat(path.join(NOTE_IMAGE_DIR, filename))).size;
      await transaction((db) =>
        registerAsset(db, {
          owner,
          sourceType: 'note_image',
          sourceId: filename,
          locator: filename,
          storage: 'local',
          size,
          reconciled: true,
        }),
      );
      assets.push({ filename, url, size });
      progress.imagesDone++;
      await report({ ...progress, stage: 'publishing_images' });
    }
    await report({ ...progress, stage: 'writing_note' });
    const result = await createNote({
      userId: owner,
      note: { title: item.title, type: item.type, content, parentId: claimed.parent_id },
      idempotencyKey: `note-import:${owner}:${id}:${item.id}`,
      suppressUserRewards: true,
      shareExposureAcknowledged: true,
      trustedImageUrls: assets.map((a) => a.url),
      managedImportImages: assets,
      beforeCreate: async (db) => {
        const task = await ownedTask(db, owner, id, true);
        if (task.lease_token !== token || task.stop_requested) throw importError('NOTE_IMPORT_PAUSED', 409);
        const [[user]] = await db.query('SELECT role FROM user WHERE id=? AND del_flag=0 FOR UPDATE', [owner]);
        if (!user || !['user', 'test', 'root'].includes(user.role))
          throw importError('NOTE_IMPORT_PERMISSION_CHANGED', 403);
        const target = await targetFingerprint(db, owner, task.parent_id);
        if (target.fingerprint !== task.share_fingerprint) throw importError('NOTE_IMPORT_TARGET_CHANGED', 409);
      },
    });
    await transaction(async (db) => {
      const task = await ownedTask(db, owner, id, true);
      if (task.lease_token !== token) return;
      await db.query(
        "UPDATE note_import_items SET status='completed',note_id=?,error_code=NULL WHERE id=? AND task_id=?",
        [result.id, item.id, id],
      );
      await db.query(
        "UPDATE note_import_tasks SET status=IF(stop_requested=1,'paused','running'),progress_json=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
        [id, token],
      );
    });
  } catch (e) {
    const code = e.commitOutcomeUnknown
      ? 'NOTE_IMPORT_COMMIT_OUTCOME_UNKNOWN'
      : String(e.code || 'NOTE_IMPORT_FAILED').slice(0, 80);
    if (claimed.status === 'parsing') await update('failed', code);
    else if (/TARGET|SHARE|TREE|PAUSED|PERMISSION|PARENT|COMMIT_OUTCOME|LEASE/.test(code)) await update('paused', code);
    else {
      await transaction(async (db) => {
        const task = await ownedTask(db, owner, id, true);
        if (task.lease_token !== token) return;
        await db.query(
          "UPDATE note_import_items SET status='failed',error_code=? WHERE task_id=? AND selected=1 AND status='ready' ORDER BY position LIMIT 1",
          [code, id],
        );
        await db.query(
          "UPDATE note_import_tasks SET status='running',error_code=?,progress_json=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
          [code, id, token],
        );
      });
    }
  }
  return true;
}
export async function cleanupImports() {
  const localIds = await localImportTaskIds();
  const [tasks] = localIds.length
    ? await pool.query(
        "SELECT id FROM note_import_tasks WHERE id IN (?) AND expires_at<NOW() AND (lease_until IS NULL OR lease_until<NOW()) AND status NOT IN ('queued','running','parsing','expired') LIMIT 20",
        [localIds],
      )
    : [[]];
  for (const t of tasks) {
    await transaction(async (db) => {
      const [[task]] = await db.query('SELECT * FROM note_import_tasks WHERE id=? FOR UPDATE', [t.id]);
      if (!task || new Date(task.expires_at) > new Date() || ['queued', 'running', 'parsing'].includes(task.status))
        return;
      await fs.rm(taskDirectory(t.id), { recursive: true, force: true });
      await db.query("UPDATE note_import_tasks SET status='expired' WHERE id=?", [t.id]);
    });
  }
  await transaction(async (db) => {
    const [old] = await db.query(
      "SELECT id FROM note_import_tasks WHERE status='expired' AND create_time<DATE_SUB(NOW(),INTERVAL 30 DAY) LIMIT 20 FOR UPDATE",
    );
    for (const t of old) {
      await db.query('DELETE FROM note_import_items WHERE task_id=?', [t.id]);
      await db.query('DELETE FROM note_import_tasks WHERE id=?', [t.id]);
    }
  });
}
