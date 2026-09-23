import { createApp, h, nextTick, ref } from 'vue';
import { expect, it, vi } from 'vitest';
import Outline from './CommunityPostOutline.vue';
import { scrollIntoContainer } from '@/utils/scrolling';
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/utils/scrolling', () => ({ scrollIntoContainer: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));
it('uses rendered headings in order, navigates inside the reader, and clears a replaced outline', async () => {
  const root = document.createElement('article');
  root.innerHTML =
    '<h2>帖子标题不进目录</h2><div class="community-markdown"><h2>起步</h2><p>正文</p><h3>细节</h3><h2>总结</h2></div>';
  const container = document.createElement('main');
  container.append(root);
  const host = document.createElement('div');
  const content = ref('first');
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const app = createApp({
    setup: () => () => h(Outline, { contentRoot: root, scrollContainer: container, content: content.value }),
  });
  app.directive('auto-scrollbar', {});
  app.mount(host);
  await nextTick();
  const buttons = host.querySelectorAll('button');
  expect(Array.from(buttons).map((button) => button.textContent)).toEqual(['起步', '细节', '总结']);
  buttons[1].click();
  await nextTick();
  expect(buttons[1].getAttribute('aria-current')).toBe('location');
  container.dispatchEvent(new Event('scroll'));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await nextTick();
  expect(buttons[1].getAttribute('aria-current')).toBe('location');
  container.dispatchEvent(new Event('wheel'));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await nextTick();
  expect(buttons[2].getAttribute('aria-current')).toBe('location');
  expect(scrollIntoContainer).toHaveBeenCalledWith(container, root.querySelector('h3'), 24, 'auto');
  root.querySelector('.community-markdown')!.innerHTML = '<p>无标题正文</p>';
  content.value = 'second';
  await nextTick();
  await nextTick();
  expect(host.querySelector('nav')).toBeNull();
  app.unmount();
  vi.unstubAllGlobals();
});
