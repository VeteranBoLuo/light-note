import { describe, expect, it } from 'vitest';
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
});
