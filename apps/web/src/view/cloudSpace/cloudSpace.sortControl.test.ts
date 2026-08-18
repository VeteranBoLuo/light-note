import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/cloudSpace/cloudSpace.vue'), 'utf8');

describe('云空间排序入口', () => {
  it('上传时间提供最新和最早两个稳定方向', () => {
    expect(source).toContain("{ value: 'createTime:desc', label: t('cloudSpace.sortLatest') }");
    expect(source).toContain("{ value: 'createTime:asc', label: t('cloudSpace.sortEarliest') }");
  });

  it('中等宽度桌面显示纯图标菜单入口，并通过悬停保留当前排序说明', () => {
    expect(source).toContain(':title="`${$t(\'cloudSpace.sort\')}：${cloudSortLabel}`"');
    expect(source).toMatch(/@media \(max-width: 1550px\) and \(min-width: 768px\)/);
    expect(source).toMatch(/\.cloud-sort-select :deep\(\.select-text\) \{\s*display: none;/);
    expect(source).toMatch(/\.cloud-sort-select :deep\(\.select-suffix\) \{\s*display: none;/);
  });
});
