import { ManorError } from '@lightnote/shared/manor';
import { ensureNotVisitor } from '../util/auth.js';
import { resultData, L } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { knowledgeManorService } from '../util/services/knowledgeManorService.js';
import { canEnterManor, knowledgeManorEnabled } from '../util/services/knowledgeManorAccess.js';

async function allowed(req, res) {
  if (!ensureNotVisitor(req, res)) return false;
  if (req.adminContext) {
    res.send(resultData({ code: 'MANOR_ADMIN_CONTEXT_FORBIDDEN' }, 403, L(req, '请退出管理员代管后进入庄园', 'Leave admin preview before entering the manor')));
    return false;
  }
  if (!knowledgeManorEnabled()) {
    res.send(resultData({ code: 'MANOR_UNAVAILABLE' }, 503, L(req, '庄园暂未开放', 'The manor is not available yet')));
    return false;
  }
  // The service re-reads the account role inside its transaction.
  if (!canEnterManor(req.user.role)) {
    res.send(resultData({ code: 'MANOR_ACCOUNT_UNAVAILABLE' }, 403, L(req, '当前账号暂不能进入庄园', 'This account cannot enter the manor yet')));
    return false;
  }
  return true;
}

async function respond(req, res, action) {
  if (!(await allowed(req, res))) return;
  try {
    res.send(resultData(await action()));
  } catch (error) {
    const expected = error instanceof ManorError;
    if (!expected) console.error('[manor] request failed code=%s', stableAgentErrorCode(error));
    res.send(resultData({ code: expected ? error.code : 'MANOR_REQUEST_FAILED' }, expected ? error.status : 500,
      L(req, expected && error.status === 409 ? '庄园状态已变化，请刷新后再试' : '庄园操作未完成，请重试',
        expected && error.status === 409 ? 'The manor has changed. Refresh and try again.' : 'The manor action did not complete. Please retry.')));
  }
}

export const getKnowledgeManor = (req, res) => respond(req, res, () => knowledgeManorService.get(req.user.id));
export const runKnowledgeManorCommand = (req, res) => respond(req, res, () => knowledgeManorService.execute(req.user.id, req.body));
export const getKnowledgeManorAttention = (req, res) => respond(req, res, () => knowledgeManorService.attention(req.user.id));
