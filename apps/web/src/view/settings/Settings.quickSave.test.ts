import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'Settings.vue'), 'utf8');

describe('设置页快速收藏按钮', () => {
  it('书签名称只包含本地化标题，不把装饰图标拖进浏览器书签栏', () => {
    const anchor = source.match(/<a\s+ref="bmRef"[\s\S]*?<\/a>/u)?.[0];

    expect(anchor).toBeTruthy();
    expect(anchor).toContain(`v-text="t('settings.quickSaveBtn')"`);
    expect(anchor).not.toMatch(/[\p{Extended_Pictographic}\uFE0F]/u);
    expect(anchor).not.toContain('<SvgIcon');
  });

  it('仍保留 javascript bookmarklet，避免为 favicon 改成普通网址后丢失当前页面上下文', () => {
    expect(source).toContain('javascript:(function(){');
    expect(source).toContain("window.getSelection?window.getSelection():'')");
    expect(source).toContain("window.open(o+'/quick-save?u='+u+'&t='+t+'&d='+s");
  });
});
