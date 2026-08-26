import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/home/FilterPanel.vue'), 'utf8');

describe('书签标签树排版', () => {
  it('可拖拽时用操作提示替代重复的标签名 title', () => {
    expect(source).toContain(`:title="tagDraggable ? t('home.dragTagHint') : undefined"`);
    expect(source).not.toContain(':title="item.name"');
    expect(source).toContain(
      'const tagDraggable = computed(\n    () => !bookmark.isMobile && !tagName.value.trim() && visibleDragTagList.value.length > 1,\n  )',
    );
  });

  it('桌面标签采用与相邻资源侧栏一致的紧凑扫描密度', () => {
    expect(source).toContain(':size="bookmark.isMobile ? 18 : 17"');
    expect(source).toMatch(
      /@media \(min-width: 768px\)[\s\S]*?\.category-item \{[\s\S]*?height:\s*34px;[\s\S]*?margin:\s*2px 0;[\s\S]*?padding:\s*0 8px;[\s\S]*?gap:\s*8px;[\s\S]*?color:\s*var\(--desc-color\);[\s\S]*?font-size:\s*13px;[\s\S]*?font-weight:\s*400;/,
    );
  });

  it('默认、悬停、键盘焦点和选中状态都有明确层级', () => {
    expect(source).toContain('role="button"');
    expect(source).toContain('tabindex="0"');
    expect(source).toContain('@keydown.enter.prevent="handleClickTag(<TagInterface>item)"');
    expect(source).toContain('@keydown.space.prevent="handleClickTag(<TagInterface>item)"');
    expect(source).toMatch(/&:hover \{[\s\S]*?color:\s*var\(--resource-bookmark-color[\s\S]*?7%, transparent\)/);
    expect(source).toMatch(
      /&:focus-visible \{[\s\S]*?outline:\s*2px solid var\(--resource-bookmark-color[\s\S]*?outline-offset:\s*-2px/,
    );
    expect(source).toMatch(
      /&\.is-current \{[\s\S]*?10%,[\s\S]*?font-weight:\s*600;[\s\S]*?&::before \{[\s\S]*?width:\s*3px;[\s\S]*?background:\s*var\(--resource-bookmark-color/,
    );
    expect(source).not.toContain('backgroundColor: (bookmark.tagData as any)?.id === item.id');
  });

  it('移动端继续保留原有触控高度和实色选中信号', () => {
    expect(source).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.category-item \{[\s\S]*?min-height:\s*54px;[\s\S]*?padding:\s*8px 10px;/,
    );
    expect(source).toMatch(
      /&\.is-current \{[\s\S]*?border-left-color:\s*var\(--resource-bookmark-color[\s\S]*?font-weight:\s*650;/,
    );
  });
});
