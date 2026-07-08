import express from 'express';
import * as growthHandle from '../router_handle/growthHandle.js';

const router = express.Router();

router.get('/me', growthHandle.getMyGrowth);
router.get('/ranks', growthHandle.getRanks);
router.post('/checkin', growthHandle.doCheckin);
router.post('/notices/read', growthHandle.readNotices);

export default router;
