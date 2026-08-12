import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/growth/LotteryDraw.vue'), 'utf8');

describe('LotteryDraw 自适应设计', () => {
  it('桌面端使用抽奖舞台与权益奖池双栏布局', () => {
    expect(source).toContain('class="lt-layout"');
    expect(source).toContain('class="lt-machine"');
    expect(source).toContain('class="lt-side"');
    expect(source).toMatch(/\.lt-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(270px, 318px\);/);
  });

  it('移动端改为单列，让免费抽占满一行并用紧凑结果盘呈现十连', () => {
    expect(source).toMatch(/@media \(max-width: 1040px\)[\s\S]*?\.lt-layout\s*\{\s*grid-template-columns:\s*1fr;/);
    expect(source).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.lt-draw-options:not\(\.has-no-free\) > :first-child\s*\{\s*grid-column:\s*1 \/ -1;/,
    );
    expect(source).toMatch(/@media \(max-width: 760px\)[\s\S]*?min-height:\s*58px;/);
    expect(source).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.lt-prizes\s*\{\s*grid-template-columns:\s*repeat\(5,/);
    expect(source).toMatch(/@media \(max-width: 380px\)[\s\S]*?\.lt-prizes\s*\{\s*grid-template-columns:\s*repeat\(4,/);
  });

  it('手机点击抽奖后交给成长页定位标题，不再把开奖舞台强行顶到页签下方', () => {
    expect(source).toContain("const emit = defineEmits<{ 'focus-header': [] }>();");
    expect(source).toContain("emit('focus-header')");
    expect(source).not.toContain('stageRef');
    expect(source).not.toMatch(/\.scrollIntoView\s*\(/);
  });

  it('手机首屏压缩重复说明，并把标题、积分余额保持在同一行', () => {
    expect(source).toMatch(/@media \(max-width: 520px\)[\s\S]*?\.lt-header\s*\{[\s\S]*?flex-direction:\s*row;/);
    expect(source).toMatch(/@media \(max-width: 520px\)[\s\S]*?\.lt-subtitle\s*\{\s*display:\s*none;/);
    expect(source).toMatch(/@media \(max-width: 520px\)[\s\S]*?\.lt-stage\s*\{[\s\S]*?min-height:\s*210px;/);
  });

  it('奖品与操作图标全部复用 SvgIcon，不在模板内使用 emoji 或静态 svg', () => {
    const template = source.slice(source.indexOf('<template>'), source.indexOf('</template>'));
    expect(template).toContain('<SvgIcon');
    expect(template).not.toMatch(/<svg|<path/);
    expect(template).not.toMatch(/[🎰🪙🎁🎲🎟️🔒✨🎉💾⚡]/u);
  });

  it('保底与免费权益均提供语义化进度，并让稀有状态同时具备文字和实色描边', () => {
    expect(source.match(/role="progressbar"/g)).toHaveLength(2);
    expect(source).toContain('v-else-if="prize.rare" class="lt-prize__rare"');
    expect(source).toContain('border-color: var(--lt-gold-border);');
    expect(source).toContain("t('growth.lotteryRare')");
  });

  it('区分可保底奖池与实际保底命中，并在十连后保留明确的触发反馈', () => {
    expect(source).toContain('class="lt-pool-item__pity-badge"');
    expect(source).toContain("t('growth.lotteryPityPoolBadge')");
    expect(source).toContain('v-if="prize.guaranteed" class="lt-prize__rare is-guaranteed"');
    expect(source).toContain("t('growth.lotteryPityHitBadge')");
    expect(source).toContain('res.data.pityTriggered');
    expect(source).toContain("t('growth.lotteryPityTriggeredNext'");
  });

  it('尊重系统减少动画偏好与应用级禁用动画设置', () => {
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toContain(':global(.disable-animations)');
  });
});
