import { getGrowth, checkin } from '../util/growth.js';
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
