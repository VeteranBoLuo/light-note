import { getAnnualReportDefinition } from '@lightnote/shared/annual-report';
import { L, resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { buildAnnualReport, hasAnnualRecords } from '../util/annualReport/build.js';
import { annualEntryActive, canOpenAnnualReport, unlockAnnualReviewAchievement } from '../util/annualReport/access.js';

// 同一账号同一年份的并发请求（多标签页、快速重进）合并为一次计算，结算后立即释放。
const inflightReports = new Map();

function buildOnce(userId, year, userRole) {
  const key = `${userId}:${year}`;
  if (!inflightReports.has(key)) {
    inflightReports.set(
      key,
      buildAnnualReport(userId, { year, userRole }).finally(() => inflightReports.delete(key)),
    );
  }
  return inflightReports.get(key);
}

// 读取接口对游客直接返回不可用，不走写操作守卫，避免把入口探测记成注册墙命中。
function isRegisteredUser(req) {
  return Boolean(req.user?.id) && req.user.role !== 'visitor';
}

function resolveDefinition(req, res, value) {
  const definition = getAnnualReportDefinition(value);
  if (!definition) {
    res.send(resultData(null, 404, L(req, '没有这一年的年度报告', 'No annual report for this year')));
    return null;
  }
  return definition;
}

// GET /growth/annual-report/status?year=2026 —— 入口是否显示；只做几次索引点查。
export const getAnnualReportStatus = async (req, res) => {
  const definition = resolveDefinition(req, res, req.query?.year);
  if (!definition) return;
  if (!isRegisteredUser(req)) {
    return res.send(resultData({ year: definition.year, available: false, eligible: false, entryActive: false }));
  }
  try {
    const available = canOpenAnnualReport(definition, req.user.role);
    const eligible = available ? await hasAnnualRecords(req.user.id, { year: definition.year }) : false;
    res.send(
      resultData({
        year: definition.year,
        available,
        eligible,
        entryActive: eligible && annualEntryActive(definition, req.user.role),
        openFrom: definition.openFrom,
      }),
    );
  } catch (error) {
    console.error('[年度报告] 状态查询失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, L(req, '年度报告暂时无法读取', 'Annual report is unavailable right now')));
  }
};

// GET /growth/annual-report?year=2026 —— 本人实时报告，含标题、网站和标签名。
export const getAnnualReport = async (req, res) => {
  const definition = resolveDefinition(req, res, req.query?.year);
  if (!definition) return;
  if (!isRegisteredUser(req) || !canOpenAnnualReport(definition, req.user.role)) {
    return res.send(resultData({ year: definition.year, available: false, openFrom: definition.openFrom }));
  }
  try {
    const report = await buildOnce(req.user.id, definition.year, req.user.role);
    res.send(resultData({ ...report, available: true }));
  } catch (error) {
    console.error('[年度报告] 生成失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, L(req, '年度报告暂时没生成好', 'Annual report is not ready yet')));
  }
};

// POST /growth/annual-report/complete { year } —— 翻到最后一页时写入纪念成就。
export const completeAnnualReport = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const definition = resolveDefinition(req, res, req.body?.year);
  if (!definition) return;
  try {
    if (!canOpenAnnualReport(definition, req.user.role)) {
      return res.send(resultData(null, 409, L(req, '年度报告尚未开放', 'Annual report is not open yet')));
    }
    if (!(await hasAnnualRecords(req.user.id, { year: definition.year }))) {
      return res.send(resultData(null, 409, L(req, '今年还没有可回顾的记录', 'No records to review this year')));
    }
    res.send(resultData(await unlockAnnualReviewAchievement(req.user.id, definition)));
  } catch (error) {
    console.error('[年度报告] 纪念成就写入失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, L(req, '成就暂时没记上，稍后会再试', 'Could not record the achievement')));
  }
};
