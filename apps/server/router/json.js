import express from 'express';
const router = express.Router();
import * as jsonHandle from '../router_handle/jsonHandle.js';

router.post('/getConfigByName', jsonHandle.getConfigByName);

export default router;
