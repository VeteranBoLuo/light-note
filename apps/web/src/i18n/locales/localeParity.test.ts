import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import enUS from './en-US';
import zhCN from './zh-CN';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('locale key parity', () => {
  it('keeps Chinese and English translation leaf keys symmetric', () => {
    expect(leafKeys(enUS).sort()).toEqual(leafKeys(zhCN).sort());
  });

  it('compiles the resource mention failure message without linked-format syntax errors', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    });

    expect(i18n.global.t('note.resourceMention.insertFailed')).toContain('插入位置');
    i18n.global.locale.value = 'en-US';
    expect(i18n.global.t('note.resourceMention.insertFailed')).toContain('insertion position');
  });
});
