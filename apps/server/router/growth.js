import express from 'express';
import * as growthHandle from '../router_handle/growthHandle.js';

const router = express.Router();

router.get('/me', growthHandle.getMyGrowth);
router.get('/dashboard', growthHandle.getDashboard);
router.get('/ranks', growthHandle.getRanks);
router.post('/checkin', growthHandle.doCheckin);
router.post('/claimDailyBonus', growthHandle.claimDailyBonus);
router.post('/notices/read', growthHandle.readNotices);

export default router;
