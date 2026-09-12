import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BButton from './BButton.vue';

const buttonSource = readFileSync(resolve(process.cwd(), 'src/components/base/BasicComponents/BButton.vue'), 'utf8');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountButton(props: Record<string, unknown> = {}, slot = () => h('span', 'Save')) {
  const host = document.createElement('div');
  document.body.append(host);
  const onClick = vi.fn();
  const app = createApp({
    setup() {
      return () => h(BButton, { ...props, onClick }, { default: slot });
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onClick };
}

describe('BButton semantics', () => {
  it('renders a native non-submit button and remains keyboard clickable', () => {
    const { host, onClick } = mountButton();
    const button = host.querySelector<HTMLButtonElement>('button.b_btn');
    expect(button?.type).toBe('button');
    button?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('uses the native disabled state while disabled or loading', async () => {
    const { host, onClick } = mountButton({ loading: true });
    const button = host.querySelector<HTMLButtonElement>('button.b_btn');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
    button?.click();
    await nextTick();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards an explicitly requested native form type', () => {
    const { host } = mountButton({ nativeType: 'submit' });
    expect(host.querySelector<HTMLButtonElement>('button.b_btn')?.type).toBe('submit');
  });

  it('supports filling the available row width', () => {
    const { host } = mountButton({ block: true });
    expect(host.querySelector<HTMLButtonElement>('button.b_btn')?.classList.contains('is-block')).toBe(true);
  });

  it('只在真正支持悬浮的精细指针设备上绘制 hover，避免触屏残留状态', () => {
    expect(buttonSource).toContain('@media (hover: hover) and (pointer: fine)');
    expect(buttonSource).not.toMatch(/\.default_btn\s*\{[\s\S]*?&:hover/u);
  });
});


describe('BButton loading content', () => {
  it('keeps the label after the spinner for a text action', () => {
    const { host } = mountButton({ loading: true });
    const button = host.querySelector('button')!;
    expect(button.firstElementChild?.classList.contains('btn-spinner')).toBe(true);
    expect(button.textContent).toBe('Save');
    expect(button.querySelector('.btn-icon')).toBeNull();
  });

  it('preserves the icon slot and accessible name across loading and retry', async () => {
    const props = reactive({ iconOnly: true, loading: false, 'aria-label': 'Delete project' });
    const { host, onClick } = mountButton(props, () => h('span', { class: 'test-icon' }, '×'));
    const button = host.querySelector<HTMLButtonElement>('button')!;
    const icon = button.querySelector('.test-icon');
    for (let attempt = 0; attempt < 2; attempt++) {
      props.loading = true;
      await nextTick();
      expect(button.querySelector('.test-icon')).toBe(icon);
      expect(button.querySelector('.btn-icon-content')?.getAttribute('aria-hidden')).toBe('true');
      expect(button.querySelector('.btn-icon-content')?.classList.contains('is-loading')).toBe(true);
      expect(button.querySelectorAll('.btn-spinner')).toHaveLength(1);
      expect(button.getAttribute('aria-label')).toBe('Delete project');
      button.click();
      expect(onClick).not.toHaveBeenCalled();
      props.loading = false;
      await nextTick();
      expect(button.disabled).toBe(false);
      expect(button.querySelector('.btn-spinner')).toBeNull();
      expect(button.querySelector('.btn-icon-content')?.classList.contains('is-loading')).toBe(false);
    }
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
