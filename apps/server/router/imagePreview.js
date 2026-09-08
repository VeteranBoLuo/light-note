import express from 'express';
import { resultData } from '../util/common.js';
import { resolveImagePreviews } from '../util/imagePreview/service.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
const router = express.Router();
router.post('/resolve', async (req, res) => {
  if (!req.user?.id) return res.status(401).send(resultData(null, 401, '请先登录'));
  try {
    return res.send(
      resultData(
        await resolveImagePreviews(req.user.id, req.body?.items, { readOnly: Boolean(req.adminContext) }),
        200,
      ),
    );
  } catch (e) {
    const status = e.code === 'IMAGE_PREVIEW_REQUEST_INVALID' ? 400 : 500;
    if (status === 500) console.warn('[image-preview] resolve failed code=%s', stableAgentErrorCode(e));
    return res.status(status).send(resultData(null, status, status === 400 ? '图片预览参数无效' : '图片预览暂不可用'));
  }
});
export default router;
