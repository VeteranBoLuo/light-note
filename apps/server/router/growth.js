import express from 'express';
import * as growthHandle from '../router_handle/growthHandle.js';

const router = express.Router();

router.get('/me', growthHandle.getMyGrowth);
router.get('/dashboard', growthHandle.getDashboard);
router.get('/ranks', growthHandle.getRanks);
router.post('/checkin', growthHandle.doCheckin);
router.post('/useProtectCard', growthHandle.doUseProtectCard);
router.get('/weeklyReport', growthHandle.getWeeklyReport);
router.post('/admin/userGrowth', growthHandle.getUserGrowthForAdmin);
router.post('/admin/adjust', growthHandle.doAdminAdjustGrowth);
router.post('/claimDailyBonus', growthHandle.claimDailyBonus);
router.get('/shop', growthHandle.getShop);
router.post('/shop/buy', growthHandle.buyShopItem);
router.post('/equipTitle', growthHandle.equipTitleHandle);
router.get('/lottery', growthHandle.getLottery);
router.post('/lottery/draw', growthHandle.doDrawLottery);
router.post('/achievement/claim', growthHandle.doClaimAchievement);
router.get('/weekly', growthHandle.getWeekly);
router.post('/weekly/claim', growthHandle.doClaimWeekly);
router.get('/points/log', growthHandle.getMyPointsLog);
router.post('/admin/pointsOverview', growthHandle.getPointsOverviewForAdmin);
router.post('/admin/userPoints', growthHandle.getUserPointsForAdmin);
router.post('/admin/grantPoints', growthHandle.doAdminGrantPoints);
router.post('/notices/read', growthHandle.readNotices);

export default router;
