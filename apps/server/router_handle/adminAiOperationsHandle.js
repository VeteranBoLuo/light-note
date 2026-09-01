import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  getAdminAiExecutionDetail,
  getAdminAiOperationsOverview,
  queryAdminAiExecutions,
} from '../util/services/adminAiOperationsService.js';

function ensureRootActor(req, res) {
  if (req.user?.role === 'root' && !req.adminContext) return true;
  res.status(403).send(resultData({ code: 'AI_OPERATIONS_ADMIN_REQUIRED' }, 403, '仅管理员本人可查看 AI 运行数据'));
  return false;
}

function sendServiceError(res, error, scene) {
  const status = Math.min(599, Math.max(400, Number(error?.status || 503)));
  const code = String(error?.code || 'AI_OPERATIONS_STORE_UNAVAILABLE');
  if (status >= 500) console.error('[admin-ai-operations] scene=%s failed code=%s', scene, stableAgentErrorCode(error));
  const messages = {
    ADMIN_LIST_CURSOR_INVALID: '筛选条件已变化，请重新加载列表',
    AI_OPERATIONS_EXECUTION_ID_INVALID: 'AI 执行标识无效',
    AI_OPERATIONS_EXECUTION_NOT_FOUND: 'AI 执行记录不存在',
    AI_OPERATIONS_SCHEMA_MISSING: 'AI 运行账本尚未迁移',
    AI_OPERATIONS_STORE_UNAVAILABLE: 'AI 运行账本暂不可用',
  };
  return res.status(status).send(resultData({ code }, status, messages[code] || 'AI 运行数据暂不可用'));
}

export async function getAdminAiOperationsOverviewHandle(req, res) {
  if (!ensureRootActor(req, res)) return;
  try {
    return res.send(resultData(await getAdminAiOperationsOverview(req.body || {})));
  } catch (error) {
    return sendServiceError(res, error, 'overview');
  }
}

export async function queryAdminAiExecutionsHandle(req, res) {
  if (!ensureRootActor(req, res)) return;
  try {
    return res.send(resultData(await queryAdminAiExecutions(req.body || {})));
  } catch (error) {
    return sendServiceError(res, error, 'executions');
  }
}

export async function getAdminAiExecutionDetailHandle(req, res) {
  if (!ensureRootActor(req, res)) return;
  try {
    return res.send(resultData(await getAdminAiExecutionDetail(req.body?.executionId)));
  } catch (error) {
    return sendServiceError(res, error, 'detail');
  }
}

export const adminAiOperationsHandleInternals = Object.freeze({ ensureRootActor, sendServiceError });
