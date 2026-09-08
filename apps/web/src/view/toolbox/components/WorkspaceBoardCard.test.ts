import { createApp, h, nextTick, type App } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import WorkspaceBoardCard from './WorkspaceBoardCard.vue';
let app: App | undefined;
let host: HTMLElement;
afterEach(() => {
  app?.unmount();
  host?.remove();
});
it('keeps visitor details and source accessible while hiding mutation controls', async () => {
  const edit = vi.fn();
  const source = vi.fn();
  const readonly = { value: true };
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      h(WorkspaceBoardCard, {
        readonly: readonly.value,
        disabled: true,
        hovered: false,
        item: {
          id: 'example',
          lane: 'action',
          title: 'Practice retrieval',
          content: 'Explain without notes',
          status: 'open',
          dueOn: null,
          sourceItemId: 'source',
          sourceTitle: 'Concept card',
        } as any,
        typeLabel: 'Review',
        state: 'Not started',
        primary: { key: 'start', label: 'Start review' },
        menu: [],
        onEdit: edit,
        onSource: source,
      }),
  });
  app.component('svg-icon', { render: () => h('span') });
  app.mount(host);
  await nextTick();
  expect(host.textContent).toContain('Explain without notes');
  expect(host.querySelector('.board-drag')).toBeNull();
  expect(host.querySelector('.board-card__menu')).toBeNull();
  expect(host.textContent).not.toContain('Start review');
  host.querySelector('article')!.click();
  expect(edit).toHaveBeenCalledTimes(1);
  (host.querySelector('.board-card__source') as HTMLElement).click();
  expect(source).toHaveBeenCalledTimes(1);
  expect(edit).toHaveBeenCalledTimes(1);
  host.querySelector('article')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(edit).toHaveBeenCalledTimes(2);
});
