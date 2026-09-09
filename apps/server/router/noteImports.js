import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { ensureNotVisitor } from '../util/auth.js';
import { resultData, L } from '../util/common.js';
import { NOTE_IMPORT_EXTENSIONS, NOTE_IMPORT_LIMITS as LIMIT } from '@lightnote/shared/note-transfer';
import { createImportTask, getImportTask, startImport, ownedTask, transaction } from '../util/noteImport/service.js';
import { taskDirectory, importError, readJson, writeJson } from '../util/noteImport/storage.js';
const router = express.Router();
const handler = (fn) => async (req, res) => {
  try {
    return res.send(resultData(await fn(req)));
  } catch (e) {
    const code = /^(NOTE_IMPORT_|NOTE_SHARE_|NOTE_TREE_)/.test(e.code) ? e.code : 'NOTE_IMPORT_FAILED';
    return res.send(
      resultData(
        { errorCode: code },
        Number(e.status) || 400,
        L(
          req,
          '导入操作未完成，请检查文件、目标位置或任务状态',
          'Import could not complete. Check the files, destination or task status',
        ),
      ),
    );
  }
};
const owner = (req) => req.user.id;
const writeGuard = (req, res, next) => {
  if (ensureNotVisitor(req, res)) next();
};
router.post(
  '/list',
  handler(async (req) => {
    const [rows] = await pool.query(
      "SELECT t.id,t.status,t.parent_id,t.error_code,t.create_time,(SELECT COUNT(*) FROM note_import_items i WHERE i.task_id=t.id AND i.status='failed') AS failed_count FROM note_import_tasks t WHERE owner_id=? ORDER BY create_time DESC LIMIT 30",
      [owner(req)],
    );
    return rows;
  }),
);
router.post(
  '/detail',
  handler((req) => getImportTask(owner(req), req.body.id)),
);
router.post(
  '/preview',
  handler(async (req) => {
    const task = await ownedTask(pool, owner(req), req.body.id);
    if (!['review', 'paused', 'completed'].includes(task.status)) throw importError('NOTE_IMPORT_STATE', 409);
    const [[item]] = await pool.query('SELECT id,type FROM note_import_items WHERE task_id=? AND id=?', [
      task.id,
      req.body.itemId,
    ]);
    if (!item) throw importError('NOTE_IMPORT_NOT_FOUND', 404);
    const payload = await readJson(path.join(taskDirectory(task.id), `${item.id}.json`));
    return {
      content: payload.content.replaceAll('https://note-import.invalid/', `/api/note/imports/image?id=${task.id}&key=`),
      type: item.type,
    };
  }),
);
router.get('/image', async (req, res) => {
  try {
    const task = await ownedTask(pool, owner(req), String(req.query.id || ''));
    if (!['review', 'paused', 'completed'].includes(task.status)) throw importError('NOTE_IMPORT_STATE');
    const key = String(req.query.key || '');
    if (!/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(key)) throw importError('NOTE_IMPORT_NOT_FOUND');
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(taskDirectory(task.id), 'assets', key));
  } catch {
    res.sendStatus(404);
  }
});
router.post(
  '/create',
  writeGuard,
  handler((req) => createImportTask(owner(req))),
);
// All upload payloads stay in private staging, with both per-file and total budget checks.
router.post('/upload', writeGuard, async (req, res) => {
  const id = String(req.query.id || '');
  let temporary;
  try {
    const task = await ownedTask(pool, owner(req), id);
    if (task.status !== 'uploading') throw importError('NOTE_IMPORT_STATE', 409);
    if (Number(req.headers['content-length'] || 0) > LIMIT.uploadBytes + 1024 * 1024)
      throw importError('NOTE_IMPORT_UPLOAD_LIMIT', 413);
    let receivedBytes = 0;
    req.on('data', (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > LIMIT.uploadBytes + 1024 * 1024) req.destroy();
    });
    temporary = path.join(taskDirectory(id), `incoming-${randomUUID()}`);
    await fs.mkdir(temporary, { recursive: true, mode: 0o700 });
    const upload = multer({
      dest: temporary,
      limits: { fileSize: LIMIT.uploadBytes, files: LIMIT.documents, fields: 0 },
      fileFilter: (req, file, cb) =>
        NOTE_IMPORT_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase())
          ? cb(null, true)
          : cb(importError('NOTE_IMPORT_UNSUPPORTED_FORMAT')),
    }).array('files', LIMIT.documents);
    await new Promise((resolve, reject) => upload(req, res, (e) => (e ? reject(e) : resolve())));
    await transaction(async (db) => {
      const current = await ownedTask(db, owner(req), id, true);
      const files = req.files || [];
      const size = files.reduce((n, f) => n + f.size, 0);
      if (current.status !== 'uploading' || !files.length || Number(current.upload_bytes) + size > LIMIT.uploadBytes)
        throw importError('NOTE_IMPORT_UPLOAD_LIMIT', 413);
      const destination = path.join(taskDirectory(id), 'uploads');
      await fs.mkdir(destination, { recursive: true, mode: 0o700 });
      const existing = await fs.readdir(destination);
      if (existing.filter((f) => f.endsWith('.json')).length + files.length > LIMIT.documents)
        throw importError('NOTE_IMPORT_DOCUMENT_LIMIT');
      for (const file of files) {
        const key = randomUUID();
        let name = file.originalname; // Multipart browser filenames use UTF-8 bytes represented as latin1.
        if (!/[^\u0000-\u00ff]/.test(name)) {
          const decoded = Buffer.from(name, 'latin1').toString('utf8');
          if (!decoded.includes('\ufffd')) name = decoded;
        }
        await fs.rename(file.path, path.join(destination, key));
        await writeJson(path.join(destination, `${key}.json`), { key, name: path.basename(name) });
      }
      await db.query('UPDATE note_import_tasks SET upload_bytes=upload_bytes+? WHERE id=?', [size, id]);
    });
    return res.send(resultData({ id }));
  } catch (e) {
    return res.send(
      resultData(
        { errorCode: e.code || 'NOTE_IMPORT_UPLOAD_FAILED' },
        400,
        L(req, '上传失败或超过导入限制', 'Upload failed or import limit exceeded'),
      ),
    );
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
});
router.post(
  '/parse',
  writeGuard,
  handler(async (req) =>
    transaction(async (db) => {
      await db.query('SELECT id FROM user WHERE id=? FOR UPDATE', [owner(req)]);
      const task = await ownedTask(db, owner(req), req.body.id, true);
      if (task.status === 'parsing') return { id: task.id };
      if (task.status !== 'uploading' || !Number(task.upload_bytes)) throw importError('NOTE_IMPORT_STATE', 409);
      const [active] = await db.query(
        "SELECT id FROM note_import_tasks WHERE owner_id=? AND id<>? AND status IN ('parsing','queued','running')",
        [owner(req), task.id],
      );
      if (active.length) throw importError('NOTE_IMPORT_ALREADY_RUNNING', 409);
      await db.query("UPDATE note_import_tasks SET status='parsing' WHERE id=?", [task.id]);
      return { id: task.id };
    }),
  ),
);
router.post(
  '/start',
  writeGuard,
  handler(async (req) => {
    await startImport(owner(req), req.body.id, req.body);
    return getImportTask(owner(req), req.body.id);
  }),
);
router.post(
  '/stop',
  writeGuard,
  handler(async (req) =>
    transaction(async (db) => {
      const task = await ownedTask(db, owner(req), req.body.id, true);
      if (['queued', 'running'].includes(task.status))
        await db.query('UPDATE note_import_tasks SET stop_requested=1 WHERE id=?', [task.id]);
      return { id: task.id };
    }),
  ),
);
export default router;
