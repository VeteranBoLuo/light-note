import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/tag/ResourceTagChip.vue'), 'utf8');

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
});
