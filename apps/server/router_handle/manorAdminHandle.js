import { ManorError } from '@lightnote/shared/manor';
import { ensureRootRole } from '../util/rootRole.js';
import { AdminActionError } from '../util/adminActionExecution.js';
import { resultData, L } from '../util/common.js';
import { manorAdminService } from '../util/services/manorAdminService.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

async function respond(req, res, fn) {
  if (req.adminContext) {
    res.send(resultData({ code: 'MANOR_ADMIN_CONTEXT_FORBIDDEN' }, 403));
    return;
  }
  if (!(await ensureRootRole(req, res))) return;
  try {
    res.send(resultData(await fn()));
  } catch (error) {
    const expected = error instanceof ManorError || error instanceof AdminActionError;
    if (!expected) console.error('[manor-admin] request failed code=%s', stableAgentErrorCode(error));
    res.send(
      resultData(
        { code: expected ? error.code : 'MANOR_ADMIN_FAILED' },
        expected ? error.status : 500,
        L(req, '庄园管理请求未完成，请重试', 'The manor management request did not complete. Please retry.'),
      ),
    );
  }
}
export const getManorAdminStatus = (req, res) => respond(req, res, () => manorAdminService.status());
export const getManorAdminOverview = (req, res) => respond(req, res, () => manorAdminService.overview(req.query));
export const getManorAdminPlayers = (req, res) => respond(req, res, () => manorAdminService.players(req.query));
export const getManorAdminPlayer = (req, res) => respond(req, res, () => manorAdminService.player(req.params.userId));
export const getManorAdminOperations = (req, res) => respond(req, res, () => manorAdminService.operations(req.query));
export const updateManorAdminRuntime = (req, res) => respond(req, res, () => manorAdminService.updateRuntime(req));
