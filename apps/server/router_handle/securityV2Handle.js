import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { SECURITY_CONFIG } from '../util/security/rules.js';
import { SECURITY_HANDLED_STATUSES } from '../util/security/handledStatus.js';
import { applySecurityEventHandle } from '../util/security/services/securityEventHandling.js';
import {
  clearSecurityPolicyCache,
  getDefaultSecurityRuleMode,
  matchesSecurityPolicyPattern,
} from '../util/security/services/securityPolicyService.js';
import {
  clearSecurityRestrictionCache,
  SECURITY_RESTRICTION_TYPES,
} from '../util/security/services/securityRestrictionService.js';
import { removeUserSessions } from '../util/sessionStore.js';
import { setIpBan } from '../util/security/services/ipReputation.js';
import { isIP } from 'node:net';

const DISPOSITIONS = new Set(['unknown', 'confirmed_attack', 'false_positive', 'authorized_test', 'benign_anomaly']);
const RULE_MODES = new Set(['observe', 'block', 'off']);
const EXCEPTION_EFFECTS = new Set(['observe_only', 'skip_rule', 'score_adjust']);
const EXCEPTION_SUBJECT_TYPES = new Set(['user', 'ip']);
const TUNING_SUGGESTIONS = new Set(['observe_route', 'ignore_field', 'lower_score', 'exact_exception', 'no_change']);

const ensureRootRole = (req, res) => {
  if (!req.user?.id || req.user.role !== 'root' || req.adminContext) {
    res.status(403).send(resultData(null, 403, '仅 Root 普通管理上下文可访问安全中心'));
    return false;
  }
  return true;
};

const safeDays = (value) => ([1, 7, 30].includes(Number(value)) ? Number(value) : 7);
const cutoffForDays = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const normalizedString = (value, max = 500) =>
  String(value || '')
    .trim()
    .slice(0, max);

const normalizedExpiry = (body = {}) => {
  if (body.permanent === true) return { valid: true, value: null };
  const value = normalizedString(body.expiresAt, 64);
  const timestamp = Date.parse(value);
  return { valid: Boolean(value) && Number.isFinite(timestamp) && timestamp > Date.now(), value: value || null };
};

const queryOptionalRows = async (label, sql, params = []) => {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.warn(`[security-v2] ${label} query skipped:`, error?.code || 'QUERY_FAILED');
    return [];
  }
};

const parseJsonField = (row, field, fallback = {}) => {
  if (!row || row[field] == null || typeof row[field] === 'object') return;
  try {
    row[field] = JSON.parse(row[field]);
  } catch {
    row[field] = fallback;
  }
};

const buildDailyTrend = (rows, days) => {
  const map = new Map(rows.map((row) => [String(row.statDate), row]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - 1 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const row = map.get(key) || {};
    return {
      date: key,
      raw: Number(row.raw || 0),
      confirmed: Number(row.confirmed || 0),
      falsePositive: Number(row.falsePositive || 0),
      benignAnomaly: Number(row.benignAnomaly || 0),
      authorizedTest: Number(row.authorizedTest || 0),
    };
  });
};

const eventDispositionToLegacy = (disposition) => {
  if (disposition === 'false_positive' || disposition === 'authorized_test') return disposition;
  if (disposition === 'unknown') return 'unhandled';
  return 'processed';
};

const reviewEvent = async ({ connection, event, disposition, reason, operatorId }) => {
  const handledStatus = eventDispositionToLegacy(disposition);
  if (!SECURITY_HANDLED_STATUSES.includes(handledStatus)) throw new Error('INVALID_LEGACY_STATUS');
  await applySecurityEventHandle({
    connection,
    event,
    normalizedStatus: handledStatus,
    remark: reason,
    operatorId,
  });
  await connection.query(
    `UPDATE security_events
     SET workflow_status = ?, disposition = ?, reviewed_by = ?, reviewed_at = NOW(), review_reason = ?
     WHERE event_id = ?`,
    [disposition === 'unknown' ? 'reviewing' : 'resolved', disposition, operatorId, reason, event.event_id],
  );
};

const loadEventForUpdate = async (connection, eventId) => {
  const [rows] = await connection.query('SELECT * FROM security_events WHERE event_id = ? LIMIT 1 FOR UPDATE', [
    eventId,
  ]);
  return rows[0] || null;
};

const loadClusterEventsForUpdate = async (connection, anchor) => {
  if (anchor.cluster_key) {
    const [events] = await connection.query(
      `SELECT * FROM security_events
       WHERE cluster_key = ?
       ORDER BY id ASC
       FOR UPDATE`,
      [anchor.cluster_key],
    );
    return events;
  }
  const clusterRule = anchor.primary_rule_code || anchor.matched_rule || anchor.attack_type;
  const clusterActor = anchor.user_id || anchor.source_ip || 'anonymous';
  const [events] = await connection.query(
    `SELECT * FROM security_events
     WHERE COALESCE(NULLIF(primary_rule_code, ''), matched_rule, attack_type) = ?
       AND COALESCE(request_path, '') = ?
       AND COALESCE(NULLIF(user_id, ''), source_ip, 'anonymous') = ?
       AND FLOOR(UNIX_TIMESTAMP(created_at) / 300) = FLOOR(UNIX_TIMESTAMP(?) / 300)
     ORDER BY id ASC
     FOR UPDATE`,
    [clusterRule, anchor.request_path || '', clusterActor, anchor.created_at],
  );
  return events;
};

const createTuningSuggestionFromEvent = async ({ connection, event, operatorId, suggestionType, reason }) => {
  const [evidenceRows] = await connection.query(
    `SELECT rule_code, matched_field
     FROM security_event_evidence
     WHERE event_id = ?
     ORDER BY score_delta DESC, id ASC
     LIMIT 1`,
    [event.event_id],
  );
  const evidence = evidenceRows[0];
  if (!evidence) return null;
  const [result] = await connection.query(
    `INSERT INTO security_rule_tuning_suggestions
      (event_id, rule_code, request_path, request_method, matched_field, suggestion_type, status, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    [
      event.event_id,
      evidence.rule_code,
      event.request_path,
      event.request_method,
      evidence.matched_field,
      TUNING_SUGGESTIONS.has(suggestionType) ? suggestionType : 'no_change',
      reason,
      operatorId,
    ],
  );
  return result.insertId;
};

export const getSecurityOverviewV2 = async (req, res) => {
  try {
    if (!ensureRootRole(req, res)) return;
    const days = safeDays(req.body?.days);
    const cutoff = cutoffForDays(days);
    const [summaryRows] = await pool.query(
      `SELECT
         COUNT(*) AS rawDetections,
         COALESCE(SUM(workflow_status IN ('new','reviewing') AND disposition = 'unknown'), 0) AS pendingReview,
         COALESCE(SUM(disposition = 'confirmed_attack'), 0) AS confirmedAttacks,
         COALESCE(SUM(disposition = 'false_positive'), 0) AS falsePositives,
         COALESCE(SUM(disposition = 'authorized_test'), 0) AS authorizedTests,
         COALESCE(SUM(disposition = 'benign_anomaly'), 0) AS benignAnomalies,
         COALESCE(SUM(blocked = 1 AND confidence >= 85 AND disposition NOT IN ('false_positive','authorized_test')), 0) AS highConfidenceBlocks,
         COALESCE(SUM(workflow_status IN ('new','reviewing') AND disposition = 'unknown' AND confidence >= 85), 0) AS pendingHighConfidence
       FROM security_events
       WHERE created_at >= ?`,
      [cutoff],
    );
    const rateRows = await queryOptionalRows(
      'overview rate-limit',
      `SELECT COUNT(*) AS total
       FROM api_logs
       WHERE request_time >= ? AND status_code = '429'`,
      [cutoff],
    );
    const trendRows = await queryOptionalRows(
      'overview trend',
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS statDate,
              COUNT(*) AS raw,
              COALESCE(SUM(disposition = 'confirmed_attack'), 0) AS confirmed,
              COALESCE(SUM(disposition = 'false_positive'), 0) AS falsePositive,
              COALESCE(SUM(disposition = 'benign_anomaly'), 0) AS benignAnomaly,
              COALESCE(SUM(disposition = 'authorized_test'), 0) AS authorizedTest
       FROM security_events
       WHERE created_at >= ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
       ORDER BY MIN(created_at)`,
      [cutoff],
    );
    const noisyRuleRows = await queryOptionalRows(
      'overview noisy rules',
      `SELECT COALESCE(NULLIF(e.primary_rule_code, ''), NULLIF(e.matched_rule, ''), e.attack_type) AS ruleCode,
              MAX(COALESCE(r.rule_name, NULLIF(e.matched_rule, ''), e.attack_type)) AS ruleName,
              COUNT(*) AS rawHits,
              COALESCE(SUM(e.disposition = 'confirmed_attack'), 0) AS confirmedHits,
              COALESCE(SUM(e.disposition = 'false_positive'), 0) AS falsePositiveHits,
              ROUND(100 * COALESCE(SUM(e.disposition = 'false_positive'), 0) /
                NULLIF(COALESCE(SUM(e.disposition IN ('confirmed_attack','false_positive','benign_anomaly')), 0), 0)) AS falsePositiveRate,
              SUBSTRING_INDEX(GROUP_CONCAT(e.request_path ORDER BY e.created_at DESC SEPARATOR ','), ',', 1) AS primaryRoute
       FROM security_events e
       LEFT JOIN security_rules r
         ON r.rule_code = COALESCE(NULLIF(e.primary_rule_code, ''), NULLIF(e.matched_rule, ''), e.attack_type)
       WHERE e.created_at >= ?
         AND COALESCE(NULLIF(e.primary_rule_code, ''), NULLIF(e.matched_rule, ''), e.attack_type) IS NOT NULL
       GROUP BY COALESCE(NULLIF(e.primary_rule_code, ''), NULLIF(e.matched_rule, ''), e.attack_type)
       ORDER BY COALESCE(falsePositiveRate, 0) DESC, rawHits DESC
       LIMIT 5`,
      [cutoff],
    );
    const reviewRows = await queryOptionalRows(
      'overview review queue',
      `SELECT
         SUBSTRING_INDEX(GROUP_CONCAT(e.event_id ORDER BY e.created_at DESC SEPARATOR ','), ',', 1) AS representativeEventId,
         MAX(COALESCE(NULLIF(e.primary_rule_code, ''), e.matched_rule, e.attack_type)) AS ruleCode,
         MAX(e.matched_rule) AS ruleName,
         MAX(e.request_path) AS requestPath,
         MAX(e.request_method) AS requestMethod,
         MAX(COALESCE(NULLIF(e.user_id, ''), e.source_ip, 'anonymous')) AS actorKey,
         MAX(COALESCE(u.alias, u.email, e.user_id, '匿名来源')) AS actorLabel,
         MAX(e.source_ip) AS sourceIp,
         COUNT(*) AS hitCount,
         MAX(e.threat_score) AS maxScore,
         MAX(e.confidence) AS confidence,
         MAX(e.blocked) AS blocked,
         MAX(e.created_at) AS lastSeenAt,
         MIN(e.created_at) AS firstSeenAt
       FROM security_events e
       LEFT JOIN user u ON u.id = e.user_id
       WHERE e.created_at >= ? AND e.disposition = 'unknown' AND e.workflow_status IN ('new','reviewing')
       GROUP BY COALESCE(NULLIF(e.cluster_key, ''), CONCAT(COALESCE(e.primary_rule_code, e.matched_rule, e.attack_type), '|', e.request_path, '|', COALESCE(NULLIF(e.user_id, ''), e.source_ip), '|', FLOOR(UNIX_TIMESTAMP(e.created_at) / 300)))
       ORDER BY maxScore DESC, lastSeenAt DESC
       LIMIT 5`,
      [cutoff],
    );
    const policyRows = await queryOptionalRows(
      'overview active policies',
      `SELECT o.rule_code AS ruleCode, o.mode, o.version
       FROM security_rule_overrides o
       JOIN (
         SELECT rule_code, MAX(id) AS id
         FROM security_rule_overrides
         WHERE enabled = 1 AND (expires_at IS NULL OR expires_at > NOW())
         GROUP BY rule_code
       ) latest ON latest.id = o.id`,
    );
    const summary = summaryRows[0] || {};
    const reviewedDenominator =
      Number(summary.confirmedAttacks || 0) +
      Number(summary.falsePositives || 0) +
      Number(summary.benignAnomalies || 0);
    summary.falsePositiveRate = reviewedDenominator
      ? Math.round((Number(summary.falsePositives || 0) / reviewedDenominator) * 100)
      : 0;
    summary.rateLimitTriggers = Number(rateRows[0]?.total || 0);
    summary.detectionStatus = 'healthy';
    summary.policyVersion = Math.max(1, ...policyRows.map((row) => Number(row.version || 1)));
    summary.eventBacklog = Number(summary.pendingReview || 0);
    summary.autoIpBanEnabled = SECURITY_CONFIG.ipAutoBanEnabled;
    summary.reputationDecisionEnabled = SECURITY_CONFIG.reputationDecisionEnabled;
    res.send(
      resultData({
        days,
        summary,
        trend: buildDailyTrend(trendRows, days),
        noisyRules: noisyRuleRows.map((row) => {
          const ruleCode = row.ruleCode || row.rule_code || '';
          const policy = policyRows.find((item) => (item.ruleCode || item.rule_code) === ruleCode);
          return {
            ...row,
            ruleCode,
            mode: policy?.mode || getDefaultSecurityRuleMode(ruleCode),
            rawHits: Number(row.rawHits || row.raw_hits || 0),
            confirmedHits: Number(row.confirmedHits || row.confirmed_hits || 0),
            falsePositiveHits: Number(row.falsePositiveHits || row.false_positive_hits || 0),
            falsePositiveRate: Number(row.falsePositiveRate || row.false_positive_rate || 0),
          };
        }),
        reviewQueue: reviewRows,
      }),
    );
  } catch {
    res.status(500).send(resultData(null, 500, '获取应用安全态势失败'));
  }
};

const buildReviewFilters = (filters = {}) => {
  const conditions = ['e.created_at >= ?'];
  const params = [cutoffForDays(safeDays(filters.days))];
  const disposition = DISPOSITIONS.has(filters.disposition) ? filters.disposition : 'unknown';
  conditions.push('e.disposition = ?');
  params.push(disposition);
  if (disposition === 'unknown') {
    conditions.push("e.workflow_status IN ('new','reviewing')");
  }
  if (filters.key) {
    conditions.push(`(e.primary_rule_code LIKE CONCAT('%', ?, '%') OR e.matched_rule LIKE CONCAT('%', ?, '%')
      OR e.request_path LIKE CONCAT('%', ?, '%') OR e.user_id LIKE CONCAT('%', ?, '%')
      OR e.source_ip LIKE CONCAT('%', ?, '%') OR u.alias LIKE CONCAT('%', ?, '%') OR u.email LIKE CONCAT('%', ?, '%'))`);
    params.push(...Array(7).fill(normalizedString(filters.key, 120)));
  }
  if (filters.confidence === 'high') conditions.push('e.confidence >= 85');
  if (filters.confidence === 'medium') conditions.push('e.confidence >= 60 AND e.confidence < 85');
  return { where: conditions.join(' AND '), params };
};

export const getSecurityReviewClusters = async (req, res) => {
  try {
    if (!ensureRootRole(req, res)) return;
    const filters = req.body?.filters || {};
    const viewMode = filters.viewMode === 'raw' ? 'raw' : 'clusters';
    const { where, params } = buildReviewFilters(filters);
    const limit = Math.min(100, Math.max(1, Number(req.body?.pageSize || 50)));
    const [countRows] = await pool.query(
      `SELECT e.disposition, COUNT(*) AS total
       FROM security_events e
       WHERE e.created_at >= ?
         AND (e.disposition <> 'unknown' OR e.workflow_status IN ('new','reviewing'))
       GROUP BY e.disposition`,
      [cutoffForDays(safeDays(filters.days))],
    );
    if (viewMode === 'raw') {
      const [items] = await pool.query(
        `SELECT e.*, u.alias, u.email
         FROM security_events e LEFT JOIN user u ON u.id = e.user_id
         WHERE ${where}
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT ?`,
        [...params, limit],
      );
      return res.send(resultData({ items, total: items.length, counts: countRows, viewMode }));
    }
    const [items] = await pool.query(
      `SELECT
         SUBSTRING_INDEX(GROUP_CONCAT(e.event_id ORDER BY e.created_at DESC SEPARATOR ','), ',', 1) AS representativeEventId,
         MAX(COALESCE(NULLIF(e.primary_rule_code, ''), e.matched_rule, e.attack_type)) AS ruleCode,
         MAX(e.matched_rule) AS ruleName,
         MAX(e.request_path) AS requestPath,
         MAX(e.request_method) AS requestMethod,
         MAX(COALESCE(NULLIF(e.user_id, ''), e.source_ip, 'anonymous')) AS actorKey,
         MAX(COALESCE(u.alias, u.email, e.user_id, '匿名来源')) AS actorLabel,
         MAX(e.source_ip) AS sourceIp,
         COUNT(*) AS hitCount,
         MAX(e.threat_score) AS maxScore,
         MAX(e.confidence) AS confidence,
         MAX(e.blocked) AS blocked,
         MAX(e.action_taken) AS actionTaken,
         MAX(e.disposition) AS disposition,
         MAX(e.workflow_status) AS workflowStatus,
         MAX(e.created_at) AS lastSeenAt,
         MIN(e.created_at) AS firstSeenAt
       FROM security_events e
       LEFT JOIN user u ON u.id = e.user_id
       WHERE ${where}
       GROUP BY COALESCE(NULLIF(e.cluster_key, ''), CONCAT(COALESCE(e.primary_rule_code, e.matched_rule, e.attack_type), '|', e.request_path, '|', COALESCE(NULLIF(e.user_id, ''), e.source_ip), '|', FLOOR(UNIX_TIMESTAMP(e.created_at) / 300)))
       ORDER BY lastSeenAt DESC
       LIMIT ?`,
      [...params, limit],
    );
    res.send(resultData({ items, total: items.length, counts: countRows, viewMode }));
  } catch {
    res.status(500).send(resultData(null, 500, '获取事件复核队列失败'));
  }
};

export const getSecurityReviewClusterDetail = async (req, res) => {
  try {
    if (!ensureRootRole(req, res)) return;
    const eventId = normalizedString(req.params.eventId, 64);
    const [rows] = await pool.query(
      `SELECT e.*, u.alias, u.email
       FROM security_events e LEFT JOIN user u ON u.id = e.user_id
       WHERE e.event_id = ? LIMIT 1`,
      [eventId],
    );
    const event = rows[0];
    if (!event) return res.status(404).send(resultData(null, 404, '安全事件不存在'));
    parseJsonField(event, 'payload_summary');
    parseJsonField(event, 'headers_summary');
    const [evidence] = await pool.query(
      `SELECT * FROM security_event_evidence WHERE event_id = ? ORDER BY score_delta DESC, id ASC`,
      [eventId],
    );
    const actorCondition = event.user_id ? 'e.user_id = ?' : 'e.source_ip = ?';
    const actorValue = event.user_id || event.source_ip;
    const [similarEvents] = await pool.query(
      `SELECT e.event_id, e.primary_rule_code, e.request_path, e.threat_score, e.confidence, e.blocked,
              e.disposition, e.created_at
       FROM security_events e
       WHERE ${actorCondition}
         AND e.request_path = ?
         AND COALESCE(NULLIF(e.primary_rule_code, ''), e.matched_rule, e.attack_type) = ?
       ORDER BY e.created_at DESC
       LIMIT 20`,
      [actorValue, event.request_path, event.primary_rule_code || event.matched_rule || event.attack_type],
    );
    const [ipRows] = await pool.query(
      `SELECT
         COUNT(*) AS events24h,
         COALESCE(SUM(disposition = 'confirmed_attack'), 0) AS confirmedEvents,
         COALESCE(SUM(disposition = 'false_positive'), 0) AS falsePositives,
         MIN(created_at) AS firstSeenAt,
         MAX(created_at) AS lastSeenAt
       FROM security_events
       WHERE source_ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [event.source_ip],
    );
    let accountAnalysis = {};
    if (event.user_id) {
      const [accountRows] = await pool.query(
        `SELECT r.risk_score, r.total_events, r.high_risk_count, r.critical_count, r.last_event_at,
                (SELECT COUNT(*) FROM security_account_restrictions x
                 WHERE x.user_id = ? AND x.status = 'active' AND (x.expires_at IS NULL OR x.expires_at > NOW())) AS active_restrictions
         FROM user u
         LEFT JOIN security_account_reputation r ON r.user_id = u.id
         WHERE u.id = ?
         LIMIT 1`,
        [event.user_id, event.user_id],
      );
      accountAnalysis = accountRows[0] || {};
    }
    res.send(resultData({ event, evidence, similarEvents, sourceAnalysis: ipRows[0] || {}, accountAnalysis }));
  } catch {
    res.status(500).send(resultData(null, 500, '获取事件详情失败'));
  }
};

export const setSecurityEventDisposition = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const disposition = normalizedString(req.body?.disposition, 40);
    if (!DISPOSITIONS.has(disposition)) return res.status(400).send(resultData(null, 400, '无效的事件结论'));
    const reason = normalizedString(req.body?.reason, 500);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const event = await loadEventForUpdate(connection, req.params.eventId);
    if (!event) {
      await connection.rollback();
      return res.status(404).send(resultData(null, 404, '安全事件不存在'));
    }
    await reviewEvent({ connection, event, disposition, reason, operatorId: req.user.id });
    let tuningSuggestionId = null;
    if (disposition === 'false_positive' && req.body?.createTuningSuggestion !== false) {
      tuningSuggestionId = await createTuningSuggestionFromEvent({
        connection,
        event,
        operatorId: req.user.id,
        suggestionType: req.body?.suggestionType,
        reason,
      });
    }
    await connection.commit();
    return res.send(resultData({ tuningSuggestionId }, 200, '事件结论已保存'));
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).send(resultData(null, 500, '保存事件结论失败'));
  } finally {
    connection?.release();
  }
};

export const setSecurityClusterDisposition = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const disposition = normalizedString(req.body?.disposition, 40);
    if (!DISPOSITIONS.has(disposition)) return res.status(400).send(resultData(null, 400, '无效的事件结论'));
    const reason = normalizedString(req.body?.reason, 500);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const anchor = await loadEventForUpdate(connection, req.params.eventId);
    if (!anchor) {
      await connection.rollback();
      return res.status(404).send(resultData(null, 404, '事件簇不存在'));
    }
    const events = await loadClusterEventsForUpdate(connection, anchor);
    const targets = events.length ? events : [anchor];
    for (const event of targets) {
      await reviewEvent({ connection, event, disposition, reason, operatorId: req.user.id });
    }
    let tuningSuggestionId = null;
    if (disposition === 'false_positive' && req.body?.createTuningSuggestion !== false) {
      tuningSuggestionId = await createTuningSuggestionFromEvent({
        connection,
        event: anchor,
        operatorId: req.user.id,
        suggestionType: req.body?.suggestionType,
        reason,
      });
    }
    await connection.commit();
    return res.send(resultData({ handledTotal: targets.length, tuningSuggestionId }, 200, '事件簇结论已保存'));
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).send(resultData(null, 500, '保存事件簇结论失败'));
  } finally {
    connection?.release();
  }
};

export const batchSetSecurityReviewDisposition = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const eventIds = Array.from(
      new Set(
        (Array.isArray(req.body?.eventIds) ? req.body.eventIds : [])
          .map((eventId) => normalizedString(eventId, 64))
          .filter(Boolean),
      ),
    ).sort();
    if (!eventIds.length) {
      return res.status(400).send(resultData(null, 400, '请选择要复核的安全事件'));
    }
    if (eventIds.length > 100) {
      return res.status(400).send(resultData(null, 400, '单次最多批量复核 100 个事件或事件簇'));
    }
    const disposition = normalizedString(req.body?.disposition, 40);
    if (!DISPOSITIONS.has(disposition) || disposition === 'unknown') {
      return res.status(400).send(resultData(null, 400, '无效的事件结论'));
    }
    const scope = req.body?.scope === 'events' ? 'events' : 'clusters';
    const reason = normalizedString(req.body?.reason, 500);
    const reviewedEventIds = new Set();
    let tuningSuggestionTotal = 0;

    connection = await pool.getConnection();
    await connection.beginTransaction();
    for (const eventId of eventIds) {
      const anchor = await loadEventForUpdate(connection, eventId);
      if (!anchor) {
        await connection.rollback();
        return res.status(404).send(resultData({ missingEventId: eventId }, 404, '部分安全事件不存在，请刷新后重试'));
      }
      const clusterEvents = scope === 'clusters' ? await loadClusterEventsForUpdate(connection, anchor) : [anchor];
      const targets = clusterEvents.length ? clusterEvents : [anchor];
      let reviewedAnchor = false;
      for (const event of targets) {
        if (reviewedEventIds.has(event.event_id)) continue;
        await reviewEvent({ connection, event, disposition, reason, operatorId: req.user.id });
        reviewedEventIds.add(event.event_id);
        reviewedAnchor = true;
      }
      if (reviewedAnchor && disposition === 'false_positive' && req.body?.createTuningSuggestion !== false) {
        const suggestionId = await createTuningSuggestionFromEvent({
          connection,
          event: anchor,
          operatorId: req.user.id,
          suggestionType: req.body?.suggestionType,
          reason,
        });
        if (suggestionId) tuningSuggestionTotal += 1;
      }
    }
    await connection.commit();
    return res.send(
      resultData(
        {
          selectedTotal: eventIds.length,
          handledTotal: reviewedEventIds.size,
          tuningSuggestionTotal,
        },
        200,
        '批量事件复核结果已保存',
      ),
    );
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).send(resultData(null, 500, '批量保存事件结论失败'));
  } finally {
    connection?.release();
  }
};

export const getSecurityRuleQuality = async (req, res) => {
  try {
    if (!ensureRootRole(req, res)) return;
    const days = safeDays(req.body?.days);
    const cutoff = cutoffForDays(days);
    const [rules] = await pool.query('SELECT * FROM security_rules ORDER BY attack_type, base_score DESC');
    const [metrics] = await pool.query(
      `SELECT ev.rule_code AS ruleCode,
              COUNT(DISTINCT e.event_id) AS rawHits,
              COUNT(DISTINCT CASE WHEN e.blocked = 1 THEN e.event_id END) AS blockedHits,
              COUNT(DISTINCT CASE WHEN e.disposition = 'confirmed_attack' THEN e.event_id END) AS confirmedHits,
              COUNT(DISTINCT CASE WHEN e.disposition = 'false_positive' THEN e.event_id END) AS falsePositiveHits,
              COUNT(DISTINCT CASE WHEN e.disposition = 'authorized_test' THEN e.event_id END) AS authorizedTestHits,
              COUNT(DISTINCT e.request_path) AS affectedRoutes,
              MAX(e.created_at) AS lastHitAt,
              SUBSTRING_INDEX(GROUP_CONCAT(e.request_path ORDER BY e.created_at DESC SEPARATOR ','), ',', 1) AS primaryRoute
       FROM security_event_evidence ev
       JOIN security_events e ON e.event_id = ev.event_id
       WHERE e.created_at >= ?
       GROUP BY ev.rule_code`,
      [cutoff],
    );
    const [overrides] = await pool.query(
      `SELECT o.* FROM security_rule_overrides o
       JOIN (
         SELECT rule_code, MAX(id) AS id
         FROM security_rule_overrides
         WHERE enabled = 1 AND (expires_at IS NULL OR expires_at > NOW())
         GROUP BY rule_code
       ) latest ON latest.id = o.id`,
    );
    const metricMap = new Map(metrics.map((item) => [item.ruleCode, item]));
    const overrideMap = new Map(overrides.map((item) => [item.rule_code, item]));
    const items = rules.map((rule) => {
      const metric = metricMap.get(rule.rule_code) || {};
      const override = overrideMap.get(rule.rule_code);
      const denominator = Number(metric.confirmedHits || 0) + Number(metric.falsePositiveHits || 0);
      return {
        ...rule,
        mode: override?.mode || getDefaultSecurityRuleMode(rule.rule_code),
        scoreOverride: override?.score_override ?? null,
        effectiveScore: override?.score_override ?? Number(rule.base_score || 0),
        hasOverride: Boolean(override),
        policyVersion: Number(override?.version || 1),
        routePattern: override?.route_pattern || '',
        requestMethod: override?.request_method || '',
        fieldPattern: override?.field_pattern || '',
        expiresAt: override?.expires_at || null,
        reason: override?.reason || '',
        rawHits: Number(metric.rawHits || 0),
        blockedHits: Number(metric.blockedHits || 0),
        confirmedHits: Number(metric.confirmedHits || 0),
        falsePositiveHits: Number(metric.falsePositiveHits || 0),
        falsePositiveRate: denominator ? Math.round((Number(metric.falsePositiveHits || 0) / denominator) * 100) : 0,
        authorizedTestHits: Number(metric.authorizedTestHits || 0),
        affectedRoutes: Number(metric.affectedRoutes || 0),
        lastHitAt: metric.lastHitAt || null,
        primaryRoute: metric.primaryRoute || '',
      };
    });
    res.send(resultData({ items, total: items.length, days }));
  } catch {
    res.status(500).send(resultData(null, 500, '获取检测质量失败'));
  }
};

export const saveSecurityRuleOverride = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const ruleCode = normalizedString(req.params.ruleCode, 100);
    const mode = normalizedString(req.body?.mode, 20);
    const reason = normalizedString(req.body?.reason, 500);
    if (!ruleCode || !RULE_MODES.has(mode) || !reason) {
      return res.status(400).send(resultData(null, 400, '规则、运行模式和调整原因不能为空'));
    }
    const expiry = normalizedExpiry(req.body);
    if (!expiry.valid) {
      return res.status(400).send(resultData(null, 400, '规则策略必须设置未来的到期时间或明确为永久'));
    }
    const scoreOverride =
      req.body?.scoreOverride === '' || req.body?.scoreOverride == null
        ? null
        : Math.max(0, Math.min(100, Number(req.body.scoreOverride)));
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [ruleRows] = await connection.query('SELECT rule_code FROM security_rules WHERE rule_code = ? LIMIT 1', [
      ruleCode,
    ]);
    if (!ruleRows[0]) {
      await connection.rollback();
      return res.status(404).send(resultData(null, 404, '安全规则不存在'));
    }
    const [versionRows] = await connection.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM security_rule_overrides',
    );
    const version = Number(versionRows[0]?.version || 1);
    const [result] = await connection.query(
      `INSERT INTO security_rule_overrides
        (rule_code, mode, score_override, route_pattern, request_method, field_pattern, field_context, reason,
         expires_at, enabled, version, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        ruleCode,
        mode,
        Number.isFinite(scoreOverride) ? scoreOverride : null,
        normalizedString(req.body?.routePattern, 500) || null,
        normalizedString(req.body?.requestMethod, 16).toUpperCase() || null,
        normalizedString(req.body?.fieldPattern, 255) || null,
        normalizedString(req.body?.fieldContext, 50) || null,
        reason,
        expiry.value,
        version,
        req.user.id,
      ],
    );
    await connection.query(
      `INSERT INTO security_policy_audit
        (policy_type, policy_id, action, policy_version, operator_id, reason, snapshot_json)
       VALUES ('rule_override', ?, 'create', ?, ?, ?, ?)`,
      [result.insertId, version, req.user.id, reason, JSON.stringify({ ruleCode, mode, scoreOverride })],
    );
    await connection.commit();
    clearSecurityPolicyCache();
    res.send(resultData({ id: result.insertId, version }, 200, `策略 v${version} 已发布`));
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).send(resultData(null, 500, '发布规则策略失败'));
  } finally {
    connection?.release();
  }
};

export const replaySecurityRule = async (req, res) => {
  try {
    if (!ensureRootRole(req, res)) return;
    const ruleCode = normalizedString(req.params.ruleCode, 100);
    const [rows] = await pool.query(
      `SELECT COUNT(DISTINCT e.event_id) AS samples,
              COUNT(DISTINCT CASE WHEN e.disposition = 'false_positive' THEN e.event_id END) AS falsePositives,
              COUNT(DISTINCT CASE WHEN e.disposition = 'confirmed_attack' THEN e.event_id END) AS confirmed,
              COUNT(DISTINCT CASE WHEN e.disposition = 'unknown' THEN e.event_id END) AS unknown
       FROM security_event_evidence ev
       JOIN security_events e ON e.event_id = ev.event_id
       WHERE ev.rule_code = ? AND e.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [ruleCode],
    );
    const [sampleRows] = await pool.query(
      `SELECT e.event_id, e.request_path, e.request_method, e.threat_score, e.blocked, e.disposition, e.created_at,
              ev.matched_field, ev.matched_value_preview, ev.score_delta
       FROM security_event_evidence ev
       JOIN security_events e ON e.event_id = ev.event_id
       WHERE ev.rule_code = ? AND e.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT 1000`,
      [ruleCode],
    );
    const metrics = rows[0] || {};
    const targetMode = RULE_MODES.has(req.body?.mode) ? req.body.mode : 'observe';
    const routePattern = normalizedString(req.body?.routePattern, 500);
    const requestMethod = normalizedString(req.body?.requestMethod, 16).toUpperCase();
    const fieldPattern = normalizedString(req.body?.fieldPattern, 255);
    const affectedSamples = sampleRows.filter((item) => {
      if (requestMethod && requestMethod !== String(item.request_method || '').toUpperCase()) return false;
      if (routePattern && !matchesSecurityPolicyPattern(routePattern, item.request_path)) return false;
      if (fieldPattern && !matchesSecurityPolicyPattern(fieldPattern, item.matched_field)) return false;
      return true;
    });
    const losesBlock = targetMode === 'observe' || targetMode === 'off';
    const sampleDiffs = affectedSamples.slice(0, 5).map((item) => ({
      eventId: item.event_id,
      requestPath: item.request_path,
      requestMethod: item.request_method,
      matchedField: item.matched_field,
      matchedValuePreview: item.matched_value_preview,
      disposition: item.disposition,
      outcome:
        targetMode === 'off'
          ? 'no_longer_matched'
          : targetMode === 'observe' && item.blocked
            ? 'no_longer_blocked'
            : targetMode === 'block' && !item.blocked
              ? 'would_participate_in_blocking'
              : 'unchanged',
    }));
    res.send(
      resultData({
        samples: Number(metrics.samples || 0),
        evaluatedSamples: affectedSamples.length,
        projectedFalsePositiveBlocksRemoved: losesBlock
          ? affectedSamples.filter((item) => item.blocked && item.disposition === 'false_positive').length
          : 0,
        projectedConfirmedBlocksChanged: losesBlock
          ? affectedSamples.filter((item) => item.blocked && item.disposition === 'confirmed_attack').length
          : 0,
        unknown: affectedSamples.filter((item) => item.disposition === 'unknown').length,
        sampleDiffs,
        capped: sampleRows.length >= 1000,
        deterministic: true,
      }),
    );
  } catch {
    res.status(500).send(resultData(null, 500, '规则历史回放失败'));
  }
};

export const listSecurityExceptions = async (req, res) => {
  try {
    if (!ensureRootRole(req, res)) return;
    const [items] = await pool.query(
      `SELECT x.*, u.alias AS user_alias, u.email AS user_email, creator.alias AS created_by_alias
       FROM security_exceptions x
       LEFT JOIN user u ON x.subject_type = 'user' AND x.subject_value = u.id
       LEFT JOIN user creator ON creator.id = x.created_by
       ORDER BY x.enabled DESC, x.updated_at DESC
       LIMIT 200`,
    );
    res.send(resultData({ items, total: items.length }));
  } catch {
    res.status(500).send(resultData(null, 500, '获取例外策略失败'));
  }
};

export const saveSecurityException = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const subjectType = normalizedString(req.body?.subjectType, 20);
    const subjectValue = normalizedString(req.body?.subjectValue, 128);
    const effect = normalizedString(req.body?.effect, 30);
    const reason = normalizedString(req.body?.reason, 500);
    if (!EXCEPTION_SUBJECT_TYPES.has(subjectType) || !subjectValue || !EXCEPTION_EFFECTS.has(effect) || !reason) {
      return res.status(400).send(resultData(null, 400, '例外主体、效果和原因不能为空'));
    }
    const expiry = normalizedExpiry(req.body);
    if (!expiry.valid) {
      return res.status(400).send(resultData(null, 400, '例外策略必须设置未来的到期时间或明确为永久'));
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO security_exceptions
        (subject_type, subject_value, rule_code, route_pattern, request_method, field_pattern, effect, score_delta,
         reason, expires_at, enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        subjectType,
        subjectValue,
        normalizedString(req.body?.ruleCode, 100) || null,
        normalizedString(req.body?.routePattern, 500) || null,
        normalizedString(req.body?.requestMethod, 16).toUpperCase() || null,
        normalizedString(req.body?.fieldPattern, 255) || null,
        effect,
        effect === 'score_adjust' ? Math.max(-100, Math.min(100, Number(req.body?.scoreDelta || 0))) : null,
        reason,
        expiry.value,
        req.user.id,
      ],
    );
    await connection.query(
      `INSERT INTO security_policy_audit
        (policy_type, policy_id, action, policy_version, operator_id, reason, snapshot_json)
       VALUES ('exception', ?, 'create', 1, ?, ?, ?)`,
      [result.insertId, req.user.id, reason, JSON.stringify({ subjectType, subjectValue, effect })],
    );
    await connection.commit();
    clearSecurityPolicyCache();
    res.send(resultData({ id: result.insertId }, 200, '例外策略已创建'));
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).send(resultData(null, 500, '保存例外策略失败'));
  } finally {
    connection?.release();
  }
};

export const disableSecurityException = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send(resultData(null, 400, '无效的例外策略'));
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT id FROM security_exceptions WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
    if (!rows[0]) {
      await connection.rollback();
      return res.status(404).send(resultData(null, 404, '例外策略不存在'));
    }
    await connection.query('UPDATE security_exceptions SET enabled = 0, updated_at = NOW() WHERE id = ?', [id]);
    await connection.query(
      `INSERT INTO security_policy_audit
        (policy_type, policy_id, action, policy_version, operator_id, reason)
       VALUES ('exception', ?, 'disable', 1, ?, ?)`,
      [id, req.user.id, normalizedString(req.body?.reason, 500) || '管理员停用'],
    );
    await connection.commit();
    clearSecurityPolicyCache();
    res.send(resultData(null, 200, '例外策略已停用'));
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).send(resultData(null, 500, '停用例外策略失败'));
  } finally {
    connection?.release();
  }
};

export const listSecurityRestrictions = async (req, res) => {
  try {
    if (!ensureRootRole(req, res)) return;
    await pool.query(
      `UPDATE security_account_restrictions
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()`,
    );
    const [items] = await pool.query(
      `SELECT r.*, u.alias, u.email, u.role, creator.alias AS created_by_alias
       FROM security_account_restrictions r
       JOIN user u ON u.id = r.user_id
       LEFT JOIN user creator ON creator.id = r.created_by
       ORDER BY (r.status = 'active') DESC, r.created_at DESC
       LIMIT 200`,
    );
    items.forEach((item) => parseJsonField(item, 'scope_json'));
    res.send(resultData({ items, total: items.length }));
  } catch {
    res.status(500).send(resultData(null, 500, '获取账号限制失败'));
  }
};

export const applySecurityRestriction = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const userId = normalizedString(req.body?.userId, 64);
    const restrictionType = normalizedString(req.body?.restrictionType, 30);
    const reason = normalizedString(req.body?.reason, 500);
    if (!userId || !SECURITY_RESTRICTION_TYPES.has(restrictionType) || !reason) {
      return res.status(400).send(resultData(null, 400, '账号、限制类型和原因不能为空'));
    }
    const expiry = normalizedExpiry(req.body);
    if (!expiry.valid) {
      return res.status(400).send(resultData(null, 400, '账号限制必须设置未来的到期时间或明确为永久'));
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [users] = await connection.query('SELECT id, role FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    const user = users[0];
    if (!user) {
      await connection.rollback();
      return res.status(404).send(resultData(null, 404, '账号不存在'));
    }
    if (user.role === 'root' || user.id === req.user.id) {
      await connection.rollback();
      return res.status(400).send(resultData(null, 400, 'Root 账号不能应用安全限制'));
    }
    const [previousRestrictions] = await connection.query(
      `SELECT id FROM security_account_restrictions
       WHERE user_id = ? AND restriction_type = ? AND status = 'active'
       FOR UPDATE`,
      [userId, restrictionType],
    );
    if (previousRestrictions.length) {
      await connection.query(
        `UPDATE security_account_restrictions
         SET status = 'revoked', revoked_by = ?, revoked_at = NOW(), updated_at = NOW()
         WHERE user_id = ? AND restriction_type = ? AND status = 'active'`,
        [req.user.id, userId, restrictionType],
      );
      for (const previous of previousRestrictions) {
        await connection.query(
          `INSERT INTO security_policy_audit
            (policy_type, policy_id, action, policy_version, operator_id, reason)
           VALUES ('account_restriction', ?, 'revoke', 1, ?, '创建同类新限制时替换')`,
          [previous.id, req.user.id],
        );
      }
    }
    const [result] = await connection.query(
      `INSERT INTO security_account_restrictions
        (user_id, restriction_type, scope_json, status, reason, expires_at, created_by)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`,
      [userId, restrictionType, JSON.stringify(req.body?.scope || {}), reason, expiry.value, req.user.id],
    );
    if (restrictionType === 'full_lock') {
      await connection.query(
        `INSERT INTO security_account_bans (user_id,banned_by,ban_reason,is_active,banned_at)
         VALUES (?,?,?,1,NOW())
         ON DUPLICATE KEY UPDATE banned_by = VALUES(banned_by), ban_reason = VALUES(ban_reason),
           is_active = 1, banned_at = NOW(), unbanned_by = NULL, unbanned_at = NULL, updated_at = NOW()`,
        [userId, req.user.id, reason],
      );
    }
    await connection.query(
      `INSERT INTO security_policy_audit
        (policy_type, policy_id, action, policy_version, operator_id, reason, snapshot_json)
       VALUES ('account_restriction', ?, 'create', 1, ?, ?, ?)`,
      [result.insertId, req.user.id, reason, JSON.stringify({ userId, restrictionType })],
    );
    await connection.commit();
    clearSecurityRestrictionCache(userId);
    if (restrictionType === 'login_lock' || restrictionType === 'full_lock') {
      await removeUserSessions(userId).catch(() => {});
    }
    res.send(resultData({ id: result.insertId }, 200, '账号安全限制已生效'));
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).send(resultData(null, 500, '应用账号限制失败'));
  } finally {
    connection?.release();
  }
};

export const revokeSecurityRestriction = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send(resultData(null, 400, '无效的账号限制'));
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT * FROM security_account_restrictions WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
    );
    const restriction = rows[0];
    if (!restriction) {
      await connection.rollback();
      return res.status(404).send(resultData(null, 404, '账号限制不存在'));
    }
    await connection.query(
      `UPDATE security_account_restrictions
       SET status = 'revoked', revoked_by = ?, revoked_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [req.user.id, id],
    );
    if (restriction.restriction_type === 'full_lock') {
      await connection.query(
        `UPDATE security_account_bans
         SET is_active = 0, unbanned_by = ?, unbanned_at = NOW(), updated_at = NOW()
         WHERE user_id = ?`,
        [req.user.id, restriction.user_id],
      );
    }
    await connection.query(
      `INSERT INTO security_policy_audit
        (policy_type, policy_id, action, policy_version, operator_id, reason)
       VALUES ('account_restriction', ?, 'revoke', 1, ?, ?)`,
      [id, req.user.id, normalizedString(req.body?.reason, 500) || '管理员解除'],
    );
    await connection.commit();
    clearSecurityRestrictionCache(restriction.user_id);
    res.send(resultData(null, 200, '账号安全限制已解除'));
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).send(resultData(null, 500, '解除账号限制失败'));
  } finally {
    connection?.release();
  }
};

export const listSourceDenies = async (req, res) => {
  try {
    if (!ensureRootRole(req, res)) return;
    const [items] = await pool.query(
      `SELECT ip, banned_until, ban_reason, last_seen_at
       FROM security_ip_reputation
       WHERE is_banned = 1 AND banned_until > NOW()
       ORDER BY banned_until ASC
       LIMIT 200`,
    );
    res.send(resultData({ items, total: items.length }));
  } catch {
    res.status(500).send(resultData(null, 500, '获取来源限制失败'));
  }
};

export const applySourceDeny = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const ip = normalizedString(req.body?.ip, 45);
    const requestedMinutes = Number(req.body?.minutes ?? 60);
    const minutes = Math.min(7 * 24 * 60, Math.max(5, requestedMinutes));
    const reason = normalizedString(req.body?.reason, 420);
    if (!isIP(ip) || !reason || !Number.isFinite(requestedMinutes)) {
      return res.status(400).send(resultData(null, 400, '来源 IP、限制时长和原因不能为空'));
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await setIpBan(ip, true, minutes, `管理员手动应用层限制：${reason}`, connection);
    await connection.query(
      `INSERT INTO security_policy_audit
        (policy_type, action, policy_version, operator_id, reason, snapshot_json)
       VALUES ('source_deny', 'create', 1, ?, ?, ?)`,
      [req.user.id, reason, JSON.stringify({ ip, minutes })],
    );
    await connection.commit();
    res.send(resultData(null, 200, '来源已被临时限制访问轻笺应用层'));
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).send(resultData(null, 500, '应用来源限制失败'));
  } finally {
    connection?.release();
  }
};

export const revokeSourceDeny = async (req, res) => {
  let connection;
  try {
    if (!ensureRootRole(req, res)) return;
    const ip = normalizedString(req.body?.ip, 45);
    if (!isIP(ip)) return res.status(400).send(resultData(null, 400, '来源 IP 不能为空'));
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await setIpBan(ip, false, 0, '', connection);
    await connection.query(
      `INSERT INTO security_policy_audit
        (policy_type, action, policy_version, operator_id, reason, snapshot_json)
       VALUES ('source_deny', 'revoke', 1, ?, ?, ?)`,
      [req.user.id, normalizedString(req.body?.reason, 500) || '管理员解除', JSON.stringify({ ip })],
    );
    await connection.commit();
    res.send(resultData(null, 200, '来源限制已解除'));
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).send(resultData(null, 500, '解除来源限制失败'));
  } finally {
    connection?.release();
  }
};
