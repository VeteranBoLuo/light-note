import pool from '../../../db/index.js';
import { SECURITY_CONFIG } from '../rules.js';
import https from 'https';
import { isSecurityWhitelisted } from './whitelist.js';

const cache = new Map();
const CACHE_TTL = 60 * 1000;
const isPrivateOrLocalIp = (ip = '') =>
  /^(127\.|10\.|192\.168\.|::1$|::ffff:127\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(String(ip));
const isAutoBanReason = (reason = '') => /^IP风险分 \d+ 达到自动封禁阈值 \d+$/.test(String(reason || ''));

const defaultReputation = (ip) => ({
  ip,
  total_requests: 0,
  total_attacks: 0,
  high_risk_count: 0,
  critical_count: 0,
  risk_score: 0,
  attack_type_breakdown: {},
  is_banned: 0,
  banned_until: null,
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

export const getIpReputation = async (ip) => {
  if (!ip) return defaultReputation('');
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const [rows] = await pool.query('SELECT * FROM security_ip_reputation WHERE ip = ? LIMIT 1', [ip]);
    const value = rows[0] || defaultReputation(ip);
    value.attack_type_breakdown = parseAttackTypeBreakdown(value.attack_type_breakdown);
    cache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL });
    return value;
  } catch (e) {
    return defaultReputation(ip);
  }
};

export const updateIpReputation = async ({ ip, attackType, severity, threatScore, shouldBan = false, banMinutes = 30 }) => {
  if (!ip) return { riskDelta: 0 };

  // 直接读 DB，绕过缓存，避免并发 read-modify-write 竞态
  let current;
  try {
    const [rows] = await pool.query('SELECT * FROM security_ip_reputation WHERE ip = ? LIMIT 1', [ip]);
    current = rows[0] || defaultReputation(ip);
    current.attack_type_breakdown = parseAttackTypeBreakdown(current.attack_type_breakdown);
  } catch (e) {
    current = defaultReputation(ip);
  }

  const breakdown = current.attack_type_breakdown || {};
  breakdown[attackType] = Number(breakdown[attackType] || 0) + 1;
  const highRisk = ['high', 'critical'].includes(severity) ? 1 : 0;
  const critical = severity === 'critical' ? 1 : 0;
  const currentRiskScore = Number(current.risk_score || 0);
  const theoreticalRiskDelta = Math.max(3, Math.ceil(Number(threatScore || 0) / 10));
  const predictedScore = Math.min(100, currentRiskScore + theoreticalRiskDelta);

  const currentBanActive =
    Number(current.is_banned || 0) === 1 &&
    current.banned_until &&
    new Date(current.banned_until).getTime() > Date.now();
  const whitelisted = await isSecurityWhitelisted('ip', ip).catch(() => false);
  const canAutoBan = SECURITY_CONFIG.blockEnabled && !isPrivateOrLocalIp(ip) && !whitelisted;
  const autoBanThreshold = Number(SECURITY_CONFIG.ipAutoBanRiskScore || 80);
  const autoBanned = canAutoBan && !currentBanActive && predictedScore >= autoBanThreshold;
  const explicitBanned = canAutoBan && Boolean(shouldBan);
  const nextBanned = explicitBanned || autoBanned || currentBanActive;
  const bannedUntil = nextBanned
    ? explicitBanned || autoBanned
      ? new Date(Date.now() + banMinutes * 60 * 1000)
      : current.banned_until
    : null;
  const banReason = explicitBanned
    ? `${attackType} 威胁分 ${threatScore}`
    : autoBanned
      ? `IP风险分 ${predictedScore} 达到自动封禁阈值 ${autoBanThreshold}`
      : currentBanActive
        ? current.ban_reason || ''
        : '';

  // 原子增量：risk_score = LEAST(100, COALESCE(risk_score, 0) + VALUES(risk_score))
  // VALUES 中 risk_score 位置传入 theoreticalRiskDelta，INSERT 时作为初始值，UPDATE 时作为增量
  await pool.query(
    `INSERT INTO security_ip_reputation
      (ip,total_attacks,high_risk_count,critical_count,risk_score,is_banned,banned_until,ban_reason,attack_type_breakdown,first_seen_at,last_seen_at,last_attack_time)
     VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW(),NOW())
     ON DUPLICATE KEY UPDATE
      total_attacks = total_attacks + 1,
      high_risk_count = high_risk_count + VALUES(high_risk_count),
      critical_count = critical_count + VALUES(critical_count),
      risk_score = LEAST(100, COALESCE(risk_score, 0) + VALUES(risk_score)),
      is_banned = VALUES(is_banned),
      banned_until = VALUES(banned_until),
      ban_reason = VALUES(ban_reason),
      attack_type_breakdown = VALUES(attack_type_breakdown),
      last_seen_at = NOW(),
      last_attack_time = NOW()`,
    [
      ip,
      1,
      highRisk,
      critical,
      theoreticalRiskDelta, // 原子增量：新行初始值 = 首次增量，已有行执行 risk_score + delta
      nextBanned ? 1 : 0,
      bannedUntil,
      banReason,
      JSON.stringify(breakdown),
    ],
  );
  cache.delete(ip);

  // 接近上限时，读取实际增量以保证 riskDelta 准确（revert 依赖此值）
  let actualRiskDelta = theoreticalRiskDelta;
  if (currentRiskScore + theoreticalRiskDelta > 100) {
    try {
      const [newRows] = await pool.query('SELECT risk_score FROM security_ip_reputation WHERE ip = ?', [ip]);
      actualRiskDelta = Math.max(0, Number(newRows[0]?.risk_score || 0) - currentRiskScore);
    } catch (e) {
      // 读取失败，回退到理论值
    }
  }

  return {
    riskDelta: actualRiskDelta,
    theoreticalRiskDelta,
    nextRiskScore: predictedScore,
    highRisk,
    critical,
    autoBanned,
    autoBanThreshold,
    whitelisted,
  };
};

export const revertIpReputationImpact = async ({ ip, attackType, severity, riskDelta = 0, connection = null }) => {
  if (!ip) return false;
  const executor = connection || pool;
  const [rows] = await executor.query('SELECT * FROM security_ip_reputation WHERE ip = ? LIMIT 1', [ip]);
  const current = rows[0];
  if (!current) {
    cache.delete(ip);
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
  const nextRiskScore = Math.max(0, Number(current.risk_score || 0) - Math.max(0, Number(riskDelta || 0)));
  const clearAutoBan = isAutoBanReason(current.ban_reason) && nextRiskScore < Number(SECURITY_CONFIG.ipAutoBanRiskScore || 80);
  await executor.query(
    `UPDATE security_ip_reputation
     SET total_attacks = GREATEST(0, total_attacks - 1),
         high_risk_count = GREATEST(0, high_risk_count - ?),
         critical_count = GREATEST(0, critical_count - ?),
         risk_score = GREATEST(0, risk_score - ?),
         is_banned = ?,
         banned_until = ?,
         ban_reason = ?,
         attack_type_breakdown = ?,
         last_seen_at = NOW()
     WHERE ip = ?`,
    [
      highRisk,
      critical,
      Math.max(0, Number(riskDelta || 0)),
      clearAutoBan ? 0 : Number(current.is_banned || 0),
      clearAutoBan ? null : current.banned_until,
      clearAutoBan ? '' : current.ban_reason || '',
      JSON.stringify(breakdown),
      ip,
    ],
  );
  cache.delete(ip);
  return true;
};

export const rebuildIpReputationFromEvents = async ({ ip, connection = null }) => {
  if (!ip) return false;
  const executor = connection || pool;
  const [currentRows] = await executor.query('SELECT * FROM security_ip_reputation WHERE ip = ? LIMIT 1', [ip]);
  const current = currentRows[0] || defaultReputation(ip);
  const [events] = await executor.query(
    `SELECT attack_type, severity, threat_score, ip_risk_delta, created_at
     FROM security_events
     WHERE source_ip = ?
       AND handled_status <> 'false_positive'
       AND COALESCE(ip_risk_reverted, 0) = 0
       AND threat_score >= 20
     ORDER BY created_at ASC, id ASC`,
    [ip],
  );

  let riskScore = 0;
  let highRiskCount = 0;
  let criticalCount = 0;
  let lastAttackTime = null;
  const breakdown = {};

  for (const event of events) {
    const attackType = event.attack_type || 'SUSPICIOUS_REQUEST';
    const severity = event.severity || 'low';
    const storedDelta = Number(event.ip_risk_delta || 0);
    const theoreticalDelta = Math.max(3, Math.ceil(Number(event.threat_score || 0) / 10));
    const actualDelta = storedDelta > 0 ? storedDelta : Math.min(100, riskScore + theoreticalDelta) - riskScore;
    riskScore = Math.min(100, riskScore + Math.max(0, actualDelta));
    breakdown[attackType] = Number(breakdown[attackType] || 0) + 1;
    if (['high', 'critical'].includes(severity)) highRiskCount += 1;
    if (severity === 'critical') criticalCount += 1;
    lastAttackTime = event.created_at;
  }

  const clearAutoBan = isAutoBanReason(current.ban_reason) && riskScore < Number(SECURITY_CONFIG.ipAutoBanRiskScore || 80);
  await executor.query(
    `INSERT INTO security_ip_reputation
      (ip,total_requests,total_attacks,high_risk_count,critical_count,risk_score,attack_type_breakdown,is_banned,banned_until,ban_reason,first_seen_at,last_seen_at,last_attack_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,COALESCE(?,NOW()),NOW(),?)
     ON DUPLICATE KEY UPDATE
      total_attacks = VALUES(total_attacks),
      high_risk_count = VALUES(high_risk_count),
      critical_count = VALUES(critical_count),
      risk_score = VALUES(risk_score),
      attack_type_breakdown = VALUES(attack_type_breakdown),
      is_banned = VALUES(is_banned),
      banned_until = VALUES(banned_until),
      ban_reason = VALUES(ban_reason),
      last_seen_at = NOW(),
      last_attack_time = VALUES(last_attack_time)`,
    [
      ip,
      Number(current.total_requests || 0),
      events.length,
      highRiskCount,
      criticalCount,
      riskScore,
      JSON.stringify(breakdown),
      clearAutoBan ? 0 : Number(current.is_banned || 0),
      clearAutoBan ? null : current.banned_until || null,
      clearAutoBan ? '' : current.ban_reason || null,
      current.first_seen_at || null,
      lastAttackTime,
    ],
  );
  cache.delete(ip);
  return true;
};

export const recordIpRequest = async (ip) => {
  if (!ip) return;
  pool
    .query(
      `INSERT INTO security_ip_reputation (ip,total_requests,first_seen_at,last_seen_at)
       VALUES (?,1,NOW(),NOW())
       ON DUPLICATE KEY UPDATE total_requests = total_requests + 1, last_seen_at = NOW()`,
      [ip],
    )
    .catch(() => {});
};

export const setIpBan = async (ip, banned, minutes = 60, reason = '', executor = pool) => {
  const bannedUntil = banned ? new Date(Date.now() + Number(minutes || 60) * 60 * 1000) : null;
  await executor.query(
    `INSERT INTO security_ip_reputation (ip,is_banned,banned_until,ban_reason,first_seen_at,last_seen_at)
     VALUES (?,?,?,?,NOW(),NOW())
     ON DUPLICATE KEY UPDATE is_banned = VALUES(is_banned), banned_until = VALUES(banned_until), ban_reason = VALUES(ban_reason), last_seen_at = NOW()`,
    [ip, banned ? 1 : 0, bannedUntil, reason],
  );
  cache.delete(ip);
};

const locationPending = new Map(); // 防同一 IP 并发重复请求

export const ensureIpLocation = async (ip) => {
  if (!ip) return;
  if (locationPending.has(ip)) return; // 已有进行中的查询，跳过
  try {
    locationPending.set(ip, true);
    const data = await new Promise((resolve) => {
      const url = `https://restapi.amap.com/v3/ip?ip=${encodeURIComponent(ip)}&key=${process.env.AMAP_API_KEY || ''}`;
      https.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      }).on('error', () => resolve(null));
    });
    if (data?.status === '1') {
      const location = JSON.stringify({
        city: data.city ? (Array.isArray(data.city) ? data.city.join('') : data.city) : '未知',
        province: data.province ? (Array.isArray(data.province) ? data.province.join('') : data.province) : '未知',
      });
      await pool.query('UPDATE security_ip_reputation SET location = ? WHERE ip = ?', [location, ip]);
    }
  } catch {
    // 静默失败，不影响主流程
  } finally {
    locationPending.delete(ip);
  }
};
