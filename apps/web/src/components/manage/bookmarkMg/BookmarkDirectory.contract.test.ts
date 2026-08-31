// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

describe('书签管理标签目录契约', () => {
  it('复用标签空间目录行，数量来自书签列表，图标来自完整标签事实源', () => {
    const source = read('components/manage/bookmarkMg/BookmarkTable.vue');
    expect(source).toContain('<TagDirectoryRow');
    expect(source).toContain('const allTags = computed(() => {');
    expect(source).toContain('tableData.value.forEach((item) => {');
    expect(source).toContain('const canonicalTags = new Map(bookmark.tagList.map');
    expect(source).toContain('canonicalTag?.iconUrl || t.iconUrl');
    expect(source).toContain("bookmark.loadTagList(String(user.id || ''), { showLoading: false })");
    expect(source).toContain(':icon-src="directoryTag.iconUrl || icon.manage_categoryBtn_tag"');
    expect(source).toContain('const untaggedBookmarkCount = computed(');
    expect(source).not.toContain('fetchTagSpaces');
  });

  it('普通点击保留书签筛选语义，悬停和右键菜单再提供标签空间操作', () => {
    const source = read('components/manage/bookmarkMg/BookmarkTable.vue');
    expect(source).toContain("const tagMenuTriggers: BActionMenuTrigger[] = ['hover', 'contextmenu']");
    expect(source).toContain('@activate="setBookmarkFilter(directoryTag.id)"');
    expect(source).toContain("if (action === 'filter') setBookmarkFilter(target.id)");
    expect(source).toContain('router.push(`/tag/${target.id}`)');
    expect(source).toContain('router.push(`/manage/editBookmark/add/${target.id}`)');
  });

  it('目录行只使用 B 组件和图标事实源，并用描边与文字共同表达选中态', () => {
    const source = read('components/tagSpace/TagDirectoryRow.vue');
    expect(source).toContain('<BButton');
    expect(source).toContain('<SvgIcon');
    expect(source).toContain('icon.resource.tag');
    expect(source).not.toMatch(/<(button|input|select)\b/iu);
    expect(source).toMatch(/\.tag-directory-row\.is-active\s*\{[\s\S]*?border-color:/u);
    expect(source).toMatch(/\.tag-directory-row\.is-active\s*\{[\s\S]*?color:/u);
  });

  it('小尺寸桌面仍保留左侧目录，只有更窄的平板布局才折叠', () => {
    const source = read('components/manage/bookmarkMg/BookmarkTable.vue');
    expect(source).toMatch(/@media \(max-width: 1280px\)[\s\S]*?grid-template-columns:\s*196px minmax\(0, 1fr\)/u);
    expect(source).toMatch(/@media \(max-width: 1000px\)[\s\S]*?grid-template-columns:\s*1fr/u);
  });
});
