import express from 'express';
import * as dailyReviewHandle from '../router_handle/dailyReviewHandle.js';

const router = express.Router();

router.get('/today', dailyReviewHandle.getToday);
router.post('/today/ensure', dailyReviewHandle.ensureToday);
router.post('/today/action', dailyReviewHandle.actOnToday);
router.post('/items/:id/action', dailyReviewHandle.actOnItem);

export default router;
