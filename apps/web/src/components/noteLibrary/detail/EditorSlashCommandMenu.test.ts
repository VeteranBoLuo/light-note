import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import EditorSlashCommandMenu, { type EditorSlashCommand } from './EditorSlashCommandMenu.vue';

const mocks = vi.hoisted(() => ({
  scrollNearestIntoContainer: vi.fn(),
}));

vi.mock('@/utils/zoom', () => ({
  scrollNearestIntoContainer: mocks.scrollNearestIntoContainer,
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub', 'aria-hidden': 'true' }) },
}));

const commands: EditorSlashCommand[] = Array.from({ length: 9 }, (_, index) => ({
  key: `command-${index}`,
  label: `命令 ${index + 1}`,
  description: `说明 ${index + 1}`,
  keywords: [],
  icon: 'icon',
  group: index < 5 ? 'basic' : 'list',
  syntax: index === 0 ? '#' : undefined,
}));

let cleanup: (() => void) | undefined;

function mountMenu() {
  const host = document.createElement('div');
  document.body.append(host);
  const menuRef = ref<{
    moveActive: (offset: number) => Promise<void>;
  } | null>(null);
  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: {
      'zh-CN': {
        common: { back: '返回' },
        noteDetail: {
          editor: {
            slash: {
              title: '快捷命令',
              keyboardHint: '方向键选择，回车确认',
              noMatch: '没有匹配项',
              languageTitle: '代码语言',
              languageHint: '选择高亮语言',
              groups: { basic: '基础区块', list: '列表', block: '内容块', insert: '插入' },
            },
          },
        },
      },
    },
  });
  const app = createApp({
    render: () => h(EditorSlashCommandMenu, { ref: menuRef, commands, keyword: '' }),
  });
  app.use(i18n);
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, menuRef };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  mocks.scrollNearestIntoContainer.mockReset();
});

describe('EditorSlashCommandMenu 键盘滚动', () => {
  it('在命令右侧显示等价输入语法', async () => {
    const { host } = mountMenu();
    await nextTick();

    expect(host.querySelector('.slash-command-menu__syntax')?.textContent?.trim()).toBe('#');
  });

  it('方向键切换高亮项后将新项目滚入菜单自己的可视区域', async () => {
    const { host, menuRef } = mountMenu();
    await nextTick();

    for (let index = 0; index < 6; index += 1) await menuRef.value?.moveActive(1);

    const container = host.querySelector<HTMLElement>('.slash-command-menu__scroll');
    const activeItem = host.querySelector<HTMLElement>('.slash-command-menu__item.is-active');
    expect(activeItem?.textContent).toContain('命令 7');
    expect(mocks.scrollNearestIntoContainer).toHaveBeenLastCalledWith(container, activeItem, 'auto');
  });

  it('向上越过首项循环到末项时同样跟随滚动', async () => {
    const { host, menuRef } = mountMenu();
    await nextTick();

    await menuRef.value?.moveActive(-1);

    const container = host.querySelector<HTMLElement>('.slash-command-menu__scroll');
    const activeItem = host.querySelector<HTMLElement>('.slash-command-menu__item.is-active');
    expect(activeItem?.textContent).toContain('命令 9');
    expect(mocks.scrollNearestIntoContainer).toHaveBeenLastCalledWith(container, activeItem, 'auto');
  });
});
