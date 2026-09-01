import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/tag/ResourceTagChip.vue'), 'utf8');
const commonSource = readFileSync(resolve(process.cwd(), 'src/assets/css/common.less'), 'utf8');

describe('资源标签胶囊视觉状态', () => {
  it('选中态使用实心标签色、双重实色描边信号和对勾间距', () => {
    expect(source).toMatch(
      /\.resource-tag-chip\.b-chip--tag\.b-chip--selected\s*\{[\s\S]*?--b-chip-fg:\s*var\(--card-background[\s\S]*?--b-chip-bg:\s*var\(--chip-tag-fg\);[\s\S]*?--b-chip-border:\s*var\(--chip-tag-fg\);[\s\S]*?border-width:\s*2px;/,
    );
    expect(source).toMatch(/\.resource-tag-chip__selected-icon\s*\{[\s\S]*?margin-right:\s*2px;/);
    expect(source).toMatch(
      /\.resource-tag-chip\.b-chip--tag\.b-chip--selected\.b-chip--interactive:hover\s*\{[\s\S]*?--b-chip-bg:\s*var\(--chip-tag-hover-fg\);/,
    );
  });

  it('详情入口保留悬浮圆角标，使用 BTooltip 且点击区不侵入筛选主体', () => {
    expect(source).toContain('<BTooltip');
    expect(source).toContain('class="tag-detail-tooltip"');
    expect(source).toContain('resource-tag-chip__detail tag-detail-corner');
    expect(commonSource).toMatch(
      /\.tag-detail-chip \.tag-detail-tooltip\.b-tooltip-wrap\s*\{[\s\S]*?width:\s*15px;[\s\S]*?height:\s*15px;/,
    );
    expect(commonSource).toMatch(
      /\.tag-detail-corner\s*\{[\s\S]*?width:\s*15px\s*!important;[\s\S]*?height:\s*15px\s*!important;/,
    );
    expect(commonSource).not.toContain('inset: -10px');
  });
});
