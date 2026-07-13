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
import { levelForExp, rankOf, RANKS } from './growth.js';

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

function resolveSubject(req, { userId, userRole }) {
  // 按站长要求去掉所有豁免(含 root 与本机自测):额度对所有人真实生效。
  // root 无经验账本但视为满级,配额在 userDailyQuota 里按满级下发。
  if (userRole === 'visitor' || !userId || userId === 'visitor') {
    // 游客:指纹为主、IP 为辅(每个指纹/IP 各自独立的当日额度,互不共享)
    const fp = req.headers['x-fingerprint'] || req.body?.fingerprint || req.ip || 'unknown';
    return { exempt: false, type: 'fingerprint', key: String(fp).slice(0, 128), quota: DAILY_QUOTA.visitor };
  }
  return { exempt: false, type: 'user', key: String(userId).slice(0, 128), quota: DAILY_QUOTA.user };
}

// 注册用户每日额度按成长等级下发(aiTokenDaily,单一事实源 = growth.RANKS,满级 800k);查不到按 Lv.1 兜底。
// 替代早期「所有注册用户硬编码 100k」——那与成长权益页展示的按等级额度对不上。
async function userDailyQuota(userId, userRole) {
  // 基础额度:root 免账本、无经验记录,等级视为满级;普通用户按成长等级(查不到按 Lv.1 兜底)
  let base;
  if (userRole === 'root') {
    base = RANKS[RANKS.length - 1].aiTokenDaily;
  } else {
    try {
      const [rows] = await pool.query('SELECT exp FROM user_growth WHERE user_id = ?', [userId]);
      base = rankOf(levelForExp(Number(rows[0]?.exp || 0))).aiTokenDaily;
    } catch {
      return RANKS[0].aiTokenDaily;
    }
  }
  // 叠加今日「AI 加油包」额度加成(使用加油包写入 ai_daily_bonus,此处只读)。
  // 修复:此前 root 提前 return 满级额度,跳过了这段,导致 root 用加油包后总量不增加。
  let bonus = 0;
  try {
    const [b] = await pool.query('SELECT bonus_tokens FROM ai_daily_bonus WHERE user_id = ? AND day = ?', [userId, dayKey()]);
    bonus = Number(b[0]?.bonus_tokens || 0);
  } catch {
    /* 表尚未建(ensurePointsSchema 之前)时忽略 */
  }
  return base + bonus;
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
    // 注册用户额度按等级(替换早期硬编码 100k);游客沿用固定配额
    if (s.type === 'user') s.quota = await userDailyQuota(s.key, ctx.userRole);
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

/**
 * 查询当日额度状态(供前端 AI 助手展示「今日已用 / 剩余」)。
 * root / 本机自测豁免 → { exempt:true };注册用户额度按等级,游客按固定配额。
 */
export async function getStatus(req, ctx) {
  try {
    const s = resolveSubject(req, ctx);
    if (s.exempt) return { exempt: true, role: ctx?.userRole, enforcing: ENFORCE };
    const quota = s.type === 'user' ? await userDailyQuota(s.key, ctx.userRole) : s.quota;
    const used = await getDayUsed(s.type, s.key, dayKey());
    return { exempt: false, type: s.type, used, quota, remaining: Math.max(0, quota - used), enforcing: ENFORCE };
  } catch (e) {
    console.warn('[aiQuota] getStatus 失败:', e.message);
    return { exempt: true, role: ctx?.userRole };
  }
}

// 供 Agent「查我的 AI 额度」工具用:按 userId 查登录用户今日额度,不依赖 req(游客走指纹的场景不在此覆盖,直接给固定配额提示)。
export async function getStatusForUser(userId, userRole) {
  try {
    if (!userId || userId === 'visitor' || userRole === 'visitor') {
      return { guest: true, quota: DAILY_QUOTA.visitor };
    }
    const quota = await userDailyQuota(userId, userRole);
    const used = await getDayUsed('user', userId, dayKey());
    return { type: 'user', used, quota, remaining: Math.max(0, quota - used), enforcing: ENFORCE };
  } catch (e) {
    console.warn('[aiQuota] getStatusForUser 失败:', e.message);
    return { guest: true, quota: DAILY_QUOTA.visitor };
  }
}

export function isEnforcing() {
  return ENFORCE;
}
