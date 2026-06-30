import express from 'express';
import * as trashHandle from '../router_handle/trashHandle.js';

const router = express.Router();

router.post('/list', trashHandle.getTrashList);
router.post('/fileSize', trashHandle.getTrashFileSize);
router.post('/restore', trashHandle.restoreTrash);
router.post('/restoreAll', trashHandle.restoreAllTrash);
router.post('/permanentDelete', trashHandle.permanentDelete);
router.post('/emptyAll', trashHandle.emptyTrash);

export default router;
