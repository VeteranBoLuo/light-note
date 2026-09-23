// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import SvgIcon from './SvgIcon.vue';
import icon from '@/config/icon';
import { applyUiDensity } from '@/composables/useUiDensity';
let cleanup = () => {};
afterEach(() => { cleanup(); applyUiDensity('medium'); });
it('sizes UI icons once, including missing-source fallbacks, and restores standard dimensions', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp({ components: { SvgIcon }, setup: () => ({ icon }), template: '<div><SvgIcon :src="icon.arrow_left" :size="28"/><SvgIcon src="" :size="28"/><SvgIcon :src="icon.arrow_left" :size="28" :density-aware="false"/></div>' });
  app.mount(host); cleanup = () => { app.unmount(); host.remove(); };
  const sizes = () => [...host.querySelectorAll('[style]')].map(e => (e as HTMLElement).style.width).filter(Boolean);
  applyUiDensity('medium'); await nextTick(); expect(sizes()).toEqual(['28px','28px','28px']);
  applyUiDensity('small'); await nextTick(); expect(sizes()).toEqual(['25px','25px','28px']);
  applyUiDensity('large'); await nextTick(); expect(sizes()).toEqual(['31px','31px','28px']);
  applyUiDensity('medium'); await nextTick(); expect(sizes()).toEqual(['28px','28px','28px']);
});
