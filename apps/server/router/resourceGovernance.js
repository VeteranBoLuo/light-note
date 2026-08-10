import express from 'express';
import * as handle from '../router_handle/resourceGovernanceHandle.js';

const router = express.Router();

router.post('/scans', handle.createScan);
router.get('/scans/:id', handle.getScan);
router.post('/findings/query', handle.queryFindings);
router.get('/findings/:id', handle.getFinding);
router.post('/findings/ignore', handle.ignoreFinding);
router.post('/invalid-owners/cleanup', handle.cleanupInvalidOwners);
router.post('/jobs/preview', handle.previewJob);
router.post('/jobs', handle.createJob);
router.post('/jobs/query', handle.queryJobs);
router.get('/jobs/:id', handle.getJob);
router.post('/jobs/:id/retry', handle.retryJob);
router.post('/jobs/:id/cancel', handle.cancelJob);
router.post('/audits/query', handle.queryAudits);

export default router;
