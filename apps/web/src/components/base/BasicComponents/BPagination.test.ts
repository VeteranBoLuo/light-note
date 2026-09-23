import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import BPagination from './BPagination.vue';

describe('pagination custom page sizes', () => {
  it('shows the current page size even when it is not a preset', async () => {
    const pageSize = ref(12);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({ render: () => h(BPagination, { pageSize: pageSize.value, total: 30 }) });
    app.use(createI18n({ legacy: false, locale: 'en', messages: { en: { common: {
      perPage: '{n} per page', totalItems: '{n} items', prevPage: 'Previous', nextPage: 'Next',
    } } } }));
    try {
      app.mount(host);
      await nextTick();
      expect(host.querySelector('.select-text')?.textContent).toBe('12 per page');
      (host.querySelector('.select-trigger') as HTMLElement).click();
      await nextTick();
      expect([...document.querySelectorAll('.bpagination__sizer-dropdown .select-option-label')]
        .map(option => option.textContent?.trim())).toEqual(['10 per page', '20 per page', '50 per page', '100 per page']);
      pageSize.value = 20;
      await nextTick();
      expect(host.querySelector('.select-text')?.textContent).toBe('20 per page');
    } finally {
      app.unmount();
      host.remove();
    }
  });
});
