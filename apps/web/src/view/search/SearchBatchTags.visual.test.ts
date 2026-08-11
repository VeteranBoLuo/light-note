import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/search/SearchBatchTags.vue'), 'utf8');

describe('批量标签选择视觉状态', () => {
  it('已选标签同时使用实色填充、实色描边和勾选图标', () => {
    expect(source).toContain(':class="{ \'tag-chip--selected\': selectedTagIds.includes(tag.id) }"');
    expect(source).toContain('show-selected-indicator');

    const selectedRule = source.match(/\.tag-chip\.tag-chip--selected[^\{]*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
    expect(selectedRule).toContain('--b-chip-bg: var(--chip-tag-fg)');
    expect(selectedRule).toContain('--b-chip-border: var(--chip-tag-fg)');
    expect(selectedRule).toContain('border-color: var(--chip-tag-fg)');
    expect(selectedRule).toContain('border-width: 2px');
  });
});
