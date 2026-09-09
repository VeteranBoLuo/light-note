import express from 'express';
import { resultData } from '../util/common.js';
import { resolveImagePreviews, retryImagePreview } from '../util/imagePreview/service.js';
import { classifyImageError } from '../util/imagePreview/errors.js';
const router = express.Router();
router.post('/resolve', async (req, res) => {
  if (!req.user?.id) return res.status(401).send(resultData(null, 401, '请先登录'));
  try {
    return res.send(
      resultData(
        await resolveImagePreviews(req.user.id, req.body?.items, {
          readOnly: Boolean(req.adminContext),
          refreshUrl: req.body?.refreshUrl === true,
        }),
        200,
      ),
    );
  } catch (e) {
    const status = e.code === 'IMAGE_PREVIEW_REQUEST_INVALID' ? 400 : 500;
    if (status === 500) console.warn('[image-preview] resolve failed code=%s', classifyImageError(e));
    return res.status(status).send(resultData(null, status, status === 400 ? '图片预览参数无效' : '图片预览暂不可用'));
  }
});
router.post('/retry', async (req, res) => {
  if (!req.user?.id) return res.status(401).send(resultData(null, 401, '请先登录'));
  if (req.adminContext) return res.status(403).send(resultData(null, 403, '代管模式不可重试图片预览'));
  try {
    return res.send(resultData(await retryImagePreview(req.user.id, req.body?.source), 200));
  } catch (e) {
    const status = e.code === 'IMAGE_PREVIEW_NOT_FOUND' ? 404 : e.code === 'IMAGE_PREVIEW_REQUEST_INVALID' ? 400 : 500;
    return res
      .status(status)
      .send(resultData(null, status, status === 404 ? '图片不存在或无权访问' : '暂时无法重试图片预览'));
  }
});
export default router;
