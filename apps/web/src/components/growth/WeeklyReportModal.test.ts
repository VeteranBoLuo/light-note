import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/growth/WeeklyReportModal.vue'), 'utf8');
const zhSource = readFileSync(resolve(process.cwd(), 'src/i18n/locales/zh-CN.ts'), 'utf8');
const enSource = readFileSync(resolve(process.cwd(), 'src/i18n/locales/en-US.ts'), 'utf8');

describe('成长周报 V2', () => {
  it('使用标准弹框、BButton 和统一图标，不再自建原生交互控件', () => {
    expect(source).toContain('<BModal');
    expect(source).toContain('<BButton');
    expect(source).toContain('<SvgIcon');
    expect(source).not.toMatch(/<(?:button|input|select|textarea)(?:\s|>)/i);
    expect(source).not.toMatch(/<svg(?:\s|>)/i);
  });

  it('导出目标只包含周报卡，操作按钮位于右侧洞察区且不占用弹窗底栏', () => {
    expect(source).toMatch(/ref="posterRef"\s+class="wr-poster"/);
    expect(source).toContain(':show-footer="false"');
    expect(source).not.toContain('<template #footer>');
    expect(source).toMatch(/<aside class="wr-insights">[\s\S]*?class="wr-insight-actions"[\s\S]*?<\/aside>/);
    expect(source).toContain('posterRef.value.cloneNode(true)');
    expect(source).toContain("exportPoster.dataset.weeklyReportExport = 'true'");
    expect(source).toContain('html2canvas(exportPoster');
    expect(source).toContain('scale: Math.min(5, Math.max(3, 2160 / renderWidth))');
    expect(source).toContain('availableHeight / height');
    expect(source).toContain("clonedPoster.style.transform = 'none'");
    expect(source).toContain('prepareMaskedIconsForCanvas(exportPoster, window)');
    expect(source).toContain('exportHost.remove()');
    expect(source).toMatch(/\.wr-poster\s*\{[\s\S]*?box-sizing:\s*border-box/);
    expect(source).toMatch(/\.wr-insight-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, max-content\)/);
  });

  it('提供真实趋势、内容构成、经验状态和下周目标', () => {
    expect(source).toContain('hasDailySeries');
    expect(source).toContain('wrActivityTrend');
    expect(source).toContain('wrContentComposition');
    expect(source).toContain("props.report?.expStatus === 'role_excluded'");
    expect(source).toContain('safeNumber(props.report?.level) >= 15');
    expect(source).toContain('wrNextGoal');
  });

  it('中英文均包含新版周报关键文案', () => {
    for (const key of ['wrPosterPreview', 'wrActivityTrend', 'wrExpRoleExcluded', 'wrNextGoal', 'wrSaveTip']) {
      expect(zhSource).toContain(`${key}:`);
      expect(enSource).toContain(`${key}:`);
    }
  });

  it('移动渲染基线保留实色边框，不依赖阴影表达关键状态', () => {
    expect(source).toMatch(/html\.light-note-mobile-rendering[\s\S]*?border-color:\s*var\(--primary-color\)/);
    expect(source).toMatch(/html\.light-note-mobile-rendering[\s\S]*?box-shadow:\s*none/);
  });

  it('移动端全屏弹框由周报内容区接管纵向触摸滚动', () => {
    expect(source).toMatch(
      /\.weekly-report-v2-modal\.is-mobile-fullscreen[\s\S]*?\.weekly-report-v2-content[\s\S]*?overflow-y:\s*auto\s*!important/,
    );
    expect(source).toContain('touch-action: pan-y');
    expect(source).toContain('-webkit-overflow-scrolling: touch');
  });
});
