import express from 'express';
const router = express.Router();
import * as jsonHandle from '../router_handle/jsonHandle.js';

router.post('/getConfigByName', jsonHandle.getConfigByName);
router.post('/deleteConfigById', jsonHandle.deleteConfigById);
router.post('/updateConfig', jsonHandle.updateConfig);

export default router;
