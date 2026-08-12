import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BButton from './BButton.vue';

const buttonSource = readFileSync(resolve(process.cwd(), 'src/components/base/BasicComponents/BButton.vue'), 'utf8');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountButton(props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const onClick = vi.fn();
  const app = createApp({
    setup() {
      return () => h(BButton, { ...props, onClick }, { default: () => 'Save' });
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
