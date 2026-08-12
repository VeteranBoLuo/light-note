import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const personCenterSource = source('src/view/personCenter/PersonCenterMobile.vue');
const desktopPersonCenterSource = source('src/view/personCenter/PersonCenter.vue');
const myInfoSource = source('src/components/personCenter/myInfo/MyInfoMobile.vue');
const desktopMyInfoSource = source('src/components/personCenter/myInfo/MyInfo.vue');
const framePickerSource = source('src/components/growth/AvatarFramePickerDrawer.vue');
const avatarFrameSource = source('src/components/growth/AvatarFramePreview.vue');
const pointsShopSource = source('src/components/growth/PointsShop.vue');
const achievementWallSource = source('src/components/growth/AchievementWall.vue');
const growthPageSource = source('src/view/growth/GrowthPage.vue');
const tabsSource = source('src/components/base/BasicComponents/BTabs.vue');
const navigationRightAreaSource = source('src/components/home/navigation/RightArea.vue');
const mobileTopBarSource = source('src/components/mobile/MobileTopBar.vue');
const opinionSource = source('src/components/personCenter/opinions/OpinionPanel.vue');
const passwordDialogSource = source('src/components/personCenter/myInfo/PassConfigDlg.vue');

describe('mobile personal center experience', () => {
  it('keeps quick access entries in a strict four-column equal-width grid', () => {
    expect(personCenterSource).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(personCenterSource).toMatch(/\.profile-quick-item\s*\{[\s\S]*?width:\s*100%;/);
    expect(personCenterSource).not.toContain('profile-overview');
  });

  it('shows only the account email in the profile summary and keeps role labels inside profile editing', () => {
    expect(personCenterSource).toContain('<span v-if="user.email">{{ user.email }}</span>');
    expect(personCenterSource).not.toContain('{{ roleName }}');
    expect(myInfoSource).toContain('resolveAccountRoleLabelKey(user.role, user.id)');
    expect(desktopMyInfoSource).toContain('resolveAccountRoleLabelKey(user.role, user.id)');
  });

  it('keeps co-build visible in both desktop and mobile personal centers for visitors', () => {
    expect(personCenterSource).toContain("goToProfileModule('/co-build')");
    expect(personCenterSource).toContain("t('personCenter.coBuildDesc')");
    expect(desktopPersonCenterSource).toContain("path: '/co-build'");
    expect(desktopPersonCenterSource).not.toMatch(/name:\s*'coBuild'[\s\S]{0,180}authOnly:\s*true/);
  });

  it('exposes the equipped frame and the frame picker from profile editing', () => {
    expect(myInfoSource).toContain('<AvatarFramePreview');
    expect(myInfoSource).toContain(
      '<AvatarFramePickerDrawer v-model:open="frameDrawerOpen" @navigate="handleFrameNavigation" />',
    );
    expect(desktopMyInfoSource).toContain('<AvatarFramePreview');
    expect(desktopMyInfoSource).toContain('@navigate="handleFrameNavigation"');
    expect(desktopMyInfoSource).toContain("t('myInfo.chooseAvatarFrame')");
    expect(myInfoSource).toContain('<MobileStickyActionBar');
    expect(framePickerSource).toContain('await buyItem(frame.id)');
    expect(framePickerSource).toContain('await equipFrame(frame.id)');
    expect(framePickerSource).toContain('isMobileLayout.value ? BDrawer : BModal');
    expect(framePickerSource).toContain("modalClass: 'frame-picker-modal'");
    expect(framePickerSource).toContain('frame-picker__detail');
    expect(framePickerSource).toMatch(/\.frame-picker__detail\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(framePickerSource).toContain(':size="86"');
    expect(framePickerSource).toContain('sortFramesByRarity(');
    expect(framePickerSource).toContain('achievementRequirement(frame)');
    expect(framePickerSource).toContain("t('growth.frameAchievementConditionWithLevel'");
    expect(framePickerSource).toContain("t('growth.frameAchievementLevelProgress'");
    expect(framePickerSource).toContain('canEquipFrame(frame)');
    expect(framePickerSource).toContain("t('growth.shopRootPreview')");
    expect(pointsShopSource).toContain('<template v-if="canEquipFrame(it)">');
    expect(pointsShopSource).toContain(
      "return it.type === 'cosmetic' && Boolean(it.canEquip || it.owned || shop.value?.rootFrameAccess);",
    );
    expect(framePickerSource).not.toContain('dvh');
  });

  it('keeps compact equipped avatars visually identical to the full preview instead of clipping effects', () => {
    expect(avatarFrameSource).toContain('const FRAME_DESIGN_AVATAR_SIZE = 64');
    expect(avatarFrameSource).toContain('<span class="avatar-frame__canvas">');
    expect(avatarFrameSource).toContain(':size="FRAME_DESIGN_AVATAR_SIZE"');
    expect(avatarFrameSource).toContain("'--frame-canvas-scale': String(scale)");
    expect(avatarFrameSource).toContain('Math.round(FRAME_DESIGN_OUTER_SIZE * scale)');
    expect(avatarFrameSource).toContain("'--frame-constellation-stroke': `${constellationStroke}px`");
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame__canvas\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?transform:\s*translate\(-50%, -50%\) scale\(var\(--frame-canvas-scale\)\);/,
    );
    expect(avatarFrameSource).toMatch(/\.avatar-frame\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--celestial \.avatar-frame__orbit\s*\{[\s\S]*?inset:\s*-10% -13%[\s\S]*?transform:\s*rotate\(18deg\) scaleY\(0\.86\);[\s\S]*?frame-celestial-orbit/,
    );
    expect(avatarFrameSource).toMatch(
      /@keyframes frame-celestial-orbit\s*\{[\s\S]*?transform:\s*rotate\(378deg\) scaleY\(0\.86\);/,
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--celestial \.avatar-frame__motif\s*\{[\s\S]*?border:\s*var\(--frame-constellation-stroke\) dotted/,
    );
    expect(avatarFrameSource).not.toContain('avatar-frame--compact');
    expect(desktopPersonCenterSource).toMatch(/\.navigation-icon\.has-frame\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(navigationRightAreaSource).toMatch(/\.navigation-icon\.has-frame\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(mobileTopBarSource).toMatch(/\.mobile-top-bar__profile\s*\{[\s\S]*?overflow:\s*visible;/);
  });

  it('closes avatar overlay history before navigating and stabilizes the initial frame tabs', () => {
    expect(framePickerSource).toContain('closeCurrentMobileOverlayThen(closeDrawer');
    expect(framePickerSource).toContain("emit('navigate', 'achievements')");
    expect(framePickerSource).toContain("emit('navigate', 'tasks')");
    expect(framePickerSource).toContain('@click="goEarnPoints"');
    expect(desktopMyInfoSource).toContain('visible.value = false');
    expect(desktopMyInfoSource).toContain("query: { section: 'tasks' }");
    expect(framePickerSource).toContain('flex: 0 0 38px');
    expect(framePickerSource).toContain('flex: 1 1 50%');
  });

  it('keeps paid-frame prices visible after ownership and uses a wider desktop achievement layout', () => {
    expect(pointsShopSource).toMatch(/v-else class="ps-purchase-meta"[\s\S]*?\{\{ it\.cost \}\}/);
    expect(pointsShopSource).toContain("t('growth.frameAchievementConditionWithLevel'");
    expect(pointsShopSource).toContain("t('growth.frameAchievementLevelProgress'");
    expect(framePickerSource).toMatch(/v-if="!isAchievementFrame\(frame\)" class="frame-card__cost"/);
    expect(achievementWallSource).toContain('grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))');
    expect(achievementWallSource).toContain('conditionOf(a)');
    expect(achievementWallSource).toContain('class="aw-mini-level"');
  });

  it('returns the shared growth scroller to the top on both tab changes and active-tab reselection', () => {
    expect(growthPageSource).toContain('@select="handleSectionTabSelect"');
    expect(growthPageSource).toContain('resetMobileScrollElement(growthPageRef.value)');
    expect(growthPageSource).toContain('() => route.query.section');
    expect(growthPageSource).toContain('activeSection.value = nextSection');
    expect(tabsSource).toContain("emit('select', value)");
    expect(tabsSource).toMatch(/emit\('select', value\);[\s\S]*?if \(activeValue\.value === value\)/);
  });

  it('uses a mobile password drawer while retaining the desktop modal', () => {
    expect(passwordDialogSource).toContain('isMobile.value ? BDrawer : BModal');
    expect(passwordDialogSource).toContain("placement: 'bottom' as const");
    expect(passwordDialogSource).toContain('password-shell--mobile');
    expect(passwordDialogSource).toContain('<BInput');
    expect(passwordDialogSource).not.toMatch(/<(?:button|input|select|textarea|svg)\b/i);
  });

  it('uses the mobile feedback composition and B components without native controls', () => {
    expect(opinionSource).toContain('<MobileNoticeStrip');
    expect(opinionSource).toContain('<MobileStickyActionBar');
    expect(opinionSource).toContain('opinionData.content.trim().length >= 6');
    expect(opinionSource).toContain(':maxlength="500"');
    expect(opinionSource).not.toMatch(/<(?:button|input|select|textarea|svg)\b/i);
  });
});
