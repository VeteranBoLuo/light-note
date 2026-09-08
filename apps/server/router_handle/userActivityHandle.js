import { ensureRootRole } from './commonHandle.js';
import { resultData } from '../util/common.js';
import { activityFailure, recordActivity, queryActiveUsers } from '../util/services/userActivityService.js';

export async function recordUserActivity(req, res) {
  const user = req.user;
  if (
    !user?.isAuthenticated ||
    !user.id ||
    ['visitor', 'deleted'].includes(user.role) ||
    user.isDeletedOrDisabled ||
    req.adminContext ||
    req.isAdminPreview
  ) {
    return res.send(resultData({ accepted: false }));
  }
  if (!['interaction', 'reading'].includes(req.body?.signal))
    return res.status(400).send(resultData({ code: 'ACTIVITY_SIGNAL_INVALID' }, 400, '无效活动信号'));
  try {
    return res.send(resultData(await recordActivity(user.id)));
  } catch (error) {
    activityFailure(error);
    return res.status(503).send(resultData({ code: 'ACTIVITY_UNAVAILABLE' }, 503, '活动记录暂不可用'));
  }
}

export async function getAdminOverviewActiveUsers(req, res) {
  if (req.user?.role !== 'root' || req.adminContext)
    return res.status(403).send(resultData(null, 403, '仅管理员可查看'));
  const actorId = await ensureRootRole(req, res);
  if (!actorId) return;
  try {
    return res.send(
      resultData(
        await queryActiveUsers({
          actorId,
          hideInternal: req.body?.hideInternal !== false,
          cursor: req.body?.cursor,
          snapshotAt: req.body?.snapshotAt,
        }),
      ),
    );
  } catch (error) {
    const status = error.code === 'ADMIN_LIST_CURSOR_INVALID' ? 400 : 503;
    if (status === 503) activityFailure(error);
    return res
      .status(status)
      .send(
        resultData(
          { code: status === 400 ? error.code : 'ACTIVITY_UNAVAILABLE' },
          status,
          status === 400 ? '统计日期或游标已失效，请刷新' : '活跃用户暂不可用',
        ),
      );
  }
}
