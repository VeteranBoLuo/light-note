import { getGrowth, getGrowthDashboard, claimDailyQuestBonus, checkin, RANKS, markNoticesRead } from '../util/growth.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';

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
    }));
    res.send(resultData(ranks));
  } catch (error) {
    console.error('获取段位表失败:', error);
    res.send(resultData(null, 500, '获取段位表失败: ' + error.message));
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
