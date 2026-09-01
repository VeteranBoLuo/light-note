import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/manage/bookmarkEditMg/BookmarkEditMobile.vue'),
  'utf8',
);

describe('移动端书签编辑页滚动布局', () => {
  it('把长表单限制在页面主体内滚动，避免小屏裁掉底部操作', () => {
    expect(source).toContain('class="bookmark-edit-mobile-page"');
    expect(source).toContain('.bookmark-edit-mobile-page :deep(.resource-page-body)');
    expect(source).toContain('overflow-y: auto');
    expect(source).toContain('overscroll-behavior: contain');
  });
});
