import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const phoneListSource = readFileSync(
  resolve(process.cwd(), 'src/components/base/phoneComponents/PhoneListMg.vue'),
  'utf8',
);
const bookmarkSource = readFileSync(
  resolve(process.cwd(), 'src/components/manage/bookmarkMg/BookmarkTableMobile.vue'),
  'utf8',
);
const linkHealthSource = readFileSync(
  resolve(process.cwd(), 'src/components/manage/bookmarkMg/LinkHealthModal.vue'),
  'utf8',
);

describe('移动端书签列表布局', () => {
  it('从页面内容区到列表保持可收缩的 flex 高度链', () => {
    expect(phoneListSource).toMatch(/:deep\(\.resource-page-body\)[\s\S]*?flex-direction:\s*column/);
    expect(phoneListSource).toMatch(/\.edit-list-container[\s\S]*?min-height:\s*0[\s\S]*?overflow:\s*hidden/);
    expect(phoneListSource).toMatch(/\.list-body[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto/);
    expect(phoneListSource).toMatch(/\.list-body :deep\(> \.mobile-list-surface\)[\s\S]*?flex:\s*0 0 auto/);
  });

  it('使用原型的 70px 紧凑列表行，而不是把每条书签撑成大卡片', () => {
    expect(bookmarkSource).toMatch(/\.list-item \.mobile-list-row\)[\s\S]*?min-height:\s*70px/);
    expect(bookmarkSource).toMatch(/\.mobile-list-row\.is-complex\)[\s\S]*?min-height:\s*70px/);
  });

  it('移动端只保留一层原型边距，并让加载骨架覆盖列表可用高度', () => {
    expect(phoneListSource).toMatch(/\.phone-list-page-shell[\s\S]*?padding:\s*0/);
    expect(phoneListSource).toMatch(/\.edit-list-container[\s\S]*?padding:\s*14px/);
    expect(phoneListSource).toContain('v-for="index in 9"');
    expect(phoneListSource).toMatch(/\.phone-list-skeleton[\s\S]*?min-height:\s*100%/);
    expect(phoneListSource).toMatch(/\.phone-skeleton-icon[\s\S]*?width:\s*38px[\s\S]*?height:\s*38px/);
  });

  it('通过页面级更多抽屉进入死链体检，并安全交接移动端浮层历史', () => {
    expect(bookmarkSource).toContain('<LinkHealthModal v-model:visible="healthVisible" />');
    expect(bookmarkSource).toMatch(/key:\s*'health'[\s\S]*?icon:\s*icon\.bookmarkManage\.healthCheck/);
    expect(bookmarkSource).toMatch(/auxiliaryActionLabel:[\s\S]*?t\('common\.more'\)/);
    expect(bookmarkSource).toMatch(/auxiliaryActionIcon:\s*\(\)\s*=>\s*icon\.common\.more/);
    expect(bookmarkSource).toMatch(
      /async function handlePageAction[\s\S]*?closeCurrentMobileOverlayThen[\s\S]*?healthVisible\.value = true/,
    );
  });

  it('死链体检在窄屏改为纵向结果卡，并保留 44px 触控操作', () => {
    expect(linkHealthSource).toContain('v-auto-scrollbar class="lh-list"');
    expect(linkHealthSource).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.lh-bar[\s\S]*?flex-direction:\s*column/);
    expect(linkHealthSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.lh-item[\s\S]*?flex-direction:\s*column[\s\S]*?border-color:\s*var\(--danger-color\)/,
    );
    expect(linkHealthSource).toMatch(/\.lh-act[\s\S]*?min-height:\s*44px/);
  });
});
