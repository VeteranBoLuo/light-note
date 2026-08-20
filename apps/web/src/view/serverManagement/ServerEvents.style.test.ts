import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/serverManagement/ServerEvents.vue'), 'utf8');

describe('服务器日志可读性', () => {
  it('显式覆盖全局 pre 主题色，保证固定深色日志面板在全端都有浅色文字', () => {
    expect(source).toMatch(/\.events-logs\s*\{[\s\S]*?color:\s*#dbe7f5\s*!important;/u);
    expect(source).toMatch(/\.events-logs code\s*\{[\s\S]*?color:\s*inherit\s*!important;/u);
  });
});
