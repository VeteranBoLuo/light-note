import { createApp } from 'vue';
import { expect, it } from 'vitest';
import Excerpt from './CommunityPostExcerpt.vue';
const image = '11111111-1111-4111-8111-111111111111';
it('summarizes the text around inline images as one Markdown block without embedding images', () => {
  const host = document.createElement('div');
  const app = createApp(Excerpt, {
    body: `## 起步\n\n前\n\n![步骤](community-image:${image})\n\n后 [链接][ref]\n\n[ref]: https://example.com`,
  });
  app.mount(host);
  expect(host.querySelectorAll('.community-markdown')).toHaveLength(1);
  expect(host.querySelector('img')).toBeNull();
  expect(host.innerHTML).not.toContain('community-image');
  expect(host.querySelector('h2')?.textContent).toBe('起步');
  expect(host.innerHTML.indexOf('前')).toBeLessThan(host.innerHTML.indexOf('后'));
  expect(host.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
  app.unmount();
});
