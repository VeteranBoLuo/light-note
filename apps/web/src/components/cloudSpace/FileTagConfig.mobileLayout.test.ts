import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/cloudSpace/FileTagConfig.vue'), 'utf8');

describe('FileTagConfig 移动端高度分配', () => {
  it('只让共享标签列表纵向滚动，摘要与底部操作保持固定', () => {
    expect(source).toContain('v-auto-scrollbar class="tag-list"');
    expect(source).toMatch(/\.file-tag-config\.mobile\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow:\s*hidden;/);
    expect(source).toMatch(/\.library-panel\s*\{[\s\S]*?grid-template-rows:\s*auto auto minmax\(0, 1fr\)/);
    expect(source).toMatch(/\.tag-list\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*auto/);
    expect(source).toMatch(/\.tag-config-footer\s*\{[\s\S]*?position:\s*sticky/);
  });

  it('把移动端已选摘要压缩为数量徽标和横向标签带', () => {
    expect(source).toContain('class="selected-count-badge"');
    expect(source).toMatch(/\.file-tag-config\.mobile\s*\{[\s\S]*?\.selected-overview\s*\{[\s\S]*?display:\s*none/);
    expect(source).toMatch(/\.file-tag-config\.mobile\s*\{[\s\S]*?\.chip-list\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
    expect(source).toMatch(/\.file-tag-config\.mobile\s*\{[\s\S]*?\.chip-list\s*\{[\s\S]*?overflow-x:\s*auto/);
  });

  it('移动渲染基线用实色描边和勾选图标表达绑定状态', () => {
    expect(source).toContain(':src="icon.filterPanel.check"');
    expect(source).toContain('html.light-note-mobile-rendering .file-tag-config.mobile .tag-row.active');
    expect(source).toContain('border-color: var(--resource-tag-color)');
  });
});
