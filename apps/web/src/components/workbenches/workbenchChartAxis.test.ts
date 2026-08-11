import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const chartSource = readFileSync(resolve(process.cwd(), 'src/components/workbenches/WorkbenchCharts.vue'), 'utf8');
const themeSource = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.less'), 'utf8');

describe('工作台趋势图坐标可读性', () => {
  it('使用工作台专用坐标主题变量，不复用深色输入框背景作为网格线', () => {
    expect(chartSource).toContain("getThemeVar('--workbench-chart-axis-text'");
    expect(chartSource).toContain("getThemeVar('--workbench-chart-grid-line'");
    expect(chartSource).toContain("getThemeVar('--workbench-chart-axis-line'");
    expect(chartSource).not.toContain("getThemeVar('--bl-input-noBorder-bg-color'");
    expect(themeSource.match(/--workbench-chart-axis-line:/g)).toHaveLength(2);
  });

  it('绘制横纵轴与日期短刻度', () => {
    expect(chartSource).toMatch(/ctx\.lineTo\(left, top \+ plotHeight\);[\s\S]*ctx\.lineTo\(left \+ plotWidth, top \+ plotHeight\)/);
    expect(chartSource).toContain('ctx.lineTo(x, top + plotHeight + 5)');
  });
});
