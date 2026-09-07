import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/resourceActions/ResourceBatchTagsDrawer.vue'),
  'utf8',
);

describe('批量标签选择视觉状态', () => {
  it('已选标签保留实色描边和勾选图标，紧凑胶囊与触控区域分离', () => {
    expect(source).toContain('class="tag-chip tag-chip--selected"');
    expect(source).toContain('show-selected-indicator');

    const selectedRule = source.match(/\.tag-chip\.tag-chip--selected[^\{]*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
    expect(selectedRule).toContain('border-color: var(--chip-tag-fg)');
    expect(selectedRule).toContain('border-width: 1px');
  });
});
