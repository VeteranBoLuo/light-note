import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { listAiLiveSmokeRuns, startAiLiveSmokeRun } from '../util/aiEvaluationService.js';

async function ensureRootRole(req, res) {
  const userId = req.user?.id;
  if (!userId || req.user?.role !== 'root') {
    res.send(resultData(null, 403, '无权限操作'));
    return null;
  }
  const [rows] = await pool.query('SELECT role, del_flag FROM user WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length || rows[0].role !== 'root' || Number(rows[0].del_flag || 0) !== 0) {
    res.send(resultData(null, 403, '仅 root 用户可操作'));
    return null;
  }
  return userId;
}

export async function listRuns(req, res) {
  try {
    if (!(await ensureRootRole(req, res))) return;
    return res.send(resultData(await listAiLiveSmokeRuns({ limit: req.body?.limit })));
  } catch (error) {
    console.error('[ai-evaluation] 查询失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, 'AI 冒烟记录暂时不可用'));
  }
}

export async function startRun(req, res) {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const repeat = Number(req.body?.repeat ?? 1);
    const suite = String(req.body?.suite || 'quick');
    const run = await startAiLiveSmokeRun({ triggeredBy: userId, suite, repeat });
    return res.send(resultData(run));
  } catch (error) {
    const code = String(error?.code || '');
    if (code === 'REPEAT_OUT_OF_RANGE') return res.send(resultData(null, 400, '执行轮数必须是 1～5'));
    if (code === 'SUITE_NOT_SUPPORTED') return res.send(resultData(null, 400, '不支持的测试集'));
    if (code === 'RUN_ALREADY_ACTIVE') return res.send(resultData(null, 409, '已有 AI 冒烟任务正在执行'));
    console.error('[ai-evaluation] 启动失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, 'AI 冒烟任务启动失败'));
  }
}
