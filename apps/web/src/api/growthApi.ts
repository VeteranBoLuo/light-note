import { apiBaseGet, apiBasePost, apiBasePut } from '@/http/request.ts';

// 读当前用户成长快照(游客返回 Lv.1 默认;root 满级)
export const getMyGrowth = () => apiBaseGet('/api/growth/me');

// 签到(游客后端返回 status 'preview',由 request 拦截统一弹注册引导)
export const checkin = () => apiBasePost('/api/growth/checkin');

// 领取当前已达到的每日任务阶梯奖励（2/3 与 3/3）
export const claimDailyBonus = () => apiBasePost('/api/growth/claimDailyBonus');

// 使用补签卡(补回最近 3 个自然日内指定的一天漏签、续连签)
export const useProtectCard = (date?: string) => apiBasePost('/api/growth/useProtectCard', date ? { date } : {});

// 段位表(「段位路线」总览用,公开只读)
export const getRanks = () => apiBaseGet('/api/growth/ranks');

// 成长看板(成就墙/统计/今日任务/时间线)
export const getDashboard = () => apiBaseGet('/api/growth/dashboard');

// 成长任务定义与当前账号完成状态(PR2；页面展示在后续阶段接入)
export const getGrowthTasks = () => apiBaseGet('/api/growth/tasks');

// 成长任务达成后手动领取经验
export const claimGrowthTask = (taskKey: string) => apiBasePost('/api/growth/tasks/claim', { taskKey });

// 实时本周成长周报(前端「查看大图」用)
export const getWeeklyReport = () => apiBaseGet('/api/growth/weeklyReport');

// 后台成长运营(root):查目标用户成长 + 调整(发经验/设等级/送补签卡)
export const adminGetUserGrowth = (userId: string) => apiBasePost('/api/growth/admin/userGrowth', { userId });
export const adminAdjustGrowth = (payload: {
  userId: string;
  expDelta?: number;
  setLevel?: number | null;
  cardDelta?: number;
  reason: string;
  confirmed: true;
  confirmText: string;
}) => apiBasePost('/api/growth/admin/adjust', payload);

// 标记升级通知已读(查看成长页后)
export const markNoticesRead = () => apiBasePost('/api/growth/notices/read');

// 积分商店:目录 + 当前用户余额/等级/已拥有/已佩戴(游客只读)
export const getShop = () => apiBaseGet('/api/growth/shop');

// 购买商品(补签卡 / AI 加油包 / 称号)
export const buyShopItem = (payload: {
  itemId: string;
  clientRequestId: string;
  economyVersion: string;
  expectedCost: number;
}) => apiBasePost('/api/growth/shop/buy', payload, { silent: true });

// 背包(历史消耗品持有)+ 资产(积分/永久扩容/永久 AI 加油余额)总览
export const getInventory = () => apiBaseGet('/api/growth/inventory');

// 使用一件历史背包消耗品(旧 AI 加油包会转入永久余额);补签卡走 useProtectCard
export const useItemApi = (itemId: string) => apiBasePost('/api/growth/item/use', { itemId });

// 佩戴 / 卸下称号(titleId 为空=卸下)
export const equipTitle = (titleId: string | null) => apiBasePost('/api/growth/equipTitle', { titleId });

// 佩戴 / 卸下头像框装扮(frameId 为空=卸下)
export const equipFrame = (frameId: string | null) => apiBasePost('/api/growth/equipFrame', { frameId });

// 积分抽奖:状态(余额/成本/保底/奖池概率)+ 抽奖(times=1 单抽 / 10 十连)
export const getLottery = () => apiBaseGet('/api/growth/lottery');
export const drawLottery = (payload: {
  mode: 'free' | 'paid';
  times: 1 | 10;
  clientRequestId: string;
  economyVersion: string;
  expectedCost: number;
}) => apiBasePost('/api/growth/lottery/draw', payload, { silent: true });

// 领取成就奖励
export const claimAchievement = (key: string) => apiBasePost('/api/growth/achievement/claim', { key });

// 那年今日 · 智能回顾
export const getRecap = () => apiBaseGet('/api/growth/recap');
export const updateRecapState = (payload: { type: 'bookmark' | 'note'; id: string; action: 'snooze_7d' | 'dismiss' }) =>
  apiBasePost('/api/growth/recap/state', payload);

export const getClaimable = () => apiBaseGet('/api/growth/claimable');
export const claimAll = (payload?: {
  scopes?: Array<'daily' | 'growthTasks' | 'achievements' | 'weekly'>;
  keys?: Partial<Record<'daily' | 'growthTasks' | 'achievements' | 'weekly', string[]>>;
}) => apiBasePost('/api/growth/claimAll', payload || {});

export const getGrowthPreferences = () => apiBaseGet('/api/growth/preferences');
export const updateGrowthPreferences = (payload: {
  weeklyActiveTarget?: 0 | 3 | 5 | 7;
  streakReminderEnabled?: boolean;
  celebrationEnabled?: boolean;
  lowPressureMode?: boolean;
  timezone?: string;
  utcOffsetMinutes?: number;
}) => apiBasePut('/api/growth/preferences', payload);

// 知识活动热力图(贡献格子);year 可选,默认当前年
export const getHeatmap = (year?: number) =>
  apiBaseGet(year ? `/api/growth/heatmap?year=${year}` : '/api/growth/heatmap');

// 每周挑战:进度 + 领取
export const getWeekly = () => apiBaseGet('/api/growth/weekly');
export const claimWeekly = (key: string) => apiBasePost('/api/growth/weekly/claim', { key });

// 积分明细(分页)
export const getPointsLog = (
  limit = 30,
  options: { offset?: number; cursor?: string | null; filter?: 'all' | 'earned' | 'spent' | 'lottery' | 'system' } = {},
) => {
  const query = new URLSearchParams({ limit: String(limit), filter: options.filter || 'all' });
  if (options.cursor) query.set('cursor', options.cursor);
  else if (options.offset) query.set('offset', String(options.offset));
  return apiBaseGet(`/api/growth/points/log?${query.toString()}`);
};

export const getPointsSummary = () => apiBaseGet('/api/growth/points/summary');
export const updatePointsGoal = (payload: { itemId?: string | null; enabled: boolean }) =>
  apiBasePut('/api/growth/preferences/points-goal', payload);

// —— root 积分运营 ——
export const adminPointsOverview = () => apiBasePost('/api/growth/admin/pointsOverview');
export const adminUserPoints = (
  userId: string,
  options: {
    days?: 7 | 28 | 90;
    logCategory?: 'all' | 'stable' | 'oneTime' | 'random' | 'spent' | 'operations';
  } = {},
) => apiBasePost('/api/growth/admin/userPoints', { userId, ...options });
export const adminSearchUsers = (keyword: string, limit = 20) =>
  apiBasePost('/api/growth/admin/searchUsers', { keyword, limit });
export const adminGrantPoints = (
  payload: {
    userId: string;
    points?: number;
    cards?: number;
    storageMb?: number;
    reasonCode: 'customer_support' | 'incident_compensation' | 'data_correction' | 'test_acceptance' | 'other';
    note?: string;
    ticketRef?: string;
    reason: string;
    confirmed: true;
    confirmText: string;
  },
  requestId: string,
) =>
  apiBasePost('/api/growth/admin/grantPoints', payload, {
    headers: { 'X-Request-Id': requestId },
    silent: true,
  });

export interface PointsGovernanceRange {
  presetDays?: 7 | 28 | 90;
  startDate?: string;
  endDate?: string;
  policyVersion?: string;
  economyVersion?: string;
}

export const adminPointsGovernanceOverview = (payload: PointsGovernanceRange = {}) =>
  apiBasePost('/api/growth/admin/pointsGovernanceOverview', payload);
export const adminPointsGovernanceSources = (payload: PointsGovernanceRange = {}) =>
  apiBasePost('/api/growth/admin/pointsGovernanceSources', payload);
export const adminPointsAnomalies = (payload: PointsGovernanceRange & { limit?: number } = {}) =>
  apiBasePost('/api/growth/admin/pointsAnomalies', payload);
export const adminPointsReconciliation = (
  payload: { cursor?: string | null; limit?: number; onlyMismatch?: boolean } = {},
) => apiBasePost('/api/growth/admin/pointsReconciliation', payload);
export const adminPointsCorrection = (
  payload: {
    userId: string;
    expectedDifference: number;
    note?: string;
    reason: string;
    confirmed: true;
    confirmText: string;
  },
  requestId: string,
) =>
  apiBasePost('/api/growth/admin/pointsCorrection', payload, {
    headers: { 'X-Request-Id': requestId },
    silent: true,
  });
export const adminPointsSimulator = (payload: Record<string, unknown> = {}) =>
  apiBasePost('/api/growth/admin/pointsSimulator', payload);

export const adminPointsCampaigns = (limit = 30) => apiBasePost('/api/growth/admin/campaigns/list', { limit });
export const adminPointsCampaignDetail = (publicId: string) =>
  apiBasePost('/api/growth/admin/campaigns/detail', { publicId });
export const adminCreatePointsCampaign = (payload: Record<string, unknown>, requestId: string) =>
  apiBasePost('/api/growth/admin/campaigns/create', payload, {
    headers: { 'X-Request-Id': requestId },
    silent: true,
  });
export const adminPreviewPointsCampaign = (publicId: string, requestId: string) =>
  apiBasePost(
    '/api/growth/admin/campaigns/preview',
    { publicId, reason: '预览活动受众和积分影响' },
    {
      headers: { 'X-Request-Id': requestId },
      silent: true,
    },
  );
export const adminFreezePointsCampaign = (
  payload: {
    publicId: string;
    reason: string;
    confirmed: true;
    confirmText: string;
  },
  requestId: string,
) =>
  apiBasePost('/api/growth/admin/campaigns/freeze', payload, {
    headers: { 'X-Request-Id': requestId },
    silent: true,
  });
export const adminConfirmPointsCampaign = (
  payload: {
    publicId: string;
    reason: string;
    confirmed: true;
    confirmText: string;
  },
  requestId: string,
) =>
  apiBasePost('/api/growth/admin/campaigns/confirm', payload, {
    headers: { 'X-Request-Id': requestId },
    silent: true,
  });
export const adminExecutePointsCampaign = (
  payload: {
    publicId: string;
    batchSize?: number;
    reason: string;
    confirmed: true;
    confirmText: string;
  },
  requestId: string,
) =>
  apiBasePost('/api/growth/admin/campaigns/execute', payload, {
    headers: { 'X-Request-Id': requestId },
    silent: true,
  });
export const adminDeletePointsCampaign = (
  payload: {
    publicId: string;
    reason: string;
    confirmed: true;
    confirmText: string;
  },
  requestId: string,
) =>
  apiBasePost('/api/growth/admin/campaigns/delete', payload, {
    headers: { 'X-Request-Id': requestId },
    silent: true,
  });

export default {
  getMyGrowth,
  checkin,
  claimDailyBonus,
  useProtectCard,
  getRanks,
  getDashboard,
  getGrowthTasks,
  claimGrowthTask,
  getWeeklyReport,
  adminGetUserGrowth,
  adminAdjustGrowth,
  markNoticesRead,
  getShop,
  buyShopItem,
  getInventory,
  useItemApi,
  equipTitle,
  equipFrame,
  getLottery,
  drawLottery,
  claimAchievement,
  getRecap,
  updateRecapState,
  getClaimable,
  claimAll,
  getGrowthPreferences,
  updateGrowthPreferences,
  getHeatmap,
  getWeekly,
  claimWeekly,
  getPointsLog,
  getPointsSummary,
  updatePointsGoal,
  adminPointsOverview,
  adminUserPoints,
  adminSearchUsers,
  adminGrantPoints,
  adminPointsGovernanceOverview,
  adminPointsGovernanceSources,
  adminPointsAnomalies,
  adminPointsReconciliation,
  adminPointsCorrection,
  adminPointsSimulator,
  adminPointsCampaigns,
  adminPointsCampaignDetail,
  adminCreatePointsCampaign,
  adminPreviewPointsCampaign,
  adminFreezePointsCampaign,
  adminConfirmPointsCampaign,
  adminExecutePointsCampaign,
  adminDeletePointsCampaign,
};
