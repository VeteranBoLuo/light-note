import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureNotVisitor } from '../util/auth.js';
import { resultData, L } from '../util/common.js';
import { createTask, latestTask, ownedTask, presentTask, cancelTask, failurePage } from '../util/dataExport/service.js';
import { taskDirectory, exportError } from '../util/dataExport/storage.js';
const router = express.Router();
router.use((req, res, next) => {
  if (req.adminContext) return res.sendStatus(403);
  if (ensureNotVisitor(req, res)) next();
});
const handler = (fn) => async (req, res) => {
  try {
    res.send(resultData(await fn(req)));
  } catch (e) {
    const code = /^DATA_EXPORT_[A-Z_]+$/.test(e.code || '')
      ? e.code
      : ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(e.code)
        ? 'DATA_EXPORT_UNAVAILABLE'
        : 'DATA_EXPORT_FAILED';
    res.send(
      resultData(
        { errorCode: code },
        e.status || 503,
        L(req, '导出操作未完成，请稍后重试', 'Export could not complete. Please try again later'),
      ),
    );
  }
};
router.post(
  '/create',
  handler((req) => createTask(req.user.id, req.body)),
);
router.post(
  '/latest',
  handler((req) => latestTask(req.user.id)),
);
router.post(
  '/detail',
  handler(async (req) => presentTask(await ownedTask(req.user.id, req.body.id))),
);
router.post(
  '/cancel',
  handler((req) => cancelTask(req.user.id, req.body.id)),
);
router.post(
  '/failures',
  handler((req) => failurePage(req.user.id, req.body.id, req.body.offset || 0)),
);
router.get('/download/:id', async (req, res) => {
  try {
    const task = await ownedTask(req.user.id, req.params.id);
    if (!presentTask(task).canDownload) throw exportError('DATA_EXPORT_EXPIRED', 410);
    const file = path.join(taskDirectory(task.id), 'export.zip');
    await fs.access(file);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.download(file, `轻笺导出_${new Date(task.create_time).toISOString().slice(0, 10)}.zip`, (e) => {
      if (e && !res.headersSent) res.sendStatus(404);
    });
  } catch (e) {
    res.sendStatus(e.status || 404);
  }
});
export default router;
