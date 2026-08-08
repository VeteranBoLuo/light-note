import { createApp, defineComponent, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));

const { default: NoteTemplateList } = await import('./NoteTemplateList.vue');

describe('NoteTemplateList 模板筛选', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  function mountList() {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteTemplateList, {
              templates: [
                {
                  id: 'html-1',
                  name: '周报模板',
                  description: '团队复盘',
                  titleTemplate: '第 {{week}} 周',
                  type: 'html',
                  revision: 2,
                },
                {
                  id: 'md-1',
                  name: '技术方案',
                  description: 'Markdown 文档',
                  titleTemplate: '开发方案',
                  type: 'markdown',
                  revision: 1,
                },
              ],
              activeId: 'md-1',
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.directive('auto-scrollbar', {});
    app.mount(host);
    cleanup = () => app.unmount();
    return host;
  }

  it('可按名称、默认标题或描述搜索，并保留明确选中态', async () => {
    const host = mountList();
    await nextTick();

    expect(host.textContent).toContain('周报模板');
    expect(host.textContent).toContain('技术方案');
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain('技术方案');

    const input = host.querySelector<HTMLInputElement>('input');
    input!.value = '复盘';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    expect(host.textContent).toContain('周报模板');
    expect(host.textContent).not.toContain('技术方案');
  });
});
