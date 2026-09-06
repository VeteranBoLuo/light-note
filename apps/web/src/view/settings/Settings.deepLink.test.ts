import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/settings/Settings.vue'), 'utf8');
const commonRouterSource = readFileSync(resolve(process.cwd(), 'src/router/modules/common.ts'), 'utf8');
const preferenceSource = readFileSync(resolve(process.cwd(), 'src/view/settings/useDailyBriefPreference.ts'), 'utf8');

describe('设置页端型与深链接状态矩阵', () => {
  it('桌面端使用左侧分类目录，目录由 settingsRegistry 的唯一事实源生成', () => {
    expect(source).toContain('class="settings-desktop-sidebar"');
    expect(source).toContain("'is-full-desktop': bookmark.isDesktop");
    expect(source).toContain('v-for="section in desktopNavigationRows"');
    expect(source).toContain('visibleSettingsSections(settingsEnv.value).map((meta)');
    expect(source).toContain('title: t(meta.titleKey)');
    expect(source).not.toContain('const anchors = computed');
  });

  it('仅完整桌面放宽设置画布，并把 AI 偏好拆成页头与独立设置卡', () => {
    expect(source).toMatch(/\.settings-container\.is-full-desktop\s*\{[\s\S]*?max-width:\s*1380px/);
    expect(source).toMatch(
      /\.settings-container\.is-full-desktop \.settings-desktop-sidebar\s*\{[\s\S]*?min-height:\s*520px/,
    );
    expect(source).toMatch(
      /\.settings-container\.is-full-desktop \.settings-card--ai\s*\{[\s\S]*?background:\s*transparent/,
    );
    expect(source).toContain('class="field ai-daily-brief-field"');
  });

  it('桌面选中态直接解析 section query，刷新和深链接不依赖本地状态', () => {
    expect(source).toContain('parseSettingsSection(route.query.section, settingsEnv.value)');
    expect(source).toMatch(
      /const desktopSection = computed<SettingsIndexSectionId>\([\s\S]*?parsedSection\.value[\s\S]*?['"]appearance['"]/,
    );
    expect(source).toContain("const targetPanel = id === 'ai' ? 'usage' : undefined");
    expect(source).toContain("void router.replace({ path: '/settings', query })");
    expect(source).toMatch(/return bookmark\.isMobile \? mobileSection\.value === id : desktopSection\.value === id/);
  });

  it('桌面 AI 分类在设置壳内展示用量，独立旧路由仍保留兼容', () => {
    const settingsRecord = commonRouterSource.slice(
      commonRouterSource.indexOf("path: '/settings'"),
      commonRouterSource.indexOf("path: '/ai-usage'"),
    );
    expect(settingsRecord).not.toContain('beforeEnter');
    expect(commonRouterSource).toContain("path: '/ai-usage'");
    expect(source).toContain("<AiUsagePage v-if=\"aiSettingsPanel === 'usage'\"");
    expect(source).toContain("route.query.panel === 'routines' ? 'routines' : 'usage'");
    expect(source).not.toContain("router.push('/ai-usage')");
  });

  it('移动端仍使用原目录/子页，AI 用量也留在设置子页', () => {
    expect(source).toContain('<SettingsMobileIndex v-if="showMobileIndex"');
    expect(source).toContain(
      'const showMobileIndex = computed(() => bookmark.isMobile && mobileSection.value === null)',
    );
    expect(source).toContain("router.push({ path: '/settings', query: { section: id, ...(id === 'ai' ? { panel: 'usage' } : {}) } })");
    expect(source).toContain("function selectAiSettingsPanel(panel: 'usage' | 'routines')");
    expect(source).not.toMatch(/section === 'ai'[\s\S]{0,180}\/ai-usage/);
  });

  it('今日简报开关只在 AI 例行任务面板懒加载，保存失败会回滚并通知', () => {
    expect(source).toContain("if (section === 'ai' && panel === 'routines' && dailyBriefPreferenceWritable.value)");
    expect(source).toContain('parsedSection, aiSettingsPanel, dailyBriefPreferenceOwnerKey');
    expect(source).toContain('user.adminContext?.subjectUserId');
    expect(source).toContain('ownerKey: dailyBriefPreferenceOwnerKey');
    expect(source).toContain('writable: dailyBriefPreferenceWritable');
    expect(source).toMatch(
      /<div v-if="dailyBriefPreferenceWritable" class="field ai-daily-brief-field">\s*<div class="field-head">[\s\S]*?<span class="field-label">\{\{ t\('settings\.ai\.dailyBriefTitle'\)/,
    );
    expect(source).toMatch(
      /<div v-if="!bookmark\.isMobile" class="field">\s*<div class="field-head">\s*<span class="field-label">\{\{ t\('settings\.uiScale'\)/,
    );
    expect(source).toMatch(
      /<div v-if="!bookmark\.isMobile" class="field">\s*<div class="field-head">\s*<span class="field-label">\{\{ t\('settings\.noteDirectEdit'\)/,
    );
    expect(source).toContain(
      ':disabled="dailyBriefPreferenceLoading || dailyBriefPreferenceSaving || !dailyBriefFeatureEnabled"',
    );
    expect(preferenceSource).toMatch(
      /async function save[\s\S]*?const previous = enabled\.value[\s\S]*?enabled\.value = previous[\s\S]*?message\.warning/,
    );
    expect(source).not.toMatch(/dailyBrief[\s\S]{0,120}(estimated|tokens|cost)/i);
    expect(source).toMatch(/\.ai-brief-detail\s*\{\s*grid-column: 2;/);
  });
});
