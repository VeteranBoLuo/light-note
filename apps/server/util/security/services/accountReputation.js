import pool from '../../../db/index.js';

const cache = new Map();
const CACHE_TTL = 60 * 1000;

const defaultReputation = (userId) => ({
  userId,
  total_events: 0,
  high_risk_count: 0,
  critical_count: 0,
  risk_score: 0,
  attack_type_breakdown: {},
});

const parseAttackTypeBreakdown = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch (e) {
    return {};
  }
};

export const getAccountReputation = async (userId) => {
  if (!userId) return defaultReputation('');
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const [rows] = await pool.query(
      'SELECT * FROM security_account_reputation WHERE user_id = ? LIMIT 1',
      [userId],
    );
    const value = rows[0] || defaultReputation(userId);
    value.attack_type_breakdown = parseAttackTypeBreakdown(value.attack_type_breakdown);
    cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL });
    return value;
  } catch (e) {
    return defaultReputation(userId);
  }
};

export const updateAccountReputation = async ({ userId, attackType, severity, threatScore }) => {
  if (!userId) return { riskDelta: 0 };

  // 直接读 DB，绕过缓存，避免并发 read-modify-write 竞态
  let current;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM security_account_reputation WHERE user_id = ? LIMIT 1',
      [userId],
    );
    current = rows[0] || defaultReputation(userId);
    current.attack_type_breakdown = parseAttackTypeBreakdown(current.attack_type_breakdown);
  } catch (e) {
    current = defaultReputation(userId);
  }

  const breakdown = current.attack_type_breakdown || {};
  breakdown[attackType] = Number(breakdown[attackType] || 0) + 1;
  const highRisk = ['high', 'critical'].includes(severity) ? 1 : 0;
  const critical = severity === 'critical' ? 1 : 0;
  const currentRiskScore = Number(current.risk_score || 0);
  const theoreticalRiskDelta = Math.max(3, Math.ceil(Number(threatScore || 0) / 10));
  const predictedScore = Math.min(100, currentRiskScore + theoreticalRiskDelta);

  // 原子增量：risk_score = LEAST(100, COALESCE(risk_score, 0) + VALUES(risk_score))
  await pool.query(
    `INSERT INTO security_account_reputation
      (user_id, total_events, high_risk_count, critical_count, risk_score, attack_type_breakdown, first_event_at, last_event_at, last_attack_time)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
      total_events = total_events + 1,
      high_risk_count = high_risk_count + VALUES(high_risk_count),
      critical_count = critical_count + VALUES(critical_count),
      risk_score = LEAST(100, COALESCE(risk_score, 0) + VALUES(risk_score)),
      attack_type_breakdown = VALUES(attack_type_breakdown),
      last_event_at = NOW(),
      last_attack_time = NOW()`,
    [
      userId,
      1,
      highRisk,
      critical,
      theoreticalRiskDelta, // 原子增量：新行初始值 = 首次增量，已有行执行 risk_score + delta
      JSON.stringify(breakdown),
    ],
  );
  cache.delete(userId);

  // 接近上限时，读取实际增量以保证 riskDelta 准确（revert 依赖此值）
  let actualRiskDelta = theoreticalRiskDelta;
  if (currentRiskScore + theoreticalRiskDelta > 100) {
    try {
      const [newRows] = await pool.query('SELECT risk_score FROM security_account_reputation WHERE user_id = ?', [userId]);
      actualRiskDelta = Math.max(0, Number(newRows[0]?.risk_score || 0) - currentRiskScore);
    } catch (e) {
      // 读取失败，回退到理论值
    }
  }

  return { riskDelta: actualRiskDelta, theoreticalRiskDelta, nextRiskScore: predictedScore, highRisk, critical };
};

export const revertAccountReputationImpact = async ({ userId, attackType, severity, riskDelta = 0, connection = null }) => {
  if (!userId) return false;
  const executor = connection || pool;
  const [rows] = await executor.query(
    'SELECT * FROM security_account_reputation WHERE user_id = ? LIMIT 1',
    [userId],
  );
  const current = rows[0];
  if (!current) {
    cache.delete(userId);
    return false;
  }

  const breakdown = parseAttackTypeBreakdown(current.attack_type_breakdown);
  if (attackType) {
    const nextTypeCount = Math.max(0, Number(breakdown[attackType] || 0) - 1);
    if (nextTypeCount > 0) {
      breakdown[attackType] = nextTypeCount;
    } else {
      delete breakdown[attackType];
    }
  }

  const highRisk = ['high', 'critical'].includes(severity) ? 1 : 0;
  const critical = severity === 'critical' ? 1 : 0;
  await executor.query(
    `UPDATE security_account_reputation
     SET total_events = GREATEST(0, total_events - 1),
         high_risk_count = GREATEST(0, high_risk_count - ?),
         critical_count = GREATEST(0, critical_count - ?),
         risk_score = GREATEST(0, risk_score - ?),
         attack_type_breakdown = ?,
         last_event_at = NOW()
     WHERE user_id = ?`,
    [
      highRisk,
      critical,
      Math.max(0, Number(riskDelta || 0)),
      JSON.stringify(breakdown),
      userId,
    ],
  );
  cache.delete(userId);
  return true;
};

export const rebuildAccountReputationFromEvents = async ({ userId, connection = null }) => {
  if (!userId) return false;
  const executor = connection || pool;
  const [currentRows] = await executor.query(
    'SELECT * FROM security_account_reputation WHERE user_id = ? LIMIT 1',
    [userId],
  );
  const current = currentRows[0] || defaultReputation(userId);
  const [events] = await executor.query(
    `SELECT attack_type, severity, threat_score, user_risk_delta, created_at
     FROM security_events
     WHERE user_id = ?
       AND handled_status <> 'false_positive'
       AND COALESCE(user_risk_reverted, 0) = 0
       AND threat_score >= 20
       AND user_id IS NOT NULL AND user_id <> ''
     ORDER BY created_at ASC, id ASC`,
    [userId],
  );

  let riskScore = 0;
  let highRiskCount = 0;
  let criticalCount = 0;
  let lastAttackTime = null;
  const breakdown = {};

  for (const event of events) {
    const attackType = event.attack_type || 'SUSPICIOUS_REQUEST';
    const severity = event.severity || 'low';
    const storedDelta = Number(event.user_risk_delta || 0);
    const theoreticalDelta = Math.max(3, Math.ceil(Number(event.threat_score || 0) / 10));
    const actualDelta = storedDelta > 0 ? storedDelta : Math.min(100, riskScore + theoreticalDelta) - riskScore;
    riskScore = Math.min(100, riskScore + Math.max(0, actualDelta));
    breakdown[attackType] = Number(breakdown[attackType] || 0) + 1;
    if (['high', 'critical'].includes(severity)) highRiskCount += 1;
    if (severity === 'critical') criticalCount += 1;
    lastAttackTime = event.created_at;
  }

  await executor.query(
    `INSERT INTO security_account_reputation
      (user_id, total_events, high_risk_count, critical_count, risk_score, attack_type_breakdown, first_event_at, last_event_at, last_attack_time)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), NOW(), ?)
     ON DUPLICATE KEY UPDATE
      total_events = VALUES(total_events),
      high_risk_count = VALUES(high_risk_count),
      critical_count = VALUES(critical_count),
      risk_score = VALUES(risk_score),
      attack_type_breakdown = VALUES(attack_type_breakdown),
      last_event_at = NOW(),
      last_attack_time = VALUES(last_attack_time)`,
    [
      userId,
      events.length,
      highRiskCount,
      criticalCount,
      riskScore,
      JSON.stringify(breakdown),
      current.first_event_at || null,
      lastAttackTime,
    ],
  );
  cache.delete(userId);
  return true;
};
