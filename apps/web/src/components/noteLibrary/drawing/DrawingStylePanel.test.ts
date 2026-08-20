import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DrawingStylePanel from './DrawingStylePanel.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('DrawingStylePanel', () => {
  const mounted: Array<{ app: ReturnType<typeof createApp>; host: HTMLElement }> = [];

  afterEach(() => {
    mounted.splice(0).forEach(({ app, host }) => {
      app.unmount();
      host.remove();
    });
  });

  it('同时提供常用色、32 色完整色板、最近颜色、自定义颜色和连续尺寸', async () => {
    const colors: string[] = [];
    const sizes: number[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingStylePanel, {
      activeColor: '#1f2937',
      commonColors: ['#1f2937', '#ffffff', '#615ced', '#00a884', '#2563eb', '#dc2626', '#ea580c', '#6b7280'],
      paletteColors: Array.from({ length: 32 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`),
      recentColors: ['#123456', '#abcdef'],
      colorEnabled: true,
      sizeEnabled: true,
      activeSize: 4,
      sizeLabel: '线宽',
      sizeOptions: [2, 4, 7, 12, 20],
      sizeRange: { min: 1, max: 24 },
      onChooseColor: (color: string) => colors.push(color),
      onChooseSize: (size: number) => sizes.push(size),
    });
    app.mount(host);
    mounted.push({ app, host });
    await nextTick();

    expect(host.querySelectorAll('.drawing-style-colors--common button')).toHaveLength(8);
    expect(host.querySelectorAll('.drawing-style-colors--palette button')).toHaveLength(32);
    expect(host.querySelectorAll('.drawing-style-colors--recent button')).toHaveLength(2);
    expect(host.querySelectorAll('.drawing-style-size-option')).toHaveLength(5);
    (host.querySelector('button[aria-label="#615ced"]') as HTMLButtonElement).click();
    expect(colors).toEqual(['#615ced']);

    const range = host.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '11';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(sizes).toEqual([11]);
  });
});
