import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: vi.fn() }));

const { buildNoteShareUrl, readNoteShareSessionTicket, saveNoteShareSessionTicket } = await import('./noteShare');

describe('note share URL', () => {
  it('在当前标签页保存短时阅读票据，刷新时可复用且不落完整分享令牌', () => {
    sessionStorage.clear();
    const token = `secret-${'t'.repeat(43)}`;
    const ticket = 'a'.repeat(43);

    saveNoteShareSessionTicket(token, ticket, 1800);

    expect(readNoteShareSessionTicket(token)).toBe(ticket);
    expect(readNoteShareSessionTicket(`other-${'x'.repeat(43)}`)).toBe('');
    expect(sessionStorage.getItem('light-note:note-share-reading-session')).not.toContain(token);
  });

  it('把主令牌放进 fragment，不进入服务器可见的路径或查询串', () => {
    const token = 'secret_token-123';
    const url = new URL(buildNoteShareUrl(token, 'page-2'));
    expect(url.pathname).toBe('/share/note');
    expect(url.searchParams.get('page')).toBe('page-2');
    expect(url.hash).toBe(`#token=${token}`);
    expect(`${url.pathname}${url.search}`).not.toContain(token);
  });

  it('目录内切换页面时保留承载令牌的 fragment', () => {
    const readerSource = readFileSync(resolve(process.cwd(), 'src/view/share/NoteShareReader.vue'), 'utf8');
    expect(readerSource).toMatch(/router\.replace\(\{[\s\S]*?query:[\s\S]*?hash:\s*route\.hash/);
  });

  it('在根应用禁止页面滚动时由公开阅读页自身承接纵向滚动', () => {
    const readerSource = readFileSync(resolve(process.cwd(), 'src/view/share/NoteShareReader.vue'), 'utf8');
    expect(readerSource).toMatch(
      /\.note-share-reader\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/,
    );
  });

  it('复用统一笔记大纲并随分享页滚动高亮当前章节', () => {
    const readerSource = readFileSync(resolve(process.cwd(), 'src/view/share/NoteShareReader.vue'), 'utf8');
    const outlineSource = readFileSync(
      resolve(process.cwd(), 'src/components/noteLibrary/detail/NoteOutlineList.vue'),
      'utf8',
    );
    expect(readerSource).toContain("import NoteOutlineList from '@/components/noteLibrary/detail/NoteOutlineList.vue'");
    expect(readerSource).toContain(':active-index="activeHeadingIndex"');
    expect(readerSource).toContain("readerRef.value?.addEventListener('scroll', scheduleActiveHeading");
    expect(readerSource).toContain(":class=\"{ 'is-outline': !isSubtreeShare || effectiveSidebarTab === 'outline' }\"");
    expect(readerSource).toMatch(/\.note-share-reader__sidebar-scroll[\s\S]*?box-sizing:\s*border-box/);
    expect(readerSource).toMatch(/&\.is-outline\s*\{\s*overflow:\s*hidden/);
    expect(outlineSource).toContain('v-auto-scrollbar');
    expect(readerSource).not.toContain('note-share-reader__outline-item');
  });

  it('切换无大纲页面时临时回退到页面树，并阻止旧页异步渲染覆盖新页', () => {
    const readerSource = readFileSync(resolve(process.cwd(), 'src/view/share/NoteShareReader.vue'), 'utf8');
    expect(readerSource).toContain("const effectiveSidebarTab = computed<'pages' | 'outline'>(() =>");
    expect(readerSource).toContain("sidebarTab.value === 'outline' && !headings.value.length ? 'pages'");
    expect(readerSource).toContain('const renderVersion = ++pageRenderVersion');
    expect(readerSource.match(/if \(renderVersion !== pageRenderVersion\) return;/g)).toHaveLength(2);
    expect(readerSource).toContain('variant="share"');
  });

  it('分享目录折叠箭头旋转真实包裹层，新链接复制区保留间距', () => {
    const treeSource = readFileSync(
      resolve(process.cwd(), 'src/components/noteLibrary/share/PublicNoteTree.vue'),
      'utf8',
    );
    const modalSource = readFileSync(
      resolve(process.cwd(), 'src/components/noteLibrary/share/NoteShareModal.vue'),
      'utf8',
    );
    expect(treeSource).toContain('class="public-note-tree__chevron"');
    expect(treeSource).toContain('.public-note-tree__toggle.is-expanded .public-note-tree__chevron');
    expect(treeSource).toContain('box-shadow: inset 3px 0 0 var(--primary-color)');
    expect(modalSource).toContain('class="note-share-modal__new-link-row"');
    expect(modalSource).toContain('gap: 10px');
  });

  it('页头及品牌保留安全间距，操作在新页面打开', () => {
    const readerSource = readFileSync(resolve(process.cwd(), 'src/view/share/NoteShareReader.vue'), 'utf8');
    expect(readerSource).toContain('@click="openInNewPage(\'/help\')"');
    expect(readerSource).toContain('@click="openInNewPage(\'/app\')"');
    expect(readerSource).toContain("window.open(href, '_blank', 'noopener,noreferrer')");
    expect(readerSource).toMatch(/\.note-share-reader__header\s*\{[\s\S]*?padding:\s*0 clamp\(24px, 3vw, 48px\)/);
    expect(readerSource).toMatch(/\.note-share-reader__brand\s*\{[\s\S]*?padding:\s*0 14px 0 0/);
  });

  it('解析分享时携带当前标签页的阅读票据并保存续期票据', () => {
    const readerSource = readFileSync(resolve(process.cwd(), 'src/view/share/NoteShareReader.vue'), 'utf8');
    expect(readerSource).toContain('const sessionTicket = readNoteShareSessionTicket(token.value)');
    expect(readerSource).toContain(
      'resolvePublicNoteShare(token.value, accessCode.value.trim(), requestedPage, sessionTicket)',
    );
    expect(readerSource).toContain('saveNoteShareSessionTicket(token.value, data.accessTicket, data.ticketExpiresIn)');
  });
});
