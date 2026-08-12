import {
  getGrowth,
  getGrowthDashboard,
  getActivityHeatmap,
  checkin,
  useProtectCard,
  adminAdjustGrowth,
  RANKS,
  markNoticesRead,
} from '../util/growth.js';
import { buildWeeklyReport } from '../util/weeklyReport.js';
import { L, resultData } from '../util/common.js';
import { ensureNotVisitor, ensureUserOrAdminPolicy } from '../util/auth.js';
import {
  FRAME_CATALOG,
  SHOP_ITEMS,
  getOwnedCosmetics,
  buyItem,
  equipTitle,
  equipFrame,
  getPointsLog,
  getPointsOverview,
  adminGrantPoints,
  getUserPointsDetail,
  searchAdminUsers,
  AdminPointsError,
} from '../util/points.js';
import { drawLottery, getLotteryStatus, freeDrawsFor } from '../util/lottery.js';
import { getInventory, useItem } from '../util/items.js';
import { getWeeklyChallenges } from '../util/weeklyChallenge.js';
import { getRecap, updateRecapState } from '../util/recap.js';
import { getGrowthTasks } from '../util/growthTaskService.js';
import { claimGrowthRewards, getGrowthClaimableSnapshot } from '../util/growthClaimService.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  adminActionErrorResponse,
  beginAdminAction,
  finishAdminAction,
} from '../util/adminActionExecution.js';
import { getGrowthPreferences, updateGrowthPreferences } from '../util/growthPreferences.js';
import { isGrowthCenterV2Enabled } from '../util/growthFeature.js';

// GET /growth/me —— 读当前用户成长快照(游客返回 Lv.1 默认展示,不发经验;root 展示满级)
export const getMyGrowth = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    const userRole = req.user?.role || 'visitor';
    const growth = await getGrowth(userId, { userRole });
    growth.features = { growthCenterV2: isGrowthCenterV2Enabled({ userId, userRole }) };
    res.send(resultData(growth));
  } catch (error) {
    console.error('获取成长信息失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '获取成长信息失败', 'Failed to load growth data')));
  }
};

// POST /growth/checkin —— 签到(游客走 preview 注册引导;ensureNotVisitor 须在取连接前调用)
export const doCheckin = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await checkin(req.user.id, { userRole: req.user.role });
    res.send(resultData(result));
  } catch (error) {
    console.error('签到失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '签到失败，请稍后重试', 'Check-in failed. Please try again.')));
  }
};

// POST /growth/useProtectCard —— 使用补签卡补回最近 3 个自然日内的漏签(消耗 1 张卡)
export const doUseProtectCard = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await useProtectCard(req.user.id, { userRole: req.user.role, date: req.body?.date });
    res.send(resultData(result));
  } catch (error) {
    console.error('补签失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '补签失败，请稍后重试', 'Make-up check-in failed. Please try again.')));
  }
};

// GET /growth/weeklyReport —— 实时生成当前用户本周周报(供前端随时「查看大图」,不发通知)
export const getWeeklyReport = async (req, res) => {
  if (!ensureUserOrAdminPolicy(req, res, ['read'])) return;
  try {
    const report = await buildWeeklyReport(req.user.id, req.user.role);
    res.send(resultData(report));
  } catch (error) {
    console.error('获取周报失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '获取周报失败，请稍后重试'));
  }
};

// POST /growth/admin/userGrowth —— 查目标用户当前成长(root 专用,供运营弹窗显示)
export const getUserGrowthForAdmin = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅站长可操作'));
  try {
    const { userId } = req.body || {};
    if (!userId) return res.send(resultData(null, 400, '缺少目标用户'));
    const g = await getGrowth(userId);
    res.send(resultData(g));
  } catch (error) {
    console.error('查询用户成长失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, '查询失败'));
  }
};

// POST /growth/admin/adjust —— 管理员运营调整用户成长(发/扣经验、设等级、增减补签卡;root 专用)
export const doAdminAdjustGrowth = async (req, res) => {
  let actionContext = null;
  try {
    const { userId, expDelta, setLevel, cardDelta } = req.body || {};
    if (!userId) return res.send(resultData(null, 400, '缺少目标用户'));
    actionContext = await beginAdminAction(req, {
      action: 'growth.adjust',
      targetId: userId,
      expectedConfirmText: '确认调整成长',
      metadata: {
        expDelta: Number(expDelta || 0),
        setLevel: setLevel == null || setLevel === '' ? null : Number(setLevel),
        cardsDelta: Number(cardDelta || 0),
      },
    });
    const result = await adminAdjustGrowth(userId, { expDelta, setLevel, cardDelta }, { actionContext });
    return res.send(resultData(result));
  } catch (error) {
    if (actionContext) {
      try {
        await finishAdminAction(actionContext, {
          outcome: 'failed',
          metadata: { errorCode: stableAgentErrorCode(error) },
        });
      } catch {}
    }
    const response = adminActionErrorResponse(error, '成长运营调整失败');
    console.error('[GrowthAdminAdjust] 调整失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData({ ok: false, reason: response.code }, response.status, response.message));
  }
};

// GET /growth/dashboard —— 成长看板(成就墙/统计/今日任务/时间线;游客返回全零展示引导)
export const getDashboard = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    const userRole = req.user?.role || 'visitor';
    const data = await getGrowthDashboard(userId, { userRole });
    res.send(resultData(data));
  } catch (error) {
    console.error('获取成长看板失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '获取成长看板失败', 'Failed to load growth dashboard')));
  }
};

// GET /growth/tasks —— 成长任务定义与当前账号完成状态；游客只返回待完成预览，不读取共享游客成长记录
export const getGrowthTasksHandle = async (req, res) => {
  try {
    const subject = req.resourceUser || req.user || {};
    const userId = subject.role === 'visitor' ? null : subject.id || null;
    const data = await getGrowthTasks(userId, { ensureSchema: false });
    res.send(resultData(data));
  } catch (error) {
    console.error('获取成长任务失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, L(req, '获取成长任务失败', 'Failed to load growth tasks')));
  }
};

// POST /growth/tasks/claim —— 一次性成长任务达成后由用户主动领取经验
export const claimGrowthTaskHandle = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const taskKey = String(req.body?.taskKey || '').trim();
    if (!taskKey) return res.send(resultData(null, 400, L(req, '缺少任务标识', 'Missing task key')));
    const result = await claimGrowthRewards(
      req.user.id,
      { scopes: ['growthTasks'], keys: { growthTasks: [taskKey] } },
      { userRole: req.user.role },
    );
    const receipt = result.receipts[0];
    return res.send(
      resultData({
        ...result,
        ok: receipt?.status === 'claimed' || receipt?.status === 'already',
        reason: receipt?.status === 'claimed' ? null : receipt?.status || 'not_found',
        already: receipt?.status === 'already',
        taskKey,
        expGained: Number(receipt?.reward?.exp || 0),
      }),
    );
  } catch (error) {
    console.error('领取成长任务失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '领取成长任务失败', 'Failed to claim growth task')));
  }
};

// GET /growth/heatmap —— 知识活动热力图(贡献格子);只读,游客返回空;支持 ?year=YYYY
export const getHeatmap = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    const userRole = req.user?.role || 'visitor';
    const year = req.query?.year ? Number(req.query.year) : null;
    const data = await getActivityHeatmap(userId, { userRole, year });
    res.send(resultData(data));
  } catch (error) {
    console.error('获取活动热力图失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '获取活动热力图失败'));
  }
};

// POST /growth/claimDailyBonus —— 领取今日任务全完成奖励(游客走注册引导)
export const claimDailyBonus = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await claimGrowthRewards(req.user.id, { scopes: ['daily'] }, { userRole: req.user.role });
    res.send(
      resultData({
        ...result,
        expGained: result.exp,
        pointsEarned: result.points,
        already: result.claimed === 0 && result.receipts.some((item) => item.status === 'already'),
      }),
    );
  } catch (error) {
    console.error('领取每日奖励失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, L(req, '领取失败，请稍后重试', 'Claim failed. Please try again later.')));
  }
};

// GET /growth/ranks —— 段位表(前端「段位路线」总览用;公开只读,单一事实源)
export const getRanks = async (req, res) => {
  try {
    const ranks = RANKS.map((r) => ({
      level: r.level,
      name: r.name,
      cumExp: r.cumExp,
      spaceMb: r.spaceMb,
      aiTokenDaily: r.aiTokenDaily,
      trashDays: r.trashDays,
      freeDraws: freeDrawsFor(r.level), // 每日免费抽奖次数(随等级解锁)
    }));
    res.send(resultData(ranks));
  } catch (error) {
    console.error('获取段位表失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '获取段位表失败', 'Failed to load levels')));
  }
};

// GET /growth/shop —— 同一接口返回积分商品与完整头像框目录；前端统一展示，购买与成就领取语义分开。
export const getShop = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    const userRole = req.user?.role || 'visitor';
    const isVisitor = !req.user?.id || userRole === 'visitor';
    // Root 自己的账号用于验收装扮：目录中的全部头像框都可直接佩戴，但管理员预览上下文
    // 仍保持目标账号的真实权益，避免把 Root 的调试特权映射到被预览用户。
    const rootFrameAccess = userRole === 'root' && !req.adminContext;
    let points = 0;
    let level = 0;
    let equippedTitle = null;
    let protectCards = 0;
    let equippedFrame = null;
    let owned = [];
    if (!isVisitor) {
      const g = await getGrowth(userId, { userRole });
      points = g.points || 0;
      level = g.level || 0;
      equippedTitle = g.equippedTitle || null;
      equippedFrame = g.equippedFrame || null;
      protectCards = g.protectCards || 0;
      owned = await getOwnedCosmetics(userId);
    }
    const ownable = (t) => t === 'title' || t === 'cosmetic';
    const items = SHOP_ITEMS.map((it) => {
      const isOwned = ownable(it.type) && owned.includes(it.id);
      const meetsLevel = !it.minLevel || level >= it.minLevel;
      const cardFull = it.effect === 'makeup_card' && protectCards >= 2;
      return {
        id: it.id,
        type: it.type,
        effect: it.effect || null,
        rarity: it.rarity || null,
        name: it.name,
        desc: it.desc,
        cost: it.cost,
        minLevel: it.minLevel || 0,
        bonusTokens: it.bonusTokens || 0,
        acquisition: 'shop',
        achievementKey: null,
        owned: isOwned,
        equipped:
          (it.type === 'title' && equippedTitle === it.id) || (it.type === 'cosmetic' && equippedFrame === it.id),
        // canBuy 仅供前端置灰按钮;真正校验在 buyItem 事务内(级别/余额/上限/已拥有)
        canBuy: !isVisitor && !isOwned && meetsLevel && !cardFull && points >= it.cost,
      };
    });
    const frames = FRAME_CATALOG.map((frame) => {
      const isOwned = owned.includes(frame.id);
      const meetsLevel = !frame.minLevel || level >= frame.minLevel;
      return {
        id: frame.id,
        type: frame.type,
        effect: frame.effect,
        rarity: frame.rarity,
        name: frame.name,
        desc: frame.desc,
        cost: frame.acquisition === 'shop' ? frame.cost : null,
        minLevel: frame.minLevel || 0,
        bonusTokens: 0,
        acquisition: frame.acquisition,
        achievementKey: frame.achievementKey || null,
        owned: isOwned,
        canEquip: rootFrameAccess || isOwned,
        equipped: equippedFrame === frame.id,
        canBuy:
          frame.acquisition === 'shop' &&
          !rootFrameAccess &&
          !isVisitor &&
          !isOwned &&
          meetsLevel &&
          points >= Number(frame.cost || 0),
      };
    });
    res.send(
      resultData({
        points,
        level,
        equippedTitle,
        equippedFrame,
        protectCards,
        isVisitor,
        rootFrameAccess,
        items,
        frames,
      }),
    );
  } catch (error) {
    console.error('获取积分商店失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: 'GROWTH_SHOP_UNAVAILABLE' }, 500, '获取积分商店失败'));
  }
};

// POST /growth/shop/buy —— 购买商品(补签卡/AI加油包/称号);业务失败以 result.ok=false + msg 返回(HTTP 200)
export const buyShopItem = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { itemId } = req.body || {};
    if (!itemId) return res.send(resultData(null, 400, '缺少商品 id'));
    const result = await buyItem(req.user.id, itemId, { userRole: req.user.role });
    res.send(resultData(result));
  } catch (error) {
    console.error('购买失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '兑换失败，请稍后重试', 'Exchange failed. Please try again.')));
  }
};

// GET /growth/inventory —— 背包(消耗品持有)+ 资产(积分/永久扩容/今日AI加油)总览
export const getInventoryHandle = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    res.send(resultData(await getInventory(userId)));
  } catch (error) {
    console.error('获取背包失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '获取资产失败', 'Failed to load assets')));
  }
};

// POST /growth/item/use —— 使用一件背包消耗品(如 AI 加油包 → 今日额度 +60万);补签卡走 /useProtectCard
export const useItemHandle = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { itemId } = req.body || {};
    if (!itemId) return res.send(resultData(null, 400, '缺少物品 id'));
    const result = await useItem(req.user.id, itemId);
    res.send(resultData(result));
  } catch (error) {
    console.error('使用物品失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '使用物品失败', 'Failed to use item')));
  }
};

// POST /growth/equipTitle —— 佩戴/卸下称号(titleId 为空=卸下;须已拥有)
export const equipTitleHandle = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { titleId } = req.body || {};
    const result = await equipTitle(req.user.id, titleId || null);
    res.send(resultData(result));
  } catch (error) {
    console.error('佩戴称号失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '佩戴称号失败', 'Failed to equip title')));
  }
};

// GET /growth/claimable —— 待领取总数(日常阶段 + 成长任务 + 成就 + 每周挑战),供首页/入口红点
export const getClaimable = async (req, res) => {
  try {
    const userId = req.user?.id;
    const data = await getGrowthClaimableSnapshot(userId, { userRole: req.user?.role });
    res.send(resultData(data));
  } catch (error) {
    console.error('获取待领取数失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '获取失败'));
  }
};

// POST /growth/claimAll —— 按可选范围原子领取日常阶段、成长任务、成就与每周挑战奖励
export const doClaimAll = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await claimGrowthRewards(req.user.id, req.body || {}, { userRole: req.user.role });
    res.send(
      resultData(
        result,
        result.ok ? 200 : result.reason === 'invalid_scope' ? 400 : 409,
        result.ok ? 'success' : L(req, '领取范围无效', 'Invalid claim scope'),
      ),
    );
  } catch (error) {
    console.error('一键领取失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '领取失败'));
  }
};

// GET /growth/recap —— 那年今日 + 尘封回顾(旧内容重新推到面前)
export const getRecapHandle = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    res.send(resultData(await getRecap(userId)));
  } catch (error) {
    console.error('获取回顾失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, L(req, '获取回顾失败', 'Failed to load recap')));
  }
};

export const setRecapState = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    res.send(resultData(await updateRecapState(req.user.id, req.body || {})));
  } catch (error) {
    console.error('更新回顾偏好失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, L(req, '更新回顾偏好失败', 'Failed to update recap preference')));
  }
};

export const getPreferences = async (req, res) => {
  try {
    res.send(resultData(await getGrowthPreferences(req.user?.id || 'visitor')));
  } catch (error) {
    console.error('获取成长偏好失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, L(req, '获取成长偏好失败', 'Failed to load growth preferences')));
  }
};

export const putPreferences = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await updateGrowthPreferences(req.user.id, req.body || {});
    const status = result.ok ? 200 : 400;
    res.send(resultData(result, status, result.ok ? 'success' : L(req, '成长偏好无效', 'Invalid growth preferences')));
  } catch (error) {
    console.error('保存成长偏好失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, L(req, '保存成长偏好失败', 'Failed to save growth preferences')));
  }
};

// GET /growth/weekly —— 本周挑战(进度 + 可领取态;游客展示 0 进度)
export const getWeekly = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    res.send(resultData(await getWeeklyChallenges(userId)));
  } catch (error) {
    console.error('获取每周挑战失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '获取每周挑战失败', 'Failed to load weekly challenges')));
  }
};

// POST /growth/weekly/claim —— 领取每周挑战奖励(完成且本周未领 → 发积分)
export const doClaimWeekly = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { key } = req.body || {};
    if (!key) return res.send(resultData(null, 400, '缺少挑战 key'));
    const result = await claimGrowthRewards(
      req.user.id,
      { scopes: ['weekly'], keys: { weekly: [key] } },
      { userRole: req.user.role },
    );
    const receipt = result.receipts[0];
    res.send(
      resultData({
        ...result,
        ok: receipt?.status === 'claimed' || receipt?.status === 'already',
        reason: receipt?.status === 'claimed' ? null : receipt?.status || 'not_found',
        reward: Number(receipt?.reward?.points || 0),
      }),
    );
  } catch (error) {
    console.error('领取每周挑战失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '领取失败，请稍后重试', 'Claim failed. Please try again.')));
  }
};

// GET /growth/points/log —— 当前用户积分流水(分页)
export const getMyPointsLog = async (req, res) => {
  if (!ensureUserOrAdminPolicy(req, res, ['read'])) return;
  try {
    const limit = Number(req.query?.limit) || 30;
    const offset = Number(req.query?.offset) || 0;
    const cursor = req.query?.cursor ? String(req.query.cursor) : null;
    const filter = req.query?.filter ? String(req.query.filter) : 'all';
    const data = await getPointsLog(req.user.id, { limit, offset, cursor, filter });
    res.send(resultData(data));
  } catch (error) {
    console.error('获取积分明细失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '获取积分明细失败', 'Failed to load points history')));
  }
};

// GET /growth/admin/pointsOverview —— 积分经济总览(root 运营)
export const getPointsOverviewForAdmin = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅站长可操作'));
  try {
    res.send(resultData(await getPointsOverview()));
  } catch (error) {
    console.error('获取积分总览失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, '获取积分总览失败'));
  }
};

// POST /growth/admin/userPoints —— 查目标用户积分详情(root)
export const getUserPointsForAdmin = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅站长可操作'));
  try {
    const { userId } = req.body || {};
    if (!userId) return res.send(resultData(null, 400, '缺少目标用户'));
    res.send(resultData(await getUserPointsDetail(userId)));
  } catch (error) {
    console.error('查询用户积分失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, '查询失败'));
  }
};

// POST /growth/admin/searchUsers —— 积分运营轻量远程选人(root)
export const searchUsersForPointsAdmin = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅站长可操作'));
  const keyword = String(req.body?.keyword || '').trim();
  if (!keyword) return res.send(resultData({ rows: [] }));
  try {
    const rows = await searchAdminUsers(keyword, { limit: req.body?.limit });
    return res.send(resultData({ rows }));
  } catch (error) {
    console.error('[PointsAdminSearch] 查询失败');
    return res.send(resultData(null, 500, '搜索用户失败'));
  }
};

// POST /growth/admin/grantPoints —— 手动发放/扣减积分/存储/补签卡(root)
export const doAdminGrantPoints = async (req, res) => {
  let actionContext = null;
  try {
    const { userId, points, cards, storageMb, note, reason } = req.body || {};
    if (!userId) return res.send(resultData(null, 400, '缺少目标用户'));
    actionContext = await beginAdminAction(req, {
      action: 'growth.grant_points',
      targetId: userId,
      expectedConfirmText: '确认调整资产',
      metadata: {
        pointsDelta: Math.trunc(Number(points) || 0),
        storageMbDelta: Math.trunc(Number(storageMb) || 0),
        cardsDelta: Math.trunc(Number(cards) || 0),
      },
    });
    const result = await adminGrantPoints(
      userId,
      { points, cards, storageMb, note: note || reason },
      { actionContext },
    );
    return res.send(resultData(result));
  } catch (error) {
    if (actionContext) {
      try {
        await finishAdminAction(actionContext, {
          outcome: 'failed',
          metadata: { errorCode: stableAgentErrorCode(error) },
        });
      } catch {
        // 审计工具已记录安全错误码。
      }
    }
    if (error instanceof AdminPointsError) {
      return res.send(resultData({ ok: false, reason: error.code }, error.status, '资产调整未执行'));
    }
    const response = adminActionErrorResponse(error, '资产调整失败');
    console.error('[PointsAdminGrant] 发放失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData({ ok: false, reason: response.code }, response.status, response.message));
  }
};

// POST /growth/achievement/claim —— 领取成就奖励(已解锁且未领 → 发积分与可选头像框)
export const doClaimAchievement = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { key } = req.body || {};
    if (!key) return res.send(resultData(null, 400, '缺少成就 key'));
    const result = await claimGrowthRewards(
      req.user.id,
      { scopes: ['achievements'], keys: { achievements: [key] } },
      { userRole: req.user.role },
    );
    const receipt = result.receipts[0];
    res.send(
      resultData({
        ...result,
        ok: receipt?.status === 'claimed' || receipt?.status === 'already',
        reason: receipt?.status === 'claimed' ? null : receipt?.status || 'not_found',
        reward: Number(receipt?.reward?.points || 0),
        frameId: receipt?.reward?.frameId || null,
      }),
    );
  } catch (error) {
    console.error('领取成就奖励失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '领取失败'));
  }
};

// GET /growth/lottery —— 抽奖页数据(余额/成本/保底进度/奖池概率;游客只读展示概率)
export const getLottery = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    const data = await getLotteryStatus(userId, { userRole: req.user?.role });
    res.send(resultData(data));
  } catch (error) {
    console.error('获取抽奖信息失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '获取抽奖信息失败', 'Failed to load draw details')));
  }
};

// POST /growth/lottery/draw —— 抽奖(times=1 单抽 / 10 十连);积分不足以 result.ok=false 返回
export const doDrawLottery = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const times = Number(req.body?.times) === 10 ? 10 : 1;
    const free = req.body?.free === true;
    const result = await drawLottery(req.user.id, { times, free, userRole: req.user.role });
    res.send(resultData(result));
  } catch (error) {
    console.error('抽奖失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '抽奖失败，请稍后重试', 'Draw failed. Please try again.')));
  }
};

// POST /growth/equipFrame —— 佩戴/卸下头像框装扮(frameId 为空=卸下;普通用户须已拥有，Root 可验收全目录)
export const equipFrameHandle = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { frameId } = req.body || {};
    const result = await equipFrame(req.user.id, frameId || null, {
      userRole: req.adminContext ? null : req.user.role,
    });
    res.send(resultData(result));
  } catch (error) {
    console.error('佩戴头像框失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '佩戴失败', 'Failed to equip frame')));
  }
};

// POST /growth/notices/read —— 标记升级通知已读(查看成长页后)
export const readNotices = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    await markNoticesRead(req.user.id);
    res.send(resultData({ ok: true }));
  } catch (error) {
    console.error('标记升级通知已读失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData({ reason: stableAgentErrorCode(error) }, 500, L(req, '标记已读失败', 'Failed to mark as read')));
  }
};
