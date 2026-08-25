/**
 * 每日任务奖励领取结果 → 提示文案。
 *
 * 为什么单独抽出来:成长页、移动端今日、桌面工作台三处都有「领取每日奖励」入口,
 * 原先各自写了一遍同样的 already / capped / 经验+积分 / 只发积分分支，
 * 三份拷贝各改一次迟早会走偏 —— 收口成纯函数,顺带能测。
 */

export interface DailyQuestClaimResult {
  already?: boolean;
  capped?: boolean;
  expGained?: number;
  pointsEarned?: number;
}

export interface DailyQuestClaimFeedback {
  /** info = 无实际入账的提醒(已领过、撞日顶);success = 这次真的拿到了东西 */
  level: 'info' | 'success';
  key: string;
  params: Record<string, number>;
}

export function resolveDailyQuestClaimFeedback(
  result: DailyQuestClaimResult | null | undefined,
): DailyQuestClaimFeedback {
  const exp = Number(result?.expGained || 0);
  const points = Number(result?.pointsEarned || 0);
  if (result?.already) return { level: 'info', key: 'growth.questClaimedAlready', params: {} };
  if (result?.capped) return { level: 'info', key: 'growth.questCapped', params: {} };
  // 兼容只有积分实际入账的策略/边界结果，避免报「经验 +0」。
  if (exp <= 0 && points > 0) return { level: 'success', key: 'growth.questClaimOkPointsOnly', params: { p: points } };
  if (points > 0) return { level: 'success', key: 'growth.questClaimOkPts', params: { n: exp, p: points } };
  return { level: 'success', key: 'growth.questClaimOk', params: { n: exp } };
}

/** 操作日志文案(三处入口只有 module 不同,文案本身共用)。 */
export function dailyQuestClaimLogText(result: DailyQuestClaimResult | null | undefined): string {
  return `领取每日任务奖励（经验+${Number(result?.expGained || 0)}、积分+${Number(result?.pointsEarned || 0)}）`;
}
