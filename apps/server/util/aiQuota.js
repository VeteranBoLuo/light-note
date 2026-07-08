/**
 * AI token 限流机(P0-A)
 *
 * 设计见《轻笺 next 总方案》三节:
 * - 请求前 reserve():按 role 解析主体(user / 游客指纹)+ 占位扣减 RESERVE_TOKENS;
 * - 请求结束 reconcile():把占位校正为真实 token 用量;
 *   · 正常结束 → 计真实值(delta 可负 = 退还未用占位);
 *   · abort(客户端断开)→ 按已消耗结算,绝不退还占位(否则"断开即退"可免费刷长对话)。
 * - root(站长)与本机/自测流量豁免;限流基建异常绝不阻断 AI 主流程。
 * - 灰度:默认 dry-run(只记录不拦截);设 AI_GATE_ENFORCE=true 才开启拦截(P1)。
 *
 * 用独立表 ai_token_usage 计数(非聚合 agent_logs):agent_logs 无 fp/ip、游客全是同一 visitor,
 * 无法按个体计;本表用唯一键原子累加,支持请求前占位。
 */
import pool from '../db/index.js';

// 请求前占位(≈真实 p90 用量);结束按真实回写校正
const RESERVE_TOKENS = 5000;

// P0-A 默认每日额度(硬编码;P1 移到 config_json 以便不改代码调整)
const DAILY_QUOTA = {
  user: 100_000, // 普通注册用户(role=admin)Lv.1 基础 ≈24 次提问/日
  visitor: 30_000, // 游客(单指纹)≈7 次/日
};

// 灰度开关:默认 dry-run(只记录不拦截);P1 设 AI_GATE_ENFORCE=true 开启拦截
const ENFORCE = process.env.AI_GATE_ENFORCE === 'true';

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// 站长自测/本机流量:不计数、不受限(记忆:自测=14.155.x 动态段 + 127.0.0.1 + ::1)
function isSelfTest(ip) {
  if (!ip) return true;
  return ip.includes('127.0.0.1') || ip === '::1' || ip.startsWith('14.155.');
}

function resolveSubject(req, { userId, userRole }) {
  // root(站长)与本机自测:豁免
  if (userRole === 'root' || isSelfTest(req.ip)) return { exempt: true };
  if (userRole === 'visitor' || !userId || userId === 'visitor') {
    // 游客:指纹为主、IP 为辅(P0-A 只观测,取到啥用啥;P1 补 visitor_global 成本硬顶)
    const fp = req.headers['x-fingerprint'] || req.body?.fingerprint || req.ip || 'unknown';
    return { exempt: false, type: 'fingerprint', key: String(fp).slice(0, 128), quota: DAILY_QUOTA.visitor };
  }
  return { exempt: false, type: 'user', key: String(userId).slice(0, 128), quota: DAILY_QUOTA.user };
}

async function getDayUsed(type, key, pk) {
  const [rows] = await pool.query(
    'SELECT tokens_used FROM ai_token_usage WHERE subject_type=? AND subject_key=? AND period_type=? AND period_key=?',
    [type, key, 'day', pk],
  );
  return Number(rows[0]?.tokens_used || 0);
}

// 原子累加(delta 可为负 = 回写退还);tokens_used 下限 0。不用已废弃的 VALUES()。
async function bumpDay(type, key, pk, tokens, calls) {
  await pool.query(
    `INSERT INTO ai_token_usage (subject_type, subject_key, period_type, period_key, tokens_used, call_count)
     VALUES (?, ?, 'day', ?, ?, ?)
     ON DUPLICATE KEY UPDATE tokens_used = GREATEST(0, tokens_used + ?), call_count = call_count + ?`,
    [type, key, pk, Math.max(0, tokens), calls, tokens, calls],
  );
}

/**
 * 请求前:检查额度 + 占位扣减。返回 handle 供结束时 reconcile()。
 * P0-A(ENFORCE=false)永不返回 blocked,只记录用量用于观测。
 */
export async function reserve(req, ctx) {
  try {
    const s = resolveSubject(req, ctx);
    if (s.exempt) return { exempt: true };
    const pk = dayKey();
    const used = await getDayUsed(s.type, s.key, pk);
    if (ENFORCE && used >= s.quota) {
      return { blocked: true, used, quota: s.quota, type: s.type };
    }
    await bumpDay(s.type, s.key, pk, RESERVE_TOKENS, 1);
    return { exempt: false, blocked: false, type: s.type, key: s.key, pk, reserved: RESERVE_TOKENS, quota: s.quota, used };
  } catch (e) {
    // 限流基建异常绝不阻断 AI 主流程
    console.warn('[aiQuota] reserve 失败(放行):', e.message);
    return { exempt: true };
  }
}

/**
 * 请求结束:把占位校正为真实用量。
 * @param {object} handle reserve() 的返回
 * @param {number} actualTokens 本次真实消耗(totalUsage.totalTokens)
 * @param {{aborted?: boolean}} opts abort 时按已消耗结算、不退占位
 */
export async function reconcile(handle, actualTokens, { aborted = false } = {}) {
  try {
    if (!handle || handle.exempt || handle.blocked) return;
    const actual = Number(actualTokens || 0);
    const reserved = handle.reserved || 0;
    const delta = aborted ? Math.max(0, actual - reserved) : actual - reserved;
    if (delta !== 0) await bumpDay(handle.type, handle.key, handle.pk, delta, 0);
  } catch (e) {
    console.warn('[aiQuota] reconcile 失败:', e.message);
  }
}

export function isEnforcing() {
  return ENFORCE;
}
