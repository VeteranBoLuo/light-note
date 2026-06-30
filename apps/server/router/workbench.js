import express from 'express';
import * as workbenchHandle from '../router_handle/workbenchHandle.js';

const router = express.Router();

router.post('/summary', workbenchHandle.getWorkbenchSummary);

export default router;
