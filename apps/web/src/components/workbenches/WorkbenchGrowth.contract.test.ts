import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/workbenches/WorkbenchGrowth.vue'), 'utf8');

describe('工作台成长卡交互契约', () => {
  it('下一步建议深链到成长任务分区，不复用查看成长的总览入口', () => {
    expect(source).toContain('class="growth-next" @click="openGrowthTasks"');
    expect(source).toContain("router.push({ path: '/growth', query: { section: 'tasks' }, hash: '#growth-weekly' })");
    expect(source).toContain('class="growth-link"');
    expect(source).toContain('@click="goGrowth"');
  });

  it('签到完成后强制回读成长快照和可领取项，失败时不会静默结束', () => {
    expect(source).toContain('await Promise.all([load(true), loadClaimable()])');
    expect(source).toContain("message.error(res?.msg || t('growth.checkinFailed'))");
    expect(source).toContain("message.error(t('growth.checkinFailed'))");
  });

  it('移动端紧凑模式展示今日进度、可领取摘要和明确实色描边', () => {
    expect(source).toContain('compactToday?: boolean');
    expect(source).toContain("'growth-card--compact-today': props.compactToday");
    expect(source).toContain("t('growth.todayGrowthProgress')");
    expect(source).toContain("t('growth.claimableSummary', { n: claimable })");
    expect(source).toMatch(/\.growth-card--compact-today\s*\{[\s\S]*?border-color:\s*var\(--primary-color\)/);
  });

  it('桌面一键领取显示来源 Tooltip，移动端复用同一按钮但关闭浮层', () => {
    expect(source).toContain('<BTooltip');
    expect(source).toContain(':disabled="!bookmark.isDesktop"');
    expect(source.match(/class="claim-button"/g)).toHaveLength(1);
    expect(source).toContain('useGrowthClaimFeedback(claimableData)');
  });

  it('一键领取成功后根据服务端 receipts 区分任务和成就来源', () => {
    expect(source).toContain('const pendingBreakdown = snapshotClaimableBreakdown()');
    expect(source).toContain('claimSuccessMessage(res.data.receipts, pendingBreakdown)');
  });
});
