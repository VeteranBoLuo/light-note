import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import ResourceInspectorPanel from './ResourceInspectorPanel.vue';
import TodoSearchMeta from './TodoSearchMeta.vue';
import { mapDisplayItems } from './searchUtils';
import zh from '@/i18n/locales/zh-CN';
import icon from '@/config/icon';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
function mount(component: any, props: any) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(component, props) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.directive('auto-scrollbar', {});
  app.component('svg-icon', { render: () => h('span') });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}
const base = { id: 'todo', type: 'todo' as const, title: '任务', description: '' };
describe('待办查找只读展示', () => {
  it.each([
    ['pending', '2020-01-01 10:00:00', '已逾期'],
    ['completed', '2020-01-01 10:00:00', '已完成'],
    ['pending', null, '无截止时间'],
    ['pending', '2099-01-01 10:00:00', '未完成'],
  ])('显示 %s / %s 的状态', (status, dueAt, label) => {
    const host = mount(TodoSearchMeta, { item: { ...base, status, dueAt } });
    expect(host.textContent).toContain(label);
    if (status === 'completed') expect(host.textContent).not.toContain('已逾期');
  });
  it('检查器显示优先级且只提供打开待办', () => {
    const [resource] = mapDisplayItems([{ ...base, status: 'pending', priority: 2 }], '');
    const host = mount(ResourceInspectorPanel, {
      resource,
      iconSrc: icon.todoWorkspace.checkSquare,
      typeLabel: '待办',
      preview: '说明',
      noteTypeLabel: '',
    });
    expect(host.textContent).toContain('优先级');
    expect(host.textContent).toContain('高');
    expect([...host.querySelectorAll('button')].map((button) => button.textContent?.trim())).toEqual(['打开待办']);
    expect(icon.todoWorkspace.checkSquare).toBeTruthy();
    expect(icon.todoWorkspace.checkSquare).not.toBe(icon.nullImg);
  });
});
