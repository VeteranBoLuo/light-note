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
import { earnPoints, earnStorage, getAchievementFrameByKey, titleName } from './points.js';
import { grantItem } from './items.js';
import { createNotification } from './notification.js';
import { stableAgentErrorCode } from './agent/logSafety.js';
import { finishAdminAction } from './adminActionExecution.js';
import { dayKeyAtOffset, getGrowthCalendarContext } from './growthPreferences.js';

// 15 级段位表:cumExp=升到该级的累计经验阈值;spaceMb/aiTokenDaily=该级权益。
// 容量曲线(前期平滑、中期明显、后期加速):Lv1 1G → Lv10 6G → Lv15 20G。
// Lv1-5 每级 +256MB，Lv6-10 逐步提至 +1GB，Lv11 起加速；全部按 256MB 整数倍设计。
// AI 额度同步按等级递增:Lv.1 50 万 → Lv.15 400 万 token/日。
// 数值 = 展示 GB×1024 取整;后端按 level 下发真实配额。
export const RANKS = [
  { level: 1, name: '蒙童', cumExp: 0, spaceMb: 1024, aiTokenDaily: 500_000, trashDays: 30 },
  { level: 2, name: '书生', cumExp: 500, spaceMb: 1280, aiTokenDaily: 600_000, trashDays: 30 },
  { level: 3, name: '秀才', cumExp: 1000, spaceMb: 1536, aiTokenDaily: 760_000, trashDays: 30 },
  { level: 4, name: '举人', cumExp: 1700, spaceMb: 1792, aiTokenDaily: 900_000, trashDays: 30 },
  { level: 5, name: '贡士', cumExp: 2700, spaceMb: 2048, aiTokenDaily: 1_100_000, trashDays: 60 },
  { level: 6, name: '进士', cumExp: 4000, spaceMb: 2560, aiTokenDaily: 1_300_000, trashDays: 60 },
  { level: 7, name: '探花', cumExp: 5800, spaceMb: 3072, aiTokenDaily: 1_500_000, trashDays: 60 },
  { level: 8, name: '榜眼', cumExp: 8000, spaceMb: 4096, aiTokenDaily: 1_760_000, trashDays: 60 },
  { level: 9, name: '状元', cumExp: 10800, spaceMb: 5120, aiTokenDaily: 2_000_000, trashDays: 60 },
  { level: 10, name: '翰林', cumExp: 14500, spaceMb: 6144, aiTokenDaily: 2_300_000, trashDays: 180 },
  { level: 11, name: '学士', cumExp: 19000, spaceMb: 8192, aiTokenDaily: 2_600_000, trashDays: 180 },
  { level: 12, name: '大学士', cumExp: 25000, spaceMb: 10752, aiTokenDaily: 3_000_000, trashDays: 180 },
  { level: 13, name: '文豪', cumExp: 32000, spaceMb: 13824, aiTokenDaily: 3_300_000, trashDays: 180 },
  { level: 14, name: '文宗', cumExp: 40000, spaceMb: 16896, aiTokenDaily: 3_600_000, trashDays: 180 },
  // 满级 36500 天(100 年)≈ 永久:清理 SQL 用它算出的过期点在 100 年前,永不命中;前端 ≥3650 显示「永久」
  { level: 15, name: '文圣', cumExp: 50000, spaceMb: 20480, aiTokenDaily: 4_000_000, trashDays: 36500 },
];

export const MAX_LEVEL = 15;
export const MAKEUP_WINDOW_DAYS = 3;
const DAILY_EXP_CAP = 200; // 日 EXP 硬顶 —— 唯一不可绕底线(批量导入速通的最后闸)。签到远低于此,为后续创造类预置。
// 一次性/运营类经验不属于可刷的「每日经验」，既不受 200 日顶限制，也不占用当日额度。
// first_own_resource / profile_done 为历史一次性来源，保留在同一口径中兼容旧账本。
const DAILY_EXP_CAP_EXEMPT_SOURCES = Object.freeze([
  'growth_task',
  'first_own_resource',
  'milestone',
  'manual',
  'profile_done',
]);
const DAILY_EXP_CAP_EXEMPT_PLACEHOLDERS = DAILY_EXP_CAP_EXEMPT_SOURCES.map(() => '?').join(', ');
export const DAILY_QUEST_STAGES = [
  { key: 'basic', required: 2, exp: 5, points: 10, source: 'daily_quest_2' },
  { key: 'complete', required: 3, exp: 10, points: 20, source: 'daily_quest_3' },
];
export const DAILY_QUEST_KEYS = ['daily_note', 'daily_bookmark', 'daily_file', 'daily_todo', 'daily_organize'];

// 连签里程碑大奖:累计连续签到命中当天即发(积分/永久存储/补签卡),按 ref=days 一次性幂等。
// 把签到从「+5 经验」升级为值得长期坚持的习惯养成:越久回报越丰厚(存储是最实在的诱惑)。
export const STREAK_MILESTONES = [
  { days: 7, points: 50 },
  { days: 30, points: 300, storageMb: 512, cards: 1 },
  { days: 100, points: 1000, storageMb: 2048 },
  { days: 365, points: 5000, storageMb: 5120 },
];

const CHECKIN_BASE = 5; // 每日签到基础 +5
const HEATMAP_ACTIVITY_TYPES = ['bookmark', 'note', 'file', 'todo', 'organize', 'checkin'];

// 游客在 user 表中有固定的共享账号 ID，并不一定等于字面量 "visitor"。
// 所有成长数据都必须以角色为准隔离，避免游客继承共享账号的历史成长/奖励记录。
function isVisitorGrowthActor(userId, userRole = null) {
  return !userId || userId === 'visitor' || userRole === 'visitor';
}

function isDailyExpCapExemptSource(source) {
  return DAILY_EXP_CAP_EXEMPT_SOURCES.includes(source);
}

// 发放与展示共用同一查询，避免「页面还没到 200，后端却已停止增长」。
async function getDailyLimitedExpTotal(db, userId, calendar = null) {
  const dayClause = calendar
    ? "DATE_FORMAT(DATE_ADD(create_time, INTERVAL ? MINUTE), '%Y%m%d') = ?"
    : 'create_time >= CURDATE()';
  const [[row]] = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS used FROM growth_events
     WHERE user_id = ? AND status = 'granted' AND ${dayClause}
       AND source NOT IN (${DAILY_EXP_CAP_EXEMPT_PLACEHOLDERS})`,
    calendar
      ? [userId, calendar.shiftMinutes, calendar.dayKey, ...DAILY_EXP_CAP_EXEMPT_SOURCES]
      : [userId, ...DAILY_EXP_CAP_EXEMPT_SOURCES],
  );
  return Number(row?.used || 0);
}

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

function addCalendarDays(date, offset) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + offset);
  return result;
}

function dateFromDayKey(key) {
  if (typeof key !== 'string' || !/^\d{8}$/.test(key)) return null;
  const date = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
  return dayKey(date) === key ? date : null;
}

// 补签候选:今天之前最近 3 个自然日，按由近到远排序。补签只补签到记录，不补经验/积分/里程碑。
export function getMakeupCandidateDays(now = new Date()) {
  return Array.from({ length: MAKEUP_WINDOW_DAYS }, (_, index) => dayKey(addCalendarDays(now, -(index + 1))));
}

export function isMakeupCandidateDay(key, now = new Date()) {
  return !!dateFromDayKey(key) && getMakeupCandidateDays(now).includes(key);
}

function countStreakEndingAt(daySet, endDay) {
  const endDate = dateFromDayKey(endDay);
  if (!endDate) return 0;
  let streak = 0;
  for (let offset = 0; ; offset++) {
    const day = dayKey(addCalendarDays(endDate, -offset));
    if (!daySet.has(day)) break;
    streak++;
  }
  return streak;
}

// 两个 YYYYMMDD 相差天数(a 晚于 b 为正)
function daysBetween(aKey, bKey) {
  const toDate = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(4, 6)) - 1, Number(k.slice(6, 8)));
  return Math.round((toDate(aKey) - toDate(bKey)) / 86_400_000);
}

async function isLevelUpNotificationEnabled(conn, userId) {
  const [[row]] = await conn.query(
    "SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.notifyLevelUp')), 'true') AS v FROM `user` WHERE id = ?",
    [userId],
  );
  return row?.v !== 'false';
}

// 升级通知统一从这里写入。正常成长可逐级通知；后台调整只发最终等级，避免一笔运营操作刷屏。
async function writeLevelUpNotification(conn, userId, level, { source = null } = {}) {
  const rankName = rankOf(level).name;
  try {
    await createNotification(
      userId,
      {
        type: 'level_up',
        title: `升级到 Lv.${level} ${rankName}`,
        link: '/growth',
        meta: { level, name: rankName, ...(source ? { source } : {}) },
      },
      conn,
    );
  } catch (notifyErr) {
    // 通知故障绝不阻断成长主流程；通知中心表尚未就绪时也可安全降级。
    console.error('写升级通知失败(不影响升级) code=%s', stableAgentErrorCode(notifyErr));
  }
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
  const { refId = null, day = null, amount = 0, meta = null, userRole = null, calendar = null } = opts;
  if (isVisitorGrowthActor(userId, userRole)) return { granted: 0, skipped: 'visitor' };
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

    // 2. 锁定用户成长行，串行化同一用户的并发发放，防止多请求同时穿透 200 日硬顶。
    // ON DUPLICATE KEY UPDATE 直接取排他锁；不用 INSERT IGNORE 的共享锁再升级，避免并发锁升级死锁。
    await c.query(
      `INSERT INTO user_growth (user_id) VALUES (?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [userId],
    );
    const [[gRow]] = await c.query('SELECT exp, level FROM user_growth WHERE user_id = ? FOR UPDATE', [userId]);

    // 3. 日 EXP 硬顶:只统计受限的日常/创造来源，一次性奖励始终单独计算。
    // daily_quest 不豁免，与签到、新增内容、批量导入共用 200/日额度。
    const capExempt = isDailyExpCapExemptSource(source);
    const used = capExempt ? 0 : await getDailyLimitedExpTotal(c, userId, calendar);
    const grantAmount = capExempt ? amount : Math.max(0, Math.min(amount, DAILY_EXP_CAP - used));
    if (grantAmount > 0) {
      await c.query('UPDATE growth_events SET amount = ? WHERE id = ?', [grantAmount, eventId]);
    }

    // 4. 更新快照:exp 增量累加(防并发覆盖);level 随后由 levelForExp 校准
    const beforeExp = Number(gRow?.exp || 0);
    const fromLevel = gRow ? Number(gRow.level) : 1;
    const afterExp = beforeExp + grantAmount;
    const toLevel = levelForExp(afterExp);
    await c.query(
      `INSERT INTO user_growth (user_id, exp, level) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE exp = exp + ?, level = ?`,
      [userId, afterExp, toLevel, grantAmount, toLevel],
    );
    try {
      const { persistAchievementUnlocksForMetrics } = await import('./growthAchievementState.js');
      await persistAchievementUnlocksForMetrics(userId, { level: toLevel }, { db: c, currentLevel: toLevel });
    } catch (error) {
      console.warn('[growth] 等级成就状态同步失败 code=%s', stableAgentErrorCode(error));
    }

    // 5. 升级 → 逐级落 level_up 里程碑(唯一键去重;通知中心第三刀读此)
    let leveledUp = false;
    if (toLevel > fromLevel) {
      leveledUp = true;
      // 尊重用户「升级提醒」开关(preferences.notifyLevelUp === 'false' 时不发升级通知,但里程碑账本照记)
      const notifyLevelUp = await isLevelUpNotificationEnabled(c, userId);
      // 每升 1 级奖励 1 张补签卡(上限 2),统一走 grantItem
      await grantItem(c, userId, 'makeup_card', toLevel - fromLevel);
      for (let L = fromLevel + 1; L <= toLevel; L++) {
        const rankName = rankOf(L).name;
        await c.query(
          `INSERT IGNORE INTO growth_events (user_id, source, ref_id, day, amount, status, meta)
          VALUES (?, 'milestone', ?, NULL, 0, 'granted', ?)`,
          [userId, `level_up_L${L}`, JSON.stringify({ from: L - 1, to: L, rank: rankName })],
        );
        if (notifyLevelUp) await writeLevelUpNotification(c, userId, L);
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
  bookmark: [
    [3, 10],
    [8, 5],
    [15, 2],
  ],
  note: [
    [3, 15],
    [8, 8],
    [15, 3],
  ],
  file: [
    [3, 12],
    [8, 6],
    [15, 3],
  ],
};
function createAmount(kind, nth) {
  for (const [maxN, amt] of CREATE_TIERS[kind] || []) if (nth <= maxN) return amt;
  return 1; // 第 16 条起 +1(衰减不归零)
}

// 内容判重键:对 url 等取 sha256 hex,落 growth_events.ref_id 做永久判重(删了重建也不再发)
export function hashRef(str) {
  return crypto
    .createHash('sha256')
    .update(String(str || ''))
    .digest('hex');
}

/**
 * 创造类发经验:按用户当日该类已发条数决定衰减档位,再走 grantExp(幂等 + 日顶 + root 跳过)。
 * 必须 fire-and-forget 调用,且不要传创建资源用的事务连接(它 commit 后即释放)。
 * @param {string} kind 'bookmark' | 'note' | 'file'
 * @param {string} refId 判重键:书签传 url 的 hashRef,笔记/文件传各自主键
 */
export async function awardCreate(userId, kind, refId, { userRole = null } = {}) {
  if (isVisitorGrowthActor(userId, userRole)) return { granted: 0, skipped: true };
  if (!refId) return { granted: 0, skipped: 'no-ref' };
  // 功能发现任务只记录一次业务事实，经验仍由用户主动领取。
  if (kind === 'note' || kind === 'bookmark' || kind === 'file') {
    try {
      const { completeGrowthTask } = await import('./growthTaskCompletion.js');
      const taskKey = kind === 'note' ? 'first_note' : kind === 'bookmark' ? 'first_bookmark' : 'first_file';
      await completeGrowthTask(userId, taskKey, { userRole });
    } catch (error) {
      console.warn('[growth] 首次成长任务状态同步失败 code=%s', stableAgentErrorCode(error));
    }
  }
  // root 不进入经验账本，但上面的成长任务完成事实仍需正常记录并自动收口。
  if (userRole === 'root') return { granted: 0, skipped: true };
  const calendar = await getGrowthCalendarContext(userId);
  // 当日第 N 条衰减
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c FROM growth_events
      WHERE user_id=? AND source=? AND status='granted'
        AND DATE_FORMAT(DATE_ADD(create_time, INTERVAL ? MINUTE), '%Y%m%d') = ?`,
    [userId, kind, calendar.shiftMinutes, calendar.dayKey],
  );
  const nth = Number(row?.c || 0) + 1;
  const grant = await grantExp(userId, kind, {
    refId: String(refId),
    amount: createAmount(kind, nth),
    userRole,
    calendar,
  });
  try {
    const { persistAchievementMetricFromDatabase } = await import('./growthAchievementState.js');
    const metric = kind === 'note' ? 'noteCount' : kind === 'bookmark' ? 'bookmarkCount' : 'fileCount';
    await persistAchievementMetricFromDatabase(userId, metric);
  } catch (error) {
    console.warn('[growth] 创作成就状态同步失败 code=%s', stableAgentErrorCode(error));
  }
  return grant;
}

/**
 * 读取用户成长快照(用于 /growth/me 与前端徽章)。
 * level 以 levelForExp(exp) 为权威;root 直接按满级展示(权益=满级,不依赖账本)。
 */
export async function getGrowth(userId, { userRole = null, db = pool, calendar = null } = {}) {
  const isGuest = isVisitorGrowthActor(userId, userRole);
  const accountCalendar = calendar || (!isGuest ? await getGrowthCalendarContext(userId, { db }) : null);
  const effectiveDayKey = accountCalendar?.dayKey || dayKey();
  let exp = 0;
  let streak = 0;
  let lastCheckin = null;
  let lastNotifiedLevel = 1;
  let protectCards = 0;
  let canUseProtectCard = false;
  let makeupDays = [];
  let points = 0;
  let equippedTitle = null;
  let equippedFrame = null;
  let storageBonus = 0;
  if (!isGuest) {
    const [rows] = await db.query(
      'SELECT exp, streak, last_checkin_date, last_notified_level, streak_protect_cards, points, equipped_title, equipped_frame, storage_bonus_mb FROM user_growth WHERE user_id = ?',
      [userId],
    );
    if (rows[0]) {
      exp = Number(rows[0].exp || 0);
      streak = Number(rows[0].streak || 0);
      lastCheckin = rows[0].last_checkin_date || null;
      lastNotifiedLevel = Number(rows[0].last_notified_level || 1);
      protectCards = Number(rows[0].streak_protect_cards || 0);
      points = Number(rows[0].points || 0);
      equippedTitle = rows[0].equipped_title || null;
      equippedFrame = rows[0].equipped_frame || null;
      storageBonus = Number(rows[0].storage_bonus_mb || 0);
    }
    // 补签判定:有卡时查今天之前最近 3 个自然日；今天是否签到不影响补历史漏签。
    if (protectCards > 0) {
      const candidates = accountCalendar?.makeupDays || getMakeupCandidateDays();
      const [checkedRows] = await db.query(
        `SELECT day FROM growth_events
         WHERE user_id = ? AND source = 'checkin' AND status = 'granted'
           AND day IN (${candidates.map(() => '?').join(',')})`,
        [userId, ...candidates],
      );
      const checkedDays = new Set((checkedRows || []).map((row) => row.day));
      makeupDays = candidates.filter((day) => !checkedDays.has(day));
      canUseProtectCard = makeupDays.length > 0;
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
  const progress = isMax
    ? 100
    : span > 0
      ? Math.max(0, Math.min(100, Math.round(((exp - rank.cumExp) / span) * 100)))
      : 0;
  const hasUnreadLevelUp = userRole !== 'root' && level > lastNotifiedLevel; // 升级通知未读(通知中心随 level_up)
  // 今日已获经验(仅计入受日顶约束的来源,口径与 grantExp 日顶一致),供前端展示"每日上限"进度
  let dailyExp = 0;
  if (!isGuest && userRole !== 'root') {
    dailyExp = await getDailyLimitedExpTotal(db, userId, accountCalendar);
  }
  return {
    exp,
    level,
    name: rank.name,
    spaceMb: rank.spaceMb + storageBonus, // 段位基础(root 已是满级 rank) + 积分永久扩容
    spaceBonusMb: storageBonus, // 其中积分兑换的扩容部分(前端可单独标注「已扩容 +X」)
    aiTokenDaily: rank.aiTokenDaily,
    trashDays: rank.trashDays,
    streak,
    protectCards, // 补签卡数量(上限 2)
    points, // 积分余额(消费货币)
    equippedTitle, // 已佩戴称号 id
    equippedTitleName: titleName(equippedTitle), // 称号显示名
    equippedFrame, // 已佩戴头像框装扮 id
    canUseProtectCard, // 最近 3 个自然日内存在漏签且有卡
    makeupDays, // 可补的 YYYYMMDD，按由近到远排序；前端仅展示这些日期
    checkedInToday: lastCheckin === effectiveDayKey,
    levelStartExp: rank.cumExp,
    nextLevelExp: nextExp,
    expToNext: need,
    progress, // 本级内进度 0-100(前端进度条直接用)
    hasUnreadLevelUp,
    unreadLevel: hasUnreadLevelUp ? level : null,
    isMax,
    dailyExp, // 今日已获经验(计入日顶部分)
    dailyCap: DAILY_EXP_CAP, // 每日经验上限
    dailyCapReached: dailyExp >= DAILY_EXP_CAP, // 今日是否已到顶
  };
}

// ============================================================================
// 成长看板(派生层) —— 成就墙 / 统计 / 每日任务 / 时间线
// 进度从 user_growth / growth_events / 资源表 / user.create_time 派生；永久解锁与领取状态
// 只读 user_achievements。Schema 与历史回填统一在服务启动阶段完成，GET 请求不补写数据。
// ============================================================================

// 成就定义:阈值单一事实源。group=分类;metric=进度所依据的统计字段;target=解锁阈值;reward=解锁后可领的积分。
// minLevel 只用于高数量资源头像框：200 档需 Lv.5，500 档需 Lv.8。等级本身受每日经验硬顶约束，
// 已经代表持续使用时长，不再叠加注册/活跃天数或内容质量判定，避免误伤正常导入和高频创作。
// reward 按长期积累难度递增：首签 10；中阶 40~120；高阶 150~500；里程碑级 600~800。
// points_log(reason='achievement', ref=key)负责到账幂等，user_achievements 负责永久解锁与领取展示状态。
export const ACHIEVEMENTS = [
  { key: 'streak_1', group: 'checkin', metric: 'maxStreak', target: 1, reward: 10 },
  { key: 'streak_7', group: 'checkin', metric: 'maxStreak', target: 7, reward: 50 },
  { key: 'streak_30', group: 'checkin', metric: 'maxStreak', target: 30, reward: 120 },
  { key: 'streak_100', group: 'checkin', metric: 'maxStreak', target: 100, reward: 300 },
  { key: 'streak_365', group: 'checkin', metric: 'maxStreak', target: 365, reward: 800 },
  { key: 'checkin_50', group: 'checkin', metric: 'totalCheckins', target: 50, reward: 80 },
  { key: 'checkin_100', group: 'checkin', metric: 'totalCheckins', target: 100, reward: 150 },
  { key: 'bookmark_20', group: 'create', metric: 'bookmarkCount', target: 20, reward: 40 },
  { key: 'bookmark_50', group: 'create', metric: 'bookmarkCount', target: 50, reward: 80 },
  { key: 'bookmark_200', group: 'create', metric: 'bookmarkCount', target: 200, reward: 200 },
  { key: 'bookmark_500', group: 'create', metric: 'bookmarkCount', target: 500, minLevel: 8, reward: 400 },
  { key: 'note_10', group: 'create', metric: 'noteCount', target: 10, reward: 40 },
  { key: 'note_20', group: 'create', metric: 'noteCount', target: 20, reward: 60 },
  { key: 'note_50', group: 'create', metric: 'noteCount', target: 50, reward: 120 },
  { key: 'note_200', group: 'create', metric: 'noteCount', target: 200, minLevel: 5, reward: 400 },
  { key: 'note_500', group: 'create', metric: 'noteCount', target: 500, minLevel: 8, reward: 600 },
  { key: 'file_10', group: 'create', metric: 'fileCount', target: 10, reward: 40 },
  { key: 'file_50', group: 'create', metric: 'fileCount', target: 50, reward: 100 },
  { key: 'file_200', group: 'create', metric: 'fileCount', target: 200, minLevel: 5, reward: 300 },
  { key: 'file_500', group: 'create', metric: 'fileCount', target: 500, minLevel: 8, reward: 500 },
  { key: 'todo_20', group: 'action', metric: 'completedTodoCount', target: 20, reward: 40 },
  { key: 'todo_100', group: 'action', metric: 'completedTodoCount', target: 100, reward: 150 },
  { key: 'todo_500', group: 'action', metric: 'completedTodoCount', target: 500, reward: 300 },
  { key: 'todo_1000', group: 'action', metric: 'completedTodoCount', target: 1000, reward: 500 },
  { key: 'organize_20', group: 'organize', metric: 'organizedResourceCount', target: 20, reward: 40 },
  { key: 'organize_100', group: 'organize', metric: 'organizedResourceCount', target: 100, reward: 150 },
  { key: 'organize_500', group: 'organize', metric: 'organizedResourceCount', target: 500, reward: 300 },
  { key: 'organize_1000', group: 'organize', metric: 'organizedResourceCount', target: 1000, reward: 500 },
  { key: 'level_5', group: 'level', metric: 'level', target: 5, reward: 100 },
  { key: 'level_10', group: 'level', metric: 'level', target: 10, reward: 250 },
  { key: 'level_15', group: 'level', metric: 'level', target: 15, reward: 600 },
  { key: 'join_7', group: 'tenure', metric: 'joinDays', target: 7, reward: 40 },
  { key: 'join_30', group: 'tenure', metric: 'joinDays', target: 30, reward: 100 },
  { key: 'join_100', group: 'tenure', metric: 'joinDays', target: 100, reward: 250 },
  { key: 'join_365', group: 'tenure', metric: 'joinDays', target: 365, reward: 600 },
];

export function meetsAchievementRequirement(achievement, metrics = {}) {
  const current = Number(metrics[achievement?.metric] || 0);
  const level = Number(metrics.level || 0);
  const minLevel = Math.max(0, Number(achievement?.minLevel || 0));
  return current >= Number(achievement?.target || 0) && level >= minLevel;
}

function safeParseMeta(m) {
  if (!m) return null;
  if (typeof m === 'object') return m;
  try {
    return JSON.parse(m);
  } catch {
    return null;
  }
}

function dailyQuestKeyFor(userId, day) {
  const digest = crypto.createHash('sha256').update(`growth-daily-v1\0${userId}\0${day}`).digest();
  return DAILY_QUEST_KEYS[digest.readUInt32BE(0) % DAILY_QUEST_KEYS.length];
}

export async function getDailyQuestState(userId, growth, { isGuest = false, db = pool, calendar = null } = {}) {
  const effectiveDayKey = calendar?.dayKey || dayKey();
  const dailyCondition = (column) =>
    calendar
      ? `DATE_FORMAT(DATE_ADD(${column}, INTERVAL ? MINUTE), '%Y%m%d') = ?`
      : `${column} >= CURDATE()`;
  const randomKey = dailyQuestKeyFor(userId || 'visitor', effectiveDayKey);
  let metrics = {
    created: 0,
    daily_note: 0,
    daily_bookmark: 0,
    daily_file: 0,
    daily_todo: 0,
    daily_organize: 0,
  };
  if (!isGuest) {
    const [[row]] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM bookmark b
          WHERE b.user_id = ? AND b.del_flag = 0 AND ${dailyCondition('b.create_time')}
            AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id=b.user_id AND osr.resource_type='bookmark' AND osr.resource_id=b.id)) AS bookmarks,
        (SELECT COUNT(*) FROM note n
          WHERE n.create_by = ? AND n.del_flag = 0 AND ${dailyCondition('n.create_time')}
            AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id=n.create_by AND osr.resource_type='note' AND osr.resource_id=n.id)) AS notes,
        (SELECT COUNT(*) FROM files f
          WHERE f.create_by = ? AND f.del_flag = 0 AND ${dailyCondition('f.create_time')}
            AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id=f.create_by AND osr.resource_type='file' AND osr.resource_id=CAST(f.id AS CHAR))) AS files,
        (SELECT COUNT(*) FROM todo_items td
          WHERE td.user_id = ? AND td.del_flag = 0 AND ${dailyCondition('td.create_time')}) AS todosCreated,
        (SELECT COUNT(*) FROM todo_items td
          WHERE td.user_id = ? AND td.del_flag = 0 AND td.status = 'completed'
            AND ${dailyCondition('td.completed_at')}) AS todosCompleted,
        (SELECT COUNT(*) FROM resource_inbox ri
          WHERE ri.user_id = ? AND ri.status = 'completed' AND ${dailyCondition('ri.complete_time')}) AS organized`,
      calendar
        ? Array.from({ length: 6 }, () => [userId, calendar.shiftMinutes, effectiveDayKey]).flat()
        : [userId, userId, userId, userId, userId, userId],
    );
    const bookmarks = Number(row?.bookmarks || 0);
    const notes = Number(row?.notes || 0);
    const files = Number(row?.files || 0);
    const todosCreated = Number(row?.todosCreated || 0);
    metrics = {
      created: bookmarks + notes + files + todosCreated,
      daily_note: notes,
      daily_bookmark: bookmarks,
      daily_file: files,
      daily_todo: Number(row?.todosCompleted || 0),
      daily_organize: Number(row?.organized || 0),
    };
  }
  const quests = [
    { key: 'checkin', done: Boolean(growth?.checkedInToday), cur: growth?.checkedInToday ? 1 : 0, target: 1 },
    { key: 'create', done: metrics.created > 0, cur: Math.min(metrics.created, 1), target: 1 },
    { key: randomKey, done: metrics[randomKey] > 0, cur: Math.min(metrics[randomKey], 1), target: 1, random: true },
  ];
  return { quests, completedCount: quests.filter((quest) => quest.done).length };
}

// 给一组升序去重的 YYYYMMDD,求最长连续天数(签到最长连签)
function longestConsecutiveRun(days) {
  if (!days.length) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = daysBetween(days[i], days[i - 1]);
    if (gap === 1) cur++;
    else if (gap > 1) cur = 1; // gap===0(重复)理论上已去重,忽略
    if (cur > best) best = cur;
  }
  return best;
}

/**
 * 知识活动热力图(贡献格子)。口径：
 * - 资源新增直接从三张资源表 create_time 读取(归属列不同:bookmark=user_id,note/files=create_by);
 *   软删仍计入其创建当天(不加 del_flag) —— 今天建明天删不该让昨天的格子熄灭。
 * - 签到及待办/整理的不可变历史只读取明确白名单 source；待办/整理当前表仅兜底迁移前数据，
 *   已固化事件的业务行会被排除，避免同一行为重复计数。其余奖励/里程碑事件一律不计。
 * - 自然年边界 [YYYY-01-01, (YYYY+1)-01-01),按账号时区分日；签到 day 本身已使用同一账号日历；
 *   day/输出统一 YYYY-MM-DD 字符串,前端不再做 Date 解析(避免 toISOString 类偏移)。
 * - 每格同时返回各来源的次数，用于前端解释“这几次活动来自哪里”；总数和明细来自同一条聚合，避免二次查询口径漂移。
 * 性能:个人级数据量小,首期不加缓存;如实测慢再按 EXPLAIN 补复合索引 + 短 TTL 缓存。
 */
export async function getActivityHeatmap(userId, { userRole = null, year = null, calendar = null } = {}) {
  const now = new Date();
  const isGuest = isVisitorGrowthActor(userId, userRole);
  const accountCalendar = isGuest ? null : calendar || (await getGrowthCalendarContext(userId));
  const currentDayKey = accountCalendar?.dayKey || dayKey(now);
  const currentYear = Number(currentDayKey.slice(0, 4));
  let y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > currentYear) y = currentYear;

  const base = {
    year: y,
    timezone: accountCalendar?.timezone || 'Asia/Shanghai',
    rangeStart: `${y}-01-01`,
    rangeEndExclusive: `${y + 1}-01-01`,
    availableYears: [currentYear],
    days: [],
    summary: {
      activeDays: 0,
      longestStreak: 0,
      weekCount: 0,
      weekActiveDays: 0,
      weeklyTarget: Number(accountCalendar?.weeklyActiveTarget || 0),
    },
    includedTypes: [...HEATMAP_ACTIVITY_TYPES],
    countingRules: {
      excludesSeedResources: true,
      preservesDeletedResourceHistory: true,
      todoTimeField: 'completed_at',
      organizeTimeField: 'complete_time',
    },
  };
  // 游客共用 user 表中的一个真实账号 ID，不能只比较字面量 "visitor"，否则会读到该共享账号的历史活动。
  if (isGuest) return base;

  const shiftMinutes = accountCalendar.shiftMinutes;
  const dayStart = `${y}0101`;
  const dayEnd = `${y}1231`;

  // 一次 UNION ALL 归一为 {day, activity_type},按日和来源聚合；不 JOIN 三张资源表(避免多态重复),也不逐日 365 次查询。
  const [rows] = await pool.query(
    `SELECT day, activity_type, COUNT(*) AS cnt FROM (
       SELECT DATE_FORMAT(DATE_ADD(b.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS day, 'bookmark' AS activity_type FROM bookmark b
         WHERE b.user_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
           )
       UNION ALL
       SELECT DATE_FORMAT(DATE_ADD(n.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS day, 'note' AS activity_type FROM note n
         WHERE n.create_by = ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
           )
       UNION ALL
       SELECT DATE_FORMAT(DATE_ADD(f.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS day, 'file' AS activity_type FROM files f
         WHERE f.create_by = ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
               AND osr.resource_id = CAST(f.id AS CHAR)
           )
       UNION ALL
       SELECT DATE_FORMAT(DATE_ADD(td.completed_at, INTERVAL ? MINUTE), '%Y%m%d') AS day, 'todo' AS activity_type
         FROM todo_items td
        WHERE td.user_id = ? AND td.completed_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM growth_events ge
             WHERE ge.user_id = td.user_id AND ge.source = 'todo_complete'
               AND ge.ref_id = SHA2(CONCAT('todo:', CAST(td.id AS CHAR)), 256)
          )
       UNION ALL
       SELECT DATE_FORMAT(DATE_ADD(ge.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS day, 'todo' AS activity_type
         FROM growth_events ge
        WHERE ge.user_id = ? AND ge.source = 'todo_complete' AND ge.status = 'granted'
       UNION ALL
       SELECT DATE_FORMAT(DATE_ADD(ri.complete_time, INTERVAL ? MINUTE), '%Y%m%d') AS day, 'organize' AS activity_type
         FROM resource_inbox ri
        WHERE ri.user_id = ? AND ri.complete_time IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
              AND osr.resource_id = ri.resource_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM growth_events ge
             WHERE ge.user_id = ri.user_id AND ge.source = 'organize_complete'
               AND ge.ref_id = SHA2(CONCAT('organize:', ri.resource_type, ':', ri.resource_id), 256)
          )
       UNION ALL
       SELECT DATE_FORMAT(DATE_ADD(ge.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS day, 'organize' AS activity_type
         FROM growth_events ge
        WHERE ge.user_id = ? AND ge.source = 'organize_complete' AND ge.status = 'granted'
       UNION ALL
       SELECT day, 'checkin' AS activity_type FROM growth_events
         WHERE user_id = ? AND source = 'checkin'
           AND status = 'granted' AND day IS NOT NULL AND day >= ? AND day <= ?
     ) t
     WHERE day >= ? AND day <= ?
     GROUP BY day, activity_type
     ORDER BY day ASC, activity_type ASC`,
    [
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      userId,
      dayStart,
      dayEnd,
      dayStart,
      dayEnd,
    ],
  );

  const activityByDay = new Map();
  for (const row of rows) {
    const key = String(row.day);
    const type = String(row.activity_type || '');
    const count = Number(row.cnt || 0);
    if (!/^\d{8}$/.test(key) || !HEATMAP_ACTIVITY_TYPES.includes(type) || count <= 0) continue;

    let activity = activityByDay.get(key);
    if (!activity) {
      activity = {
        count: 0,
        breakdown: Object.fromEntries(HEATMAP_ACTIVITY_TYPES.map((activityType) => [activityType, 0])),
      };
      activityByDay.set(key, activity);
    }
    activity.count += count;
    activity.breakdown[type] += count;
  }
  const days = Array.from(activityByDay.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, activity]) => ({
      day: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`,
      count: activity.count,
      breakdown: activity.breakdown,
    }));

  const dayKeys = days.map((item) => item.day.replaceAll('-', '')); // 已按 day ASC
  const activeDays = dayKeys.length;
  const longestStreak = longestConsecutiveRun(dayKeys); // 仅当前年份范围内的最长连续
  // 近 7 天只对当前年有语义；浏览历史年时返回 0，前端不展示这个当前态指标。
  const weekKeys = new Set();
  for (let i = 0; i < 7; i++) weekKeys.add(dayKeyAtOffset(now, accountCalendar.utcOffsetMinutes, -i));
  const weekCount =
    y === currentYear
      ? days.reduce((sum, activity) => (weekKeys.has(activity.day.replaceAll('-', '')) ? sum + activity.count : sum), 0)
      : 0;
  const accountDate = new Date(
    Date.UTC(
      Number(currentDayKey.slice(0, 4)),
      Number(currentDayKey.slice(4, 6)) - 1,
      Number(currentDayKey.slice(6, 8)),
    ),
  );
  const accountWeekday = accountDate.getUTCDay() || 7;
  const currentWeekStart = dayKeyAtOffset(now, accountCalendar.utcOffsetMinutes, 1 - accountWeekday);
  const weekActiveDays =
    y === currentYear
      ? dayKeys.filter((key) => key >= currentWeekStart && key <= currentDayKey).length
      : 0;

  // 只提供真实有活动的历史年份，避免把用户带到一串没有意义的空年份；当前年始终可看。
  const [yearRows] = await pool.query(
    `SELECT DISTINCT y FROM (
       SELECT YEAR(DATE_ADD(b.create_time, INTERVAL ? MINUTE)) AS y FROM bookmark b
         WHERE b.user_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
           )
       UNION ALL SELECT YEAR(DATE_ADD(n.create_time, INTERVAL ? MINUTE)) FROM note n
         WHERE n.create_by = ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
           )
       UNION ALL SELECT YEAR(DATE_ADD(f.create_time, INTERVAL ? MINUTE)) FROM files f
         WHERE f.create_by = ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
               AND osr.resource_id = CAST(f.id AS CHAR)
           )
       UNION ALL SELECT CAST(LEFT(day, 4) AS UNSIGNED) FROM growth_events
         WHERE user_id = ? AND source = 'checkin' AND status = 'granted' AND day IS NOT NULL
       UNION ALL SELECT YEAR(DATE_ADD(td.completed_at, INTERVAL ? MINUTE)) FROM todo_items td
         WHERE td.user_id = ? AND td.completed_at IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM growth_events ge
              WHERE ge.user_id = td.user_id AND ge.source = 'todo_complete'
                AND ge.ref_id = SHA2(CONCAT('todo:', CAST(td.id AS CHAR)), 256)
           )
       UNION ALL SELECT YEAR(DATE_ADD(ge.create_time, INTERVAL ? MINUTE)) FROM growth_events ge
         WHERE ge.user_id = ? AND ge.source = 'todo_complete' AND ge.status = 'granted'
       UNION ALL SELECT YEAR(DATE_ADD(ri.complete_time, INTERVAL ? MINUTE)) FROM resource_inbox ri
         WHERE ri.user_id = ? AND ri.complete_time IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
               AND osr.resource_id = ri.resource_id
           )
           AND NOT EXISTS (
             SELECT 1 FROM growth_events ge
              WHERE ge.user_id = ri.user_id AND ge.source = 'organize_complete'
                AND ge.ref_id = SHA2(CONCAT('organize:', ri.resource_type, ':', ri.resource_id), 256)
           )
       UNION ALL SELECT YEAR(DATE_ADD(ge.create_time, INTERVAL ? MINUTE)) FROM growth_events ge
         WHERE ge.user_id = ? AND ge.source = 'organize_complete' AND ge.status = 'granted'
     ) activity_years
     WHERE y BETWEEN ? AND ?
     ORDER BY y DESC`,
    [
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      userId,
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      shiftMinutes,
      userId,
      2000,
      currentYear,
    ],
  );
  const availableYears = Array.from(
    new Set(
      [currentYear, ...yearRows.map((row) => Number(row.y))].filter(
        (item) => Number.isInteger(item) && item >= 2000 && item <= currentYear,
      ),
    ),
  ).sort((a, b) => b - a);

  return {
    year: y,
    timezone: accountCalendar.timezone,
    rangeStart: `${y}-01-01`,
    rangeEndExclusive: `${y + 1}-01-01`,
    availableYears,
    days,
    summary: {
      activeDays,
      longestStreak,
      weekCount,
      weekActiveDays,
      weeklyTarget: Number(accountCalendar.weeklyActiveTarget || 0),
    },
    includedTypes: [...HEATMAP_ACTIVITY_TYPES],
    countingRules: base.countingRules,
  };
}

/**
 * 成长看板聚合:统计 + 成就(解锁/进度) + 今日任务 + 近期时间线。
 * 游客返回全零/全未解锁(仍可展示"待收集"引导)。root 统计真实、等级满级。
 */
export async function getGrowthDashboard(userId, { userRole = null, db = pool, calendar = null } = {}) {
  const isGuest = isVisitorGrowthActor(userId, userRole);
  const accountCalendar = calendar || (!isGuest ? await getGrowthCalendarContext(userId, { db }) : null);
  const effectiveDayKey = accountCalendar?.dayKey || dayKey();
  const growth = await getGrowth(userId, { userRole, db, calendar: accountCalendar });

  const stats = {
    joinDays: 0,
    currentStreak: growth.streak || 0,
    maxStreak: 0,
    totalCheckins: 0,
    bookmarkCount: 0,
    noteCount: 0,
    fileCount: 0,
    tagCount: 0,
    completedTodoCount: 0,
    organizedResourceCount: 0,
    pendingResourceCount: 0,
    weekExp: 0,
    checkinDays: [],
  };
  let timeline = [];

  if (!isGuest) {
    // 资源计数 + 注册时间(合并成一条查询)。
    // 注册时间兜底:部分早期/root 账号 user.create_time 为 NULL,退而用最早的书签/笔记时间作为"入驻"起点,
    // 避免"陪伴 0 天"。
    const [[row]] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM bookmark b
          WHERE b.user_id = ? AND b.del_flag = 0
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
            )) AS bookmarkCount,
        (SELECT COUNT(*) FROM note n
          WHERE n.create_by = ? AND n.del_flag = 0
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
            )) AS noteCount,
        (SELECT COUNT(*) FROM files f
          WHERE f.create_by = ? AND f.del_flag = 0
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
                AND osr.resource_id = CAST(f.id AS CHAR)
            )) AS fileCount,
        (SELECT COUNT(*) FROM tag t
          WHERE t.user_id = ? AND t.del_flag = 0
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = t.user_id AND osr.resource_type = 'tag' AND osr.resource_id = t.id
            )) AS tagCount,
        (SELECT COUNT(*) FROM todo_items td
          WHERE td.user_id = ? AND td.del_flag = 0 AND td.status = 'completed') AS completedTodoCount,
        (SELECT COUNT(*) FROM resource_inbox ri
          WHERE ri.user_id = ? AND ri.status = 'completed'
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
                AND osr.resource_id = ri.resource_id
            )) AS organizedResourceCount,
        (SELECT COUNT(*) FROM resource_inbox ri
          WHERE ri.user_id = ? AND ri.status = 'pending'
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
                AND osr.resource_id = ri.resource_id
            )) AS pendingResourceCount,
        (SELECT create_time FROM user WHERE id = ?) AS createTime,
        (SELECT MIN(b.create_time) FROM bookmark b
          WHERE b.user_id = ? AND b.del_flag = 0
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
            )) AS firstBookmark,
        (SELECT MIN(n.create_time) FROM note n
          WHERE n.create_by = ? AND n.del_flag = 0
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
            )) AS firstNote`,
      [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId],
    );
    stats.bookmarkCount = Number(row.bookmarkCount || 0);
    stats.noteCount = Number(row.noteCount || 0);
    stats.fileCount = Number(row.fileCount || 0);
    stats.tagCount = Number(row.tagCount || 0);
    stats.completedTodoCount = Number(row.completedTodoCount || 0);
    stats.organizedResourceCount = Number(row.organizedResourceCount || 0);
    stats.pendingResourceCount = Number(row.pendingResourceCount || 0);
    const joinTimes = [row.createTime, row.firstBookmark, row.firstNote]
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .filter((n) => !Number.isNaN(n));
    if (joinTimes.length) {
      const earliest = Math.min(...joinTimes);
      // 按账号时区的自然日计（注册当天=第 1 天），避免服务器与账号跨日时陪伴天数/成就提前或延后。
      const joinedDayKey = dayKeyAtOffset(new Date(earliest), accountCalendar?.utcOffsetMinutes);
      stats.joinDays = Math.max(1, daysBetween(effectiveDayKey, joinedDayKey) + 1);
    }

    // 签到天集合 → 累计签到 + 最长连签(从账本派生,无需新列)
    const [ckRows] = await db.query(
      `SELECT DISTINCT day FROM growth_events
       WHERE user_id = ? AND source = 'checkin' AND day IS NOT NULL
       ORDER BY day ASC`,
      [userId],
    );
    const days = ckRows.map((r) => String(r.day)).filter((d) => d && d !== 'null');
    // 累计签到与最长连签至少不小于当前连签(root 免账本、无 checkin 事件,靠 streak 保证口径自洽)
    stats.totalCheckins = Math.max(days.length, stats.currentStreak);
    stats.maxStreak = Math.max(longestConsecutiveRun(days), stats.currentStreak);
    stats.checkinDays = days; // 签到日期(YYYYMMDD)数组,供前端签到日历高亮

    // 近 7 天获得经验
    const [[wk]] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM growth_events
       WHERE user_id = ? AND status = 'granted' AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [userId],
    );
    stats.weekExp = Number(wk.s || 0);

    // 成长足迹:从真实活动派生(书签/笔记/文件 + 升级里程碑),合并按时间倒序取 15。
    // 不再只读 growth_events —— root/免账本用户没有账本记录,否则足迹恒空(用户反馈)。
    const [[bmRows], [ntRows], [flRows], [msRows]] = await Promise.all([
      db.query(
        `SELECT b.name, b.create_time FROM bookmark b
         WHERE b.user_id = ? AND b.del_flag = 0
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
           )
         ORDER BY b.create_time DESC LIMIT 12`,
        [userId],
      ),
      db.query(
        `SELECT n.title, n.create_time FROM note n
         WHERE n.create_by = ? AND n.del_flag = 0
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
           )
         ORDER BY n.create_time DESC LIMIT 12`,
        [userId],
      ),
      db.query(
        `SELECT f.file_name, f.create_time FROM files f
         WHERE f.create_by = ? AND f.del_flag = 0
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
               AND osr.resource_id = CAST(f.id AS CHAR)
           )
         ORDER BY f.create_time DESC LIMIT 12`,
        [userId],
      ),
      db.query(
        "SELECT meta, create_time FROM growth_events WHERE user_id = ? AND source = 'milestone' ORDER BY create_time DESC LIMIT 12",
        [userId],
      ),
    ]);
    timeline = [
      ...bmRows.map((r) => ({ source: 'bookmark', name: r.name, meta: null, time: r.create_time })),
      ...ntRows.map((r) => ({ source: 'note', name: r.title, meta: null, time: r.create_time })),
      ...flRows.map((r) => ({ source: 'file', name: r.file_name, meta: null, time: r.create_time })),
      ...msRows.map((r) => ({ source: 'milestone', name: null, meta: safeParseMeta(r.meta), time: r.create_time })),
    ]
      .filter((x) => x.time)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 15)
      .map((x) => ({ source: x.source, name: x.name || null, amount: 0, meta: x.meta, time: x.time }));
  }

  // 成就进度:统一用 stats + 当前等级派生(root 等级=满级,资源统计真实)
  // 永久解锁模型(业界惯例):一旦达标即永久解锁,此后删内容让指标回落也【不退回未解锁、不重复置灰/高亮】。
  // 永久状态来自独立表；GET 只做读取与当前进度派生，不再在请求过程中补写账本。
  const achievementState = new Map();
  if (!isGuest) {
    const [cRows] = await db.query(
      `SELECT achievement_key AS achievementKey, unlocked_at AS unlockedAt, claimed_at AS claimedAt
       FROM user_achievements WHERE user_id = ?`,
      [userId],
    );
    for (const row of cRows) achievementState.set(row.achievementKey, row);
  }
  const metrics = { ...stats, level: growth.level };
  const achievements = ACHIEVEMENTS.map((a) => {
    const cur = Number(metrics[a.metric] || 0);
    const minLevel = Math.max(0, Number(a.minLevel || 0));
    const currentLevel = Number(growth.level || 0);
    const rewardFrame = getAchievementFrameByKey(a.key);
    const state = achievementState.get(a.key);
    const claimed = Boolean(state?.claimedAt);
    // 已写入的永久状态优先；尚未入表但当前达标仍可展示和领取，领取事务会固化状态。
    const everUnlocked = Boolean(state?.unlockedAt);
    const requirementsMet = meetsAchievementRequirement(a, metrics);
    const unlocked = everUnlocked || requirementsMet;
    return {
      key: a.key,
      group: a.group,
      target: a.target,
      cur,
      minLevel,
      currentLevel,
      unlocked,
      reward: a.reward, // 解锁后可领的积分
      frameId: rewardFrame?.id || null, // 可选头像框奖励；领取时与积分在同一事务发放
      claimed, // 是否已领取奖励
      claimable: unlocked && !claimed, // 可领取(已解锁且未领)
      unlockedAt: state?.unlockedAt || null,
      claimedAt: state?.claimedAt || null,
    };
  });
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const claimableCount = achievements.filter((a) => a.claimable).length; // 待领取数(前端红点/汇总)

  // 每日三任务：签到、创建任一内容、按用户+日期稳定抽取的一项随机任务。
  // 随机项不依赖完成后的可选集合，因此同一天刷新、跨 PC/移动端都不会换题。
  const expGranted = userRole !== 'root';
  const { quests, completedCount } = await getDailyQuestState(userId, growth, {
    isGuest,
    db,
    calendar: accountCalendar,
  });
  let legacyClaimed = false;
  let claimedRefs = new Set();
  if (!isGuest) {
    const [rows] = await db.query(
      `SELECT ref FROM points_log
       WHERE user_id = ? AND reason = 'quest' AND ref IN (?, ?, ?)`,
      [userId, effectiveDayKey, `${effectiveDayKey}:2`, `${effectiveDayKey}:3`],
    );
    claimedRefs = new Set(rows.map((row) => String(row.ref)));
    legacyClaimed = claimedRefs.has(effectiveDayKey);
  }
  const stages = DAILY_QUEST_STAGES.map((stage) => {
    const ref = `${effectiveDayKey}:${stage.required}`;
    const claimed = legacyClaimed || claimedRefs.has(ref);
    return {
      key: stage.key,
      required: stage.required,
      exp: expGranted ? stage.exp : 0,
      points: stage.points,
      claimed,
      claimable: completedCount >= stage.required && !claimed,
    };
  });
  const questBonus = {
    exp: expGranted ? DAILY_QUEST_STAGES.reduce((sum, stage) => sum + stage.exp, 0) : 0,
    points: DAILY_QUEST_STAGES.reduce((sum, stage) => sum + stage.points, 0),
    claimed: stages.every((stage) => stage.claimed),
    claimable: stages.some((stage) => stage.claimable),
    completedCount,
    total: quests.length,
    stages,
  };

  // 连签里程碑阶梯(静态奖励表 + 按当前连签标注是否达成),供成长页展示「坚持到 X 天可得 Y」
  const curStreak = Number(growth.streak || 0);
  const streakMilestones = STREAK_MILESTONES.map((m) => ({
    days: m.days,
    points: m.points,
    storageMb: m.storageMb || 0,
    cards: m.cards || 0,
    reached: curStreak >= m.days,
  }));

  return {
    stats,
    achievements,
    unlockedCount,
    claimableCount,
    totalAchievements: ACHIEVEMENTS.length,
    quests,
    questBonus,
    timeline,
    streakMilestones,
    currentStreak: curStreak,
  };
}

/**
 * 领取今日任务的所有可领阶段奖励；每阶段独立幂等。
 * 后端二次核算任务完成状态,防前端伪造;游客不发。
 * 满级(含 root)照发积分；root 不写经验账本。
 */
export async function claimDailyQuestBonus(userId, { userRole = null, calendar = null } = {}) {
  if (isVisitorGrowthActor(userId, userRole)) return { ok: false, reason: 'visitor' };
  const accountCalendar = calendar || (await getGrowthCalendarContext(userId));
  const g = await getGrowth(userId, { userRole, calendar: accountCalendar });
  // 与 getGrowthDashboard 同一判定:root 的经验不入账,考核项和幂等来源都要跟着变
  const expGranted = userRole !== 'root';

  const today = accountCalendar.dayKey;
  const { completedCount } = await getDailyQuestState(userId, g, { calendar: accountCalendar });
  if (completedCount < DAILY_QUEST_STAGES[0].required) return { ok: false, reason: 'incomplete' };
  const [[legacy]] = await pool.query(
    "SELECT COUNT(*) AS c FROM points_log WHERE user_id = ? AND reason = 'quest' AND ref = ?",
    [userId, today],
  );
  if (Number(legacy?.c || 0) > 0) {
    return { ok: true, already: true, growth: await getGrowth(userId, { userRole, calendar: accountCalendar }) };
  }

  let expGained = 0;
  let pointsEarned = 0;
  let eligibleCount = 0;
  let duplicateCount = 0;
  let leveledUp = false;
  for (const stage of DAILY_QUEST_STAGES.filter((item) => completedCount >= item.required)) {
    eligibleCount++;
    const ref = `${today}:${stage.required}`;
    const grant = expGranted
      ? await grantExp(userId, stage.source, { day: today, amount: stage.exp, userRole, calendar: accountCalendar })
      : { granted: 0, duplicated: false };
    const gotPoints = await earnPoints(userId, stage.points, 'quest', ref);
    // root 不写经验账本，积分流水就是唯一的阶段幂等事实源。
    if (!gotPoints && (!expGranted || grant.duplicated)) duplicateCount++;
    expGained += Number(grant.granted || 0);
    if (gotPoints) pointsEarned += stage.points;
    leveledUp ||= Boolean(grant.leveledUp);
  }
  if (eligibleCount > 0 && duplicateCount === eligibleCount) {
    return { ok: true, already: true, growth: await getGrowth(userId, { userRole, calendar: accountCalendar }) };
  }
  return {
    ok: true,
    expGained,
    pointsEarned,
    // capped 专指「今日经验已达上限被截断」;root 本就不发经验,不能让前端误报成撞了日顶
    capped: expGranted && expGained === 0,
    leveledUp,
    growth: await getGrowth(userId, { userRole, calendar: accountCalendar }),
  };
}

/**
 * 用户当前等级对应的云空间配额(MB)。root=满级;无成长账本(新用户)=Lv1。
 * 供文件上传配额校验按等级下发,替代原先"非 root 一律 500MB"。
 */
// 领取单个成就奖励：已解锁且未领 → 在同一事务发积分与可选头像框。
// points_log(reason='achievement', ref=key) 仍是幂等领取事实源；头像框使用 user_cosmetics 主键兜底去重。
export async function claimAchievement(userId, key, { userRole = null, dashboard = null } = {}) {
  if (isVisitorGrowthActor(userId, userRole)) return { ok: false, reason: 'visitor' };
  const ach = ACHIEVEMENTS.find((a) => a.key === key);
  if (!ach) return { ok: false, reason: 'not_found', msg: '成就不存在' };
  // 复用看板派生的解锁判定(单一事实源),避免重复实现各 metric 的统计口径;
  // claimAll 场景可传入已算好的 dashboard,免得每领一个成就重跑一遍完整聚合(N+1)
  const dash = dashboard || (await getGrowthDashboard(userId, { userRole }));
  const a = dash.achievements.find((x) => x.key === key);
  if (!a || !a.unlocked) return { ok: false, reason: 'locked', msg: '成就尚未解锁' };
  const rewardFrame = getAchievementFrameByKey(key);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const got = await earnPoints(userId, ach.reward, 'achievement', key, conn);
    if (!got) {
      await conn.rollback();
      return { ok: false, reason: 'claimed', msg: '该成就奖励已领取' };
    }
    if (rewardFrame) {
      await conn.query('INSERT IGNORE INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)', [
        userId,
        rewardFrame.id,
      ]);
    }
    await conn.commit();
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // 回滚失败仅保留原始错误，由上层统一记录稳定错误信息。
    }
    throw error;
  } finally {
    conn.release();
  }
  return {
    ok: true,
    key,
    reward: ach.reward,
    frameId: rewardFrame?.id || null,
    growth: await getGrowth(userId, { userRole }),
  };
}

export async function getUserSpaceMb(userId, userRole = null) {
  // root 视为满级;积分兑换的永久扩容对所有人(含 root)叠加
  let bonus = 0;
  let exp = 0;
  if (!isVisitorGrowthActor(userId, userRole)) {
    const [rows] = await pool.query('SELECT exp, storage_bonus_mb FROM user_growth WHERE user_id = ?', [userId]);
    if (rows[0]) {
      exp = Number(rows[0].exp || 0);
      bonus = Number(rows[0].storage_bonus_mb || 0);
    }
  }
  const base = userRole === 'root' ? RANKS[MAX_LEVEL - 1].spaceMb : rankOf(levelForExp(exp)).spaceMb;
  return base + bonus;
}

// 每日成长提醒(定时任务):把成长价值主动推到通知中心,驱动回访。
// 只做「连签将断」——高价值(守住习惯)、非骚扰(仅昨天签过、今天未签、连签≥3 的用户)、单查询低成本;
// 免费抽/成就待领等靠站内徽章提示,不在此每日推送以免刷屏。按 (user, type, 当天) 幂等。
export async function generateGrowthNudges() {
  try {
    const yesterday = dayKey(new Date(Date.now() - 86_400_000));
    const today = dayKey();
    const [risk] = await pool.query(
      `SELECT ug.user_id, ug.streak, u.preferences FROM user_growth ug
         JOIN user u ON u.id = ug.user_id
         LEFT JOIN user_growth_preferences ugp ON BINARY ugp.user_id = BINARY ug.user_id
        WHERE ug.last_checkin_date = ? AND ug.streak >= 3 AND ug.last_checkin_date <> ?
          AND COALESCE(ugp.streak_reminder_enabled, 1) = 1`,
      [yesterday, today],
    );
    let sent = 0;
    for (const u of risk) {
      // 尊重通知偏好:设置里关闭「连签将断提醒」的用户跳过(preferences.notifyStreakRisk === false)
      try {
        const p = JSON.parse(u.preferences || '{}');
        if (p.notifyStreakRisk === false) continue;
      } catch {
        /* 偏好解析失败按默认(发送)处理 */
      }
      const [ex] = await pool.query(
        "SELECT 1 FROM notification WHERE user_id = ? AND type = 'streak_risk' AND create_time >= CURDATE() LIMIT 1",
        [u.user_id],
      );
      if (ex.length) continue;
      await createNotification(u.user_id, {
        type: 'streak_risk',
        title: `连签 ${u.streak} 天,别断啦!`,
        content: '今天还没签到,来保住你的连续签到吧~',
        link: '/growth',
      }).catch((e) => console.warn('[growth] 连签提醒发送失败 code=%s', stableAgentErrorCode(e)));
      sent++;
    }
    console.log(`[成长提醒] 连签将断候选 ${risk.length} 人,新发提醒 ${sent} 条`);
  } catch (e) {
    console.warn('[成长提醒] 生成失败 code=%s', stableAgentErrorCode(e));
  }
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
export async function checkin(userId, { userRole = null, calendar = null } = {}) {
  if (isVisitorGrowthActor(userId, userRole)) return { ok: false, reason: 'visitor' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const accountCalendar = calendar || (await getGrowthCalendarContext(userId, { db: conn }));
    const today = accountCalendar.dayKey;
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
      const growth = await getGrowth(userId, { userRole, db: conn, calendar: accountCalendar });
      await conn.commit();
      return { ok: true, already: true, growth };
    }

    let streak;
    if (!g.last_checkin_date) streak = 1;
    else {
      const gap = daysBetween(today, g.last_checkin_date);
      streak = gap === 1 ? Number(g.streak) + 1 : 1; // 连签+1 / 断签(gap>1)重置为1(今天重新开始);昨天漏签可用补签卡接回真实连续
    }
    const amount = CHECKIN_BASE + checkinBonus(streak); // 5 + min(streak,5),单日 ≤10

    await conn.query('UPDATE user_growth SET streak = ?, last_checkin_date = ? WHERE user_id = ?', [
      streak,
      today,
      userId,
    ]);
    // 连签满 7 天奖励 1 张补签卡(上限 2),统一走 grantItem
    if (streak > 0 && streak % 7 === 0) {
      await grantItem(conn, userId, 'makeup_card', 1);
    }
    const grant = await grantExp(
      userId,
      'checkin',
      { day: today, amount, meta: { streak }, userRole, calendar: accountCalendar },
      conn,
    );
    // root 不经 grantExp 写入 events(第 94 行对 root return),手动记一条签到事件供日历/统计/成就使用
    if (userRole === 'root' && grant.skipped === 'root') {
      await conn.query(
        `INSERT IGNORE INTO growth_events (user_id, source, ref_id, day, amount, status, meta)
         VALUES (?, 'checkin', NULL, ?, 0, 'granted', ?)`,
        [userId, today, JSON.stringify({ streak })],
      );
    }
    // 签到额外发积分(消费货币):基础 20 + 连签加成(≤10),按天幂等,与 EXP 同事务落库
    const checkinPoints = 20 + Math.min(streak, 10);
    const gotCheckinPoints = await earnPoints(userId, checkinPoints, 'checkin', today, conn);

    // 连签里程碑大奖:命中当天(streak 恰好==里程碑天数)发积分/存储/卡,按 ref=days 一次性幂等
    let milestone = null;
    const ms = STREAK_MILESTONES.find((m) => m.days === streak);
    if (ms) {
      const firstHit = await earnPoints(userId, ms.points, 'streak_milestone', String(ms.days), conn);
      if (firstHit) {
        if (ms.storageMb) await earnStorage(userId, ms.storageMb, 'streak_milestone', String(ms.days), conn);
        if (ms.cards) {
          await grantItem(conn, userId, 'makeup_card', ms.cards);
        }
        milestone = { days: ms.days, points: ms.points, storageMb: ms.storageMb || 0, cards: ms.cards || 0 };
      }
    }
    try {
      const [[checkinRow]] = await conn.query(
        "SELECT COUNT(DISTINCT day) AS total FROM growth_events WHERE user_id = ? AND source = 'checkin' AND status = 'granted'",
        [userId],
      );
      const { persistAchievementUnlocksForMetrics } = await import('./growthAchievementState.js');
      await persistAchievementUnlocksForMetrics(
        userId,
        { maxStreak: streak, totalCheckins: Number(checkinRow?.total || 0) },
        { db: conn },
      );
    } catch (error) {
      console.warn('[growth] 签到成就状态同步失败 code=%s', stableAgentErrorCode(error));
    }
    const growth = await getGrowth(userId, { userRole, db: conn, calendar: accountCalendar });
    await conn.commit();

    return {
      ok: true,
      already: false,
      streak,
      expGained: grant.granted || 0,
      pointsEarned: gotCheckinPoints ? checkinPoints : 0,
      milestone, // 命中连签里程碑时的大奖详情(供前端庆祝),否则 null
      leveledUp: !!grant.leveledUp,
      growth,
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

// 使用补签卡:可补今天之前最近 3 个自然日的任一漏签，补签到记录和连签，不发经验/积分/里程碑奖励。
export async function useProtectCard(userId, { userRole = null, date = null, calendar = null } = {}) {
  if (isVisitorGrowthActor(userId, userRole)) return { ok: false, reason: 'visitor' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const accountCalendar = calendar || (await getGrowthCalendarContext(userId, { db: conn }));
    // 未传日期时兼容旧客户端，默认仍尝试补昨天；新版前端会明确传入用户选择的日期。
    const makeupDate = date || accountCalendar.makeupDays[0];
    if (!dateFromDayKey(makeupDate) || !accountCalendar.makeupDays.includes(makeupDate)) {
      await conn.rollback();
      return { ok: false, reason: 'outside_window' };
    }
    const [rows] = await conn.query(
      'SELECT streak, last_checkin_date, streak_protect_cards FROM user_growth WHERE user_id = ? FOR UPDATE',
      [userId],
    );
    const g = rows[0];
    if (!g || Number(g.streak_protect_cards) < 1) {
      await conn.rollback();
      return { ok: false, reason: 'no_card' };
    }
    // 目标日已有签到记录时无需补；唯一索引也作为并发兜底。
    const [[targetRow]] = await conn.query(
      "SELECT COUNT(*) AS c FROM growth_events WHERE user_id=? AND source='checkin' AND day=? AND status='granted'",
      [userId, makeupDate],
    );
    if (Number(targetRow?.c || 0) > 0) {
      await conn.rollback();
      return { ok: false, reason: 'already_checked' };
    }
    // 最近签到日只能向前推进，不能因补更早的日期被回拨。
    const lastCheckin = !g.last_checkin_date || makeupDate > g.last_checkin_date ? makeupDate : g.last_checkin_date;
    await conn.query(
      'UPDATE user_growth SET last_checkin_date = ?, streak_protect_cards = streak_protect_cards - 1 WHERE user_id = ?',
      [lastCheckin, userId],
    );
    // 补一条目标日的签到账本（amount=0，不发经验/积分/里程碑奖励）。
    await conn.query(
      `INSERT IGNORE INTO growth_events (user_id, source, ref_id, day, amount, status, meta)
       VALUES (?, 'checkin', NULL, ?, 0, 'granted', ?)`,
      [userId, makeupDate, JSON.stringify({ protectCard: true })],
    );
    // 重新计算连签:从最近一次实际签到日往前数。未签到今天时不能从今天起算，否则补昨天后会错误归零。
    const [events] = await conn.query(
      "SELECT day FROM growth_events WHERE user_id=? AND source='checkin' AND status='granted' ORDER BY day DESC",
      [userId],
    );
    const daySet = new Set((events || []).map((row) => row.day));
    const correctedStreak = countStreakEndingAt(daySet, events[0]?.day || null);
    await conn.query('UPDATE user_growth SET streak = ? WHERE user_id = ?', [correctedStreak, userId]);
    const growth = await getGrowth(userId, { userRole, db: conn, calendar: accountCalendar });
    await conn.commit();
    return { ok: true, date: makeupDate, streak: correctedStreak, growth };
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

// 管理员运营:直接调整目标用户成长(发/扣经验、设等级、增减补签卡)。
// root 专用,绕过日顶与账本;升级时仅补发最终等级通知，不额外补等级卡或里程碑奖励。
export async function adminAdjustGrowth(
  userId,
  { expDelta = 0, setLevel = null, cardDelta = 0 } = {},
  { actionContext = null } = {},
) {
  if (!userId || userId === 'visitor') return { ok: false, reason: 'no_user' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT exp, streak_protect_cards FROM user_growth WHERE user_id = ? FOR UPDATE', [
      userId,
    ]);
    let g = rows[0];
    if (!g) {
      await conn.query('INSERT INTO user_growth (user_id) VALUES (?)', [userId]);
      g = { exp: 0, streak_protect_cards: 0 };
    }
    let exp = Number(g.exp || 0);
    let cards = Number(g.streak_protect_cards || 0);
    const fromLevel = levelForExp(exp);
    if (setLevel != null && setLevel !== '') {
      const lv = Math.max(1, Math.min(MAX_LEVEL, Number(setLevel)));
      exp = RANKS[lv - 1].cumExp; // 设到该等级的起始经验
    } else if (expDelta) {
      exp = Math.max(0, exp + Number(expDelta)); // 发/扣经验(不低于 0)
    }
    if (cardDelta) cards = Math.max(0, Math.min(99, cards + Number(cardDelta)));
    const level = levelForExp(exp);
    await conn.query('UPDATE user_growth SET exp = ?, level = ?, streak_protect_cards = ? WHERE user_id = ?', [
      exp,
      level,
      cards,
      userId,
    ]);
    if (level > fromLevel && (await isLevelUpNotificationEnabled(conn, userId))) {
      await writeLevelUpNotification(conn, userId, level, { source: 'admin_adjust' });
    }
    const receipt = actionContext
      ? await finishAdminAction(actionContext, {
          outcome: 'succeeded',
          metadata: {
            expDelta: Number(expDelta || 0),
            setLevel: setLevel == null || setLevel === '' ? null : Number(setLevel),
            cardsDelta: Number(cardDelta || 0),
            resultingExp: exp,
            resultingLevel: level,
            resultingCards: cards,
          },
          db: conn,
        })
      : {};
    await conn.commit();
    return { ok: true, exp, level, name: rankOf(level).name, cards, leveledUp: level > fromLevel, ...receipt };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (actionContext) throw e;
    return { ok: false, reason: 'GROWTH_ADJUST_FAILED' };
  } finally {
    conn.release();
  }
}
