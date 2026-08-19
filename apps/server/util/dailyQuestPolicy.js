import crypto from 'crypto';

/**
 * C6 每日任务目录。只保留无需前置库存、可立即开始的具体行动，避免用户为了
 * 解锁“完成/整理”任务先制造一次性数据。目录在策略版本内保持不可变。
 */
export const C6_DAILY_QUESTS = Object.freeze([
  Object.freeze({ key: 'daily_bookmark', kind: 'bookmark' }),
  Object.freeze({ key: 'daily_note', kind: 'note' }),
  Object.freeze({ key: 'daily_file', kind: 'file' }),
  Object.freeze({ key: 'daily_todo_create', kind: 'todo_create' }),
]);
export const C6_DAILY_QUEST_KINDS = Object.freeze(C6_DAILY_QUESTS.map((quest) => quest.kind));

const LEGACY_DAILY_QUEST_KEYS = Object.freeze([
  'daily_note',
  'daily_bookmark',
  'daily_file',
  'daily_todo',
  'daily_organize',
]);

function safeDayOrdinal(dayKey) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(dayKey || '').trim());
  if (!match) throw new Error('INVALID_DAILY_QUEST_DAY');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('INVALID_DAILY_QUEST_DAY');
  }
  return Math.floor(timestamp / 86_400_000);
}

function stableNumber(seed) {
  return crypto.createHash('sha256').update(seed).digest().readUInt32BE(0);
}

function stableShuffle(items, seed) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = stableNumber(`${seed}\0${index}`) % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/**
 * 同一账号每天得到唯一可重算的任务组合：刷新、换端、重启都不换题。
 * 四个候选任务两两组合形成 6 日洗牌周期，周期内组合不重复。不同账号使用
 * 不同组合顺序与周期偏移；同一天的两项任务始终不同。
 */
export function selectC6DailyQuests(userId, dayKey) {
  const actor = String(userId || 'visitor');
  const ordinal = safeDayOrdinal(dayKey);
  const combinations = C6_DAILY_QUESTS.flatMap((quest, index) =>
    C6_DAILY_QUESTS.slice(index + 1).map((other) => Object.freeze([quest, other])),
  );
  const ordered = stableShuffle(combinations, `growth-daily-c6\0${actor}\0combinations`);
  const cycleSize = ordered.length;
  const offset = stableNumber(`growth-daily-c6\0${actor}\0offset`) % cycleSize;
  const position = (((ordinal + offset) % cycleSize) + cycleSize) % cycleSize;
  return ordered[position];
}

/** 保留 legacy 同账号同日稳定抽取算法，避免兼容期任务漂移。 */
export function selectLegacyDailyQuestKey(userId, dayKey) {
  const digest = crypto
    .createHash('sha256')
    .update(`growth-daily-v1\0${userId || 'visitor'}\0${dayKey}`)
    .digest();
  return LEGACY_DAILY_QUEST_KEYS[digest.readUInt32BE(0) % LEGACY_DAILY_QUEST_KEYS.length];
}
