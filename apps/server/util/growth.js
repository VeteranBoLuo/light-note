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
import { earnPoints, earnStorage, titleName } from './points.js';
import { grantItem } from './items.js';
import { createNotification } from './notification.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

// 15 级段位表:cumExp=升到该级的累计经验阈值;spaceMb/aiTokenDaily=该级权益。
// 容量曲线(方案A,前期平缓、后期陡增,凸显高等级价值):Lv1 0.5G → Lv10 5G → Lv15 20G,
// 11 级起明显加速(5→7→9→12→16→20G)。数值 = 展示 GB×1024 取整;后端按 level 下发真实配额。
export const RANKS = [
  { level: 1, name: '蒙童', cumExp: 0, spaceMb: 512, aiTokenDaily: 250_000, trashDays: 30 },
  { level: 2, name: '书生', cumExp: 500, spaceMb: 768, aiTokenDaily: 300_000, trashDays: 30 },
  { level: 3, name: '秀才', cumExp: 1000, spaceMb: 1024, aiTokenDaily: 380_000, trashDays: 30 },
  { level: 4, name: '举人', cumExp: 1700, spaceMb: 1536, aiTokenDaily: 450_000, trashDays: 30 },
  { level: 5, name: '贡士', cumExp: 2700, spaceMb: 2048, aiTokenDaily: 550_000, trashDays: 60 },
  { level: 6, name: '进士', cumExp: 4000, spaceMb: 2560, aiTokenDaily: 650_000, trashDays: 60 },
  { level: 7, name: '探花', cumExp: 5800, spaceMb: 3072, aiTokenDaily: 750_000, trashDays: 60 },
  { level: 8, name: '榜眼', cumExp: 8000, spaceMb: 3584, aiTokenDaily: 880_000, trashDays: 60 },
  { level: 9, name: '状元', cumExp: 10800, spaceMb: 4352, aiTokenDaily: 1_000_000, trashDays: 60 },
  { level: 10, name: '翰林', cumExp: 14500, spaceMb: 5120, aiTokenDaily: 1_150_000, trashDays: 180 },
  { level: 11, name: '学士', cumExp: 19000, spaceMb: 7168, aiTokenDaily: 1_300_000, trashDays: 180 },
  { level: 12, name: '大学士', cumExp: 25000, spaceMb: 9216, aiTokenDaily: 1_500_000, trashDays: 180 },
  { level: 13, name: '文豪', cumExp: 32000, spaceMb: 12288, aiTokenDaily: 1_650_000, trashDays: 180 },
  { level: 14, name: '文宗', cumExp: 40000, spaceMb: 16384, aiTokenDaily: 1_800_000, trashDays: 180 },
  // 满级 36500 天(100 年)≈ 永久:清理 SQL 用它算出的过期点在 100 年前,永不命中;前端 ≥3650 显示「永久」
  { level: 15, name: '文圣', cumExp: 50000, spaceMb: 20480, aiTokenDaily: 2_000_000, trashDays: 36500 },
];

export const MAX_LEVEL = 15;
export const MAKEUP_WINDOW_DAYS = 3;
const DAILY_EXP_CAP = 200; // 日 EXP 硬顶 —— 唯一不可绕底线(批量导入速通的最后闸)。签到远低于此,为后续创造类预置。
const DAILY_QUEST_BONUS = 15; // 今日任务全部完成的一次性奖励(每日一次;计入并受日顶 200 约束,不超上限)
const DAILY_QUEST_POINTS = 30; // 今日任务全部完成额外发的积分(消费货币,不受经验日顶约束)

// 连签里程碑大奖:累计连续签到命中当天即发(积分/永久存储/补签卡),按 ref=days 一次性幂等。
// 把签到从「+5 经验」升级为值得长期坚持的习惯养成:越久回报越丰厚(存储是最实在的诱惑)。
export const STREAK_MILESTONES = [
  { days: 7, points: 50 },
  { days: 30, points: 300, storageMb: 512, cards: 1 },
  { days: 100, points: 1000, storageMb: 2048 },
  { days: 365, points: 5000, storageMb: 5120 },
];

const CHECKIN_BASE = 5; // 每日签到基础 +5
const HEATMAP_ACTIVITY_TYPES = ['bookmark', 'note', 'file', 'checkin'];

// 游客在 user 表中有固定的共享账号 ID，并不一定等于字面量 "visitor"。
// 所有成长数据都必须以角色为准隔离，避免游客继承共享账号的历史成长/奖励记录。
function isVisitorGrowthActor(userId, userRole = null) {
  return !userId || userId === 'visitor' || userRole === 'visitor';
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
    console.error('写升级通知失败(不影响升级):', notifyErr.message);
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
  const { refId = null, day = null, amount = 0, meta = null, userRole = null } = opts;
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

    // 2. 日 EXP 硬顶:当日已发放合计(含刚插入的 0)→ 截断本次发放量
    // 里程碑/一次性来源豁免日顶(一次性、幂等、非刷点):首次成就、升级里程碑、手动。
    // 日顶只压可重复的日常/创造来源(签到、书签/笔记/文件衰减、批量导入)。
    // profile_done 与 first_own_resource 同属一次性成就(幂等、非刷点),一并豁免日顶,保证必得
    // daily_quest(今日任务奖励)不豁免日顶:与日上限口径一致,达 200/日后不再增发(用户反馈:不应超上限)
    const capExempt =
      source === 'first_own_resource' || source === 'milestone' || source === 'manual' || source === 'profile_done';
    let used = 0;
    if (!capExempt) {
      const [[sumRow]] = await c.query(
        `SELECT COALESCE(SUM(amount), 0) AS used FROM growth_events
         WHERE user_id = ? AND status = 'granted' AND create_time >= CURDATE()`,
        [userId],
      );
      used = Number(sumRow.used || 0);
    }
    const grantAmount = capExempt ? amount : Math.max(0, Math.min(amount, DAILY_EXP_CAP - used));
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
  if (isVisitorGrowthActor(userId, userRole) || userRole === 'root') return { granted: 0, skipped: true };
  if (!refId) return { granted: 0, skipped: 'no-ref' };
  // 首次创建该类资源 +30(一次性成就,uk_resource(user,'first_own_resource',kind) 幂等)
  // await 让首次与衰减顺序到账(awardCreate 整体已在 handler 里 fire-and-forget,不阻塞创建响应)
  await grantExp(userId, 'first_own_resource', { refId: kind, amount: 30, userRole }).catch((e) =>
    console.warn('[growth] 首次资源奖励发放失败 code=%s', stableAgentErrorCode(e)),
  );
  // 当日第 N 条衰减
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c FROM growth_events WHERE user_id=? AND source=? AND status='granted' AND create_time >= CURDATE()`,
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
  const isGuest = isVisitorGrowthActor(userId, userRole);
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
    const [rows] = await pool.query(
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
      const candidates = getMakeupCandidateDays();
      const [checkedRows] = await pool.query(
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
    const [[dRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM growth_events
       WHERE user_id = ? AND status = 'granted' AND create_time >= CURDATE()
         AND source NOT IN ('first_own_resource', 'milestone', 'manual', 'profile_done')`,
      [userId],
    );
    dailyExp = Number(dRow.s || 0);
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
    checkedInToday: lastCheckin === dayKey(),
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
// 全部从既有数据(user_growth / growth_events / 资源表 / user.create_time)派生,
// 不新增表、不改 schema,零风险叠加在现有增长引擎之上。前端按 key 映射图标与 i18n 文案。
// ============================================================================

// 成就定义:阈值单一事实源。group=分类;metric=进度所依据的统计字段;target=解锁阈值;reward=解锁后可领的积分。
// reward 按难度递增:首次类 20;中阶 50~120;高阶 150~250;里程碑级 500~600。领取幂等由 points_log(reason='achievement', ref=key)保证,无需额外表。
export const ACHIEVEMENTS = [
  { key: 'first_checkin', group: 'checkin', metric: 'totalCheckins', target: 1, reward: 20 },
  { key: 'streak_7', group: 'checkin', metric: 'maxStreak', target: 7, reward: 50 },
  { key: 'streak_30', group: 'checkin', metric: 'maxStreak', target: 30, reward: 120 },
  { key: 'checkin_50', group: 'checkin', metric: 'totalCheckins', target: 50, reward: 80 },
  { key: 'checkin_100', group: 'checkin', metric: 'totalCheckins', target: 100, reward: 150 },
  { key: 'first_bookmark', group: 'create', metric: 'bookmarkCount', target: 1, reward: 20 },
  { key: 'bookmark_50', group: 'create', metric: 'bookmarkCount', target: 50, reward: 80 },
  { key: 'bookmark_200', group: 'create', metric: 'bookmarkCount', target: 200, reward: 200 },
  { key: 'first_note', group: 'create', metric: 'noteCount', target: 1, reward: 20 },
  { key: 'note_20', group: 'create', metric: 'noteCount', target: 20, reward: 60 },
  { key: 'note_50', group: 'create', metric: 'noteCount', target: 50, reward: 120 },
  { key: 'first_file', group: 'create', metric: 'fileCount', target: 1, reward: 20 },
  { key: 'level_5', group: 'level', metric: 'level', target: 5, reward: 100 },
  { key: 'level_10', group: 'level', metric: 'level', target: 10, reward: 250 },
  { key: 'level_15', group: 'level', metric: 'level', target: 15, reward: 600 },
  { key: 'join_7', group: 'tenure', metric: 'joinDays', target: 7, reward: 40 },
  { key: 'join_30', group: 'tenure', metric: 'joinDays', target: 30, reward: 100 },
  { key: 'join_100', group: 'tenure', metric: 'joinDays', target: 100, reward: 250 },
  { key: 'join_365', group: 'tenure', metric: 'joinDays', target: 365, reward: 600 },
];

function safeParseMeta(m) {
  if (!m) return null;
  if (typeof m === 'object') return m;
  try {
    return JSON.parse(m);
  } catch {
    return null;
  }
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
 * 知识活动热力图(贡献格子)。数据全部现成、零新表。口径：
 * - 资源新增直接从三张资源表 create_time 读取(归属列不同:bookmark=user_id,note/files=create_by);
 *   软删仍计入其创建当天(不加 del_flag) —— 今天建明天删不该让昨天的格子熄灭。
 * - 签到只从 growth_events 读 source='checkin' 这类"一手且互斥"的活动事件;
 *   绝不直接 COUNT(growth_events) —— 否则 first_own_resource/milestone 等派生奖励会把一次行为放大成多格,
 *   且资源类事件会与上面的资源表重复。amount 可为 0 仍计(触顶/root/补签)。
 * - 自然年边界 [YYYY-01-01, (YYYY+1)-01-01),按服务器本地时区分日(当前为中文用户群,风险可接受);
 *   day/输出统一 YYYY-MM-DD 字符串,前端不再做 Date 解析(避免 toISOString 类偏移)。
 * - 每格同时返回各来源的次数，用于前端解释“这几次活动来自哪里”；总数和明细来自同一条聚合，避免二次查询口径漂移。
 * 性能:个人级数据量小,首期不加缓存;如实测慢再按 EXPLAIN 补复合索引 + 短 TTL 缓存。
 */
export async function getActivityHeatmap(userId, { userRole = null, year = null } = {}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  let y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > currentYear) y = currentYear;

  const base = {
    year: y,
    timezone: 'server-local',
    rangeStart: `${y}-01-01`,
    rangeEndExclusive: `${y + 1}-01-01`,
    availableYears: [currentYear],
    days: [],
    summary: { activeDays: 0, longestStreak: 0, weekCount: 0 },
    includedTypes: [...HEATMAP_ACTIVITY_TYPES],
  };
  // 游客共用 user 表中的一个真实账号 ID，不能只比较字面量 "visitor"，否则会读到该共享账号的历史活动。
  if (isVisitorGrowthActor(userId, userRole)) return base;

  const start = `${y}-01-01 00:00:00`;
  const end = `${y + 1}-01-01 00:00:00`;
  const dayStart = `${y}0101`;
  const dayEnd = `${y}1231`;

  // 一次 UNION ALL 归一为 {day, activity_type},按日和来源聚合；不 JOIN 三张资源表(避免多态重复),也不逐日 365 次查询。
  const [rows] = await pool.query(
    `SELECT day, activity_type, COUNT(*) AS cnt FROM (
       SELECT DATE_FORMAT(b.create_time, '%Y%m%d') AS day, 'bookmark' AS activity_type FROM bookmark b
         WHERE b.user_id = ? AND b.create_time >= ? AND b.create_time < ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
           )
       UNION ALL
       SELECT DATE_FORMAT(n.create_time, '%Y%m%d') AS day, 'note' AS activity_type FROM note n
         WHERE n.create_by = ? AND n.create_time >= ? AND n.create_time < ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
           )
       UNION ALL
       SELECT DATE_FORMAT(f.create_time, '%Y%m%d') AS day, 'file' AS activity_type FROM files f
         WHERE f.create_by = ? AND f.create_time >= ? AND f.create_time < ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
               AND osr.resource_id = CAST(f.id AS CHAR)
           )
       UNION ALL
       SELECT day, 'checkin' AS activity_type FROM growth_events
         WHERE user_id = ? AND source = 'checkin'
           AND status = 'granted' AND day IS NOT NULL AND day >= ? AND day <= ?
     ) t
     GROUP BY day, activity_type
     ORDER BY day ASC, activity_type ASC`,
    [userId, start, end, userId, start, end, userId, start, end, userId, dayStart, dayEnd],
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
  for (let i = 0; i < 7; i++) weekKeys.add(dayKey(addCalendarDays(now, -i)));
  const weekCount =
    y === currentYear
      ? days.reduce((sum, activity) => (weekKeys.has(activity.day.replaceAll('-', '')) ? sum + activity.count : sum), 0)
      : 0;

  // 只提供真实有活动的历史年份，避免把用户带到一串没有意义的空年份；当前年始终可看。
  const [yearRows] = await pool.query(
    `SELECT DISTINCT y FROM (
       SELECT YEAR(b.create_time) AS y FROM bookmark b
         WHERE b.user_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
           )
       UNION ALL SELECT YEAR(n.create_time) FROM note n
         WHERE n.create_by = ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
           )
       UNION ALL SELECT YEAR(f.create_time) FROM files f
         WHERE f.create_by = ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
               AND osr.resource_id = CAST(f.id AS CHAR)
           )
       UNION ALL SELECT CAST(LEFT(day, 4) AS UNSIGNED) FROM growth_events
         WHERE user_id = ? AND source = 'checkin' AND status = 'granted' AND day IS NOT NULL
     ) activity_years
     WHERE y BETWEEN ? AND ?
     ORDER BY y DESC`,
    [userId, userId, userId, userId, 2000, currentYear],
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
    timezone: 'server-local',
    rangeStart: `${y}-01-01`,
    rangeEndExclusive: `${y + 1}-01-01`,
    availableYears,
    days,
    summary: { activeDays, longestStreak, weekCount },
    includedTypes: [...HEATMAP_ACTIVITY_TYPES],
  };
}

/**
 * 成长看板聚合:统计 + 成就(解锁/进度) + 今日任务 + 近期时间线。
 * 游客返回全零/全未解锁(仍可展示"待收集"引导)。root 统计真实、等级满级。
 */
export async function getGrowthDashboard(userId, { userRole = null } = {}) {
  const isGuest = isVisitorGrowthActor(userId, userRole);
  const growth = await getGrowth(userId, { userRole });

  const stats = {
    joinDays: 0,
    currentStreak: growth.streak || 0,
    maxStreak: 0,
    totalCheckins: 0,
    bookmarkCount: 0,
    noteCount: 0,
    fileCount: 0,
    tagCount: 0,
    weekExp: 0,
    checkinDays: [],
  };
  let timeline = [];

  if (!isGuest) {
    // 资源计数 + 注册时间(合并成一条查询)。
    // 注册时间兜底:部分早期/root 账号 user.create_time 为 NULL,退而用最早的书签/笔记时间作为"入驻"起点,
    // 避免"陪伴 0 天"。
    const [[row]] = await pool.query(
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
      [userId, userId, userId, userId, userId, userId, userId],
    );
    stats.bookmarkCount = Number(row.bookmarkCount || 0);
    stats.noteCount = Number(row.noteCount || 0);
    stats.fileCount = Number(row.fileCount || 0);
    stats.tagCount = Number(row.tagCount || 0);
    const joinTimes = [row.createTime, row.firstBookmark, row.firstNote]
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .filter((n) => !Number.isNaN(n));
    if (joinTimes.length) {
      const earliest = Math.min(...joinTimes);
      // 按自然日计(注册当天=第 1 天),与签到口径一致,避免「连签 2 天却陪伴 1 天」的割裂:
      // 旧算法用「经过的整 24 小时数」,昨晚注册今天看还不满 24h 就只算 1 天。
      const startDay = new Date(earliest);
      startDay.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      stats.joinDays = Math.max(1, Math.round((today.getTime() - startDay.getTime()) / 86_400_000) + 1);
    }

    // 签到天集合 → 累计签到 + 最长连签(从账本派生,无需新列)
    const [ckRows] = await pool.query(
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
    const [[wk]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM growth_events
       WHERE user_id = ? AND status = 'granted' AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [userId],
    );
    stats.weekExp = Number(wk.s || 0);

    // 成长足迹:从真实活动派生(书签/笔记/文件 + 升级里程碑),合并按时间倒序取 15。
    // 不再只读 growth_events —— root/免账本用户没有账本记录,否则足迹恒空(用户反馈)。
    const [[bmRows], [ntRows], [flRows], [msRows]] = await Promise.all([
      pool.query(
        `SELECT b.name, b.create_time FROM bookmark b
         WHERE b.user_id = ? AND b.del_flag = 0
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
           )
         ORDER BY b.create_time DESC LIMIT 12`,
        [userId],
      ),
      pool.query(
        `SELECT n.title, n.create_time FROM note n
         WHERE n.create_by = ? AND n.del_flag = 0
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
           )
         ORDER BY n.create_time DESC LIMIT 12`,
        [userId],
      ),
      pool.query(
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
      pool.query(
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
  // 事实源仍用 points_log(无需额外表):reason='achievement'=已领取;reason='ach_unlock'(delta=0)=已解锁的永久标记。
  let claimedKeys = new Set();
  let unlockedKeys = new Set();
  if (!isGuest) {
    const [cRows] = await pool.query(
      "SELECT reason, ref FROM points_log WHERE user_id = ? AND reason IN ('achievement', 'ach_unlock')",
      [userId],
    );
    for (const r of cRows) {
      unlockedKeys.add(r.ref);
      if (r.reason === 'achievement') claimedKeys.add(r.ref);
    }
  }
  const metrics = { ...stats, level: growth.level };
  const newlyUnlocked = []; // 本次读取里首次达标、尚无永久标记的成就 → 待落库固化
  const achievements = ACHIEVEMENTS.map((a) => {
    const cur = Number(metrics[a.metric] || 0);
    const claimed = claimedKeys.has(a.key);
    // 永久解锁 = 已领取 / 有解锁标记 / 或当前刚达标(后者首次出现时落标记固化,之后指标回落也不退回)
    const everUnlocked = claimed || unlockedKeys.has(a.key);
    const unlocked = everUnlocked || cur >= a.target;
    if (!isGuest && !everUnlocked && cur >= a.target) newlyUnlocked.push(a.key);
    return {
      key: a.key,
      group: a.group,
      target: a.target,
      cur,
      unlocked,
      reward: a.reward, // 解锁后可领的积分
      claimed, // 是否已领取奖励
      claimable: unlocked && !claimed, // 可领取(已解锁且未领)
    };
  });
  // 首次达标 → 落一条永久解锁标记(delta=0,不影响积分余额;幂等 INSERT..WHERE NOT EXISTS 防并发重复)。
  // 用户「积分明细」查询会排除 ach_unlock,不污染流水展示。
  for (const key of newlyUnlocked) {
    await pool.query(
      `INSERT INTO points_log (user_id, delta, reason, ref)
       SELECT ?, 0, 'ach_unlock', ? FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM points_log WHERE user_id = ? AND reason = 'ach_unlock' AND ref = ?)`,
      [userId, key, userId, key],
    );
  }
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const claimableCount = achievements.filter((a) => a.claimable).length; // 待领取数(前端红点/汇总)

  // 今日任务(派生):签到 / 记录一条内容 / 今日获得 30 经验。
  // "记录内容"按真实资源当日创建判定(不依赖 growth_events),root 也能完成。
  let createdToday = 0;
  if (!isGuest) {
    const [[c]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM bookmark b
          WHERE b.user_id = ? AND b.del_flag = 0 AND b.create_time >= CURDATE()
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
            )) +
        (SELECT COUNT(*) FROM note n
          WHERE n.create_by = ? AND n.del_flag = 0 AND n.create_time >= CURDATE()
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
            )) +
        (SELECT COUNT(*) FROM files f
          WHERE f.create_by = ? AND f.del_flag = 0 AND f.create_time >= CURDATE()
            AND NOT EXISTS (
              SELECT 1 FROM onboarding_seed_resources osr
              WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
                AND osr.resource_id = CAST(f.id AS CHAR)
            )) AS c`,
      [userId, userId, userId],
    );
    createdToday = Number(c.c || 0);
  }
  const dailyExp = Number(growth.dailyExp || 0);
  const quests = [
    { key: 'checkin', done: !!growth.checkedInToday },
    { key: 'create', done: createdToday > 0 },
    { key: 'exp30', done: dailyExp >= 30, cur: Math.min(dailyExp, 30), target: 30 },
  ];
  // 满级(含 root)不再需要每日经验养成,前端据此隐藏任务卡
  const questsEnabled = !growth.isMax;
  const allQuestsDone = quests.every((q) => q.done);
  let bonusClaimed = false;
  if (!isGuest && questsEnabled) {
    const [[bq]] = await pool.query(
      `SELECT COUNT(*) AS c FROM growth_events WHERE user_id = ? AND source = 'daily_quest' AND day = ? AND status = 'granted'`,
      [userId, dayKey()],
    );
    bonusClaimed = Number(bq.c || 0) > 0;
  }
  // 全部完成 → 可领每日奖励(一次性 EXP,豁免日顶)
  const questBonus = {
    exp: DAILY_QUEST_BONUS,
    claimed: bonusClaimed,
    claimable: questsEnabled && allQuestsDone && !bonusClaimed,
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
    questsEnabled,
    questBonus,
    timeline,
    streakMilestones,
    currentStreak: curStreak,
  };
}

/**
 * 领取今日任务奖励(全部完成后一次性 EXP;每日一次,幂等)。
 * 后端二次核算任务完成状态,防前端伪造;满级/root/游客不发。
 */
export async function claimDailyQuestBonus(userId, { userRole = null } = {}) {
  if (isVisitorGrowthActor(userId, userRole)) return { ok: false, reason: 'visitor' };
  const g = await getGrowth(userId, { userRole });
  if (g.isMax) return { ok: false, reason: 'max' };

  const today = dayKey();
  const [[c]] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM bookmark b
        WHERE b.user_id = ? AND b.del_flag = 0 AND b.create_time >= CURDATE()
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
          )) +
      (SELECT COUNT(*) FROM note n
        WHERE n.create_by = ? AND n.del_flag = 0 AND n.create_time >= CURDATE()
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
          )) +
      (SELECT COUNT(*) FROM files f
        WHERE f.create_by = ? AND f.del_flag = 0 AND f.create_time >= CURDATE()
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
              AND osr.resource_id = CAST(f.id AS CHAR)
          )) AS c`,
    [userId, userId, userId],
  );
  const createdToday = Number(c.c || 0);
  const dailyExp = Number(g.dailyExp || 0);
  const allDone = g.checkedInToday && createdToday > 0 && dailyExp >= 30;
  if (!allDone) return { ok: false, reason: 'incomplete' };

  const grant = await grantExp(userId, 'daily_quest', { day: today, amount: DAILY_QUEST_BONUS, userRole });
  if (grant.duplicated) return { ok: true, already: true, growth: await getGrowth(userId, { userRole }) };
  // 积分与经验独立:即便经验被日顶截断(granted=0),完成任务照样发积分。按天幂等。
  const gotQuestPoints = await earnPoints(userId, DAILY_QUEST_POINTS, 'quest', today);
  // granted 为 0 = 今日经验已达上限被截断(奖励入账为 0,但已标记领取,不重复)
  return {
    ok: true,
    expGained: grant.granted || 0,
    pointsEarned: gotQuestPoints ? DAILY_QUEST_POINTS : 0,
    capped: (grant.granted || 0) === 0,
    leveledUp: !!grant.leveledUp,
    growth: await getGrowth(userId, { userRole }),
  };
}

/**
 * 用户当前等级对应的云空间配额(MB)。root=满级;无成长账本(新用户)=Lv1。
 * 供文件上传配额校验按等级下发,替代原先"非 root 一律 500MB"。
 */
// 领取单个成就奖励:已解锁且未领 → 发积分(幂等,ref=成就 key,与 dashboard.claimed 同源)。
export async function claimAchievement(userId, key, { userRole = null, dashboard = null } = {}) {
  if (isVisitorGrowthActor(userId, userRole)) return { ok: false, reason: 'visitor' };
  const ach = ACHIEVEMENTS.find((a) => a.key === key);
  if (!ach) return { ok: false, reason: 'not_found', msg: '成就不存在' };
  // 复用看板派生的解锁判定(单一事实源),避免重复实现各 metric 的统计口径;
  // claimAll 场景可传入已算好的 dashboard,免得每领一个成就重跑一遍完整聚合(N+1)
  const dash = dashboard || (await getGrowthDashboard(userId, { userRole }));
  const a = dash.achievements.find((x) => x.key === key);
  if (!a || !a.unlocked) return { ok: false, reason: 'locked', msg: '成就尚未解锁' };
  const got = await earnPoints(userId, ach.reward, 'achievement', key);
  if (!got) return { ok: false, reason: 'claimed', msg: '该成就奖励已领取' };
  return { ok: true, key, reward: ach.reward, growth: await getGrowth(userId, { userRole }) };
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
        WHERE ug.last_checkin_date = ? AND ug.streak >= 3 AND ug.last_checkin_date <> ?`,
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
    console.warn('[成长提醒] 生成失败:', e.message);
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
export async function checkin(userId, { userRole = null } = {}) {
  if (isVisitorGrowthActor(userId, userRole)) return { ok: false, reason: 'visitor' };
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
    const grant = await grantExp(userId, 'checkin', { day: today, amount, meta: { streak }, userRole }, conn);
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
    await conn.commit();

    return {
      ok: true,
      already: false,
      streak,
      expGained: grant.granted || 0,
      pointsEarned: gotCheckinPoints ? checkinPoints : 0,
      milestone, // 命中连签里程碑时的大奖详情(供前端庆祝),否则 null
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

// 使用补签卡:可补今天之前最近 3 个自然日的任一漏签，补签到记录和连签，不发经验/积分/里程碑奖励。
export async function useProtectCard(userId, { userRole = null, date = null } = {}) {
  if (isVisitorGrowthActor(userId, userRole)) return { ok: false, reason: 'visitor' };
  // 未传日期时兼容旧客户端，默认仍尝试补昨天；新版前端会明确传入用户选择的日期。
  const makeupDate = date || getMakeupCandidateDays()[0];
  if (!isMakeupCandidateDay(makeupDate)) return { ok: false, reason: 'outside_window' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
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
    await conn.commit();
    return { ok: true, date: makeupDate, streak: correctedStreak, growth: await getGrowth(userId, { userRole }) };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: 'error', error: e.message };
  } finally {
    conn.release();
  }
}

// 管理员运营:直接调整目标用户成长(发/扣经验、设等级、增减补签卡)。
// root 专用,绕过日顶与账本;升级时仅补发最终等级通知，不额外补等级卡或里程碑奖励。
export async function adminAdjustGrowth(userId, { expDelta = 0, setLevel = null, cardDelta = 0 } = {}) {
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
    await conn.commit();
    return { ok: true, exp, level, name: rankOf(level).name, cards, leveledUp: level > fromLevel };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: 'error', error: e.message };
  } finally {
    conn.release();
  }
}
