import express from 'express';
import * as growthHandle from '../router_handle/growthHandle.js';

const router = express.Router();

router.get('/me', growthHandle.getMyGrowth);
router.post('/checkin', growthHandle.doCheckin);

export default router;
