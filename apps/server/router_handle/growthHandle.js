import { getGrowth, getGrowthDashboard, getActivityHeatmap, claimDailyQuestBonus, claimAchievement, checkin, useProtectCard, adminAdjustGrowth, RANKS, markNoticesRead } from '../util/growth.js';
import { buildWeeklyReport } from '../util/weeklyReport.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { SHOP_ITEMS, getOwnedCosmetics, buyItem, equipTitle, equipFrame, getPointsLog, getPointsOverview, adminGrantPoints, getUserPointsDetail } from '../util/points.js';
import { drawLottery, getLotteryStatus, freeDrawsFor } from '../util/lottery.js';
import { getInventory, useItem } from '../util/items.js';
import { getWeeklyChallenges, claimWeeklyChallenge } from '../util/weeklyChallenge.js';
import { getRecap } from '../util/recap.js';

// GET /growth/me —— 读当前用户成长快照(游客返回 Lv.1 默认展示,不发经验;root 展示满级)
export const getMyGrowth = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    const userRole = req.user?.role || 'visitor';
    const growth = await getGrowth(userId, { userRole });
    res.send(resultData(growth));
  } catch (error) {
    console.error('获取成长信息失败:', error);
    res.send(resultData(null, 500, '获取成长信息失败: ' + error.message));
  }
};

// POST /growth/checkin —— 签到(游客走 preview 注册引导;ensureNotVisitor 须在取连接前调用)
export const doCheckin = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await checkin(req.user.id, { userRole: req.user.role });
    res.send(resultData(result));
  } catch (error) {
    console.error('签到失败:', error);
    res.send(resultData(null, 500, '签到失败: ' + error.message));
  }
};

// POST /growth/useProtectCard —— 使用补签卡补回最近 3 个自然日内的漏签(消耗 1 张卡)
export const doUseProtectCard = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await useProtectCard(req.user.id, { userRole: req.user.role, date: req.body?.date });
    res.send(resultData(result));
  } catch (error) {
    console.error('补签失败:', error);
    res.send(resultData(null, 500, '补签失败: ' + error.message));
  }
};

// GET /growth/weeklyReport —— 实时生成当前用户本周周报(供前端随时「查看大图」,不发通知)
export const getWeeklyReport = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const report = await buildWeeklyReport(req.user.id, req.user.role);
    res.send(resultData(report));
  } catch (error) {
    console.error('获取周报失败:', error);
    res.send(resultData(null, 500, '获取周报失败: ' + error.message));
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
    console.error('查询用户成长失败:', error);
    res.send(resultData(null, 500, '查询失败: ' + error.message));
  }
};

// POST /growth/admin/adjust —— 管理员运营调整用户成长(发/扣经验、设等级、增减补签卡;root 专用)
export const doAdminAdjustGrowth = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅站长可操作'));
  try {
    const { userId, expDelta, setLevel, cardDelta } = req.body || {};
    if (!userId) return res.send(resultData(null, 400, '缺少目标用户'));
    const result = await adminAdjustGrowth(userId, { expDelta, setLevel, cardDelta });
    res.send(resultData(result));
  } catch (error) {
    console.error('成长运营调整失败:', error);
    res.send(resultData(null, 500, '调整失败: ' + error.message));
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
    console.error('获取成长看板失败:', error);
    res.send(resultData(null, 500, '获取成长看板失败: ' + error.message));
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
    console.error('获取活动热力图失败:', error);
    res.send(resultData(null, 500, '获取活动热力图失败'));
  }
};

// POST /growth/claimDailyBonus —— 领取今日任务全完成奖励(游客走注册引导)
export const claimDailyBonus = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await claimDailyQuestBonus(req.user.id, { userRole: req.user.role });
    res.send(resultData(result));
  } catch (error) {
    console.error('领取每日奖励失败:', error);
    res.send(resultData(null, 500, '领取失败: ' + error.message));
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
    console.error('获取段位表失败:', error);
    res.send(resultData(null, 500, '获取段位表失败: ' + error.message));
  }
};

// GET /growth/shop —— 积分商店(目录 + 当前用户余额/等级/已拥有/已佩戴;游客只读展示,canBuy 全 false)
export const getShop = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    const userRole = req.user?.role || 'visitor';
    const isVisitor = !req.user?.id || userRole === 'visitor';
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
        name: it.name,
        desc: it.desc,
        cost: it.cost,
        minLevel: it.minLevel || 0,
        bonusTokens: it.bonusTokens || 0,
        owned: isOwned,
        equipped: (it.type === 'title' && equippedTitle === it.id) || (it.type === 'cosmetic' && equippedFrame === it.id),
        // canBuy 仅供前端置灰按钮;真正校验在 buyItem 事务内(级别/余额/上限/已拥有)
        canBuy: !isVisitor && !isOwned && meetsLevel && !cardFull && points >= it.cost,
      };
    });
    res.send(resultData({ points, level, equippedTitle, equippedFrame, protectCards, isVisitor, items }));
  } catch (error) {
    console.error('获取积分商店失败:', error);
    res.send(resultData(null, 500, '获取积分商店失败: ' + error.message));
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
    console.error('购买失败:', error);
    res.send(resultData(null, 500, '购买失败: ' + error.message));
  }
};

// GET /growth/inventory —— 背包(消耗品持有)+ 资产(积分/永久扩容/今日AI加油)总览
export const getInventoryHandle = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    res.send(resultData(await getInventory(userId)));
  } catch (error) {
    console.error('获取背包失败:', error);
    res.send(resultData(null, 500, '获取背包失败: ' + error.message));
  }
};

// POST /growth/item/use —— 使用一件背包消耗品(如 AI 加油包 → 今日额度 +30万);补签卡走 /useProtectCard
export const useItemHandle = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { itemId } = req.body || {};
    if (!itemId) return res.send(resultData(null, 400, '缺少物品 id'));
    const result = await useItem(req.user.id, itemId);
    res.send(resultData(result));
  } catch (error) {
    console.error('使用物品失败:', error);
    res.send(resultData(null, 500, '使用物品失败: ' + error.message));
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
    console.error('佩戴称号失败:', error);
    res.send(resultData(null, 500, '佩戴称号失败: ' + error.message));
  }
};

// GET /growth/claimable —— 待领取总数(成就 + 每周挑战),供首页/入口红点
export const getClaimable = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role === 'visitor') return res.send(resultData({ count: 0 }));
    const [dash, wk] = await Promise.all([getGrowthDashboard(userId, { userRole: req.user.role }), getWeeklyChallenges(userId)]);
    const count = (dash.claimableCount || 0) + (wk.claimableCount || 0);
    res.send(resultData({ count, achievements: dash.claimableCount || 0, weekly: wk.claimableCount || 0 }));
  } catch (error) {
    console.error('获取待领取数失败:', error);
    res.send(resultData(null, 500, '获取失败: ' + error.message));
  }
};

// POST /growth/claimAll —— 一键领取所有可领的成就 + 每周挑战奖励
export const doClaimAll = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    let claimed = 0;
    let points = 0;
    const dash = await getGrowthDashboard(userId, { userRole });
    for (const a of dash.achievements.filter((x) => x.claimable)) {
      // 传入已算好的 dashboard,避免每领一个都重跑完整看板聚合;幂等仍由 earnPoints(reason,ref) 保证
      const r = await claimAchievement(userId, a.key, { userRole, dashboard: dash });
      if (r.ok) {
        claimed++;
        points += r.reward || 0;
      }
    }
    const wk = await getWeeklyChallenges(userId);
    for (const c of wk.challenges.filter((x) => x.claimable)) {
      const r = await claimWeeklyChallenge(userId, c.key);
      if (r.ok) {
        claimed++;
        points += r.reward || 0;
      }
    }
    res.send(resultData({ ok: true, claimed, points }));
  } catch (error) {
    console.error('一键领取失败:', error);
    res.send(resultData(null, 500, '领取失败: ' + error.message));
  }
};

// GET /growth/recap —— 那年今日 + 尘封回顾(旧内容重新推到面前)
export const getRecapHandle = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    res.send(resultData(await getRecap(userId)));
  } catch (error) {
    console.error('获取回顾失败:', error);
    res.send(resultData(null, 500, '获取回顾失败: ' + error.message));
  }
};

// GET /growth/weekly —— 本周挑战(进度 + 可领取态;游客展示 0 进度)
export const getWeekly = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    res.send(resultData(await getWeeklyChallenges(userId)));
  } catch (error) {
    console.error('获取每周挑战失败:', error);
    res.send(resultData(null, 500, '获取每周挑战失败: ' + error.message));
  }
};

// POST /growth/weekly/claim —— 领取每周挑战奖励(完成且本周未领 → 发积分)
export const doClaimWeekly = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { key } = req.body || {};
    if (!key) return res.send(resultData(null, 400, '缺少挑战 key'));
    res.send(resultData(await claimWeeklyChallenge(req.user.id, key)));
  } catch (error) {
    console.error('领取每周挑战失败:', error);
    res.send(resultData(null, 500, '领取失败: ' + error.message));
  }
};

// GET /growth/points/log —— 当前用户积分流水(分页)
export const getMyPointsLog = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const limit = Number(req.query?.limit) || 30;
    const offset = Number(req.query?.offset) || 0;
    const data = await getPointsLog(req.user.id, { limit, offset });
    res.send(resultData(data));
  } catch (error) {
    console.error('获取积分明细失败:', error);
    res.send(resultData(null, 500, '获取积分明细失败: ' + error.message));
  }
};

// GET /growth/admin/pointsOverview —— 积分经济总览(root 运营)
export const getPointsOverviewForAdmin = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅站长可操作'));
  try {
    res.send(resultData(await getPointsOverview()));
  } catch (error) {
    console.error('获取积分总览失败:', error);
    res.send(resultData(null, 500, '获取积分总览失败: ' + error.message));
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
    console.error('查询用户积分失败:', error);
    res.send(resultData(null, 500, '查询失败: ' + error.message));
  }
};

// POST /growth/admin/grantPoints —— 手动发放/扣减积分/存储/补签卡(root)
export const doAdminGrantPoints = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅站长可操作'));
  try {
    const { userId, points, cards, storageMb, note } = req.body || {};
    if (!userId) return res.send(resultData(null, 400, '缺少目标用户'));
    const result = await adminGrantPoints(userId, { points, cards, storageMb, note });
    res.send(resultData(result));
  } catch (error) {
    console.error('发放积分失败:', error);
    res.send(resultData(null, 500, '发放失败: ' + error.message));
  }
};

// POST /growth/achievement/claim —— 领取成就奖励(已解锁且未领 → 发积分)
export const doClaimAchievement = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { key } = req.body || {};
    if (!key) return res.send(resultData(null, 400, '缺少成就 key'));
    const result = await claimAchievement(req.user.id, key, { userRole: req.user.role });
    res.send(resultData(result));
  } catch (error) {
    console.error('领取成就奖励失败:', error);
    res.send(resultData(null, 500, '领取失败: ' + error.message));
  }
};

// GET /growth/lottery —— 抽奖页数据(余额/成本/保底进度/奖池概率;游客只读展示概率)
export const getLottery = async (req, res) => {
  try {
    const userId = req.user?.id || 'visitor';
    const data = await getLotteryStatus(userId, { userRole: req.user?.role });
    res.send(resultData(data));
  } catch (error) {
    console.error('获取抽奖信息失败:', error);
    res.send(resultData(null, 500, '获取抽奖信息失败: ' + error.message));
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
    console.error('抽奖失败:', error);
    res.send(resultData(null, 500, '抽奖失败: ' + error.message));
  }
};

// POST /growth/equipFrame —— 佩戴/卸下头像框装扮(frameId 为空=卸下;须已拥有)
export const equipFrameHandle = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { frameId } = req.body || {};
    const result = await equipFrame(req.user.id, frameId || null);
    res.send(resultData(result));
  } catch (error) {
    console.error('佩戴头像框失败:', error);
    res.send(resultData(null, 500, '佩戴失败: ' + error.message));
  }
};

// POST /growth/notices/read —— 标记升级通知已读(查看成长页后)
export const readNotices = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    await markNoticesRead(req.user.id);
    res.send(resultData({ ok: true }));
  } catch (error) {
    console.error('标记升级通知已读失败:', error);
    res.send(resultData(null, 500, '标记已读失败: ' + error.message));
  }
};
