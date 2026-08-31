import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'Settings.vue'), 'utf8');
const zhLocaleSource = readFileSync(resolve(process.cwd(), 'src/i18n/locales/zh-CN.ts'), 'utf8');
const enLocaleSource = readFileSync(resolve(process.cwd(), 'src/i18n/locales/en-US.ts'), 'utf8');

describe('设置页浏览器收集入口', () => {
  it('把完整扩展与轻量书签栏收藏作为两种独立方式展示', () => {
    expect(source).toContain("t('settings.browserCaptureTitle')");
    expect(source).toContain('browser-capture-card--extension');
    expect(source).toContain('browser-capture-card--bookmarklet');
    expect(source).toContain('openBrowserExtensionStore');
    expect(source).toContain('openBrowserExtensionDetails');
    expect(source).toContain('BROWSER_EXTENSION_LANDING_PATH');
    expect(source).toContain('openChromeWebStore');
    expect(source).toContain("from '@/config/browserExtension.ts'");
    expect(source).not.toContain('hfdpgaiggloacopnkihfkloicjepldig');
  });

  it('书签名称只包含本地化标题，不把装饰图标拖进浏览器书签栏', () => {
    const anchor = source.match(/<a\s+ref="bmRef"[\s\S]*?<\/a>/u)?.[0];

    expect(anchor).toBeTruthy();
    expect(anchor).toContain(`v-text="t('settings.quickSaveBtn')"`);
    expect(anchor).not.toMatch(/[\p{Extended_Pictographic}\uFE0F]/u);
    expect(anchor).not.toContain('<SvgIcon');
    expect(zhLocaleSource).toContain("quickSaveBtn: '轻笺收藏'");
    expect(enLocaleSource).toContain("quickSaveBtn: 'Save to LightNote'");
  });

  it('仍保留 javascript bookmarklet，避免为 favicon 改成普通网址后丢失当前页面上下文', () => {
    expect(source).toContain('javascript:(function(){');
    expect(source).toContain("window.getSelection?window.getSelection():'')");
    expect(source).toContain("window.open(o+'/quick-save?u='+u+'&t='+t+'&d='+s");
  });
});
