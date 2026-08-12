import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/admin/components/overview/AdminOverview.vue'), 'utf8');
const template = source.slice(0, source.indexOf('<script'));

describe('后台运营总览指标去重', () => {
  it('把系统运行和待办健康合并为一组有行动价值的指标', () => {
    expect(template).toContain('运行与待办健康');
    expect(template).not.toContain('>今日运行 ');
    expect(template).not.toContain('>待办运行 ');

    const healthSection = template.match(
      /运行与待办健康[\s\S]*?<ul class="admin-stats ov-health-stats">([\s\S]*?)<\/ul>/u,
    )?.[1];
    expect(healthSection).toBeTruthy();
    expect(healthSection?.match(/class="admin-stat-card/g)).toHaveLength(6);

    for (const label of ['活跃用户', 'AI 调用', 'API 请求', '当前未完成', '当前逾期', '今日完成']) {
      expect(healthSection).toContain(`>${label}<`);
    }
    expect(healthSection).not.toContain('待办总量');
    expect(healthSection).not.toContain('今日新增');
  });

  it('新增、到期、逾期和完成指标在总览模板中各展示一次', () => {
    expect(template.match(/>新增待办</gu)).toHaveLength(1);
    expect(template.match(/>今日到期 /gu)).toHaveLength(1);
    expect(template.match(/>当前逾期</gu)).toHaveLength(1);
    expect(template.match(/>今日完成</gu)).toHaveLength(1);
    expect(template).toMatch(/新增待办[\s\S]*?todos\.createdToday[\s\S]*?累计 \{\{ n\(data\.todos\.total\) \}\}/u);
  });

  it('今日用户和资源指标复用最近新增明细完成筛选下钻', () => {
    for (const type of ['user', 'resource', 'bookmark', 'note', 'file']) {
      expect(template).toContain(`@click="drillDownTodayRecent('${type}')"`);
    }
    expect(template.match(/@click="drillDownTodayRecent\('/gu)).toHaveLength(5);
    expect(template).toContain('ref="recentAnchor"');
    expect(template).toContain(':filter="recentFilter"');
    expect(template).toContain(':filtered-total="recentFilteredTotal"');
    expect(template).toContain('@filter-change="changeRecentFilter"');
    expect(source).toContain('scrollIntoContainer(container, target, 8');
  });

  it('今日卡片显示同一时刻基线，显著波动只生成用户和资源两类运营提示', () => {
    for (const metric of ['users', 'resources', 'bookmarks', 'notes', 'files', 'todos']) {
      expect(template).toContain(`baselineText('${metric}')`);
    }
    expect(template).toContain('v-for="insight in todayInsights"');
    expect(source).toContain('buildAdminTodayInsights');
    expect(source).toContain("files: 'file'");
    expect(template).toContain('@click="openInsight(insight)"');
    expect(template).toContain("t('adminOverview.sameTimeCutoff'");
    expect(source).toContain("go('conversion')");
    expect(source).toContain("drillDownTodayRecent(insight.focus ? insightRecentType[insight.focus] : 'resource')");
  });

  it('真实待处理事项保留直接处理入口，并复用统一待处理中心', () => {
    expect(template).toContain("go('userOpinion')");
    expect(template).toContain('goToSecurityEvents');
    expect(template).toContain("go('actionCenter')");
    expect(template).toContain("t('adminOverview.openActionCenter')");
  });
});
