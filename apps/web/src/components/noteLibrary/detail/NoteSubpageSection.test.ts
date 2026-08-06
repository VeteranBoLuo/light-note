import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({ apiBasePost: vi.fn() }));

vi.mock('@/http/request', () => ({ apiBasePost: mocks.apiBasePost }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i aria-hidden="true" />' },
}));

import NoteSubpageSection from './NoteSubpageSection.vue';

async function flushUi() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

describe('NoteSubpageSection 页面树双向操作', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    mocks.apiBasePost.mockReset();
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: { items: [], maxDepth: 8 } });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('空目录压缩为单行状态，并在页面关系菜单中明确区分父子方向', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const events = { create: vi.fn(), attach: vi.fn(), moveSelf: vi.fn() };
    const app = createApp({
      render: () =>
        h(NoteSubpageSection, {
          noteId: 'current-note',
          onCreate: events.create,
          onAttach: events.attach,
          onMoveSelf: events.moveSelf,
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.directive('auto-scrollbar', {});
    app.mount(host);
    cleanup = () => app.unmount();
    await flushUi();

    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/note/queryNoteTree',
      { parentId: 'current-note', depth: 1 },
      { silent: true },
    );
    expect(host.querySelector('.note-subpage-heading')?.textContent).toContain(zhCN.note.noSubpagesShort);
    expect(host.querySelector('.note-subpage-empty')).toBeNull();

    const relationButton = host.querySelector<HTMLButtonElement>('.note-subpage-position-button');
    expect(relationButton?.textContent).toContain(zhCN.note.pageRelations);
    relationButton!.click();
    await flushUi();

    const relationItems = [...document.querySelectorAll<HTMLElement>('.b-dropdown-item')];
    const attachItem = relationItems.find((item) => item.textContent?.includes(zhCN.note.moveExistingUnderThisPage));
    const moveSelfItem = relationItems.find((item) => item.textContent?.includes(zhCN.note.moveThisPageUnderAnother));
    expect(attachItem).toBeTruthy();
    expect(moveSelfItem).toBeTruthy();
    attachItem!.click();

    relationButton!.click();
    await flushUi();
    [...document.querySelectorAll<HTMLElement>('.b-dropdown-item')]
      .find((item) => item.textContent?.includes(zhCN.note.moveThisPageUnderAnother))!
      .click();

    host.querySelector<HTMLButtonElement>('.note-subpage-create')!.click();

    expect(events.attach).toHaveBeenCalledTimes(1);
    expect(events.moveSelf).toHaveBeenCalledTimes(1);
    expect(events.create).toHaveBeenCalledTimes(1);
  });
});
