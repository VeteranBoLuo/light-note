import { resultData, snakeCaseKeys, insertData, generateUUID, INTERNAL_ROLES } from '../util/common.js';
import { isLocalIp } from '../util/ipFilter.js';
import { isSelfTraffic, listLogExclude, addLogExclude, removeLogExclude } from '../util/logExclude.js';
import https from 'https';
import http from 'http';
import fs from 'fs';
import fsP from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import pool from '../db/index.js';
import { validateQueryParams } from '../util/request.js';
import { recordConversionEvent, normalizeConversionSource } from '../util/conversion.js';
import { getDeepSeekBalance as queryDeepSeekBalance } from '../util/agent/providerBalance.js';
import { collectUsedImageNames } from '../util/noteImages.js';
import { resolveKnowledgeSourceTarget } from '../util/agent/sourceUtils.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

// 记录游客转化事件(前端 CTA 点击等);允许游客调用,白名单事件防滥用
export const recordConversion = (req, res) => {
  // v1.1:新增 demo_enter/signup_open/signup_submit;cta_click 仅兼容旧客户端(新代码不再写入);
  // register/first_own_resource/signup_failed 仅后端记录,不接受客户端上报(防伪造激活/注册)
  const ALLOWED = [
    'page_view',
    'demo_enter',
    'signup_open',
    'signup_submit',
    'wall_hit',
    'share_view',
    'share_cta_click',
    'cta_click',
  ];
  const event = String(req.body?.event || '');
  if (!ALLOWED.includes(event)) {
    return res.send(resultData(null, 400, '不支持的事件'));
  }
  // 转化漏斗只统计游客:已登录用户的访问/点击不计入(他们不在游客转化路径上)
  if ((req.user?.role || 'visitor') !== 'visitor') {
    return res.send(resultData(null));
  }
  // 渠道归因类事件的 source 走白名单归一(signup_open/demo_enter/share_* 等);
  // wall_hit 的 source 是「撞墙操作」、page_view 是页面名,属另一维度,只截断不套渠道白名单
  const CHANNEL_EVENTS = new Set(['demo_enter', 'signup_open', 'signup_submit', 'share_view', 'share_cta_click']);
  const rawSource = req.body?.source || '';
  const context = CHANNEL_EVENTS.has(event) ? normalizeConversionSource(rawSource) : String(rawSource).slice(0, 255);
  recordConversionEvent(req, event, context);
  res.send(resultData(null));
};

// 转化漏斗看板数据(root 专属):各事件去重访客数 + 撞墙热点 + 分享/激活 + 按天趋势;支持时间窗
export const getConversionFunnel = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    // 时间窗(可选):startDate/endDate 为 'YYYY-MM-DD',用于「改一版看效果」的版本前后对比;不传则全期
    const { startDate, endDate } = req.body || {};
    const timeCond = [];
    const timeParams = [];
    if (startDate) {
      timeCond.push('create_time >= ?');
      timeParams.push(String(startDate) + ' 00:00:00');
    }
    if (endDate) {
      timeCond.push('create_time < DATE_ADD(?, INTERVAL 1 DAY)');
      timeParams.push(String(endDate));
    }
    const andTime = timeCond.length ? ' AND ' + timeCond.join(' AND ') : '';

    // 漏斗只算游客:page_view/demo_enter/wall_hit/signup_open/signup_submit/signup_failed/share_* 限 visitor;
    // register(转化那一刻 visitor_type 已转 user)靠 event='register' OR 补进来;按 fingerprint 去重(轻量近似漏斗,不建 session)
    const [rows] = await pool.query(
      `SELECT event, COUNT(DISTINCT fingerprint) AS visitors FROM conversion_events WHERE fingerprint <> '' AND (event = 'register' OR visitor_type = 'visitor')${andTime} GROUP BY event`,
      timeParams,
    );
    // 用显式 camelCase 标量字段返回,避免 resultData 的 camelCaseKeys 把 wall_hit/cta_click 等带下划线的 key 改名
    const visitorsOf = (ev) => {
      const r = rows.find((x) => x.event === ev);
      return r ? Number(r.visitors) : 0;
    };
    const [hotspots] = await pool.query(
      `SELECT context, COUNT(*) AS cnt FROM conversion_events WHERE event = 'wall_hit' AND context <> ''${andTime} GROUP BY context ORDER BY cnt DESC LIMIT 20`,
      timeParams,
    );
    const [ipRow] = await pool.query(
      `SELECT COUNT(DISTINCT ip) AS ips FROM conversion_events WHERE visitor_type = 'visitor' AND ip <> ''${andTime}`,
      timeParams,
    );
    // 激活里程碑(按注册 cohort 归因):只算「本期注册的用户」里做过 first_own_resource 的去重数,
    // 用 register 关联,排除历史用户/内部账号的自建事件混入,避免激活率虚高甚至超过 100%。
    // (v1.1 不做「注册后 24h 内」时间窗约束——那属完整 V2,达触发条件再加)
    const andTimeReg = timeCond.length
      ? ' AND ' + timeCond.map((c) => c.replace('create_time', 'r.create_time')).join(' AND ')
      : '';
    const [actRow] = await pool.query(
      `SELECT COUNT(DISTINCT r.user_id) AS activated
       FROM conversion_events r
       JOIN conversion_events f ON f.user_id = r.user_id AND f.event = 'first_own_resource'
       WHERE r.event = 'register' AND r.user_id IS NOT NULL${andTimeReg}`,
      timeParams,
    );
    // 无法归因:空 fingerprint 的游客事件数(不计入访客数,单独展示,提示采集质量)
    const [unattrRow] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM conversion_events WHERE fingerprint = '' AND visitor_type = 'visitor'${andTime}`,
      timeParams,
    );
    // 注册失败原因分布(标准原因码:email_exists / weak_password / server_error)
    const [failReasons] = await pool.query(
      `SELECT context AS reason, COUNT(*) AS cnt FROM conversion_events WHERE event = 'signup_failed' AND context <> ''${andTime} GROUP BY context ORDER BY cnt DESC`,
      timeParams,
    );
    // 按天趋势(访问 / 打开注册 / 注册成功),用 DATE_FORMAT 直接出字符串避免时区偏移
    const [trend] = await pool.query(
      `SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d,
         COUNT(DISTINCT CASE WHEN visitor_type = 'visitor' AND event = 'page_view' THEN fingerprint END) AS pv,
         COUNT(DISTINCT CASE WHEN visitor_type = 'visitor' AND event = 'signup_open' THEN fingerprint END) AS signupOpen,
         COUNT(DISTINCT CASE WHEN event = 'register' THEN fingerprint END) AS reg
       FROM conversion_events WHERE 1 = 1${andTime}
       GROUP BY d ORDER BY d`,
      timeParams,
    );
    res.send(
      resultData({
        pageViewVisitors: visitorsOf('page_view'),
        demoEnterVisitors: visitorsOf('demo_enter'),
        wallHitVisitors: visitorsOf('wall_hit'),
        signupOpenVisitors: visitorsOf('signup_open'),
        signupSubmitVisitors: visitorsOf('signup_submit'),
        registerVisitors: visitorsOf('register'),
        signupFailedVisitors: visitorsOf('signup_failed'),
        ctaClickVisitors: visitorsOf('cta_click'), // legacy:旧客户端历史上报,新代码不再写入,仅供历史对比
        shareViewVisitors: visitorsOf('share_view'),
        shareCtaClickVisitors: visitorsOf('share_cta_click'),
        activatedUsers: Number(actRow[0]?.activated || 0),
        unattributedEvents: Number(unattrRow[0]?.cnt || 0),
        signupFailReasons: (failReasons || []).map((r) => ({ reason: r.reason, cnt: Number(r.cnt || 0) })),
        uniqueIps: Number(ipRow[0]?.ips || 0),
        hotspots,
        trend: (trend || []).map((t) => ({
          d: t.d,
          pv: Number(t.pv || 0),
          signupOpen: Number(t.signupOpen || 0),
          reg: Number(t.reg || 0),
        })),
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

const ensureRootRole = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role !== 'root') {
      res.send(resultData(null, 403, '无权限操作'));
      return null;
    }
    const [userResult] = await pool.query('SELECT role,del_flag FROM user WHERE id = ? LIMIT 1', [userId]);
    if (userResult.length === 0 || userResult[0].role !== 'root') {
      res.send(resultData(null, 403, '仅root用户可操作'));
      return null;
    }
    return userId;
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
    return null;
  }
};

export const getDeepSeekBalance = async (req, res) => {
  const rootUserId = await ensureRootRole(req, res);
  if (!rootUserId) return;
  try {
    const balance = await queryDeepSeekBalance({ forceRefresh: req.body?.forceRefresh === true });
    return res.send(resultData(balance));
  } catch (error) {
    console.error('[agent-balance] DeepSeek 余额查询失败:', error?.message || error);
    return res.send(resultData(null, 500, 'DeepSeek 余额查询暂时不可用'));
  }
};

const OPINION_STATUS = {
  PENDING: 'pending',
  REPLIED: 'replied',
};

const emptyNoticeSummary = (role = 'visitor') => ({
  role,
  opinion: {
    pendingTotal: 0,
    unreadReplyTotal: 0,
    latestAt: null,
    latestReply: null,
  },
  security: {
    enabled: false,
    unhandledHighRiskCount: 0,
    unhandledCriticalCount: 0,
    latestAt: null,
  },
  hasNotice: false,
  noticeKey: '',
});

const buildNoticeKey = (summary) =>
  [
    summary.role,
    summary.opinion.pendingTotal,
    summary.opinion.unreadReplyTotal,
    summary.opinion.latestAt || '',
    summary.security.unhandledHighRiskCount,
    summary.security.unhandledCriticalCount,
    summary.security.latestAt || '',
  ].join('|');

export const getNoticeSummary = async (req, res) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role || 'visitor';
    if (!userId || role === 'visitor') {
      return res.send(resultData(emptyNoticeSummary(role)));
    }

    const summary = emptyNoticeSummary(role);
    if (role === 'root') {
      const [opinionRows] = await pool.query(
        `SELECT COUNT(*) AS pending_total, MAX(create_time) AS latest_at
         FROM opinion
         WHERE del_flag = 0 AND status = ?`,
        [OPINION_STATUS.PENDING],
      );
      const [securityRows] = await pool.query(
        `SELECT
           COUNT(*) AS unhandled_high_risk_count,
           SUM(severity = 'critical') AS unhandled_critical_count,
           MAX(created_at) AS latest_at
         FROM security_events
         WHERE handled_status = 'unhandled'
           AND severity IN ('high','critical')`,
      );
      summary.opinion.pendingTotal = Number(opinionRows[0]?.pending_total || 0);
      summary.opinion.latestAt = opinionRows[0]?.latest_at || null;
      summary.security.enabled = true;
      summary.security.unhandledHighRiskCount = Number(securityRows[0]?.unhandled_high_risk_count || 0);
      summary.security.unhandledCriticalCount = Number(securityRows[0]?.unhandled_critical_count || 0);
      summary.security.latestAt = securityRows[0]?.latest_at || null;
      summary.hasNotice = summary.opinion.pendingTotal > 0 || summary.security.unhandledHighRiskCount > 0;
      summary.noticeKey = buildNoticeKey(summary);
      return res.send(resultData(summary));
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS unread_reply_total, MAX(reply_time) AS latest_at
       FROM opinion
       WHERE user_id = ?
         AND del_flag = 0
         AND status = ?
         AND reply_viewed = 0`,
      [userId, OPINION_STATUS.REPLIED],
    );
    const [latestRows] = await pool.query(
      `SELECT id, type, content, reply_content, reply_time
       FROM opinion
       WHERE user_id = ?
         AND del_flag = 0
         AND status = ?
         AND reply_viewed = 0
       ORDER BY reply_time DESC, create_time DESC
       LIMIT 1`,
      [userId, OPINION_STATUS.REPLIED],
    );
    summary.opinion.unreadReplyTotal = Number(countRows[0]?.unread_reply_total || 0);
    summary.opinion.latestAt = countRows[0]?.latest_at || null;
    summary.opinion.latestReply = latestRows[0] || null;
    summary.hasNotice = summary.opinion.unreadReplyTotal > 0;
    summary.noticeKey = buildNoticeKey(summary);
    res.send(resultData(summary));
  } catch (e) {
    res.send(resultData(null, 500, '获取提醒汇总失败：' + e.message));
  }
};

const ensureSortColumn = async (connection, tableName) => {
  const [columnRows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE 'sort'`);
  if (columnRows.length > 0) {
    return false;
  }
  try {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN sort INT NOT NULL DEFAULT 0`);
  } catch (e) {
    if (e?.code === 'ER_DUP_FIELDNAME') return false;
    throw e;
  }
  return true;
};

const reseedSortById = async (connection, tableName) => {
  await connection.query('SET @help_sort_seed := -1');
  await connection.query(
    `UPDATE \`${tableName}\`
     SET sort = (@help_sort_seed := @help_sort_seed + 1)
     ORDER BY id ASC`,
  );
};

// sort 列管理已移除（knowledge_base 自带 sort 列）

export const getApiLogs = async (req, res) => {
  // 全站 API 日志(含所有用户 IP/URL/请求体)——仅 root 运维可查,防越权信息泄露(前端已在 root 后台,后端须同门)
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const skip = pageSize * (currentPage - 1);
    const { key, hide_internal: hideInternal = true } = filters;
    const rolePh = INTERNAL_ROLES.map(() => '?').join(', ');
    const roleParams = hideInternal ? INTERNAL_ROLES : [];

    const baseWhere = `(u.alias LIKE CONCAT('%', ?, '%') OR a.ip LIKE CONCAT('%', ?, '%') OR a.url LIKE CONCAT('%', ?, '%')) AND a.del_flag = 0`;
    // 隐藏内部账号(root/test);u.role 为 NULL(join 不到 user,如已删用户)按真实用户保留,避免误删日志
    const roleFilter = hideInternal ? ` AND (u.role IS NULL OR u.role NOT IN (${rolePh}))` : '';
    const whereClause = baseWhere + roleFilter;

    const [result] = await pool.query(
      `SELECT a.*, u.alias, u.email FROM api_logs a LEFT JOIN user u ON a.user_id = u.id WHERE ${whereClause} ORDER BY a.request_time DESC LIMIT ? OFFSET ?`,
      [key, key, key, ...roleParams, pageSize, skip],
    );

    result.forEach((row) => {
      ['req', 'system'].forEach((field) => {
        if (row[field] && typeof row[field] === 'string') {
          try {
            row[field] = JSON.parse(row[field]);
          } catch (e) {}
        }
      });
    });

    const [totalRes] = await pool.query(
      `SELECT COUNT(*) AS total FROM api_logs a LEFT JOIN user u ON a.user_id = u.id WHERE ${whereClause}`,
      [key, key, key, ...roleParams],
    );

    res.send(
      resultData({
        items: result,
        total: totalRes[0].total,
      }),
    );
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};
export const clearApiLogs = (req, res) => {
  if (req.user?.role !== 'root') {
    return res.send(resultData(null, 403, '没有操作权限'));
  }
  pool
    .query('UPDATE api_logs set del_flag=1')
    .then(() => {
      res.send(resultData(null));
    })
    .catch((err) => {
      res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
    });
};
// 用户操作日志
export const recordOperationLogs = (req, res) => {
  try {
    if (req.isAdminPreview && !req.isVisitorWorkspace) {
      return res.send(resultData(null, 403, '管理员用户预览为只读模式'));
    }
    if (req.isVisitorWorkspace && req.adminActor?.role !== 'root') {
      return res.send(resultData(null, 403, '游客维护工作区需要真实管理员身份'));
    }
    const userId = req.isVisitorWorkspace ? req.adminActor?.id : req.user?.id;
    const moduleName = String(req.body?.module || '').trim();
    const operationName = String(req.body?.operation || '').trim();
    if (!userId || !moduleName || !operationName) {
      return res.send(resultData(null, 400, '操作日志参数不完整'));
    }
    // 本地/回环请求(本地调试)不记操作日志
    // 游客内容维护属于管理员审计，即使是自己人设备也必须记录。
    if (!req.isVisitorWorkspace && isSelfTraffic(req)) return res.send(resultData(null));
    const log = {
      module: req.isVisitorWorkspace ? `游客内容维护/${moduleName}` : moduleName,
      operation: req.isVisitorWorkspace ? `${operationName}（目标游客：${req.user?.id || '未知'}）` : operationName,
      create_by: userId,
      ip: req.ip || '',
      del_flag: 0,
    };
    // operation_logs 为 latin1 表,operation/module 等列不支持 4 字节字符(emoji):
    // 写入前剥离星芒面字符,避免含 emoji 的操作(如撤回带 🎉 标题的通知)整条 500,
    // 进而被前端拦截器弹成「报错通知」(实际业务操作已成功)。
    const stripAstral = (v) => (typeof v === 'string' ? v.replace(/[\u{10000}-\u{10FFFF}]/gu, '') : v);
    Object.keys(log).forEach((k) => {
      log[k] = stripAstral(log[k]);
    });
    pool
      .query('INSERT INTO operation_logs SET ?', [insertData(log)])
      .then(() => {
        res.send(resultData(null));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};

// —— 日志白名单(自己人设备免记录 api/操作/转化):仅 root 可管理 ——
export const getLogExclude = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    res.send(resultData(await listLogExclude()));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const addLogExcludeFp = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const fingerprint = String(req.body?.fingerprint || '')
      .trim()
      .slice(0, 128);
    const deviceId = String(req.body?.deviceId || req.headers?.['x-log-device-id'] || '')
      .trim()
      .slice(0, 128);
    const note = String(req.body?.note || '')
      .trim()
      .slice(0, 255);
    if (!fingerprint) return res.send(resultData(null, 400, '缺少指纹'));
    await addLogExclude(fingerprint, deviceId, note);
    res.send(resultData(null));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const removeLogExcludeFp = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const fingerprint = String(req.body?.fingerprint || '').trim();
    if (!fingerprint) return res.send(resultData(null, 400, '缺少指纹'));
    await removeLogExclude(fingerprint);
    res.send(resultData(null));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const getOperationLogs = (req, res) => {
  // 全站操作日志(含所有用户行为)——仅 root 运维可查,防越权信息泄露
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const skip = pageSize * (currentPage - 1);
    const hideInternal = filters.hide_internal !== false;
    const rolePh = INTERNAL_ROLES.map(() => '?').join(', ');
    const roleParams = hideInternal ? INTERNAL_ROLES : [];
    const roleFilter = hideInternal ? ` AND (u.role IS NULL OR u.role NOT IN (${rolePh}))` : '';
    // 查询总数据条数
    pool
      .query(
        `SELECT o.*, u.alias,u.email
FROM operation_logs o
LEFT JOIN user u ON o.create_by = u.id
WHERE (u.alias LIKE CONCAT('%', ?, '%') 
OR o.operation LIKE CONCAT('%', ?, '%') 
OR o.module LIKE CONCAT('%', ?, '%')) 
AND o.del_flag = 0${roleFilter}
ORDER BY o.create_time DESC
LIMIT ? OFFSET ?;
`,
        [filters.key, filters.key, filters.key, ...roleParams, pageSize, skip],
      )
      .then(async ([result]) => {
        const totalSql = `SELECT COUNT(*) FROM operation_logs o left join user u on o.create_by=u.id WHERE 
(u.alias LIKE CONCAT('%', ?, '%') 
OR o.operation LIKE CONCAT('%', ?, '%') 
OR o.module LIKE CONCAT('%', ?, '%'))
AND o.del_flag=0${roleFilter}`;
        const [totalRes] = await pool.query(totalSql, [filters.key, filters.key, filters.key, ...roleParams]);
        res.send(
          resultData({
            items: result,
            total: totalRes[0]['COUNT(*)'],
          }),
        );
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};

export const clearOperationLogs = (req, res) => {
  if (req.user?.role !== 'root') {
    return res.send(resultData(null, 403, '没有操作权限'));
  }
  pool
    .query('UPDATE operation_logs set del_flag=1')
    .then(() => {
      res.send(resultData(null));
    })
    .catch((err) => {
      res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
    });
};

// ── 按 IP 清理日志(root 专属的后台清理模块用)──────────────────────────
// 三张带 ip 列的日志表;operation_logs 的 ip 列由 20260702 迁移补齐,历史行 ip 为 NULL
// key 显式用驼峰:resultData 会对返回 data 递归 camelCaseKeys,直接用驼峰避免蛇形被改名(见本文件顶部同类坑)
const IP_LOG_TABLES = [
  { table: 'api_logs', key: 'apiLogs' },
  { table: 'conversion_events', key: 'conversionEvents' },
  { table: 'operation_logs', key: 'operationLogs' },
];
// 构造按 IP 过滤的 WHERE:mode='local' 匹配本地/回环(等价 isLocalIp),否则按精确 IP
const buildIpLogWhere = (mode, ip) => {
  if (mode === 'local') {
    return {
      where: "(LOWER(ip)='::1' OR LOWER(ip)='localhost' OR ip LIKE '127.%' OR LOWER(ip) LIKE '::ffff:127.%')",
      params: [],
    };
  }
  return { where: 'ip = ?', params: [ip] };
};

// 统计某 IP(或本地回环)在各日志表的命中行数(清理前预览,不改数据)
export const getIpLogStats = async (req, res) => {
  const userId = await ensureRootRole(req, res);
  if (!userId) return;
  try {
    const mode = req.body?.mode === 'local' ? 'local' : 'exact';
    const ip = String(req.body?.ip || '').trim();
    if (mode === 'exact' && !ip) return res.send(resultData(null, 400, '请输入要查询的 IP'));
    const { where, params } = buildIpLogWhere(mode, ip);
    const stats = {};
    for (const { table, key } of IP_LOG_TABLES) {
      const [rows] = await pool.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params);
      stats[key] = rows[0].n;
    }
    res.send(resultData(stats));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

// 物理删除某 IP(或本地回环)在各日志表的全部记录(root 专属;转化漏斗表无 del_flag,统一用物理删除)
export const clearLogsByIp = async (req, res) => {
  const userId = await ensureRootRole(req, res);
  if (!userId) return;
  try {
    const mode = req.body?.mode === 'local' ? 'local' : 'exact';
    const ip = String(req.body?.ip || '').trim();
    if (mode === 'exact' && !ip) return res.send(resultData(null, 400, '请输入要清理的 IP'));
    const { where, params } = buildIpLogWhere(mode, ip);
    const deleted = {};
    for (const { table, key } of IP_LOG_TABLES) {
      const [result] = await pool.query(`DELETE FROM ${table} WHERE ${where}`, params);
      deleted[key] = result.affectedRows || 0;
    }
    res.send(resultData(deleted));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

// 定义支持的图片类型及其对应的扩展名
const imageMimeTypes = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

const BOOKMARK_ICON_UPLOAD_DIR = '/www/wwwroot/images';
const BOOKMARK_ICON_AFTER_SAVE_COOLDOWN_MS = 60 * 60 * 1000;
const bookmarkIconRefreshInFlight = new Map();

export function isBookmarkIconCheckRecent(
  checkedAt,
  now = Date.now(),
  cooldownMs = BOOKMARK_ICON_AFTER_SAVE_COOLDOWN_MS,
) {
  if (!checkedAt) return false;
  const timestamp = checkedAt instanceof Date ? checkedAt.getTime() : Date.parse(String(checkedAt).replace(' ', 'T'));
  return Number.isFinite(timestamp) && now - timestamp < cooldownMs;
}

export function bookmarkIconBuffersEqual(existingBuffer, fetchedBuffer) {
  return Buffer.isBuffer(existingBuffer) && Buffer.isBuffer(fetchedBuffer) && existingBuffer.equals(fetchedBuffer);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLocalBookmarkIconPath(iconUrl, bookmarkId) {
  if (!iconUrl || !bookmarkId) return '';
  try {
    const pathname = new URL(iconUrl, 'https://light-note.local').pathname;
    if (!pathname.startsWith('/uploads/')) return '';
    const fileName = path.basename(decodeURIComponent(pathname));
    const validName = new RegExp(
      `^bookmark-${escapeRegExp(bookmarkId)}(?:-[a-f0-9]{12})?\\.(?:png|svg|jpe?g|gif|webp|ico)$`,
      'i',
    );
    return validName.test(fileName) ? path.join(BOOKMARK_ICON_UPLOAD_DIR, fileName) : '';
  } catch {
    return '';
  }
}

async function readCurrentBookmarkIcon(connection, bookmarkId, userId, fallbackCheckedAt) {
  const [rows] = await connection.query(
    'SELECT icon_url, icon_checked_at FROM bookmark WHERE id=? AND user_id=? AND del_flag=0 LIMIT 1',
    [bookmarkId, userId],
  );
  return {
    id: bookmarkId,
    iconUrl: rows[0]?.icon_url || '',
    iconCheckedAt: rows[0]?.icon_checked_at || fallbackCheckedAt,
    changed: false,
    stale: true,
  };
}

// 图标获取:统一走同机工具箱 favimg(hub :3480)。favimg 抓网页解析 <link icon> + 站点自身 favicon.ico,
// 直连失败(强反爬/超时)再兜底公网聚合源(favicone/yandex);内置 SSRF 防护/缓存。返回 {buffer, contentType} 或 null。
function fetchIconFromFavimg(url) {
  return new Promise((resolve) => {
    const chunks = [];
    const request = http.get(`http://127.0.0.1:3480/favimg/?url=${encodeURIComponent(url)}`, (response) => {
      const contentType = response.headers['content-type'] || '';
      if (response.statusCode !== 200 || !contentType.startsWith('image/')) {
        response.resume();
        return resolve(null);
      }
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.length ? { buffer, contentType } : null);
      });
    });
    request.on('error', () => resolve(null));
    request.setTimeout(12000, () => {
      request.destroy();
      resolve(null);
    });
  });
}

export const analyzeImgUrl = async (req, res) => {
  const canMaintainAdminBookmarks =
    req.adminContext?.mode === 'maintain' && req.adminCapability?.policy === 'content_write';
  const canMaintainVisitorBookmarks =
    canMaintainAdminBookmarks ||
    (req.isVisitorWorkspaceContentWrite && req.isVisitorWorkspace && req.adminActor?.role === 'root');
  if (req.isAdminPreview && !canMaintainAdminBookmarks && !canMaintainVisitorBookmarks) {
    return res.send(resultData(null, 403, '管理员用户预览为只读模式'));
  }
  // 图标抓取会落盘并更新 bookmark.icon_url，属于写操作。普通游客浏览时静默跳过，避免自动请求弹注册墙。
  if ((!req.user?.id || req.user.role === 'visitor') && !canMaintainVisitorBookmarks) {
    return res.send(resultData([]));
  }
  if (!Array.isArray(req.body)) {
    return res.send(resultData(null, 400, '请求参数格式错误'));
  }

  const requestModeById = new Map();
  req.body.slice(0, 50).forEach((item) => {
    const id = String(item?.id || '').trim();
    const refreshMode =
      item?.refreshMode === 'after_save'
        ? 'after_save'
        : item?.refreshMode === 'periodic' || item?.noCache
          ? 'periodic'
          : '';
    if (!id || !refreshMode) return;
    // 同一请求里定期刷新优先：它本身已由 30 天/24 小时周期筛选，不再受保存后一小时限频影响。
    if (!requestModeById.has(id) || refreshMode === 'periodic') requestModeById.set(id, refreshMode);
  });
  const requestedIds = [...requestModeById.keys()];
  if (requestedIds.length === 0) {
    return res.send(resultData([]));
  }

  const connection = await pool.getConnection();
  try {
    // URL 与归属均以数据库为准，不信任客户端传来的 id/url；防止越权改图标或借图标抓取请求任意地址。
    const placeholders = requestedIds.map(() => '?').join(',');
    const [ownedBookmarks] = await connection.query(
      `SELECT id, url, icon_url, icon_checked_at
       FROM bookmark
       WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`,
      [req.user.id, ...requestedIds],
    );
    const results = await Promise.all(
      ownedBookmarks.map(async (bookmark) => {
        const refreshMode = requestModeById.get(String(bookmark.id));
        const checkedAt = new Date().toISOString();
        if (refreshMode === 'after_save' && isBookmarkIconCheckRecent(bookmark.icon_checked_at)) {
          return {
            id: bookmark.id,
            iconUrl: bookmark.icon_url || '',
            iconCheckedAt: bookmark.icon_checked_at || checkedAt,
            changed: false,
            throttled: true,
          };
        }

        const refreshKey = `${req.user.id}:${bookmark.id}:${bookmark.url}`;
        const existingRefresh = bookmarkIconRefreshInFlight.get(refreshKey);
        if (existingRefresh) return existingRefresh;

        const refreshPromise = (async () => {
          const markChecked = async () => {
            const [updateResult] = await connection.query(
              'UPDATE bookmark SET icon_checked_at=NOW() WHERE id=? AND user_id=? AND url=?',
              [bookmark.id, req.user.id, bookmark.url],
            );
            if (!updateResult?.affectedRows) {
              return readCurrentBookmarkIcon(connection, bookmark.id, req.user.id, checkedAt);
            }
            return {
              id: bookmark.id,
              iconUrl: bookmark.icon_url || '',
              iconCheckedAt: checkedAt,
              changed: false,
            };
          };
          // 统一走自研 favimg(覆盖面广:网页 link + 站点 favicon.ico + 聚合兜底,无第三方占位假图问题)
          const fetched = await fetchIconFromFavimg(bookmark.url);
          if (!fetched) return markChecked();
          let tempPath = '';
          let finalPath = '';
          try {
            let fileExtension = 'png';
            const mimeType = Object.entries(imageMimeTypes).find(([key]) => fetched.contentType?.includes(key))?.[1];
            if (mimeType) fileExtension = mimeType;

            const oldFilePath = getLocalBookmarkIconPath(bookmark.icon_url, bookmark.id);
            if (oldFilePath) {
              const existingBuffer = await fsP.readFile(oldFilePath).catch(() => null);
              if (bookmarkIconBuffersEqual(existingBuffer, fetched.buffer)) {
                const [updateResult] = await connection.query(
                  'UPDATE bookmark SET icon_checked_at=NOW() WHERE id=? AND user_id=? AND url=?',
                  [bookmark.id, req.user.id, bookmark.url],
                );
                if (!updateResult?.affectedRows) {
                  return readCurrentBookmarkIcon(connection, bookmark.id, req.user.id, checkedAt);
                }
                return {
                  id: bookmark.id,
                  iconUrl: bookmark.icon_url || '',
                  iconCheckedAt: checkedAt,
                  changed: false,
                };
              }
            }

            // 内容变化才生成内容寻址文件；URL 不变意味着浏览器缓存也不需要被无意义击穿。
            const contentHash = createHash('sha256').update(fetched.buffer).digest('hex').slice(0, 12);
            const fileName = `bookmark-${bookmark.id}-${contentHash}.${fileExtension}`;
            finalPath = path.join(BOOKMARK_ICON_UPLOAD_DIR, fileName);
            tempPath = path.join(BOOKMARK_ICON_UPLOAD_DIR, `.bookmark-${bookmark.id}-${randomUUID()}.tmp`);
            await fsP.mkdir(BOOKMARK_ICON_UPLOAD_DIR, { recursive: true });
            // 先写临时文件，再原子替换目标文件。写入失败时旧图标仍在，不能为了刷新把可用图标删掉。
            const existingFinalBuffer = await fsP.readFile(finalPath).catch(() => null);
            if (!bookmarkIconBuffersEqual(existingFinalBuffer, fetched.buffer)) {
              await fsP.writeFile(tempPath, fetched.buffer);
              await fsP.rename(tempPath, finalPath);
            }
            const requestHost = typeof req.get === 'function' ? req.get('host') : req.headers?.host;
            const imageUrl = `https://${requestHost}/uploads/${fileName}`;
            const [updateResult] = await connection.query(
              'UPDATE bookmark SET icon_url=?, icon_checked_at=NOW() WHERE id=? AND user_id=? AND url=?',
              [imageUrl, bookmark.id, req.user.id, bookmark.url],
            );
            // 抓取期间书签可能刚好改成另一站点；条件更新失败时不覆盖新站点状态。
            // 内容寻址文件即使暂时无引用也留给现有图库清理任务处理，避免误删并发请求刚复用的同内容文件。
            if (!updateResult?.affectedRows) {
              return readCurrentBookmarkIcon(connection, bookmark.id, req.user.id, checkedAt);
            }
            // 数据库已经指向新文件后，再清理上一版文件及固定文件名时代的历史文件。
            const cleanupPaths = new Set(
              [
                oldFilePath,
                ...['png', 'svg', 'jpeg', 'jpg', 'gif', 'ico', 'webp'].map((extension) =>
                  path.join(BOOKMARK_ICON_UPLOAD_DIR, `bookmark-${bookmark.id}.${extension}`),
                ),
              ].filter((filePath) => filePath && filePath !== finalPath),
            );
            await Promise.all([...cleanupPaths].map((filePath) => fsP.unlink(filePath).catch(() => {})));
            return { id: bookmark.id, iconUrl: imageUrl, iconCheckedAt: checkedAt, changed: true };
          } catch (err) {
            if (tempPath) await fsP.unlink(tempPath).catch(() => {});
            console.error('图标落盘失败:', err.message);
            return markChecked();
          }
        })();
        bookmarkIconRefreshInFlight.set(refreshKey, refreshPromise);
        try {
          return await refreshPromise;
        } finally {
          if (bookmarkIconRefreshInFlight.get(refreshKey) === refreshPromise) {
            bookmarkIconRefreshInFlight.delete(refreshKey);
          }
        }
      }),
    );
    res.send(resultData(results.filter(Boolean), 200, '图标检查完成'));
  } catch (err) {
    res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
  } finally {
    connection.release();
  }
};

export const getImages = async (req, res) => {
  // 后台图库(列全站书签图标 + 笔记图片 + 笔记模板图片 + 服务器图片目录)——仅 root 可查
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  // 指定要读取的目录路径
  const directoryPath = '/www/wwwroot/images';

  try {
    // 读取目录中的所有文件和子目录
    let files = [];
    try {
      files = fs.readdirSync(directoryPath);
    } catch (e) {
      if (e.code === 'ENOENT') {
        files = [];
      } else {
        throw e;
      }
    }

    // 过滤并处理文件名和后缀
    let fileList = files.map((file) => {
      const ext = path.extname(file); // 获取文件后缀
      const fileName = path.basename(file, ext); // 获取文件名（不带后缀）
      return {
        name: fileName,
        extension: ext.split('.')[1],
        fullFileName: file, // 如果需要完整的文件名（包括后缀）
      };
    });

    // 引用集合统一由 util/noteImages.js 汇总(书签图标 + note_images + 模板正文),
    // 精确按「文件名(不含扩展)」比对,避免子串误判(如 bookmark-5 命中 bookmark-50);
    // 「仅被模板引用」的图片必须算已使用,否则 Root 清理会导致模板裂图
    const usedNames = await collectUsedImageNames();

    if (req.body.name) {
      fileList = fileList.filter((file) => file.name.includes(req.body.name));
    }
    res.send(
      resultData({
        items: {
          usedImages: fileList.filter((file) => usedNames.has(file.name)),
          unUsedImages: fileList.filter((file) => !usedNames.has(file.name)),
        },
        total: fileList.length,
      }),
    );
  } catch (error) {
    console.error('读取目录时出错：', error);
    res.send(resultData(null, 500, '读取图片目录失败'));
  }
};

export const clearImages = async (req, res) => {
  const userId = await ensureRootRole(req, res);
  if (!userId) return;
  const directoryPath = '/www/wwwroot/images';
  const images = Array.isArray(req.body.images) ? req.body.images : [];
  if (!images.length) {
    return res.send(resultData(null, 400, '未指定要删除的图片'));
  }

  try {
    // 删除前服务端重建引用集合再次校验(不信任前端的"已失效"标记):
    // 图库列表与实际清理之间存在时间差,期间图片可能已被笔记/模板重新引用
    const usedNames = await collectUsedImageNames();
    const deleted = [];
    const skipped = [];
    const failed = [];
    for (const data of images) {
      // basename 防路径穿越,只允许删除图片目录内的文件
      const fullFileName = path.basename(String(data?.fullFileName || ''));
      if (!fullFileName) continue;
      const baseName = fullFileName.replace(/\.[^.]+$/, '');
      if (usedNames.has(baseName)) {
        skipped.push(fullFileName);
        continue;
      }
      try {
        await fsP.unlink(path.join(directoryPath, fullFileName));
        deleted.push(fullFileName);
      } catch (error) {
        // 文件已不存在视为删除达成(幂等),其余失败如实上报,不谎报成功
        if (error?.code === 'ENOENT') {
          deleted.push(fullFileName);
        } else {
          console.error(`删除文件失败: ${fullFileName}`, error);
          failed.push(fullFileName);
        }
      }
    }
    if (failed.length && !deleted.length && !skipped.length) {
      return res.status(500).send(resultData({ deleted, skipped, failed }, 500, '删除失败'));
    }
    const msgParts = [];
    if (deleted.length) msgParts.push(`已删除 ${deleted.length} 张`);
    if (skipped.length) msgParts.push(`${skipped.length} 张仍被引用已跳过`);
    if (failed.length) msgParts.push(`${failed.length} 张删除失败`);
    res.send(resultData({ deleted, skipped, failed }, 200, msgParts.join('；') || '删除成功'));
  } catch (error) {
    console.error('删除过程中出现错误:', error);
    res.status(500).send(resultData(null, 500, '删除失败'));
  }
};

export const runSql = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;

    // 拦截危险操作（DROP TABLE/DATABASE、TRUNCATE、ALTER TABLE、GRANT、REVOKE）
    const DANGEROUS = /\b(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE|ALTER\s+TABLE|GRANT|REVOKE)\b/i;
    if (DANGEROUS.test(req.body.sql)) {
      return res.send(resultData(null, 403, '危险操作已拦截。如需执行，请直连数据库。'));
    }

    const [result] = await pool.query(req.body.sql);
    res.send(resultData(result, 200));
  } catch (e) {
    console.error('[admin-sql] 执行失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, 'SQL 执行失败，请检查语句后重试'));
  }
};

export const getHelpConfig = async (req, res) => {
  try {
    const [result] = await pool.query(
      "SELECT id,title,content,sort FROM knowledge_base WHERE category = '帮助中心' AND status = 'public' ORDER BY sort ASC, created_at ASC",
    );
    res.send(resultData(result, 200));
  } catch (e) {
    // 公开接口:不把 SQL 错误细节返给游客,降级空数组 + 500
    console.error('[help] 获取帮助中心配置失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData([], 500, '获取帮助中心内容失败'));
  }
};

// 仅为旧 AI 会话补齐可导航来源：普通用户只能解析帮助中心公开文章，不返回正文。
export const resolveHelpSources = async (req, res) => {
  try {
    if (!Array.isArray(req.body?.titles)) return res.send(resultData(null, 400, '来源标题格式无效'));
    const titles = [
      ...new Set(
        req.body.titles
          .map((title) =>
            String(title || '')
              .trim()
              .slice(0, 255),
          )
          .filter(Boolean)
          .slice(0, 20),
      ),
    ];
    if (!titles.length) return res.send(resultData([], 200));
    const placeholders = titles.map(() => '?').join(',');
    const publicOnly = req.user?.role !== 'root';
    const [rows] = await pool.query(
      `SELECT id, title, category, status FROM knowledge_base
       WHERE title IN (${placeholders})${publicOnly ? " AND status = 'public' AND category = '帮助中心'" : ''}`,
      titles,
    );
    const titleCounts = rows.reduce((counts, row) => {
      counts.set(row.title, (counts.get(row.title) || 0) + 1);
      return counts;
    }, new Map());
    res.send(
      resultData(
        rows
          .filter((row) => titleCounts.get(row.title) === 1)
          .map((row) => {
            const target = resolveKnowledgeSourceTarget(row, req.user?.role);
            if (!target) return null;
            return {
              id: String(row.id),
              title: row.title,
              category: row.category || '',
              status: row.status || 'internal',
              target,
            };
          })
          .filter(Boolean),
        200,
      ),
    );
  } catch (error) {
    console.error('[help] 旧来源解析失败:', error?.message || error);
    res.send(resultData(null, 500, '来源解析失败'));
  }
};

// 草稿管理相关 handler 已移除（迁移至 knowledge_base 表）

function percentile(values, ratio) {
  const nums = values
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!nums.length) return null;
  return nums[Math.min(nums.length - 1, Math.max(0, Math.ceil(nums.length * ratio) - 1))];
}

function parseAgentToolStatuses(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 兼容升级前仅保存逗号分隔工具名的历史日志。
    return String(value)
      .split(',')
      .filter(Boolean)
      .map((name) => ({ name, status: 'unknown' }));
  }
}

export const getAgentLogsSummary = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'root') {
      return res.send(resultData(null, 403, '仅管理员可查看'));
    }

    // 用 Node 本地时间计算今日范围（避免 MySQL 时区差异）
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // 隐藏内部账号(root/test):与列表口径一致,按 user_id join user 判角色
    const { hideInternal = true } = req.body || {};
    const roleClause = hideInternal
      ? ` AND (u.role IS NULL OR u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`
      : '';
    const roleParams = hideInternal ? INTERNAL_ROLES : [];

    const [[todayRow], [totalRow]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(a.total_tokens),0) as tokens, COALESCE(SUM(a.cost),0) as cost FROM agent_logs a LEFT JOIN user u ON a.user_id = u.id WHERE a.created_at >= ? AND a.created_at < DATE_ADD(?, INTERVAL 1 DAY)${roleClause}`,
        [todayStr, todayStr, ...roleParams],
      ),
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(a.total_tokens),0) as tokens, COALESCE(SUM(a.cost),0) as cost FROM agent_logs a LEFT JOIN user u ON a.user_id = u.id WHERE 1=1${roleClause}`,
        [...roleParams],
      ),
    ]);

    let metricRows = [];
    try {
      const [rows] = await pool.query(
        `SELECT a.status, a.duration_ms, a.first_token_ms, a.planner_ms, a.tool_ms,
                a.final_ms, a.task_type, a.tools_used
         FROM agent_logs a
         LEFT JOIN user u ON a.user_id = u.id
         WHERE a.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)${roleClause}
         ORDER BY a.created_at DESC
         LIMIT 5000`,
        [...roleParams],
      );
      metricRows = rows;
    } catch (error) {
      // 迁移前的旧表缺少追踪字段时仍返回基础统计，避免后台页面整体不可用。
      if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    }

    const toolRows = metricRows.filter((row) => row.tools_used);
    const toolErrors = toolRows.filter((row) =>
      parseAgentToolStatuses(row.tools_used).some((tool) => tool.status === 'error'),
    ).length;
    const errorCount = metricRows.filter((row) => row.status === 'error').length;
    const confirmationApproved = metricRows.filter(
      (row) => row.task_type === 'agent_confirmation' && row.status === 'success',
    ).length;
    const confirmationRejected = metricRows.filter(
      (row) => row.task_type === 'agent_confirmation' && row.status === 'confirmation_rejected',
    ).length;
    const ratio = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0);
    const average = (field) => {
      const values = metricRows
        .map((row) => row[field])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(Number.isFinite);
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };

    res.send(
      resultData({
        today: {
          count: todayRow[0].count,
          tokens: todayRow[0].tokens,
          cost: Number(todayRow[0].cost).toFixed(4),
        },
        total: {
          count: totalRow[0].count,
          tokens: totalRow[0].tokens,
          cost: Number(totalRow[0].cost).toFixed(4),
        },
        quality: {
          sampleCount: metricRows.length,
          errorRate: ratio(errorCount, metricRows.length),
          durationP50: percentile(
            metricRows.map((row) => row.duration_ms),
            0.5,
          ),
          durationP95: percentile(
            metricRows.map((row) => row.duration_ms),
            0.95,
          ),
          firstTokenP50: percentile(
            metricRows.map((row) => row.first_token_ms),
            0.5,
          ),
          firstTokenP95: percentile(
            metricRows.map((row) => row.first_token_ms),
            0.95,
          ),
          plannerAvg: average('planner_ms'),
          toolAvg: average('tool_ms'),
          finalAvg: average('final_ms'),
          toolHitRate: ratio(toolRows.length, metricRows.length),
          toolErrorRate: ratio(toolErrors, toolRows.length),
          confirmationRate: ratio(confirmationApproved, confirmationApproved + confirmationRejected),
          directTaskCount: metricRows.filter((row) => row.task_type === 'note_assist').length,
          agentTaskCount: metricRows.filter((row) => row.task_type === 'agent').length,
        },
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, '查询失败: ' + e.message));
  }
};

// POST /common/getAdminOverview —— 后台总览看板:用户/内容/存储/AI/活跃/系统/转化/待办 + 近7天趋势(仅 root)
// 口径统一:累计量与今日增量成对返回,前端统一「累计为主 + 今日 +N」呈现;高风险表(security/user_sessions/api_logs/agent_logs)各自兜底,缺表不拖垮整体
export const getAdminOverview = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅管理员可查看'));
  try {
    // 隐藏内部账号(root/test):默认开。user/user_sessions 直接按 role;内容/AI/反馈按创建者 id 子查询排除。
    // INTERNAL_ROLES 是代码常量(非用户输入),内联进 SQL 以免大量参数错位;游客转化/系统健康不受影响
    const hideInternal = req.body?.hideInternal !== false;
    const irSql = INTERNAL_ROLES.map((r) => `'${r}'`).join(', ');
    const notIntRole = hideInternal ? ` AND role NOT IN (${irSql})` : '';
    const notIntUser = hideInternal ? ` AND user_id NOT IN (SELECT id FROM \`user\` WHERE role IN (${irSql}))` : '';
    const notIntCreateBy = hideInternal
      ? ` AND create_by NOT IN (SELECT id FROM \`user\` WHERE role IN (${irSql}))`
      : '';

    // 用 Node 本地时间算今日与近7天序列(与 getAgentLogsSummary 一致,避免 MySQL 时区差异)
    const now = new Date();
    const pad = (nn) => String(nn).padStart(2, '0');
    const dstr = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const today = dstr(now);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(dstr(d));
    }
    const weekAgo = days[0];

    // 新日志由 logFunction 写入 routeMatched，能精确区分“业务路由返回 4xx”和“未知路径 404”。
    // 历史日志没有该标记，按已注册的业务路由前缀兼容判断，避免上线当天统计口径断层。
    const businessApiPrefixPattern =
      '^/(user|notification|json|common|note|bookmark|opinion|file|chat|search|workbench|security|trash|knowledgeBase|growth|inbox|todo|tagIcon|featureRequest)(/|[?]|$)';
    const legacyRouteUnclassifiedSql = `(COALESCE(system, '') NOT LIKE '%"routeMatched":%')`;
    const routeMatchedSql = `(COALESCE(system, '') LIKE '%"routeMatched":true%' OR (${legacyRouteUnclassifiedSql} AND url REGEXP '${businessApiPrefixPattern}'))`;
    const routeUnmatchedSql = `(COALESCE(system, '') LIKE '%"routeMatched":false%' OR (${legacyRouteUnclassifiedSql} AND NOT (url REGEXP '${businessApiPrefixPattern}')))`;
    // 历史 404 无法知道 Express 是否命中路由；现有数据主要是扫描不存在的路径，因此归为无效访问。
    // 上线后有 routeMatched=true 的真实业务 404 仍会正确归入业务 4xx。
    const legacyUnknown404Sql = `(status_code = '404' AND ${legacyRouteUnclassifiedSql})`;
    const validApiRequestSql = `((${routeMatchedSql} AND NOT ${legacyUnknown404Sql}) OR status_code LIKE '5%')`;
    const business4xxSql = `(status_code LIKE '4%' AND ${routeMatchedSql} AND NOT ${legacyUnknown404Sql})`;
    const invalid4xxSql = `(status_code LIKE '4%' AND (${routeUnmatchedSql} OR ${legacyUnknown404Sql}))`;

    const [userAgg, resAgg, convAgg, opinionAgg, securityAgg, activeAgg, sysAgg, userTrendRows, contentTrendRows] =
      await Promise.all([
        pool.query(
          'SELECT COUNT(*) AS total, COALESCE(SUM(create_time >= ?), 0) AS today FROM `user` WHERE del_flag = 0' +
            notIntRole,
          [today],
        ),
        pool.query(
          `SELECT
           (SELECT COUNT(*) FROM bookmark WHERE del_flag = 0${notIntUser}) AS bookmarkTotal,
           (SELECT COUNT(*) FROM note WHERE del_flag = 0${notIntCreateBy}) AS noteTotal,
           (SELECT COUNT(*) FROM files WHERE del_flag = 0${notIntCreateBy}) AS fileTotal,
           COALESCE((SELECT ROUND(SUM(file_size) / 1048576, 2) FROM files WHERE del_flag = 0${notIntCreateBy}), 0) AS storageMb,
           (SELECT COUNT(*) FROM bookmark WHERE del_flag = 0 AND create_time >= ?${notIntUser}) AS bookmarkToday,
           (SELECT COUNT(*) FROM note WHERE del_flag = 0 AND create_time >= ?${notIntCreateBy}) AS noteToday,
           (SELECT COUNT(*) FROM files WHERE del_flag = 0 AND create_time >= ?${notIntCreateBy}) AS fileToday,
           COALESCE((SELECT ROUND(SUM(file_size) / 1048576, 2) FROM files WHERE del_flag = 1${notIntCreateBy}), 0) AS trashMb,
           (SELECT COUNT(*) FROM files WHERE del_flag = 1${notIntCreateBy}) AS trashCount`,
          [today, today, today],
        ),
        pool.query(
          `SELECT
           COUNT(DISTINCT CASE WHEN event = 'page_view' THEN fingerprint END) AS visitors,
           COUNT(DISTINCT CASE WHEN event = 'register' THEN fingerprint END) AS registers
         FROM conversion_events`,
        ),
        pool.query('SELECT COUNT(*) AS pending FROM opinion WHERE del_flag = 0 AND status = ?' + notIntUser, [
          OPINION_STATUS.PENDING,
        ]),
        pool
          .query(
            "SELECT COUNT(*) AS unhandled FROM security_events WHERE handled_status = 'unhandled' AND severity IN ('high','critical')",
          )
          .catch(() => [[{ unhandled: 0 }]]),
        // 活跃用户(会话表 last_active_time;排除游客会话)
        pool
          .query(
            `SELECT
             COUNT(DISTINCT CASE WHEN last_active_time >= ? THEN user_id END) AS activeToday,
             COUNT(DISTINCT CASE WHEN last_active_time >= ? THEN user_id END) AS active7d
           FROM user_sessions WHERE role != 'visitor'${notIntRole}`,
            [today, weekAgo],
          )
          .catch(() => [[{ activeToday: 0, active7d: 0 }]]),
        // 系统健康：业务 4xx、未知路径 4xx 与服务端 5xx 分开，避免外部探测 404 被误解为功能故障。
        pool
          .query(
            `SELECT
             COALESCE(SUM(${validApiRequestSql}), 0) AS total,
             COALESCE(SUM(${business4xxSql}), 0) AS businessErrors,
             COALESCE(SUM(${invalid4xxSql}), 0) AS invalidRequests,
             COALESCE(SUM(status_code LIKE '5%'), 0) AS serverErrors
           FROM api_logs WHERE request_time >= ?`,
            [today],
          )
          .catch(() => [[{ total: 0, businessErrors: 0, invalidRequests: 0, serverErrors: 0 }]]),
        // 近7天新增用户按天
        pool
          .query(
            "SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM `user` WHERE del_flag = 0 AND create_time >= ?" +
              notIntRole +
              ' GROUP BY d',
            [weekAgo],
          )
          .catch(() => [[]]),
        // 近7天新增内容(书签+笔记+文件合并)按天
        pool
          .query(
            `SELECT d, SUM(c) AS c FROM (
             SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM bookmark WHERE del_flag = 0 AND create_time >= ?${notIntUser} GROUP BY d
             UNION ALL SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM note WHERE del_flag = 0 AND create_time >= ?${notIntCreateBy} GROUP BY d
             UNION ALL SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM files WHERE del_flag = 0 AND create_time >= ?${notIntCreateBy} GROUP BY d
           ) t GROUP BY d`,
            [weekAgo, weekAgo, weekAgo],
          )
          .catch(() => [[]]),
      ]);

    // AI 消耗单独兜底(agent_logs 若某环境未建表,不拖垮整个看板)
    let ai = { todayCount: 0, todayTokens: 0, todayCost: '0.0000', totalCount: 0, totalTokens: 0, totalCost: '0.0000' };
    try {
      const [[aiToday], [aiTotal]] = await Promise.all([
        pool.query(
          'SELECT COUNT(*) AS count, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(cost),0) AS cost FROM agent_logs WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)' +
            notIntUser,
          [today, today],
        ),
        pool.query(
          'SELECT COUNT(*) AS count, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(cost),0) AS cost FROM agent_logs WHERE 1=1' +
            notIntUser,
        ),
      ]);
      ai = {
        todayCount: Number(aiToday[0].count),
        todayTokens: Number(aiToday[0].tokens),
        todayCost: Number(aiToday[0].cost).toFixed(4),
        totalCount: Number(aiTotal[0].count),
        totalTokens: Number(aiTotal[0].tokens),
        totalCost: Number(aiTotal[0].cost).toFixed(4),
      };
    } catch (aiErr) {
      console.error('[AdminOverview] AI 统计失败(忽略):', aiErr.message);
    }

    // 趋势按天补零成 7 天序列(展示 MM-DD)
    const userMap = Object.fromEntries((userTrendRows[0] || []).map((x) => [x.d, Number(x.c)]));
    const contentMap = Object.fromEntries((contentTrendRows[0] || []).map((x) => [x.d, Number(x.c)]));
    const trend = days.map((d) => ({ d: d.slice(5), users: userMap[d] || 0, content: contentMap[d] || 0 }));

    const u = userAgg[0][0],
      r = resAgg[0][0],
      c = convAgg[0][0],
      o = opinionAgg[0][0],
      s = securityAgg[0][0],
      a = activeAgg[0][0],
      sys = sysAgg[0][0];
    res.send(
      resultData({
        users: { total: Number(u.total || 0), today: Number(u.today || 0) },
        active: { today: Number(a.activeToday || 0), week: Number(a.active7d || 0) },
        resources: {
          bookmarkTotal: Number(r.bookmarkTotal || 0),
          noteTotal: Number(r.noteTotal || 0),
          fileTotal: Number(r.fileTotal || 0),
          bookmarkToday: Number(r.bookmarkToday || 0),
          noteToday: Number(r.noteToday || 0),
          fileToday: Number(r.fileToday || 0),
          storageMb: Number(r.storageMb || 0),
          trashMb: Number(r.trashMb || 0),
          trashCount: Number(r.trashCount || 0),
        },
        ai,
        conversion: { visitors: Number(c.visitors || 0), registers: Number(c.registers || 0) },
        system: {
          apiToday: Number(sys.total || 0),
          // 保留 apiErrorsToday 兼容旧前端，但只统计真正需要关注的业务 4xx + 服务端 5xx。
          apiErrorsToday: Number(sys.businessErrors || 0) + Number(sys.serverErrors || 0),
          apiBusinessErrorsToday: Number(sys.businessErrors || 0),
          apiInvalidRequestsToday: Number(sys.invalidRequests || 0),
          apiServerErrorsToday: Number(sys.serverErrors || 0),
        },
        pending: { opinion: Number(o.pending || 0), security: Number(s.unhandled || 0) },
        trend,
        generatedAt: `${today} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      }),
    );
  } catch (e) {
    console.error('获取后台总览失败:', e.message);
    res.send(resultData(null, 500, '获取后台总览失败: ' + e.message));
  }
};

export const getAgentLogs = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'root') {
      return res.send(resultData(null, 403, '仅管理员可查看'));
    }

    const { keyword, pageSize = 20, currentPage = 1, hideInternal = true } = req.body || {};
    const take = Math.min(Math.max(pageSize || 20, 1), 100);
    const offset = take * (Math.max(currentPage || 1, 1) - 1);

    let where = '1=1';
    const params = [];

    if (keyword) {
      where += ' AND (a.question LIKE ? OR a.user_alias LIKE ? OR a.tools_used LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // 隐藏内部账号(root/test):按 user_id join user 判角色;join 不到(u.role NULL,如已删用户)按真实用户保留
    if (hideInternal) {
      where += ` AND (u.role IS NULL OR u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`;
      params.push(...INTERNAL_ROLES);
    }

    const [[rows], [countRes]] = await Promise.all([
      pool.query(
        `SELECT a.* FROM agent_logs a LEFT JOIN user u ON a.user_id = u.id WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
        [...params, take, offset],
      ),
      pool.query(
        `SELECT COUNT(*) as total FROM agent_logs a LEFT JOIN user u ON a.user_id = u.id WHERE ${where}`,
        params,
      ),
    ]);

    res.send(
      resultData({
        items: rows,
        total: countRes[0].total,
        currentPage,
        pageSize: take,
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, '查询失败: ' + e.message));
  }
};
