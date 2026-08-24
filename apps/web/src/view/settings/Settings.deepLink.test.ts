import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/settings/Settings.vue'), 'utf8');
const commonRouterSource = readFileSync(resolve(process.cwd(), 'src/router/modules/common.ts'), 'utf8');

describe('设置页分类深链接', () => {
  it('普通设置分类通过统一 section 映射定位，不写死分类滚动偏移', () => {
    expect(source).toContain('SETTINGS_SECTION_ANCHOR[section]');
    expect(source).toContain('parseSettingsSection(rawSection, settingsEnv.value)');
    expect(source).not.toMatch(/section\s*===\s*['"]ai['"][\s\S]{0,120}scroll/);
  });

  it('旧 AI 设置深链接兼容重定向到独立用量页', () => {
    expect(commonRouterSource).toContain("to.query.section[0] : to.query.section) === 'ai'");
    expect(commonRouterSource).toContain("{ name: 'aiUsage', replace: true }");
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
