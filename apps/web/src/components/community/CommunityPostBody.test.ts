import { createApp, nextTick } from 'vue';
import { expect, it, vi } from 'vitest';
import Body from './CommunityPostBody.vue';
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/composables/useCommunityPreview', async () => {
  const { ref } = await import('vue');
  return { useCommunityPreview: () => ({ identity: ref('test') }) };
});
vi.mock('@/composables/useCommunityPreviewImages', () => ({
  useCommunityPreviewImages: () => ({ imageSource: (url: string) => url, imageUnavailable: () => false }),
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/base/Viewer/BImageViewer.vue', () => ({
  __esModule: true,
  default: {
    props: ['images', 'initialId'],
    template: '<img class="test-original" :src="images.find(i => i.id === initialId)?.src" />',
  },
}));
const first = '11111111-1111-4111-8111-111111111111',
  second = '22222222-2222-4222-8222-222222222222';
it('renders inline images once between paragraphs with attachments above the body', async () => {
  const host = document.createElement('div');
  const app = createApp(Body, {
    body: `前\n\n![步骤](community-image:${first})\n\n后\n\n![外链](https://tracker.example/image)`,
    images: [first, second].map((publicId) => ({
      publicId,
      url: '/api/community/images/' + publicId,
      width: 800,
      height: 400,
      fileSize: 1,
      contentType: 'image/png',
    })),
  });
  app.mount(host);
  await nextTick();
  expect(Array.from(host.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual([
    '/api/community/images/' + second,
    '/api/community/images/' + first,
  ]);
  expect(host.textContent).toContain('前');
  expect(host.textContent).toContain('后');
  expect(host.innerHTML.indexOf('前')).toBeLessThan(host.innerHTML.indexOf(first));
  expect(host.innerHTML.indexOf(first)).toBeLessThan(host.innerHTML.indexOf('后'));
  expect(host.innerHTML.indexOf(second)).toBeLessThan(host.innerHTML.indexOf('前'));
  app.unmount();
});
it('keeps attachments out of the body-only Markdown preview', () => {
  const host = document.createElement('div');
  const app = createApp(Body, {
    body: `前\n\n![](community-image:${first})\n\n后`,
    hideAttachments: true,
    images: [first, second].map((publicId) => ({
      publicId,
      url: '/image/' + publicId,
      width: 20,
      height: 10,
      fileSize: 1,
      contentType: 'image/png',
    })),
  });
  app.mount(host);
  expect(Array.from(host.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual(['/image/' + first]);
  app.unmount();
});
it('keeps compressed body images after opening an original and supports legacy images', async () => {
  const host = document.createElement('div');
  const app = createApp(Body, {
    body: `![截图](community-image:${first})`,
    images: [
      {
        publicId: first,
        url: '/original.png',
        width: 2000,
        height: 1000,
        fileSize: 10000,
        contentType: 'image/png',
        preview: { url: '/preview.webp', width: 1600, height: 800, fileSize: 1000, contentType: 'image/webp' },
      },
    ],
  });
  app.mount(host);
  expect(host.querySelector('.inline-image img')?.getAttribute('src')).toBe('/preview.webp');
  host.querySelector<HTMLButtonElement>('.inline-image button')!.click();
  await vi.dynamicImportSettled();
  for (let n = 0; n < 5; n++) await nextTick();
  await vi.waitFor(() => expect(host.querySelector('.test-original')?.getAttribute('src')).toContain('/original.png'));
  expect(host.querySelector('.inline-image img')?.getAttribute('src')).toBe('/preview.webp');
  app.unmount();
});
