import express from 'express';
import * as handle from '../router_handle/extractionHandle.js';
import { aiActionRateLimiter, localProcessingRateLimiter } from '../util/requestRateLimit.js';
// common.js also owns root route registration; resolve handlers at dispatch to
// avoid accessing their bindings while that existing module cycle initializes.
const router = express.Router();
router.get('/', (req, res) => handle.list(req, res));
router.post('/', localProcessingRateLimiter, (req, res) => handle.create(req, res));
router.get('/:id', (req, res) => handle.read(req, res));
router.post('/:id/actions', aiActionRateLimiter, (req, res) => handle.action(req, res));
router.get('/:id/records', (req, res) => handle.records(req, res));
router.get('/:id/next-pending', (req, res) => handle.nextPending(req, res));
router.get('/:id/sources/:sourceId', (req, res) => handle.source(req, res));
router.post('/:id/note-summary', localProcessingRateLimiter, (req, res) => handle.noteSummary(req, res));
router.patch('/:id/records/:recordId', localProcessingRateLimiter, (req, res) => handle.review(req, res));
router.post('/:id/export', localProcessingRateLimiter, (req, res) => handle.exportData(req, res));
router.delete('/:id', localProcessingRateLimiter, (req, res) => handle.remove(req, res));
export default router;
