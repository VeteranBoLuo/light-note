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
const iconSource = source('src/config/icon.ts');
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
    expect(desktopPersonCenterSource).toContain(':size="32"');
    expect(desktopPersonCenterSource).toMatch(/\.navigation-icon\.has-frame\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(navigationRightAreaSource).toMatch(/\.navigation-icon\.has-frame\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(mobileTopBarSource).toMatch(/\.mobile-top-bar__profile\s*\{[\s\S]*?overflow:\s*visible;/);
  });

  it('keeps free and paid frame effects aligned with acquisition, price and rarity', () => {
    const section = (start: string, end: string) =>
      avatarFrameSource.slice(avatarFrameSource.indexOf(start), avatarFrameSource.indexOf(end));
    const paidBasicSection = section('/* 薄荷：', '/* 初光：');
    const freeAdvancedSection = section('/* 七日晨光：', '/* 鎏金：');
    const goldSection = avatarFrameSource.slice(
      avatarFrameSource.indexOf('/* 鎏金：'),
      avatarFrameSource.indexOf('/* 樱绯：'),
    );
    const oceanSection = section('/* 潮汐：', '/* 极光：');
    const auroraSection = avatarFrameSource.slice(
      avatarFrameSource.indexOf('/* 极光：'),
      avatarFrameSource.indexOf('/* 星河：'),
    );
    const galaxySection = avatarFrameSource.slice(
      avatarFrameSource.indexOf('/* 星河：'),
      avatarFrameSource.indexOf('/* 赤焰：'),
    );
    const flameSection = avatarFrameSource.slice(
      avatarFrameSource.indexOf('/* 赤焰：'),
      avatarFrameSource.indexOf('/* 龙曜：'),
    );
    const neonSection = avatarFrameSource.slice(
      avatarFrameSource.indexOf('/* 霓虹：'),
      avatarFrameSource.indexOf('/* 晚霞：'),
    );
    const noteMasterpieceSection = section('/* 文心长河：', '/* 云阙宝库：');
    const fileVaultSection = section('/* 云阙宝库：', '/* 翰墨星海：');
    const streakMonthSection = section('/* 月华渐盈：', '/* 岁序长明：');
    const identityVariantSection = avatarFrameSource.slice(
      avatarFrameSource.indexOf('const FRAME_IDENTITY_VARIANTS ='),
      avatarFrameSource.indexOf('const props', avatarFrameSource.indexOf('const FRAME_IDENTITY_VARIANTS =')),
    );
    const identityStyleSection = avatarFrameSource.slice(
      avatarFrameSource.indexOf('/* 高阶传说身份结构：'),
      avatarFrameSource.indexOf('@keyframes frame-premium-orbit'),
    );
    const dragonBodyMotionSection = identityStyleSection.slice(
      identityStyleSection.indexOf('@keyframes frame-dragon-body-breathe'),
      identityStyleSection.indexOf('@keyframes frame-dragon-scale-sweep'),
    );
    const dragonHeadMotionSection = identityStyleSection.slice(
      identityStyleSection.indexOf('@keyframes frame-dragon-head-awaken'),
      identityStyleSection.indexOf('@keyframes frame-dragon-pearl'),
    );

    expect(paidBasicSection).not.toContain('animation:');
    expect(freeAdvancedSection).not.toContain('animation:');

    expect(goldSection).toContain('积分进阶入门档');
    expect(goldSection).toContain('animation: frame-gold-glint');
    expect(goldSection).toContain('animation: frame-premium-orbit 14s');
    expect(goldSection).not.toContain('avatar-frame__comet');

    expect(oceanSection).toContain('.avatar-frame--ocean .avatar-frame__ring::before');
    expect(oceanSection).toContain('animation: frame-ocean-current');
    expect(oceanSection).toContain('animation: frame-ocean-orbit');
    expect(oceanSection).not.toContain('avatar-frame__comet');

    expect(auroraSection).toContain('animation: frame-aurora-turn');
    expect(auroraSection).toContain('animation: frame-aurora-wave');
    expect(auroraSection).toContain('.avatar-frame--aurora .avatar-frame__orbit::before');
    expect(auroraSection).not.toContain('avatar-frame__comet');

    expect(flameSection).toContain('.avatar-frame--flame .avatar-frame__orbit::before');
    expect(flameSection).toContain('.avatar-frame--flame .avatar-frame__orbit::after');
    expect(flameSection).toContain('animation: frame-flame-comet');

    expect(neonSection).toContain('.avatar-frame--neon .avatar-frame__orbit::before');
    expect(neonSection).toContain('.avatar-frame--neon .avatar-frame__orbit::after');
    expect(neonSection).toContain('animation: frame-neon-comet');

    expect(galaxySection).toContain('.avatar-frame--galaxy .avatar-frame__ring::before');
    expect(galaxySection).toContain('.avatar-frame--galaxy .avatar-frame__motif::before');
    expect(galaxySection).toContain('.avatar-frame--galaxy .avatar-frame__orbit::before');
    expect(galaxySection).toContain('animation: frame-galaxy-comet');

    expect(avatarFrameSource).toContain('<span v-if="hasFrameIdentity" class="avatar-frame__signature"');
    expect(avatarFrameSource).toContain('<span class="avatar-frame__signature-mark"></span>');
    expect(avatarFrameSource).toContain("import icon from '@/config/icon'");
    expect(identityVariantSection).toContain("new Set(['dragon'])");
    expect(identityVariantSection).not.toContain("'galaxy'");
    expect(identityVariantSection).not.toContain("'neon'");
    expect(identityVariantSection).not.toContain("'celestial'");
    expect(identityVariantSection).not.toContain("'bookmark-archive'");
    expect(identityVariantSection).not.toContain("'note-constellation'");
    expect(identityVariantSection).not.toContain("'file-constellation'");
    expect(identityVariantSection).not.toContain("'streak-eternal'");
    expect(identityStyleSection).not.toContain('frame-signature-orbit');
    expect(identityStyleSection).not.toContain('frame-dragon-guardian');
    expect(avatarFrameSource).toContain(':src="icon.avatarFrame.dragonCrest"');
    expect(avatarFrameSource).toContain(':src="icon.avatarFrame.dragonHead"');
    expect(avatarFrameSource).toContain('const FRAME_DRAGON_ART_SIZE = 96');
    expect(avatarFrameSource.match(/:size="FRAME_DRAGON_ART_SIZE"/g)).toHaveLength(2);
    expect(iconSource.match(/viewBox="-6 -6 132 132"/g)).toHaveLength(2);
    expect(avatarFrameSource.indexOf('class="avatar-frame__dragon-head"')).toBeGreaterThan(
      avatarFrameSource.indexOf('class="avatar-frame__portrait"'),
    );
    expect(identityStyleSection).toContain('.avatar-frame--dragon .avatar-frame__dragon-crest');
    expect(identityStyleSection).toContain('.avatar-frame--dragon .avatar-frame__dragon-head');
    expect(identityStyleSection).toMatch(
      /\.avatar-frame--dragon \.avatar-frame__dragon-head\s*\{[\s\S]*?z-index:\s*3;/,
    );
    expect(identityStyleSection).toContain('animation: frame-dragon-body-breathe');
    expect(identityStyleSection).toContain('animation: frame-dragon-head-awaken');
    expect(identityStyleSection).toContain('animation: frame-dragon-pearl');
    expect(identityStyleSection).toContain('animation: frame-dragon-eye-flash');
    expect(identityStyleSection).toContain('animation: frame-dragon-breath-spark');
    expect(identityStyleSection).toContain('animation: frame-dragon-scale-sweep 6.4s');
    expect(identityStyleSection.match(/transform-origin: 50% 55%/g)).toHaveLength(2);
    expect(identityStyleSection).toContain('.avatar-frame--dragon .avatar-frame__portrait::after');
    expect(identityStyleSection).toContain('.avatar-frame--dragon .avatar-frame__dragon-head::before');
    expect(identityStyleSection).toContain('.avatar-frame--dragon .avatar-frame__dragon-head::after');
    expect(dragonBodyMotionSection).toContain('rotate(7deg)');
    expect(dragonBodyMotionSection).toContain('rotate(-3deg)');
    expect(dragonHeadMotionSection).toContain('rotate(7deg)');
    expect(dragonHeadMotionSection).toContain('rotate(-3deg)');
    expect(iconSource.match(/dragonHead:[\s\S]*?(?=\n\s*},)/)?.[0]).not.toContain('<linearGradient');
    expect(iconSource.match(/dragonHead:[\s\S]*?(?=\n\s*},)/)?.[0]).toContain('stroke-width="2.9"');
    expect(identityStyleSection).not.toContain('.avatar-frame--celestial');
    expect(identityStyleSection).not.toContain('.avatar-frame--bookmark-archive');
    expect(identityStyleSection).not.toContain('.avatar-frame--note-constellation');
    expect(identityStyleSection).not.toContain('.avatar-frame--file-constellation');
    expect(identityStyleSection).not.toContain('.avatar-frame--streak-eternal');
    expect(avatarFrameSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.avatar-frame__dragon-crest[\s\S]*?animation:\s*none !important;/,
    );

    for (const freeColorfulSection of [noteMasterpieceSection, fileVaultSection, streakMonthSection]) {
      expect(freeColorfulSection.match(/animation:/g)).toHaveLength(2);
      expect(freeColorfulSection).not.toContain('avatar-frame__comet');
      expect(freeColorfulSection).toContain('orbit::after');
      expect(freeColorfulSection).not.toContain('animation: frame-gift-epic-orbit');
    }
    expect(noteMasterpieceSection).toContain('animation: frame-free-colorful-orbit');
    expect(fileVaultSection).toContain('animation: frame-free-colorful-orbit-reverse');
    expect(streakMonthSection).toContain('animation: frame-free-colorful-moon-orbit');
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
