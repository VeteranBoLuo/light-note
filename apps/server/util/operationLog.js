import pool from '../db/index.js';
import { insertData } from './common.js';
import { isSelfTraffic } from './logExclude.js';

const stripAstral = (value) =>
  typeof value === 'string' ? value.replace(/[\u{10000}-\u{10FFFF}]/gu, '') : value;

/**
 * 服务端成功路径操作日志。
 * 用于改密等会在响应后立即失效会话、无法再由前端调用 recordOperation 的操作。
 */
export async function recordServerOperation(req, { module, operation, userId } = {}) {
  if (req?.isAdminPreview && !req?.isVisitorWorkspace) return false;
  if (req?.isVisitorWorkspace && req?.adminActor?.role !== 'root') return false;

  const operatorId = userId || (req?.isVisitorWorkspace ? req?.adminActor?.id : req?.user?.id);
  const moduleName = String(module || '').trim();
  const operationName = String(operation || '').trim();
  if (!operatorId || !moduleName || !operationName) return false;
  if (!req?.isVisitorWorkspace && isSelfTraffic(req)) return false;

  const log = {
    module: req?.isVisitorWorkspace ? `游客内容维护/${moduleName}` : moduleName,
    operation: req?.isVisitorWorkspace
      ? `${operationName}（目标游客：${req?.user?.id || '未知'}）`
      : operationName,
    createBy: operatorId,
    ip: req?.ip || '',
    delFlag: 0,
  };
  Object.keys(log).forEach((key) => {
    log[key] = stripAstral(log[key]);
  });
  await pool.query('INSERT INTO operation_logs SET ?', [insertData(log)]);
  return true;
}
