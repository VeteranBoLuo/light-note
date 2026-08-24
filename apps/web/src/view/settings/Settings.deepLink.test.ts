import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/settings/Settings.vue'), 'utf8');

describe('设置页分类深链接', () => {
  it('通过统一 section 映射定位，不为 AI 用量写死滚动偏移', () => {
    expect(source).toContain('SETTINGS_SECTION_ANCHOR[section]');
    expect(source).toContain('parseSettingsSection(rawSection, settingsEnv.value)');
    expect(source).not.toMatch(/section\s*===\s*['"]ai['"][\s\S]{0,120}scroll/);
  });

  it('在异步设置项改变高度后继续校准，并在用户操作后停止', () => {
    expect(source).toContain('new ResizeObserver(align)');
    expect(source).toContain('deepLinkTargetAnchor');
    expect(source).toContain('8000');
    expect(source).toContain("addEventListener('wheel', stopDeepLinkAlignment");
    expect(source).toContain("addEventListener('pointerdown', stopDeepLinkAlignment");
  });

  it('路由 query 后续变化也会重新定位对应分类', () => {
    expect(source).toMatch(/watch\([\s\S]*?\(\) => route\.query\.section[\s\S]*?alignDesktopDeepLink\(section\)/);
  });
});
