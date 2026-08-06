import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import BChip from './BChip.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountChip(props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const onClick = vi.fn();
  const app = createApp({
    setup: () => () => h(BChip, { tone: 'tag', ...props, onClick }, { default: () => '工作' }),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onClick };
}

describe('BChip', () => {
  it('默认使用无交互 span，并暴露语义色与尺寸 class', () => {
    const { host } = mountChip();
    const chip = host.querySelector<HTMLElement>('span.b-chip');
    expect(chip?.classList.contains('b-chip--tag')).toBe(true);
    expect(chip?.classList.contains('b-chip--small')).toBe(true);
    expect(chip?.textContent).toContain('工作');
  });

  it('交互态使用原生非提交按钮，并透传点击', () => {
    const { host, onClick } = mountChip({ interactive: true, size: 'medium', maxWidth: '96px', title: '很长的标签' });
    const chip = host.querySelector<HTMLButtonElement>('button.b-chip');
    expect(chip?.type).toBe('button');
    expect(chip?.classList.contains('b-chip--medium')).toBe(true);
    expect(chip?.style.maxWidth).toBe('96px');
    expect(chip?.title).toBe('很长的标签');
    chip?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('选中态同时提供 class、实色描边钩子和 aria-pressed', () => {
    const { host } = mountChip({ interactive: true, selected: true });
    const chip = host.querySelector<HTMLButtonElement>('button.b-chip');
    expect(chip?.classList.contains('b-chip--selected')).toBe(true);
    expect(chip?.getAttribute('aria-pressed')).toBe('true');
  });

  it('禁用交互态使用原生 disabled，且不会触发点击', () => {
    const { host, onClick } = mountChip({ interactive: true, disabled: true });
    const chip = host.querySelector<HTMLButtonElement>('button.b-chip');
    expect(chip?.disabled).toBe(true);
    expect(chip?.getAttribute('aria-disabled')).toBe('true');
    chip?.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
