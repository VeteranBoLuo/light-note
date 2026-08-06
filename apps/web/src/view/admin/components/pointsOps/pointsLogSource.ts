export interface PointsLogLike {
  reason?: string;
  sourceType?: string;
  sourceKey?: string | null;
  sourceMeta?: string | null;
  sourceRef?: string | null;
  ref?: string | null;
}

const LOTTERY_LABELS: Record<string, string> = {
  p10: '+10 积分',
  p30: '+30 积分',
  p70: '+70 积分',
  card: '补签卡 ×1',
  ai: 'AI 加油包',
  s128: '扩容 +128MB',
  s512: '扩容 +512MB',
};

const REASON_LABELS: Record<string, string> = {
  checkin: '每日签到',
  quest: '每日任务',
  streak_milestone: '连签里程碑',
  achievement: '成就奖励',
  buy: '兑换商品',
  lottery_cost: '抽奖消耗',
  lottery_win: '抽奖·积分',
  lottery_storage: '抽奖·存储',
  lottery_free: '免费抽奖',
  weekly: '每周挑战',
  admin: '运营调整',
  storage: '存储扩容',
};

function translateIfPresent(key: string, t: (key: string) => string, te?: (key: string) => boolean) {
  if (te && !te(key)) return '';
  const translated = t(key);
  return translated === key ? '' : translated;
}

function displayDay(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function describePointsLogSource(log: PointsLogLike, t: (key: string) => string, te?: (key: string) => boolean) {
  const type = String(log.sourceType || (log.reason?.startsWith('storage:') ? 'storage' : log.reason) || '');
  const key = String(log.sourceKey || '');
  const raw = String(log.sourceRef || log.ref || '');
  const title = translateIfPresent(`growth.pointsReason.${type}`, t, te) || REASON_LABELS[type] || type || '其他来源';
  let detail = '';

  if (type === 'achievement' && key) detail = translateIfPresent(`growth.achName.${key}`, t, te) || key;
  else if (type === 'weekly' && key) {
    const challenge = translateIfPresent(`growth.weeklyName.${key}`, t, te) || key;
    const week = String(log.sourceMeta || '');
    detail = /^\d{6}$/.test(week) ? `${challenge} · ${week.slice(0, 4)} 年第 ${Number(week.slice(4))} 周` : challenge;
  } else if (type === 'buy' && key) detail = translateIfPresent(`growth.shopItems.${key}.name`, t, te) || key;
  else if ((type === 'lottery_win' || type === 'lottery_storage') && key) detail = LOTTERY_LABELS[key] || key;
  else if (type === 'lottery_cost' && key) detail = key === 'x10' ? '十连抽' : key === 'x1' ? '单抽' : key;
  else if ((type === 'checkin' || type === 'quest') && key) detail = displayDay(key);
  else if (type === 'streak_milestone' && key) detail = `连续签到 ${key} 天`;
  else if ((type === 'admin' || type === 'storage') && key) detail = key;

  return { title, detail, raw };
}

export function pointsReasonLabel(reason: string) {
  const type = reason?.startsWith('storage:') ? 'storage' : reason;
  return REASON_LABELS[type] || reason;
}
