import express from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db/index.js';
import { readIdentity, renewIdentity, sameOrigin } from '../util/collectionForms/identity.js';
import { createFormsService } from '../util/collectionForms/service.js';
import { FormError, csvCell } from '@lightnote/shared/collection-forms';

const service = createFormsService(pool);
const send = (fn) => async (req, res, next) => {
  try {
    const data = await fn(req, res);
    if (!res.headersSent) res.json({ status: 200, msg: '', data });
  } catch (e) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = e instanceof FormError ? e.status : 500;
    res.status(status).json({
      status,
      msg: status === 500 ? '暂时无法完成操作，请稍后重试' : e.message,
      data: { field: e.field || '' },
    });
  }
};
const privateHeaders = (_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  next();
};
export const publicFormsRouter = express.Router();
publicFormsRouter.use(privateHeaders);
publicFormsRouter.use(
  rateLimit({
    windowMs: 60000,
    limit: 90,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, msg: '访问频繁，请稍后重试', data: null },
  }),
);
publicFormsRouter.use(express.json({ limit: '1mb' }));
publicFormsRouter.param('publicId', (req, res, next, value) =>
  /^[a-f0-9]{48}$/.test(value) ? next() : res.status(404).json({ status: 404, msg: '收集页面不存在', data: null }),
);
publicFormsRouter.get(
  '/:publicId',
  send(async (req, res) => {
    const identity = readIdentity(req);
    const form = await service.publicForm(req.params.publicId, identity);
    if (form.submissionPolicy === 'replace') renewIdentity(res, identity);
    return form;
  }),
);
publicFormsRouter.post(
  '/:publicId/responses',
  rateLimit({
    windowMs: 60000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, msg: '提交频繁，请稍后重试', data: null },
  }),
  send((req) => {
    if (!sameOrigin(req)) throw new FormError('请从本站表单页面提交', 403);
    return service.submit(req.params.publicId, req.body, readIdentity(req));
  }),
);
publicFormsRouter.use((err, req, res, next) =>
  res
    .status(err.type === 'entity.too.large' ? 413 : 400)
    .json({ status: err.type === 'entity.too.large' ? 413 : 400, msg: '提交内容格式或大小不符合要求', data: null }),
);
// Never fall through to authenticated middleware, even for unsupported public endpoints.
publicFormsRouter.use((_req, res) => res.status(404).json({ status: 404, msg: '页面不存在', data: null }));

const router = express.Router();
router.use(privateHeaders);
router.use((req, res, next) => {
  if (
    req.adminContext ||
    req.isAdminPreview ||
    !req.user?.id ||
    req.user.role === 'visitor' ||
    req.user.isDeletedOrDisabled
  )
    return res.status(403).json({ status: 403, msg: '请使用自己的正式账号管理公开收集', data: null });
  if (['POST', 'PATCH'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)))
    return res.status(400).json({ status: 400, msg: '请求格式无效', data: null });
  next();
});
router.get(
  '/',
  send((req) => service.list(req.user.id, req.query)),
);
router.get(
  '/tags',
  send(
    async (req) =>
      (await pool.query('SELECT id,name FROM tag WHERE user_id=? AND del_flag=0 ORDER BY sort,name', [req.user.id]))[0],
  ),
);
router.post(
  '/',
  send((req) => service.create(req.user.id, req.body)),
);
router.get(
  '/:id',
  send((req) => service.get(req.user.id, req.params.id)),
);
router.patch(
  '/:id',
  send((req) => service.update(req.user.id, req.params.id, req.body)),
);
router.post(
  '/:id/actions',
  send((req) => service.action(req.user.id, req.params.id, req.body)),
);
router.get(
  '/:id/responses',
  send((req) => service.responses(req.user.id, req.params.id, req.query)),
);
router.post(
  '/:id/responses/actions',
  send((req) => service.mark(req.user.id, req.params.id, req.body)),
);
router.get(
  '/:id/statistics',
  send((req) => service.statistics(req.user.id, req.params.id, req.query)),
);
router.get(
  '/:id/text-answers',
  send((req) => service.textAnswers(req.user.id, req.params.id, req.query)),
);
router.get(
  '/:id/export',
  send(async (req, res) => {
    const form = await service.get(req.user.id, req.params.id);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="collection.csv"',
    });
    const write = async (cells) => {
      if (res.destroyed) throw new Error('CLOSED');
      if (!res.write(cells.map(csvCell).join(',') + '\r\n'))
        await new Promise((resolve, reject) => {
          const done = () => {
            res.off('drain', drain);
            res.off('close', close);
          };
          const drain = () => {
            done();
            resolve();
          };
          const close = () => {
            done();
            reject(new Error('CLOSED'));
          };
          res.once('drain', drain);
          res.once('close', close);
        });
    };
    res.write('\uFEFF');
    await write([
      '提交编号',
      '首次提交时间（UTC）',
      '最后更新时间（UTC）',
      '已读',
      '已处理',
      '垃圾提交',
      '内部备注',
      ...form.definition.questions.map((q) => q.title),
    ]);
    for await (const row of service.exportRows(req.user.id, req.params.id, req.query)) {
      await write([
        row.id,
        new Date(row.created_at).toISOString(),
        new Date(row.updated_at || row.created_at).toISOString(),
        row.is_read,
        row.processed,
        row.spam,
        row.private_note,
        ...form.definition.questions.map((q) => {
          const value = row.answers[q.id];
          if (q.type === 'single') return q.options.find((o) => o.id === value)?.label || '';
          if (q.type === 'multiple')
            return (value || []).map((id) => q.options.find((o) => o.id === id)?.label || '').join('；');
          return value;
        }),
      ]);
    }
    res.end();
  }),
);
export default router;
