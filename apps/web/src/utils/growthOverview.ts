import type {
  Achievement,
  GrowthNextAction,
  StreakMilestone,
  TimelineItem,
  WeeklyChallenge,
} from '@/composables/useGrowth';

/**
 * 成长概览的纯展示派生：只整理服务端已返回的事实，不在前端重算奖励或资格。
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** 浏览器本地自然日 YYYYMMDD，与签到日历的“今天”口径一致。 */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** 下一个仍可获得的连签里程碑：每档只发一次，已发放或当前连签已越过的档位都跳过。 */
export function pickNextStreakMilestone(
  milestones: StreakMilestone[] | null | undefined,
  streak: number,
): StreakMilestone | null {
  const current = Math.max(0, Number(streak) || 0);
  return (
    [...(milestones || [])]
      .sort((a, b) => a.days - b.days)
      .find((milestone) => !milestone.granted && milestone.days > current) || null
  );
}

export type WeekStripState = 'checked' | 'makeup' | 'missed' | 'pending' | 'future';

export interface WeekStripDay {
  key: string;
  date: number;
  weekday: number;
  isToday: boolean;
  state: WeekStripState;
}

/**
 * 本周（周日起）签到条。逐日明细为准；只有免账本账号（无明细但今天已签）才按连签天数回推，
 * 与 SigninCalendar 的高亮规则保持一致。未签的过去日期只有在补签窗口内才提示可补，其余保持中性。
 */
export function buildWeekStrip(input: {
  now: Date;
  checkinDays?: string[] | null;
  makeupDays?: string[] | null;
  checkedInToday?: boolean;
  streak?: number;
}): WeekStripDay[] {
  const checked = new Set(input.checkinDays || []);
  const makeup = new Set(input.makeupDays || []);
  const today = new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate());
  const todayKey = localDayKey(today);
  const derivedFromStreak = Boolean(input.checkedInToday) && checked.size === 0;
  const streak = Math.max(1, Number(input.streak) || 1);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = localDayKey(day);
    const offset = Math.round((today.getTime() - day.getTime()) / 86_400_000);
    const isToday = key === todayKey;
    const isChecked =
      checked.has(key) ||
      (isToday && Boolean(input.checkedInToday)) ||
      (derivedFromStreak && offset >= 0 && offset < streak);
    let state: WeekStripState;
    if (isChecked) state = 'checked';
    else if (offset < 0) state = 'future';
    else if (isToday) state = 'pending';
    else state = makeup.has(key) ? 'makeup' : 'missed';
    return { key, date: day.getDate(), weekday: day.getDay(), isToday, state };
  });
}

export interface FootprintEntry {
  source: string;
  name: string | null;
  count: number;
  time: string;
  meta: TimelineItem['meta'];
}

function timelineDayKey(time: string): string {
  const date = new Date(String(time || '').replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(time || '') : localDayKey(date);
}

/** 同一天连续的同类新建记录合并为一条（例如一次上传 6 个文件），升级等里程碑保持单独展示。 */
export function aggregateTimeline(items: TimelineItem[] | null | undefined): FootprintEntry[] {
  const entries: FootprintEntry[] = [];
  let previousDay = '';
  for (const item of items || []) {
    const day = timelineDayKey(item.time);
    const last = entries[entries.length - 1];
    if (last && item.source !== 'milestone' && last.source === item.source && previousDay === day) {
      last.count += 1;
      continue;
    }
    entries.push({ source: item.source, name: item.name || null, count: 1, time: item.time, meta: item.meta });
    previousDay = day;
  }
  return entries;
}

export type OverviewNextStep =
  | { kind: 'starter'; key: string; action: string; exp: number }
  | { kind: 'weekly'; key: string; metric: string; current: number; target: number; points: number };

/**
 * 概览“下一步”只补充每日任务之外的一项：未完成的新手路线优先，其次最接近完成的周挑战。
 * 每日任务已经在同一张卡里列出，不能再重复推荐。
 */
export function pickOverviewNextStep(
  nextActions: GrowthNextAction[] | null | undefined,
  challenges: WeeklyChallenge[] | null | undefined,
  options: { pendingResourceCount?: number } = {},
): OverviewNextStep | null {
  const starter = (nextActions || []).find((item) => item.type === 'growth_task' && item.key !== 'task_center');
  if (starter) {
    return { kind: 'starter', key: starter.key, action: starter.action, exp: Number(starter.reward?.exp || 0) };
  }
  // 与服务端建议口径一致：没有待整理资源时不把人引到空的整理入口。
  const hasPending = Number(options.pendingResourceCount ?? 1) > 0;
  const challenge = (challenges || [])
    .filter((item) => !item.done && Number(item.target) > 0 && (hasPending || item.metric !== 'organize'))
    .sort((a, b) => a.target - a.cur - (b.target - b.cur) || a.target - b.target)[0];
  if (!challenge) return null;
  return {
    kind: 'weekly',
    key: challenge.key,
    metric: challenge.metric,
    current: Math.min(challenge.cur, challenge.target),
    target: challenge.target,
    points: Number(challenge.reward || 0),
  };
}

const achievementTime = (value?: string | null) => {
  const number = value ? Date.parse(value) : 0;
  return Number.isFinite(number) ? number : 0;
};
const achievementProgress = (item: Achievement) => (item.target ? Math.min(100, (item.cur / item.target) * 100) : 0);

/** 最近解锁按解锁时间倒序；最接近达成按进度降序、目标升序。成就页与概览共用同一排序。 */
export function rankAchievements(achievements: Achievement[] | null | undefined, limit = 3) {
  const list = achievements || [];
  return {
    recent: list
      .filter((item) => item.unlocked)
      .sort((a, b) => achievementTime(b.unlockedAt) - achievementTime(a.unlockedAt) || a.key.localeCompare(b.key))
      .slice(0, limit),
    near: list
      .filter((item) => !item.unlocked)
      .sort((a, b) => achievementProgress(b) - achievementProgress(a) || a.target - b.target)
      .slice(0, limit),
  };
}
