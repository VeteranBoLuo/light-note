import { getGrowth, getGrowthDashboard, claimDailyQuestBonus, checkin, useProtectCard, adminAdjustGrowth, RANKS, markNoticesRead } from '../util/growth.js';
import { buildWeeklyReport } from '../util/weeklyReport.js';
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

// POST /growth/useProtectCard —— 使用补签卡补回昨天漏签、续连签(消耗 1 张卡)
export const doUseProtectCard = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await useProtectCard(req.user.id, { userRole: req.user.role });
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
