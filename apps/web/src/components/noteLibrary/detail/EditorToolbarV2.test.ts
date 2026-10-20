import { createApp, nextTick } from 'vue';
import { expect, it, vi } from 'vitest';
import Toolbar from './EditorToolbarV2.vue';
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' },
}));
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({ default: { template: '<span><slot/></span>' } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span/>' } }));
vi.mock('@/components/mobile/MobilePageActionsDrawer.vue', () => ({
  default: {
    props: ['open', 'actions'],
    template:
      '<section v-if="open"><button v-for="action in actions" @click="$emit(\'action\', action)">{{ action.label }}</button></section>',
  },
}));
it('keeps six mobile actions and opens More with redo when unused insert shares the More key', async () => {
  const action = (key: string) => ({ key, label: key, icon: '' });
  const onAction = vi.fn(),
    host = document.createElement('div');
  const app = createApp(Toolbar, {
    mobile: true,
    minimal: true,
    showImage: true,
    ariaLabel: 'format',
    undoAction: action('undo'),
    redoAction: action('redo'),
    headingAction: action('heading'),
    boldAction: action('bold'),
    italicAction: action('italic'),
    listAction: action('list'),
    imageAction: action('image'),
    moreAction: action('more'),
    insertAction: action('more'),
    linkAction: action('link'),
    repeatAction: action('repeat'),
    shortcutsAction: action('shortcuts'),
    headingActions: [],
    listActions: [],
    insertActions: [],
    moreActions: [action('quote')],
    desktopFormatActions: [],
    onAction,
  });
  app.mount(host);
  expect(host.querySelectorAll('.editor-toolbar-v2__mobile-button')).toHaveLength(6);
  Array.from(host.querySelectorAll('button'))
    .find((button) => button.textContent === 'more')!
    .click();
  await nextTick();
  const redo = Array.from(host.querySelectorAll('section button')).find((button) => button.textContent === 'redo');
  expect(redo).toBeDefined();
  (redo as HTMLButtonElement).click();
  expect(onAction).toHaveBeenCalledWith(action('redo'));
  app.unmount();
});
