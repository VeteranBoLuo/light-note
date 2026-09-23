import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import BCard from './BCard.vue';
import { applyUiDensity } from '@/composables/useUiDensity';
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); applyUiDensity('medium'); });
function mount(props: Record<string, unknown> = {}) {
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp({render: () => h(BCard, props)}); app.mount(host);
  cleanups.push(() => { app.unmount(); host.remove(); });
  return (name: string) => (host.firstElementChild as HTMLElement).style.getPropertyValue(name);
}
describe('BCard interface density', () => {
  it('updates default dimensions and restores exact standard values', async () => {
    applyUiDensity('medium'); const style = mount();
    expect(style('--b-card-padding')).toBe('16px');
    expect(style('--b-card-title-size')).toBe('14px');
    applyUiDensity('small'); await nextTick();
    expect(style('--b-card-padding')).toBe('14px');
    expect(style('--b-card-title-size')).toBe('13px');
    applyUiDensity('large'); await nextTick();
    expect(style('--b-card-padding')).toBe('18px');
    expect(style('--b-card-title-size')).toBe('15px');
    applyUiDensity('medium'); await nextTick();
    expect(style('--b-card-padding')).toBe('16px');
    expect(style('--b-card-title-size')).toBe('14px');
    expect(style('--b-card-radius')).toBe('14px');
  });
  it('scales px shorthands once and keeps touch profiles at standard', async () => {
    applyUiDensity('small'); const style = mount({padding:'18px 22px 4px',size:'16px'});
    expect(style('--b-card-padding')).toBe('15px 19px 3px');
    expect(style('--b-card-title-size')).toBe('14px');
    applyUiDensity('large', true); await nextTick();
    expect(style('--b-card-padding')).toBe('18px 22px 4px');
    expect(style('--b-card-title-size')).toBe('16px');
  });
  it('preserves caller-owned expressions, variables and relative units', () => {
    applyUiDensity('small');
    for (const padding of ['var(--ui-space-16, 16px)', 'calc(10px + 1vw)', '1rem 0', '0']) {
      const style=mount({padding,size:'var(--ui-font-16, 16px)'});
      expect(style('--b-card-padding')).toBe(padding);
      expect(style('--b-card-title-size')).toBe('var(--ui-font-16, 16px)');
    }
  });
});
