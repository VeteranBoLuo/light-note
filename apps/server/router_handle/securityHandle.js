import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { validateQueryParams } from '../util/request.js';
import { rebuildIpReputationFromEvents, revertIpReputationImpact, setIpBan } from '../util/security/services/ipReputation.js';
import { rebuildAccountReputationFromEvents, revertAccountReputationImpact } from '../util/security/services/accountReputation.js';
import {
  disableSecurityWhitelist,
  isSecurityWhitelisted,
  normalizeWhitelistType,
} from '../util/security/services/whitelist.js';
import { removeUserSessions } from '../util/sessionStore.js';

const ensureRootRole = async (req, res) => {
  if (!req.user?.id || req.user?.role !== 'root') {
    res.send(resultData(null, 403, '仅root用户可查看安全中心'));
    return false;
  }
  return true;
};

const parseJsonField = (row, field, fallback) => {
  if (!row || row[field] === undefined || row[field] === null) return;
  if (typeof row[field] === 'object') return;
  try {
    row[field] = JSON.parse(row[field]);
  } catch (e) {
    row[field] = fallback;
  }
};

const padDatePart = (value) => String(value).padStart(2, '0');

const formatTrendHourKey = (date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:00:00`;

const formatTrendHourLabel = (date) =>
  `${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:00`;

const buildHourlyTrend = (rows = []) => {
  const rowMap = new Map(rows.map((row) => [row.hourKey, row]));
  const end = new Date();
  end.setMinutes(0, 0, 0);
  const start = new Date(end);
  start.setHours(start.getHours() - 23);

  return Array.from({ length: 24 }, (_, index) => {
    const current = new Date(start);
    current.setHours(start.getHours() + index);
    const hourKey = formatTrendHourKey(current);
    const row = rowMap.get(hourKey) || {};
    return {
      hourKey,
      time: formatTrendHourLabel(current),
      total: Number(row.total || 0),
      blocked: Number(row.blocked || 0),
    };
  });
};

const normalizeSecurityHandledStatus = (handledStatus = 'processed') => {
  const statusMap = {
    confirmed: 'processed',
    resolved: 'processed',
    ignored: 'processed',
    processed: 'processed',
    false_positive: 'false_positive',
    unhandled: 'unhandled',
  };
  return statusMap[handledStatus];
};

const applySecurityEventHandle = async ({ connection, event, normalizedStatus, remark, operatorId }) => {
  await connection.query(
    `UPDATE security_events
     SET handled_status = ?, remark = ?, handled_by = ?, handled_at = NOW()
     WHERE event_id = ?`,
    [normalizedStatus, remark, operatorId, event.event_id],
  );

  if (normalizedStatus === 'false_positive' && !event.ip_risk_reverted) {
    if (Number(event.ip_risk_delta || 0) > 0) {
      await revertIpReputationImpact({
        ip: event.source_ip,
        attackType: event.attack_type,
        severity: event.severity,
        riskDelta: event.ip_risk_delta,
        connection,
      });
    } else {
      await rebuildIpReputationFromEvents({ ip: event.source_ip, connection });
    }
    await connection.query(
      `UPDATE security_events
       SET ip_risk_reverted = 1, ip_risk_reverted_at = NOW()
       WHERE event_id = ?`,
      [event.event_id],
    );
  }

  if (normalizedStatus === 'false_positive' && event.user_id && !event.user_risk_reverted) {
    if (Number(event.user_risk_delta || 0) > 0) {
      await revertAccountReputationImpact({
        userId: event.user_id,
        attackType: event.attack_type,
        severity: event.severity,
        riskDelta: event.user_risk_delta,
        connection,
      });
    } else {
      await rebuildAccountReputationFromEvents({ userId: event.user_id, connection });
    }
    await connection.query(
      `UPDATE security_events
       SET user_risk_reverted = 1, user_risk_reverted_at = NOW()
       WHERE event_id = ?`,
      [event.event_id],
    );
  }
};

const buildWhitelistWhere = (filters = {}) => {
  const conditions = ['1=1'];
  const params = [];
  const targetType = normalizeWhitelistType(filters.target_type);
  if (targetType) {
    conditions.push('w.target_type = ?');
    params.push(targetType);
  }
  if (filters.enabled !== undefined && filters.enabled !== '' && filters.enabled !== null) {
    conditions.push('w.enabled = ?');
    params.push(Number(filters.enabled));
  }
  if (filters.key) {
    conditions.push(
      `(w.target_value LIKE CONCAT('%', ?, '%')
        OR w.label LIKE CONCAT('%', ?, '%')
        OR w.reason LIKE CONCAT('%', ?, '%')
        OR u.alias LIKE CONCAT('%', ?, '%')
        OR u.email LIKE CONCAT('%', ?, '%'))`,
    );
    params.push(filters.key, filters.key, filters.key, filters.key, filters.key);
  }
  return { where: conditions.join(' AND '), params };
};

const whitelistConflict = async (targetType, targetValue) => {
  const whitelisted = await isSecurityWhitelisted(targetType, targetValue);
  if (!whitelisted) return null;
  return resultData(
    {
      whitelistConflict: true,
      targetType,
      targetValue,
    },
    409,
    '该对象当前在白名单中，确认后会先移出白名单并执行封禁',
  );
};

const buildEventWhere = (filters = {}) => {
  const conditions = ['1=1'];
  const params = [];
  if (filters.key) {
    conditions.push(
      `(e.source_ip LIKE CONCAT('%', ?, '%')
        OR e.request_path LIKE CONCAT('%', ?, '%')
        OR e.matched_rule LIKE CONCAT('%', ?, '%')
        OR e.attack_type LIKE CONCAT('%', ?, '%')
        OR e.user_agent LIKE CONCAT('%', ?, '%')
        OR u.alias LIKE CONCAT('%', ?, '%')
        OR u.email LIKE CONCAT('%', ?, '%'))`,
    );
    params.push(filters.key, filters.key, filters.key, filters.key, filters.key, filters.key, filters.key);
  }
  if (filters.attack_type) {
    conditions.push('e.attack_type = ?');
    params.push(filters.attack_type);
  }
  if (filters.severity) {
    conditions.push('e.severity = ?');
    params.push(filters.severity);
  }
  if (filters.action_taken) {
    conditions.push('e.action_taken = ?');
    params.push(filters.action_taken);
  }
  if (filters.handled_status) {
    conditions.push('e.handled_status = ?');
    params.push(filters.handled_status);
  }
  if (filters.source_ip) {
    conditions.push('e.source_ip = ?');
    params.push(filters.source_ip);
  }
  if (filters.user_id) {
    conditions.push('e.user_id = ?');
    params.push(filters.user_id);
  }
  if (filters.blocked !== undefined && filters.blocked !== '' && filters.blocked !== null) {
    conditions.push('e.blocked = ?');
    params.push(Number(filters.blocked));
  }
  if (filters.start_time) {
    conditions.push('e.created_at >= ?');
    params.push(filters.start_time);
  }
  if (filters.end_time) {
    conditions.push('e.created_at <= ?');
    params.push(filters.end_time);
  }
  return { where: conditions.join(' AND '), params };
};

export const getSecurityOverview = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const [summaryRows] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(severity IN ('high','critical')), 0) AS highRisk,
        COALESCE(SUM(blocked = 1), 0) AS blocked,
        COUNT(DISTINCT source_ip) AS activeIps,
        COALESCE(SUM(created_at >= CURDATE()), 0) AS todayTotal,
        COALESCE(SUM(created_at >= CURDATE() AND severity = 'critical'), 0) AS todayCritical,
        COALESCE(SUM(handled_status = 'unhandled'), 0) AS unhandled,
        COALESCE(SUM(handled_status = 'unhandled' AND severity IN ('high','critical')), 0) AS unhandledHighRisk
      FROM security_events
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    const [severityRows] = await pool.query(`
      SELECT severity, COUNT(*) AS total
      FROM security_events
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY severity
    `);
    const [statusRows] = await pool.query(`
      SELECT handled_status AS handledStatus, COUNT(*) AS total
      FROM security_events
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY handled_status
    `);
    const [typeRows] = await pool.query(`
      SELECT attack_type AS attackType, COUNT(*) AS total
      FROM security_events
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY attack_type
      ORDER BY total DESC
      LIMIT 8
    `);
    const [trendRows] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS hourKey,
        COUNT(*) AS total,
        COALESCE(SUM(blocked = 1), 0) AS blocked
      FROM security_events
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d %H')
      ORDER BY MIN(created_at)
    `);
    const [topIpRows] = await pool.query(`
      SELECT source_ip AS sourceIp, COUNT(*) AS total, MAX(threat_score) AS maxScore
      FROM security_events
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY source_ip
      ORDER BY total DESC
      LIMIT 8
    `);
    const [topPathRows] = await pool.query(`
      SELECT request_path AS requestPath, COUNT(*) AS total, MAX(threat_score) AS maxScore
      FROM security_events
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY request_path
      ORDER BY total DESC
      LIMIT 8
    `);
    const [recentRows] = await pool.query(`
      SELECT e.*, u.alias, u.email
      FROM security_events e
      LEFT JOIN user u ON e.user_id = u.id
      ORDER BY e.created_at DESC
      LIMIT 8
    `);
    res.send(
      resultData({
        summary: summaryRows[0],
        severityDistribution: severityRows,
        statusDistribution: statusRows,
        typeDistribution: typeRows,
        trend: buildHourlyTrend(trendRows),
        topIps: topIpRows,
        topPaths: topPathRows,
        recentEvents: recentRows,
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, '获取安全总览失败：' + e.message));
  }
};

export const getSecurityEvents = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const { where, params } = buildEventWhere(filters);
    const queryParams = [...params];
    let limitClause = '';
    if (pageSize !== -1) {
      const skip = pageSize * (currentPage - 1);
      limitClause = 'LIMIT ? OFFSET ?';
      queryParams.push(Number(pageSize), Number(skip));
    }
    const [rows] = await pool.query(
      `SELECT e.*, u.alias, u.email
       FROM security_events e
       LEFT JOIN user u ON e.user_id = u.id
       WHERE ${where}
       ORDER BY e.created_at DESC, e.id DESC
       ${limitClause}`,
      queryParams,
    );
    rows.forEach((row) => {
      parseJsonField(row, 'payload_summary', {});
      parseJsonField(row, 'headers_summary', {});
    });
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM security_events e
       LEFT JOIN user u ON e.user_id = u.id
       WHERE ${where}`,
      params,
    );
    res.send(resultData({ items: rows, total: totalRows[0].total }));
  } catch (e) {
    res.send(resultData(null, 500, '获取安全事件失败：' + e.message));
  }
};

export const getSecurityEventDetail = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { eventId } = req.params;
    const [rows] = await pool.query(
      `SELECT e.*, u.alias, u.email
       FROM security_events e
       LEFT JOIN user u ON e.user_id = u.id
       WHERE e.event_id = ?
       LIMIT 1`,
      [eventId],
    );
    if (!rows[0]) {
      return res.send(resultData(null, 404, '安全事件不存在'));
    }
    const event = rows[0];
    parseJsonField(event, 'payload_summary', {});
    parseJsonField(event, 'headers_summary', {});
    const [evidence] = await pool.query(
      `SELECT *
       FROM security_event_evidence
       WHERE event_id = ?
       ORDER BY score_delta DESC, id ASC`,
      [eventId],
    );
    const [ipRecent] = await pool.query(
      `SELECT event_id, matched_rule, attack_type, severity, threat_score, request_path, action_taken, created_at
       FROM security_events
       WHERE source_ip = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 12`,
      [event.source_ip],
    );
    const [ipInfo] = await pool.query('SELECT * FROM security_ip_reputation WHERE ip = ? LIMIT 1', [event.source_ip]);
    if (ipInfo[0]) {
      parseJsonField(ipInfo[0], 'attack_type_breakdown', {});
      parseJsonField(ipInfo[0], 'location', {});
      ipInfo[0].city = ipInfo[0].location?.city || '';
    }
    let userInfo = null;
    if (event.user_id) {
      const [uRows] = await pool.query('SELECT * FROM security_account_reputation WHERE user_id = ? LIMIT 1', [event.user_id]);
      if (uRows[0]) {
        userInfo = uRows[0];
        parseJsonField(userInfo, 'attack_type_breakdown', {});
      }
    }
    res.send(resultData({ event, evidence, ipRecent, ipInfo: ipInfo[0] || null, userInfo }));
  } catch (e) {
    res.send(resultData(null, 500, '获取安全事件详情失败：' + e.message));
  }
};

export const handleSecurityEvent = async (req, res) => {
  let connection;
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { eventId } = req.params;
    const { handledStatus = 'processed', remark = '' } = req.body || {};
    const normalizedStatus = normalizeSecurityHandledStatus(handledStatus);
    const allowed = ['unhandled', 'processed', 'false_positive'];
    if (!allowed.includes(normalizedStatus)) {
      return res.send(resultData(null, 400, '无效的处理状态'));
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM security_events WHERE event_id = ? LIMIT 1 FOR UPDATE', [eventId]);
    const event = rows[0];
    if (!event) {
      await connection.rollback();
      return res.send(resultData(null, 404, '安全事件不存在'));
    }

    await applySecurityEventHandle({ connection, event, normalizedStatus, remark, operatorId: req.user.id });
    await connection.commit();
    res.send(resultData(null, 200, normalizedStatus === 'false_positive' ? '已标记误报并回滚风险影响' : '处理状态已更新'));
  } catch (e) {
    if (connection) await connection.rollback().catch(() => {});
    res.send(resultData(null, 500, '更新处理状态失败：' + e.message));
  } finally {
    if (connection) connection.release();
  }
};

export const batchHandleSecurityEvents = async (req, res) => {
  let connection;
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { eventIds = [], handledStatus = 'processed', remark = '' } = req.body || {};
    const ids = Array.from(new Set((Array.isArray(eventIds) ? eventIds : []).map((id) => String(id).trim()).filter(Boolean)));
    if (!ids.length) {
      return res.send(resultData(null, 400, '请选择要处理的安全事件'));
    }
    if (ids.length > 100) {
      return res.send(resultData(null, 400, '单次最多批量处理100条安全事件'));
    }
    const normalizedStatus = normalizeSecurityHandledStatus(handledStatus);
    const allowed = ['unhandled', 'processed', 'false_positive'];
    if (!allowed.includes(normalizedStatus)) {
      return res.send(resultData(null, 400, '无效的处理状态'));
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const placeholders = ids.map(() => '?').join(',');
    const [events] = await connection.query(
      `SELECT *
       FROM security_events
       WHERE event_id IN (${placeholders})
       FOR UPDATE`,
      ids,
    );
    const eventMap = new Map(events.map((event) => [event.event_id, event]));
    const missingIds = ids.filter((id) => !eventMap.has(id));
    if (missingIds.length) {
      await connection.rollback();
      return res.send(resultData({ missingIds }, 404, '部分安全事件不存在'));
    }

    for (const eventId of ids) {
      await applySecurityEventHandle({
        connection,
        event: eventMap.get(eventId),
        normalizedStatus,
        remark,
        operatorId: req.user.id,
      });
    }

    await connection.commit();
    res.send(resultData({ handledTotal: ids.length }, 200, `已批量处理 ${ids.length} 条安全事件`));
  } catch (e) {
    if (connection) await connection.rollback().catch(() => {});
    res.send(resultData(null, 500, '批量处理安全事件失败：' + e.message));
  } finally {
    if (connection) connection.release();
  }
};

export const getIpReputationList = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const where = filters.key ? 'WHERE ip LIKE CONCAT("%", ?, "%") OR ban_reason LIKE CONCAT("%", ?, "%")' : '';
    const params = filters.key ? [filters.key, filters.key] : [];
    const queryParams = [...params];
    let limitClause = '';
    if (pageSize !== -1) {
      const skip = pageSize * (currentPage - 1);
      limitClause = 'LIMIT ? OFFSET ?';
      queryParams.push(Number(pageSize), Number(skip));
    }
    const [rows] = await pool.query(
      `SELECT *
       FROM security_ip_reputation
       ${where}
       ORDER BY is_banned DESC, risk_score DESC, total_attacks DESC
       ${limitClause}`,
      queryParams,
    );
    rows.forEach((row) => {
      parseJsonField(row, 'attack_type_breakdown', {});
      parseJsonField(row, 'location', {});
      row.city = row.location?.city || '';
    });
    const [totalRows] = await pool.query(`SELECT COUNT(*) AS total FROM security_ip_reputation ${where}`, params);
    res.send(resultData({ items: rows, total: totalRows[0].total }));
  } catch (e) {
    res.send(resultData(null, 500, '获取IP画像失败：' + e.message));
  }
};

export const banIp = async (req, res) => {
  let connection;
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { ip, minutes = 60, reason = '管理员手动封禁', force = false } = req.body || {};
    if (!ip) return res.send(resultData(null, 400, 'IP不能为空'));
    if (!force) {
      const conflict = await whitelistConflict('ip', ip);
      if (conflict) return res.send(conflict);
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    if (force) {
      await disableSecurityWhitelist('ip', ip, connection);
    }
    await setIpBan(ip, true, minutes, reason, connection);
    await connection.commit();
    res.send(resultData(null, 200, 'IP已封禁'));
  } catch (e) {
    if (connection) await connection.rollback().catch(() => {});
    res.send(resultData(null, 500, '封禁IP失败：' + e.message));
  } finally {
    if (connection) connection.release();
  }
};

export const unbanIp = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { ip } = req.body || {};
    if (!ip) return res.send(resultData(null, 400, 'IP不能为空'));
    await setIpBan(ip, false, 0, '');
    res.send(resultData(null, 200, 'IP已解封'));
  } catch (e) {
    res.send(resultData(null, 500, '解封IP失败：' + e.message));
  }
};

export const getIpAccounts = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { ip } = req.body || {};
    if (!ip) return res.send(resultData(null, 400, 'IP不能为空'));
    const [rows] = await pool.query(
      `SELECT
         account_usage.user_id,
         u.alias,
         u.email,
         u.role,
         u.del_flag,
         SUM(account_usage.security_events) AS security_events,
         SUM(account_usage.api_requests) AS api_requests,
         MAX(account_usage.last_seen_at) AS last_seen_at,
         GROUP_CONCAT(DISTINCT account_usage.source ORDER BY account_usage.source SEPARATOR '、') AS sources
       FROM (
         SELECT user_id, COUNT(*) AS security_events, 0 AS api_requests, MAX(created_at) AS last_seen_at, '安全事件' AS source
         FROM security_events
         WHERE source_ip = ? AND user_id IS NOT NULL AND user_id <> ''
         GROUP BY user_id
         UNION ALL
         SELECT user_id, 0 AS security_events, COUNT(*) AS api_requests, MAX(request_time) AS last_seen_at, '访问日志' AS source
         FROM api_logs
         WHERE ip = ? AND user_id IS NOT NULL AND user_id <> '' AND del_flag = 0
         GROUP BY user_id
       ) account_usage
       LEFT JOIN user u ON account_usage.user_id = u.id
       GROUP BY account_usage.user_id, u.alias, u.email, u.role, u.del_flag
       ORDER BY last_seen_at DESC
       LIMIT 100`,
      [ip, ip],
    );
    res.send(resultData({ items: rows, total: rows.length }));
  } catch (e) {
    res.send(resultData(null, 500, '获取IP关联账号失败：' + e.message));
  }
};

export const getAccountBanList = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const skip = pageSize * (currentPage - 1);
    const params = [];
    const conditions = ['u.del_flag = 1'];
    if (filters.key) {
      conditions.push('(u.id LIKE CONCAT("%", ?, "%") OR u.alias LIKE CONCAT("%", ?, "%") OR u.email LIKE CONCAT("%", ?, "%") OR b.ban_reason LIKE CONCAT("%", ?, "%"))');
      params.push(filters.key, filters.key, filters.key, filters.key);
    }
    const where = conditions.join(' AND ');
    const [rows] = await pool.query(
      `SELECT
         u.id AS user_id,
         u.alias,
         u.email,
         u.role,
         u.head_picture,
         b.ban_reason,
         b.banned_by,
         b.banned_at,
         b.unbanned_at,
         b.updated_at,
         r.risk_score,
         r.total_events,
         r.high_risk_count,
         r.critical_count,
         r.last_event_at
       FROM user u
       LEFT JOIN security_account_bans b ON b.user_id = u.id
       LEFT JOIN security_account_reputation r ON r.user_id = u.id
       WHERE ${where}
       ORDER BY COALESCE(b.banned_at, u.create_time) DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(skip)],
    );
    rows.forEach((row) => parseJsonField(row, 'attack_type_breakdown', {}));
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM user u
       LEFT JOIN security_account_bans b ON b.user_id = u.id
       WHERE ${where}`,
      params,
    );
    res.send(resultData({ items: rows, total: totalRows[0].total }));
  } catch (e) {
    res.send(resultData(null, 500, '获取账号封禁列表失败：' + e.message));
  }
};

export const getAccountReputationList = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const params = [];
    const conditions = [];
    if (filters.key) {
      conditions.push(
        '(u.id LIKE CONCAT("%", ?, "%") OR u.alias LIKE CONCAT("%", ?, "%") OR u.email LIKE CONCAT("%", ?, "%"))',
      );
      params.push(filters.key, filters.key, filters.key);
    }
    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const queryParams = [...params];
    let limitClause = '';
    if (pageSize !== -1) {
      const skip = pageSize * (currentPage - 1);
      limitClause = 'LIMIT ? OFFSET ?';
      queryParams.push(Number(pageSize), Number(skip));
    }
    const [rows] = await pool.query(
      `SELECT
         u.id AS user_id,
         u.alias,
         u.email,
         u.role,
         u.head_picture,
         u.del_flag,
         r.risk_score,
         r.total_events,
         r.high_risk_count,
         r.critical_count,
         r.last_event_at
       FROM user u
       LEFT JOIN security_account_reputation r ON r.user_id = u.id
       ${where}
       ORDER BY u.del_flag DESC, COALESCE(r.risk_score, 0) DESC, u.create_time DESC
       ${limitClause}`,
      queryParams,
    );
    rows.forEach((row) => parseJsonField(row, 'attack_type_breakdown', {}));
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM user u
       LEFT JOIN security_account_reputation r ON r.user_id = u.id
       ${where}`,
      params,
    );
    res.send(resultData({ items: rows, total: totalRows[0].total }));
  } catch (e) {
    res.send(resultData(null, 500, '获取账号画像失败：' + e.message));
  }
};

export const banAccount = async (req, res) => {
  let connection;
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { userId, reason = '管理员在安全中心手动封禁', force = false } = req.body || {};
    if (!userId) return res.send(resultData(null, 400, '账号不能为空'));
    if (userId === req.user.id) return res.send(resultData(null, 400, '不能封禁当前登录账号'));
    if (!force) {
      const conflict = await whitelistConflict('user', userId);
      if (conflict) return res.send(conflict);
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT id, role, del_flag FROM user WHERE id = ? LIMIT 1', [userId]);
    if (!rows[0]) {
      await connection.rollback();
      return res.send(resultData(null, 404, '账号不存在'));
    }
    if (force) {
      await disableSecurityWhitelist('user', userId, connection);
    }
    await connection.query('UPDATE user SET del_flag = 1 WHERE id = ?', [userId]);
    await connection.query(
      `INSERT INTO security_account_bans (user_id,banned_by,ban_reason,is_active,banned_at)
       VALUES (?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE
        banned_by = VALUES(banned_by),
        ban_reason = VALUES(ban_reason),
        is_active = 1,
        banned_at = NOW(),
        unbanned_by = NULL,
        unbanned_at = NULL,
        updated_at = NOW()`,
      [userId, req.user.id, reason, 1],
    );
    await connection.commit();
    await removeUserSessions(userId).catch((error) => {
      console.error('[security] remove user sessions failed after account ban:', error);
    });
    res.send(resultData(null, 200, '账号已封禁'));
  } catch (e) {
    if (connection) await connection.rollback().catch(() => {});
    res.send(resultData(null, 500, '封禁账号失败：' + e.message));
  } finally {
    if (connection) connection.release();
  }
};

export const unbanAccount = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { userId } = req.body || {};
    if (!userId) return res.send(resultData(null, 400, '账号不能为空'));
    await pool.query('UPDATE user SET del_flag = 0 WHERE id = ?', [userId]);
    await pool.query(
      `UPDATE security_account_bans
       SET is_active = 0, unbanned_by = ?, unbanned_at = NOW(), updated_at = NOW()
       WHERE user_id = ?`,
      [req.user.id, userId],
    );
    res.send(resultData(null, 200, '账号已解封'));
  } catch (e) {
    res.send(resultData(null, 500, '解封账号失败：' + e.message));
  }
};

export const getSecurityRules = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const [rows] = await pool.query('SELECT * FROM security_rules ORDER BY attack_type, base_score DESC');
    res.send(resultData({ items: rows, total: rows.length }));
  } catch (e) {
    res.send(resultData(null, 500, '获取安全规则失败：' + e.message));
  }
};

export const getSecurityWhitelist = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const skip = pageSize * (currentPage - 1);
    const { where, params } = buildWhitelistWhere(filters);
    const limitSql = Number(pageSize) === -1 ? '' : 'LIMIT ? OFFSET ?';
    const limitParams = Number(pageSize) === -1 ? [] : [Number(pageSize), Number(skip)];
    const [rows] = await pool.query(
      `SELECT
         w.*,
         u.alias AS user_alias,
         u.email AS user_email,
         creator.alias AS created_by_alias
       FROM security_whitelist w
       LEFT JOIN user u ON w.target_type = 'user' AND w.target_value = u.id
       LEFT JOIN user creator ON creator.id = w.created_by
       WHERE ${where}
       ORDER BY w.enabled DESC, w.updated_at DESC, w.created_at DESC
       ${limitSql}`,
      [...params, ...limitParams],
    );
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM security_whitelist w
       LEFT JOIN user u ON w.target_type = 'user' AND w.target_value = u.id
       WHERE ${where}`,
      params,
    );
    res.send(resultData({ items: rows, total: totalRows[0].total }));
  } catch (e) {
    res.send(resultData(null, 500, '获取安全白名单失败：' + e.message));
  }
};

export const saveSecurityWhitelist = async (req, res) => {
  let connection;
  try {
    if (!(await ensureRootRole(req, res))) return;
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [req.body];
    const items = rawItems
      .map((item) => ({
        targetType: normalizeWhitelistType(item.targetType),
        targetValue: String(item.targetValue || '').trim(),
        label: String(item.label || '').trim(),
        reason: String(item.reason || '').trim(),
      }))
      .filter((item) => item.targetType && item.targetValue);
    if (!items.length) {
      return res.send(resultData(null, 400, '请选择要加入白名单的对象'));
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    for (const item of items) {
      await connection.query(
        `INSERT INTO security_whitelist
          (target_type,target_value,label,reason,enabled,created_by,created_at,updated_at)
         VALUES (?,?,?,?,1,?,NOW(),NOW())
         ON DUPLICATE KEY UPDATE
          label = VALUES(label),
          reason = VALUES(reason),
          enabled = 1,
          updated_at = NOW()`,
        [item.targetType, item.targetValue, item.label, item.reason, req.user.id],
      );
    }
    await connection.commit();
    res.send(resultData(null, 200, '白名单已更新'));
  } catch (e) {
    if (connection) await connection.rollback().catch(() => {});
    res.send(resultData(null, 500, '保存安全白名单失败：' + e.message));
  } finally {
    if (connection) connection.release();
  }
};

export const removeSecurityWhitelist = async (req, res) => {
  try {
    if (!(await ensureRootRole(req, res))) return;
    const { id, targetType, targetValue } = req.body || {};
    if (id) {
      await pool.query('UPDATE security_whitelist SET enabled = 0, updated_at = NOW() WHERE id = ?', [id]);
      return res.send(resultData(null, 200, '已移出白名单'));
    }
    const type = normalizeWhitelistType(targetType);
    const value = String(targetValue || '').trim();
    if (!type || !value) {
      return res.send(resultData(null, 400, '缺少白名单对象'));
    }
    await disableSecurityWhitelist(type, value);
    res.send(resultData(null, 200, '已移出白名单'));
  } catch (e) {
    res.send(resultData(null, 500, '移出安全白名单失败：' + e.message));
  }
};
