import express from 'express';
import * as handle from '../router_handle/aiEvaluationHandle.js';

const router = express.Router();

router.post('/runs', handle.listRuns);
router.post('/runs/start', handle.startRun);

export default router;
