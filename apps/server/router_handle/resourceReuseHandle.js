import { resultData } from '../util/common.js';
import { normalizeResourceReuseInput, recordResourceReuse } from '../util/services/resourceReuseService.js';

let lastFailureLog = 0;
export async function recordResourceOpen(req, res) {
  const user = req.user;
  if (
    !user?.isAuthenticated ||
    !user.id ||
    user.role !== 'user' ||
    user.isDeletedOrDisabled ||
    req.adminContext ||
    req.isAdminPreview ||
    req.suppressConversionTracking
  ) {
    return res.send(resultData({ accepted: false }));
  }
  const input = normalizeResourceReuseInput(req.body);
  if (!input) return res.status(400).send(resultData(null, 400, '无效资料打开信号'));
  try {
    return res.send(resultData(await recordResourceReuse(user.id, input)));
  } catch (error) {
    if (Date.now() - lastFailureLog > 60_000) {
      lastFailureLog = Date.now();
      console.warn(
        '[resource-reuse] unavailable code=%s',
        /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'REUSE_UNAVAILABLE',
      );
    }
    return res.status(503).send(resultData({ accepted: false }, 503, '资料使用统计暂不可用'));
  }
}
