import { apiBaseGet, apiBasePost } from '@/http/request.ts';

// 读当前用户成长快照(游客返回 Lv.1 默认;root 满级)
export const getMyGrowth = () => apiBaseGet('/api/growth/me');

// 签到(游客后端返回 status 'preview',由 request 拦截统一弹注册引导)
export const checkin = () => apiBasePost('/api/growth/checkin');

// 领取今日任务奖励(全部完成后)
export const claimDailyBonus = () => apiBasePost('/api/growth/claimDailyBonus');

// 使用补签卡(补回昨天漏签、续连签)
export const useProtectCard = () => apiBasePost('/api/growth/useProtectCard');

// 段位表(「段位路线」总览用,公开只读)
export const getRanks = () => apiBaseGet('/api/growth/ranks');

// 成长看板(成就墙/统计/今日任务/时间线)
export const getDashboard = () => apiBaseGet('/api/growth/dashboard');

// 实时本周成长周报(前端「查看大图」用)
export const getWeeklyReport = () => apiBaseGet('/api/growth/weeklyReport');

// 后台成长运营(root):查目标用户成长 + 调整(发经验/设等级/送补签卡)
export const adminGetUserGrowth = (userId: string) => apiBasePost('/api/growth/admin/userGrowth', { userId });
export const adminAdjustGrowth = (payload: { userId: string; expDelta?: number; setLevel?: number | null; cardDelta?: number }) =>
  apiBasePost('/api/growth/admin/adjust', payload);

// 标记升级通知已读(查看成长页后)
export const markNoticesRead = () => apiBasePost('/api/growth/notices/read');

// 积分商店:目录 + 当前用户余额/等级/已拥有/已佩戴(游客只读)
export const getShop = () => apiBaseGet('/api/growth/shop');

// 购买商品(补签卡 / AI 加油包 / 称号)
export const buyShopItem = (itemId: string) => apiBasePost('/api/growth/shop/buy', { itemId });

// 佩戴 / 卸下称号(titleId 为空=卸下)
export const equipTitle = (titleId: string | null) => apiBasePost('/api/growth/equipTitle', { titleId });

// 积分抽奖:状态(余额/成本/保底/奖池概率)+ 抽奖(times=1 单抽 / 10 十连)
export const getLottery = () => apiBaseGet('/api/growth/lottery');
export const drawLottery = (times: number, free = false) => apiBasePost('/api/growth/lottery/draw', { times, free });

// 领取成就奖励
export const claimAchievement = (key: string) => apiBasePost('/api/growth/achievement/claim', { key });

// 那年今日 · 智能回顾
export const getRecap = () => apiBaseGet('/api/growth/recap');

// 每周挑战:进度 + 领取
export const getWeekly = () => apiBaseGet('/api/growth/weekly');
export const claimWeekly = (key: string) => apiBasePost('/api/growth/weekly/claim', { key });

// 积分明细(分页)
export const getPointsLog = (limit = 30, offset = 0) => apiBaseGet(`/api/growth/points/log?limit=${limit}&offset=${offset}`);

// —— root 积分运营 ——
export const adminPointsOverview = () => apiBasePost('/api/growth/admin/pointsOverview');
export const adminUserPoints = (userId: string) => apiBasePost('/api/growth/admin/userPoints', { userId });
export const adminGrantPoints = (payload: { userId: string; points?: number; cards?: number; storageMb?: number; note?: string }) =>
  apiBasePost('/api/growth/admin/grantPoints', payload);

export default {
  getMyGrowth,
  checkin,
  claimDailyBonus,
  useProtectCard,
  getRanks,
  getDashboard,
  getWeeklyReport,
  adminGetUserGrowth,
  adminAdjustGrowth,
  markNoticesRead,
  getShop,
  buyShopItem,
  equipTitle,
  getLottery,
  drawLottery,
  claimAchievement,
  getRecap,
  getWeekly,
  claimWeekly,
  getPointsLog,
  adminPointsOverview,
  adminUserPoints,
  adminGrantPoints,
};
