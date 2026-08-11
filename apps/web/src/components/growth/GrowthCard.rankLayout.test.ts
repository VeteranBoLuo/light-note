import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const growthCardSource = readFileSync(resolve(process.cwd(), 'src/components/growth/GrowthCard.vue'), 'utf8');
const rankLadderSource = readFileSync(resolve(process.cwd(), 'src/components/growth/RankLadder.vue'), 'utf8');

describe('成长概览等级路线布局', () => {
  it('完整桌面直接在右侧展示路线，手机和平板保留弹框入口', () => {
    expect(growthCardSource).toContain('<RankLadder v-if="bookmark.isDesktop" class="gc-ladder" />');
    expect(growthCardSource).toContain('v-if="!bookmark.isDesktop" class="gc-ranks-btn"');
    expect(growthCardSource).toContain('v-if="!bookmark.isDesktop"');
    expect(growthCardSource).toContain('@media (min-width: 1200px)');
    expect(growthCardSource).toContain('flex: 0 0 360px;');
  });

  it('当前等级同时使用实色描边和明确文字标识', () => {
    expect(rankLadderSource).toContain('border-color: var(--primary-color);');
    expect(rankLadderSource).toContain('v-if="r.level === curLevel" tone="pin"');
    expect(rankLadderSource).toContain("t('growth.currentRank')");
  });
});
