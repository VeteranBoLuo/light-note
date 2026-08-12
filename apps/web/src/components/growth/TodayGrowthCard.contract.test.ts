import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const todaySource = readFileSync(resolve(process.cwd(), 'src/components/growth/TodayGrowthCard.vue'), 'utf8');
const weeklySource = readFileSync(resolve(process.cwd(), 'src/components/growth/WeeklyChallenge.vue'), 'utf8');
const tasksSource = readFileSync(resolve(process.cwd(), 'src/components/growth/GrowthTasks.vue'), 'utf8');

describe('成长建议与领取状态视觉契约', () => {
  it('下一步建议使用清晰的待整理入箱图标，并显示真实奖励而非固定 0/1', () => {
    expect(todaySource).toContain('icon.contextMenu.inbox');
    expect(todaySource).toContain("t('growth.nextActionExpReward'");
    expect(todaySource).toContain("t('growth.nextActionPointsReward'");
    expect(todaySource).not.toContain('data.nextAction.progress.current }}/{{ data.nextAction.progress.target');
  });

  it('已领取和已完成状态使用存在的成功图标，不再落入默认地球图标', () => {
    expect(weeklySource).toContain('icon.message.success');
    expect(tasksSource).toContain('icon.message.success');
    expect(`${weeklySource}\n${tasksSource}`).not.toContain('icon.common.check');
  });
});
