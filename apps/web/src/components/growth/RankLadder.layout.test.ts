import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rankLadderSource = readFileSync(resolve(process.cwd(), 'src/components/growth/RankLadder.vue'), 'utf8');
const growthPageSource = readFileSync(resolve(process.cwd(), 'src/view/growth/GrowthPage.vue'), 'utf8');

describe('等级路线', () => {
  it('概览通过「查看全部等级与权益」打开完整路线弹框', () => {
    expect(growthPageSource).toMatch(/<BModal v-model:visible="ranksVisible"[\s\S]*?<RankLadder \/>/);
    expect(growthPageSource).toContain('@open-ranks="ranksVisible = true"');
  });

  it('当前等级同时使用实色描边和明确文字标识', () => {
    expect(rankLadderSource).toContain('border-color: var(--primary-color);');
    expect(rankLadderSource).toContain('v-if="r.level === curLevel" tone="pin"');
    expect(rankLadderSource).toContain("t('growth.currentRank')");
  });

  it('表头与每行共用固定列宽，数字右对齐；AI 列按计费模式切换每日额度与一次性赠礼', () => {
    expect(rankLadderSource).toContain('role="table"');
    expect(rankLadderSource).toMatch(/\.rl-row \{[\s\S]*?grid-template-columns:[\s\S]*?var\(--ui-layout-140, 140px\)/);
    expect(rankLadderSource).toMatch(
      /\.rl-num \{[\s\S]*?font-variant-numeric: tabular-nums;[\s\S]*?text-align: right;/,
    );
    expect(rankLadderSource).toContain(
      "permanentOnly ? 'growth.overview.aiGiftColumn' : 'growth.overview.aiDailyColumn'",
    );
    expect(rankLadderSource).toContain('r.aiLevelGift?.tokens');
    expect(rankLadderSource).not.toContain('growth.colPerks');
  });
});
