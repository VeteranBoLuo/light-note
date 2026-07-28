import express from 'express';
import multer from 'multer';
import os from 'node:os';
import { ensureNotVisitor } from '../util/auth.js';
import { L, resultData } from '../util/common.js';
import { UPDATE_LOG_IMAGE_MAX_BYTES } from '../util/updateLog.js';
import * as updateLogHandle from '../router_handle/updateLogHandle.js';

const router = express.Router();
const imageUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: UPDATE_LOG_IMAGE_MAX_BYTES },
});

function requireRoot(req, res, next) {
  if (!ensureNotVisitor(req, res)) return;
  if (req.user?.role !== 'root') {
    return res.send(resultData(null, 403, L(req, '没有操作权限', 'Permission denied')));
  }
  next();
}

router.post('/list', updateLogHandle.list);
router.post('/manageList', updateLogHandle.manageList);
router.post('/createDraft', updateLogHandle.createDraft);
router.post('/save', updateLogHandle.save);
router.post('/delete', updateLogHandle.remove);
router.post('/cleanupImages', updateLogHandle.cleanupImages);
router.get('/image/:logId/:fileName', updateLogHandle.image);
router.post('/uploadImage', requireRoot, (req, res) => {
  imageUpload.single('file')(req, res, (error) => {
    if (error) {
      const tooLarge = error?.code === 'LIMIT_FILE_SIZE';
      return res.send(
        resultData(
          { code: tooLarge ? 'IMAGE_SIZE_INVALID' : 'IMAGE_UPLOAD_INVALID' },
          tooLarge ? 413 : 400,
          tooLarge
            ? L(req, '图片大小必须在 5MB 以内', 'Image size must be within 5MB')
            : L(req, '图片上传请求不合法', 'Invalid image upload request'),
        ),
      );
    }
    return updateLogHandle.uploadImage(req, res);
  });
});

export default router;
