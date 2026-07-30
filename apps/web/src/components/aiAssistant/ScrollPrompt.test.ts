import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import zhCN from '@/i18n/locales/zh-CN';
import scrollPromptSource from './ScrollPrompt.vue?raw';

const androidCompatStyles = readFileSync(resolve(process.cwd(), 'src/assets/css/android-webview-compat.less'), 'utf8');

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<span class="svg-icon-stub" aria-hidden="true"></span>' },
}));

const { default: ScrollPrompt } = await import('./ScrollPrompt.vue');

let cleanup: (() => void) | undefined;

async function mountPrompt(isLoading: boolean) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ScrollPrompt, { isLoading });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.directive('click-log', {});
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('ScrollPrompt', () => {
  it('加载时启用旋转态，并避免旧 WebView 不支持的 inset 简写', async () => {
    const host = await mountPrompt(true);
    const button = host.querySelector<HTMLButtonElement>('.prompt-icon');
    const spinner = host.querySelector<HTMLElement>('.loading-spinner');

    expect(button?.classList.contains('is-loading')).toBe(true);
    expect(spinner).not.toBeNull();
    expect(scrollPromptSource).not.toContain('inset: 0');
    expect(scrollPromptSource).toMatch(/\.loading-spinner\s*\{[\s\S]*?top:\s*0;/);
    expect(scrollPromptSource).toMatch(/\.loading-spinner\s*\{[\s\S]*?box-sizing:\s*border-box;/);
    expect(scrollPromptSource).toMatch(/\.prompt-icon\s*\{[\s\S]*?border:\s*0;/);
    expect(scrollPromptSource).toMatch(
      /\.prompt-icon\.is-loading \.loading-spinner\s*\{[\s\S]*?border:\s*2px solid rgba\(97, 92, 237, 0\.14\);/,
    );
    expect(androidCompatStyles).toMatch(/\.scroll-prompt \.prompt-icon\s*\{[\s\S]*?flex:\s*0 0 44px;/);
    expect(androidCompatStyles).toMatch(/\.scroll-prompt \.prompt-icon\s*\{[\s\S]*?border:\s*0;/);
    expect(androidCompatStyles).toMatch(
      /\.scroll-prompt \.loading-spinner\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/,
    );
  });

  it('非加载态保留回到底部按钮且不显示旋转态', async () => {
    const host = await mountPrompt(false);
    const button = host.querySelector<HTMLButtonElement>('.prompt-icon');

    expect(button).not.toBeNull();
    expect(button?.classList.contains('is-loading')).toBe(false);
    expect(button?.getAttribute('aria-label')).toBeTruthy();
  });
});
