import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/library/TagFilterSelector.vue'), 'utf8');

describe('TagFilterSelector', () => {
  it('桌面与移动端使用同一个标准下拉箭头，并在展开时转为向上', () => {
    expect(source.match(/:src="icon\.noteTree\.chevron"/gu)).toHaveLength(2);
    expect(source.match(/:class="\{ 'is-open': filterVisible \}"/gu)).toHaveLength(2);
    expect(source).not.toContain('icon.arrow_left');
    expect(source).toMatch(/\.filter-chevron\s*\{[\s\S]*transform:\s*rotate\(0deg\);/u);
    expect(source).toMatch(/&\.is-open\s*\{[\s\S]*transform:\s*rotate\(180deg\);/u);
  });

  it('箭头保持低视觉权重，并尊重减少动态效果设置', () => {
    expect(source.match(/class="filter-chevron"/gu)).toHaveLength(2);
    expect(source.match(/size="14"/gu)).toHaveLength(2);
    expect(source).toMatch(/\.filter-chevron\s*\{[\s\S]*opacity:\s*0\.68;/u);
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none;/u);
  });
});
