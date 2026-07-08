/**
 * 增长引擎(P0-B) —— 见《轻笺 next 总方案》一/二/八节。
 *
 * - 段位:15 级文人科举。权益(容量/AI token)由 level 派生,单一事实源 = RANKS(勿散落)。
 * - 统一发放入口 grantExp():幂等(账本唯一索引去重)+ 日 EXP 硬顶 + root 跳过 + 只追加。
 *   exp 用「增量」更新(exp = exp + n)防并发覆盖;level 以 levelForExp(exp) 为权威、快照 level 仅近似。
 * - 签到:被动(有写操作自动连)与主动共用同一把 (user_id, 'checkin', day) 唯一键;
 *   断签「回退 3 天、不清零」(评审:清零=损失厌恶焦虑,背离知识工具调性)。
 *
 * EXP 只用于升级、不是货币。所有发放都走本文件,不在业务处各写一套。
 */
import pool from '../db/index.js';
import crypto from 'crypto';

// 15 级段位表:cumExp=升到该级的累计经验阈值;spaceMb/aiTokenDaily=该级权益。
// 数值取自《总方案》二节权益对照表(已定稿,勿擅改)。容量:Lv1–3 直给 MB,Lv4+ 由展示 GB×1024 取整。
export const RANKS = [
  { level: 1, name: '蒙童', cumExp: 0, spaceMb: 500, aiTokenDaily: 100_000 },
  { level: 2, name: '书生', cumExp: 500, spaceMb: 700, aiTokenDaily: 120_000 },
  { level: 3, name: '秀才', cumExp: 1000, spaceMb: 900, aiTokenDaily: 150_000 },
  { level: 4, name: '举人', cumExp: 1700, spaceMb: 1229, aiTokenDaily: 180_000 },
  { level: 5, name: '贡士', cumExp: 2700, spaceMb: 1536, aiTokenDaily: 220_000 },
  { level: 6, name: '进士', cumExp: 4000, spaceMb: 1843, aiTokenDaily: 260_000 },
  { level: 7, name: '探花', cumExp: 5800, spaceMb: 2253, aiTokenDaily: 300_000 },
  { level: 8, name: '榜眼', cumExp: 8000, spaceMb: 2662, aiTokenDaily: 350_000 },
  { level: 9, name: '状元', cumExp: 10800, spaceMb: 3072, aiTokenDaily: 400_000 },
  { level: 10, name: '翰林', cumExp: 14500, spaceMb: 3482, aiTokenDaily: 460_000 },
  { level: 11, name: '学士', cumExp: 19000, spaceMb: 3891, aiTokenDaily: 520_000 },
  { level: 12, name: '大学士', cumExp: 25000, spaceMb: 4301, aiTokenDaily: 590_000 },
  { level: 13, name: '文豪', cumExp: 32000, spaceMb: 4608, aiTokenDaily: 660_000 },
  { level: 14, name: '文宗', cumExp: 40000, spaceMb: 4915, aiTokenDaily: 730_000 },
  { level: 15, name: '文圣', cumExp: 50000, spaceMb: 5120, aiTokenDaily: 800_000 },
];

export const MAX_LEVEL = 15;
const DAILY_EXP_CAP = 200; // 日 EXP 硬顶 —— 唯一不可绕底线(批量导入速通的最后闸)。签到远低于此,为后续创造类预置。

const CHECKIN_BASE = 5; // 每日签到基础 +5
// 连续加成:第 N 天 +min(N,5),第 5 天起固定 +5 → 单日签到 ≤ 10
function checkinBonus(streak) {
  return Math.min(Math.max(Number(streak) || 0, 0), 5);
}

/** 据累计经验反查等级 */
export function levelForExp(exp) {
  let lv = 1;
  for (const r of RANKS) {
    if (exp >= r.cumExp) lv = r.level;
    else break;
  }
  return lv;
}

/** 取某级段位信息(越界钳制到 1..MAX) */
export function rankOf(level) {
  const idx = Math.min(Math.max(Number(level) || 1, 1), MAX_LEVEL) - 1;
  return RANKS[idx];
}

// 距下一级信息;满级返回 {nextExp:null, need:0}
function nextLevelInfo(exp, level) {
  if (level >= MAX_LEVEL) return { nextExp: null, need: 0 };
  const next = RANKS[level]; // level 从 1 起,RANKS[level] 即 (level+1) 级
  return { nextExp: next.cumExp, need: Math.max(0, next.cumExp - exp) };
}

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// 两个 YYYYMMDD 相差天数(a 晚于 b 为正)
function daysBetween(aKey, bKey) {
  const toDate = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(4, 6)) - 1, Number(k.slice(6, 8)));
  return Math.round((toDate(aKey) - toDate(bKey)) / 86_400_000);
}

/**
 * EXP 统一发放入口(幂等 + 日硬顶 + root 跳过)。
 * @param {string} userId
 * @param {string} source checkin/bookmark/note/file/...
 * @param {{refId?:string, day?:string, amount:number, meta?:object, userRole?:string}} opts
 * @param {import('mysql2/promise').PoolConnection|null} conn 传入则复用外部事务(不自 commit/release)
 * @returns {Promise<{granted:number, duplicated?:boolean, skipped?:string, leveledUp?:boolean, fromLevel?:number, toLevel?:number, exp?:number, level?:number}>}
 */
export async function grantExp(userId, source, opts = {}, conn = null) {
  const { refId = null, day = null, amount = 0, meta = null, userRole = null } = opts;
  if (!userId || userId === 'visitor') return { granted: 0, skipped: 'visitor' };
  if (userRole === 'root') return { granted: 0, skipped: 'root' }; // 站长跳过发放(权益=满级另算)
  if (!(amount > 0)) return { granted: 0, skipped: 'noop' };

  const ownConn = !conn;
  const c = conn || (await pool.getConnection());
  try {
    if (ownConn) await c.beginTransaction();

    // 1. 幂等占位:先插 amount=0 抢唯一键;冲突(affectedRows=0)=已发过 → 不重复计
    // 用 INSERT IGNORE 而非 ON DUPLICATE KEY UPDATE id=id:后者在"匹配未改变"时 affectedRows 仍为 1,
    // 无法据此判重(实测踩坑);IGNORE 对唯一冲突可靠返回 affectedRows=0。
    const [ins] = await c.query(
      `INSERT IGNORE INTO growth_events (user_id, source, ref_id, day, amount, status, meta)
       VALUES (?, ?, ?, ?, 0, 'granted', ?)`,
      [userId, source, refId, day, meta ? JSON.stringify(meta) : null],
    );
    if (ins.affectedRows === 0) {
      if (ownConn) await c.commit();
      return { granted: 0, duplicated: true };
    }
    const eventId = ins.insertId;

    // 2. 日 EXP 硬顶:当日已发放合计(含刚插入的 0)→ 截断本次发放量
    const [[sumRow]] = await c.query(
      `SELECT COALESCE(SUM(amount), 0) AS used FROM growth_events
       WHERE user_id = ? AND status = 'granted' AND DATE(create_time) = CURDATE()`,
      [userId],
    );
    const used = Number(sumRow.used || 0);
    const grantAmount = Math.max(0, Math.min(amount, DAILY_EXP_CAP - used));
    if (grantAmount > 0) {
      await c.query('UPDATE growth_events SET amount = ? WHERE id = ?', [grantAmount, eventId]);
    }

    // 3. 更新快照:exp 增量累加(防并发覆盖);level 随后由 levelForExp 校准
    const [[gRow]] = await c.query('SELECT exp, level FROM user_growth WHERE user_id = ? FOR UPDATE', [userId]);
    const beforeExp = Number(gRow?.exp || 0);
    const fromLevel = gRow ? Number(gRow.level) : 1;
    const afterExp = beforeExp + grantAmount;
    const toLevel = levelForExp(afterExp);
    await c.query(
      `INSERT INTO user_growth (user_id, exp, level) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE exp = exp + ?, level = ?`,
      [userId, afterExp, toLevel, grantAmount, toLevel],
    );

    // 4. 升级 → 逐级落 level_up 里程碑(唯一键去重;通知中心第三刀读此)
    let leveledUp = false;
    if (toLevel > fromLevel) {
      leveledUp = true;
      for (let L = fromLevel + 1; L <= toLevel; L++) {
        await c.query(
          `INSERT IGNORE INTO growth_events (user_id, source, ref_id, day, amount, status, meta)
           VALUES (?, 'milestone', ?, NULL, 0, 'granted', ?)`,
          [userId, `level_up_L${L}`, JSON.stringify({ from: L - 1, to: L, rank: rankOf(L).name })],
        );
      }
    }

    if (ownConn) await c.commit();
    return { granted: grantAmount, duplicated: false, leveledUp, fromLevel, toLevel, exp: afterExp, level: toLevel };
  } catch (e) {
    if (ownConn) {
      try {
        await c.rollback();
      } catch {
        /* ignore */
      }
    }
    throw e;
  } finally {
    if (ownConn) c.release();
  }
}

// —— 创造类发经验(书签/笔记/文件):按当日第 N 条衰减(方案 3.1 终版) ——
const CREATE_TIERS = {
  bookmark: [[3, 10], [8, 5], [15, 2]],
  note: [[3, 15], [8, 8], [15, 3]],
  file: [[3, 12], [8, 6], [15, 3]],
};
function createAmount(kind, nth) {
  for (const [maxN, amt] of CREATE_TIERS[kind] || []) if (nth <= maxN) return amt;
  return 1; // 第 16 条起 +1(衰减不归零)
}

// 内容判重键:对 url 等取 sha256 hex,落 growth_events.ref_id 做永久判重(删了重建也不再发)
export function hashRef(str) {
  return crypto.createHash('sha256').update(String(str || '')).digest('hex');
}

/**
 * 创造类发经验:按用户当日该类已发条数决定衰减档位,再走 grantExp(幂等 + 日顶 + root 跳过)。
 * 必须 fire-and-forget 调用,且不要传创建资源用的事务连接(它 commit 后即释放)。
 * @param {string} kind 'bookmark' | 'note' | 'file'
 * @param {string} refId 判重键:书签传 url 的 hashRef,笔记/文件传各自主键
 */
export async function awardCreate(userId, kind, refId, { userRole = null } = {}) {
  if (!userId || userId === 'visitor' || userRole === 'root') return { granted: 0, skipped: true };
  if (!refId) return { granted: 0, skipped: 'no-ref' };
  // 首次创建该类资源 +30(一次性成就,uk_resource(user,'first_own_resource',kind) 幂等)
  // await 让首次与衰减顺序到账(awardCreate 整体已在 handler 里 fire-and-forget,不阻塞创建响应)
  await grantExp(userId, 'first_own_resource', { refId: kind, amount: 30, userRole }).catch(() => {});
  // 当日第 N 条衰减
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c FROM growth_events WHERE user_id=? AND source=? AND status='granted' AND DATE(create_time)=CURDATE()`,
    [userId, kind],
  );
  const nth = Number(row?.c || 0) + 1;
  return grantExp(userId, kind, { refId: String(refId), amount: createAmount(kind, nth), userRole });
}

/**
 * 读取用户成长快照(用于 /growth/me 与前端徽章)。
 * level 以 levelForExp(exp) 为权威;root 直接按满级展示(权益=满级,不依赖账本)。
 */
export async function getGrowth(userId, { userRole = null } = {}) {
  let exp = 0;
  let streak = 0;
  let lastCheckin = null;
  let lastNotifiedLevel = 1;
  if (userId && userId !== 'visitor') {
    const [rows] = await pool.query(
      'SELECT exp, streak, last_checkin_date, last_notified_level FROM user_growth WHERE user_id = ?',
      [userId],
    );
    if (rows[0]) {
      exp = Number(rows[0].exp || 0);
      streak = Number(rows[0].streak || 0);
      lastCheckin = rows[0].last_checkin_date || null;
      lastNotifiedLevel = Number(rows[0].last_notified_level || 1);
    }
  }
  let level = levelForExp(exp);
  if (userRole === 'root') {
    level = MAX_LEVEL;
    exp = RANKS[MAX_LEVEL - 1].cumExp;
  }
  const rank = rankOf(level);
  const { nextExp, need } = nextLevelInfo(exp, level);
  const isMax = level >= MAX_LEVEL;
  const span = nextExp ? nextExp - rank.cumExp : 0; // 本级跨度
  const progress = isMax ? 100 : span > 0 ? Math.max(0, Math.min(100, Math.round(((exp - rank.cumExp) / span) * 100))) : 0;
  const hasUnreadLevelUp = userRole !== 'root' && level > lastNotifiedLevel; // 升级通知未读(通知中心随 level_up)
  return {
    exp,
    level,
    name: rank.name,
    spaceMb: rank.spaceMb,
    aiTokenDaily: rank.aiTokenDaily,
    streak,
    checkedInToday: lastCheckin === dayKey(),
    levelStartExp: rank.cumExp,
    nextLevelExp: nextExp,
    expToNext: need,
    progress, // 本级内进度 0-100(前端进度条直接用)
    hasUnreadLevelUp,
    unreadLevel: hasUnreadLevelUp ? level : null,
    isMax,
  };
}

// 标记升级通知已读(用户查看成长页后调用):把"已知晓等级"抬到当前等级
export async function markNoticesRead(userId) {
  if (!userId || userId === 'visitor') return;
  await pool.query('UPDATE user_growth SET last_notified_level = level WHERE user_id = ?', [userId]);
}

/**
 * 签到(主动)。当日仅一次;连续加成 +min(streak,5);断签回退 3 天不清零。
 * root 也可签到(更新 streak 展示),但不发经验、权益仍满级。
 */
export async function checkin(userId, { userRole = null } = {}) {
  if (!userId || userId === 'visitor') return { ok: false, reason: 'visitor' };
  const today = dayKey();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT exp, level, streak, last_checkin_date FROM user_growth WHERE user_id = ? FOR UPDATE',
      [userId],
    );
    let g = rows[0];
    if (!g) {
      await conn.query('INSERT INTO user_growth (user_id) VALUES (?)', [userId]);
      g = { exp: 0, level: 1, streak: 0, last_checkin_date: null };
    }
    if (g.last_checkin_date === today) {
      await conn.commit();
      return { ok: true, already: true, growth: await getGrowth(userId, { userRole }) };
    }

    let streak;
    if (!g.last_checkin_date) streak = 1;
    else {
      const gap = daysBetween(today, g.last_checkin_date);
      streak = gap === 1 ? Number(g.streak) + 1 : Math.max(1, Number(g.streak) - 3); // 连签+1 / 断签回退3天不清零
    }
    const amount = CHECKIN_BASE + checkinBonus(streak); // 5 + min(streak,5),单日 ≤10

    await conn.query('UPDATE user_growth SET streak = ?, last_checkin_date = ? WHERE user_id = ?', [streak, today, userId]);
    const grant = await grantExp(userId, 'checkin', { day: today, amount, meta: { streak }, userRole }, conn);
    await conn.commit();

    return {
      ok: true,
      already: false,
      streak,
      expGained: grant.granted || 0,
      leveledUp: !!grant.leveledUp,
      growth: await getGrowth(userId, { userRole }),
    };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    conn.release();
  }
}
