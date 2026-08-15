import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_FRAME_ARTWORK } from '@/config/avatarFrameArtwork';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const personCenterSource = source('src/view/personCenter/PersonCenterMobile.vue');
const desktopPersonCenterSource = source('src/view/personCenter/PersonCenter.vue');
const communityChatSource = source('src/view/communityChat/CommunityChatWorkspace.vue');
const myInfoSource = source('src/components/personCenter/myInfo/MyInfoMobile.vue');
const desktopMyInfoSource = source('src/components/personCenter/myInfo/MyInfo.vue');
const framePickerSource = source('src/components/growth/AvatarFramePickerDrawer.vue');
const avatarFrameSource = source('src/components/growth/AvatarFramePreview.vue');
const avatarPickerSource = source('src/components/personCenter/myInfo/AvatarPicker.vue');
const avatarArtworkSource = source('src/config/avatarFrameArtwork.ts');
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

  it('renders the portrait at its requested pixel size outside the scaled decoration canvas', () => {
    expect(avatarFrameSource).toContain('const FRAME_DESIGN_AVATAR_SIZE = 64');
    expect(avatarFrameSource).toContain('<span class="avatar-frame__canvas">');
    expect(avatarFrameSource).toContain('class="avatar-frame__canvas avatar-frame__canvas--front"');
    expect(avatarFrameSource).toContain(':size="displayAvatarSize"');
    expect(avatarFrameSource).toContain("'--frame-display-avatar-size': `${displayAvatarSize.value}px`");
    expect(avatarFrameSource).toContain("'--frame-canvas-scale': String(scale)");
    expect(avatarFrameSource).toContain('Math.round(layoutOuterSize * scale)');
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame__canvas\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?transform:\s*translate\(-50%, -50%\) scale\(var\(--frame-canvas-scale\)\);/,
    );
    expect(avatarFrameSource).toMatch(/\.avatar-frame\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(avatarFrameSource).toMatch(/\.avatar-frame__art\s*\{[\s\S]*?z-index:\s*3;/);
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame__portrait\s*\{[\s\S]*?z-index:\s*2;[\s\S]*?width:\s*var\(--frame-display-avatar-size\);[\s\S]*?transform:\s*translate\(-50%, -50%\);/,
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame__bezel\s*\{[\s\S]*?z-index:\s*3;[\s\S]*?width:\s*var\(--frame-display-avatar-size\);/,
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame__portrait\s*\{[\s\S]*?width:\s*var\(--frame-display-avatar-size\);[\s\S]*?border:\s*0;/,
    );
    expect(avatarFrameSource).toMatch(/\.avatar-frame__canvas--front\s*\{[\s\S]*?z-index:\s*4;/);
    expect(avatarFrameSource.indexOf('<span class="avatar-frame__portrait">')).toBeLessThan(
      avatarFrameSource.indexOf('<span class="avatar-frame__canvas">'),
    );
    expect(avatarFrameSource).toContain('头像本体脱离主题缩放画布');
    expect(avatarFrameSource).not.toMatch(/\.avatar-frame__portrait\s*\{[^}]*filter:/);
    expect(avatarFrameSource).not.toContain('avatar-frame--compact');
    const backCanvasStart = avatarFrameSource.indexOf('<span class="avatar-frame__canvas">');
    const frontCanvasStart = avatarFrameSource.indexOf('class="avatar-frame__canvas avatar-frame__canvas--front"');
    const frontCanvasEnd = avatarFrameSource.indexOf('</span>\n    <span v-if="artwork"', frontCanvasStart);
    const backCanvasSource = avatarFrameSource.slice(backCanvasStart, frontCanvasStart);
    const frontCanvasSource = avatarFrameSource.slice(frontCanvasStart, frontCanvasEnd);
    expect(backCanvasSource).toContain('class="avatar-frame__art"');
    expect(backCanvasSource).toContain('class="avatar-frame__art-detail"');
    expect(backCanvasSource).toContain('class="avatar-frame__inner-ring"');
    expect(backCanvasSource).toContain('class="avatar-frame__art-inner"');
    expect(backCanvasSource).toContain('v-if="artwork && !usesDedicatedInnerRing"');
    expect(frontCanvasSource).toContain('class="avatar-frame__art-focus"');
    expect(frontCanvasSource).toContain('avatar-frame__dragon-layer--head');
    expect(frontCanvasSource).toContain('avatar-frame__eternal-rabbit-runner');
    expect(frontCanvasSource).toContain('avatar-frame__motion--front');
    expect(desktopPersonCenterSource).toContain(':size="32"');
    expect(desktopPersonCenterSource).toMatch(
      /\.navigation-icon\s*\{[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;[\s\S]*?flex:\s*0 0 40px;/,
    );
    expect(desktopPersonCenterSource).toMatch(/\.navigation-icon\.has-frame\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(desktopPersonCenterSource).toContain("'avatar-ring--framed': equippedFrameId");
    expect(desktopPersonCenterSource).toMatch(
      /\.avatar-ring--framed\s*\{[\s\S]*?width:\s*80px;[\s\S]*?height:\s*80px;[\s\S]*?overflow:\s*visible;/,
    );
    expect(communityChatSource).toMatch(
      /\.community-message__avatar\s*\{[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;[\s\S]*?place-items:\s*center;/,
    );
    expect(navigationRightAreaSource).toMatch(/\.navigation-icon\.has-frame\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(mobileTopBarSource).toMatch(/\.mobile-top-bar__profile\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(mobileTopBarSource).toContain(':size="26"');
    expect(personCenterSource).toContain(':class="{ \'profile-card__avatar--framed\': equippedFrameId }"');
    expect(personCenterSource).toContain(':size="48"');
    expect(personCenterSource).toMatch(/\.profile-card\s*\{[\s\S]*?padding:\s*20px 16px 16px;/);
    const maxProfileArtworkOverflow = Math.max(
      ...Object.values(AVATAR_FRAME_ARTWORK).map(({ artSize, outerSize }) =>
        Math.max(0, ((artSize - outerSize) * 48) / 64 / 2),
      ),
    );
    expect(20 - maxProfileArtworkOverflow).toBeGreaterThanOrEqual(8);
    expect(personCenterSource).toMatch(
      /\.profile-card__avatar\.profile-card__avatar--framed\s*\{[\s\S]*?width:\s*auto;[\s\S]*?height:\s*auto;[\s\S]*?flex:\s*0 0 auto;/,
    );
    expect(myInfoSource).toContain(':class="{ \'profile-hero--framed\': equippedFrameId }"');
    expect(myInfoSource).toContain(':size="64"');
    expect(myInfoSource).toMatch(/\.profile-hero--framed\s*\{[\s\S]*?padding-top:\s*14px;/);
    expect(myInfoSource).toMatch(
      /\.profile-avatar\.profile-avatar--framed\s*\{[\s\S]*?width:\s*auto;[\s\S]*?height:\s*auto;[\s\S]*?flex:\s*0 0 auto;[\s\S]*?overflow:\s*visible;/,
    );
    const maxMyInfoArtworkOverflow = Math.max(
      ...Object.values(AVATAR_FRAME_ARTWORK).map(({ artSize, outerSize }) =>
        Math.max(0, ((artSize - outerSize) * 64) / 64 / 2),
      ),
    );
    expect(8 + 14 - maxMyInfoArtworkOverflow).toBeGreaterThanOrEqual(8);
    expect(desktopMyInfoSource).toContain(':class="{ \'home-container--framed\': equippedFrameId }"');
    expect(desktopMyInfoSource).toContain(':size="80"');
    expect(desktopMyInfoSource).toMatch(
      /\.home-container--framed\s*\{[\s\S]*?padding-top:\s*54px;/,
    );
    expect(desktopMyInfoSource).toMatch(
      /\.home-container--framed \.home-user-body\s*\{[\s\S]*?margin-top:\s*52px;/,
    );
    const maxDesktopMyInfoArtworkOverflow = Math.max(
      ...Object.values(AVATAR_FRAME_ARTWORK).map(({ artSize }) => Math.max(0, ((artSize - 64) * 80) / 64 / 2)),
    );
    expect(54 - maxDesktopMyInfoArtworkOverflow).toBeGreaterThanOrEqual(8);
    expect(52 - maxDesktopMyInfoArtworkOverflow).toBeGreaterThanOrEqual(8);
    expect(avatarPickerSource).toMatch(
      /\.avatar-picker__preview-shell\s*\{[\s\S]*?width:\s*180px;[\s\S]*?height:\s*180px;[\s\S]*?overflow:\s*visible;/,
    );
    expect(avatarPickerSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.avatar-picker__preview-shell\s*\{[\s\S]*?width:\s*160px;[\s\S]*?height:\s*160px;/,
    );
  });

  it('implements all 25 unique themes and the static-to-ceiling motion ladder', () => {
    const variants = Object.keys(AVATAR_FRAME_ARTWORK);
    const staticVariants = variants.filter(
      (variant) => AVATAR_FRAME_ARTWORK[variant as keyof typeof AVATAR_FRAME_ARTWORK].motion === 'static',
    );

    expect(variants).toHaveLength(25);
    expect(variants.length - staticVariants.length).toBe(17);
    expect(new Set(Object.values(AVATAR_FRAME_ARTWORK).map((item) => item.src)).size).toBe(25);
    expect(staticVariants).toEqual([
      'mint',
      'ink',
      'moonstone',
      'first-light',
      'note-seed',
      'streak-seed',
      'bookmark-seed',
      'file-seed',
    ]);
    expect(AVATAR_FRAME_ARTWORK.gold.motion).toBe('advanced');
    expect(AVATAR_FRAME_ARTWORK.ocean.motion).toBe('colorful');
    expect(AVATAR_FRAME_ARTWORK.neon.motion).toBe('legendary');
    expect(AVATAR_FRAME_ARTWORK.galaxy.motion).toBe('legendary');
    expect(AVATAR_FRAME_ARTWORK.dragon.motion).toBe('legendary');
    expect(AVATAR_FRAME_ARTWORK.celestial.motion).toBe('ceiling');
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].motion).toBe('ceiling');
    expect(Object.values(AVATAR_FRAME_ARTWORK).every(({ innerArtSize }) => innerArtSize >= 81)).toBe(true);
    expect(avatarFrameSource).toContain("'--frame-inner-art-size': `${artwork.value?.innerArtSize");
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame__inner-ring\s*\{[\s\S]*?width:\s*80px;[\s\S]*?height:\s*80px;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(avatarFrameSource).toMatch(/\.avatar-frame__art-inner\s*\{[\s\S]*?width:\s*var\(--frame-inner-art-size\);/);
    expect(avatarFrameSource).toContain("const usesDedicatedInnerRing = computed(() => variant.value === 'dragon')");
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--dragon \.avatar-frame__bezel\s*\{[\s\S]*?border-width:\s*2px;/,
    );
    expect(AVATAR_FRAME_ARTWORK.dragon.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.galaxy.outerSize);
    expect(AVATAR_FRAME_ARTWORK.celestial.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.dragon.outerSize);
    expect(avatarArtworkSource.match(/\.webp';/g)).toHaveLength(32);
    for (const layeredArtwork of [
      'frame_aurora_v2.webp',
      'frame_flame_v2.webp',
      'frame_neon_v2.webp',
      'frame_galaxy_v2.webp',
      'frame_dragon_base_v2.webp',
      'frame_dragon_body_v2.webp',
      'frame_dragon_cloud_flame_v2.webp',
      'frame_dragon_trails_v5.webp',
      'frame_dragon_pearl_v2.webp',
      'frame_celestial_base_v2.webp',
      'frame_celestial_wings_v3.webp',
      'frame_streak_eternal_base_v3.webp',
      'frame_streak_eternal_motion_v3.webp',
      'frame_streak_eternal_rabbit_sprite_v1.webp',
    ]) {
      expect(avatarArtworkSource, layeredArtwork).toContain(layeredArtwork);
    }
  });

  it('uses theme-specific local motion instead of one shared rotating ornament', () => {
    for (const keyframe of [
      'frame-gold-glint',
      'frame-petal-drift',
      'frame-sunset-sun',
      'frame-moon-phase-travel',
      'frame-moon-star-twinkle',
      'frame-ink-current',
      'frame-note-river-glint',
      'frame-vault-door-shine',
      'frame-vault-energy-curtain',
      'frame-vault-data-rise',
      'frame-ocean-water-flow',
      'frame-ocean-undertow',
      'frame-ocean-return',
      'frame-ocean-current',
      'frame-ocean-crest-run',
      'frame-aurora-veil-left',
      'frame-aurora-veil-right',
      'frame-aurora-depth-veil',
      'frame-aurora-ribbon-flow',
      'frame-aurora-curtain-unfold',
      'frame-aurora-core-charge',
      'frame-flame-tongue',
      'frame-flame-side-burn',
      'frame-flame-material',
      'frame-neon-chase',
      'frame-neon-circuit-flow',
      'frame-neon-crystal-charge',
      'frame-galaxy-orbit',
      'frame-galaxy-orbit-reverse',
      'frame-galaxy-nebula-shimmer',
      'frame-dragon-trail-mane',
      'frame-dragon-trail-left',
      'frame-dragon-trail-right',
      'frame-dragon-trail-bottom',
      'frame-dragon-trail-ember',
      'frame-dragon-fire-flow',
      'frame-dragon-mane-sway',
      'frame-dragon-left-filament-sway',
      'frame-dragon-right-filament-sway',
      'frame-dragon-bottom-filament-sway',
      'frame-dragon-cloud-light',
      'frame-dragon-pearl-light',
      'frame-dragon-crown-light',
      'frame-dragon-orbit-shimmer',
      'frame-dragon-star-drift',
      'frame-celestial-unfold',
      'frame-celestial-art-wing-left',
      'frame-celestial-art-wing-right',
      'frame-page-flutter',
      'frame-library-page-material',
      'frame-constellation-draw',
      'frame-constellation-material',
      'frame-archive-gate',
      'frame-archive-gate-material',
      'frame-archive-star-rise',
      'frame-archive-portal-arc',
      'frame-archive-star-path',
      'frame-eternal-sun-contract',
      'frame-eternal-rabbit-bridge',
      'frame-eternal-rabbit-direction',
      'frame-eternal-rabbit-sprite',
      'frame-eternal-rabbit-body-arc',
      'frame-eternal-petal-drift',
      'frame-eternal-pine-sway',
      'frame-eternal-epoch-orbit',
    ]) {
      expect(avatarFrameSource, keyframe).toContain(`@keyframes ${keyframe}`);
    }

    expect(avatarFrameSource).toContain('animation: frame-moon-phase-travel 5.2s');
    expect(avatarFrameSource).toContain('animation: frame-moon-star-twinkle 3.6s');
    expect(avatarFrameSource).toContain('animation: frame-note-river-glint 3.8s -1.1s');
    expect(avatarFrameSource).toContain('animation: frame-vault-energy-curtain 3.8s');
    expect(avatarFrameSource).toContain('animation: frame-vault-data-rise 3.6s');
    expect(avatarFrameSource).toContain('border-bottom: 3px solid rgba(153, 246, 228, 0.96)');
    expect(avatarFrameSource).toContain('filter: drop-shadow(0 0 5px rgba(96, 165, 250, 1))');

    const dragonFrameMotion = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-dragon-metal-light'),
      avatarFrameSource.indexOf('@keyframes frame-dragon-trail-ember'),
    );
    const dragonTrailMotion = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-dragon-trail-mane'),
      avatarFrameSource.indexOf('@keyframes frame-dragon-fire-flow'),
    );
    const dragonFilamentMotion = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-dragon-fire-flow'),
      avatarFrameSource.indexOf('@keyframes frame-dragon-cloud-light'),
    );
    expect(dragonFrameMotion).not.toContain('rotate(');
    expect(dragonFrameMotion).not.toContain('scale(');
    expect(dragonTrailMotion).toContain('mask-position');
    expect(dragonTrailMotion).not.toContain('rotate(');
    expect(dragonFilamentMotion).toContain('frame-dragon-mane-sway');
    expect(dragonFilamentMotion).toContain('frame-dragon-left-filament-sway');
    expect(dragonFilamentMotion).toContain('frame-dragon-right-filament-sway');
    expect(dragonFilamentMotion).toContain('frame-dragon-bottom-filament-sway');
    expect(avatarFrameSource).toContain('stroke-dashoffset: -100');
    expect(avatarFrameSource).toContain(
      'frame-dragon-fire-flow var(--dragon-flow-duration) linear var(--dragon-flow-delay) infinite',
    );
    expect(avatarFrameSource).toContain('@keyframes frame-flame-hot-edge');
    expect(avatarFrameSource).toContain('animation: frame-dragon-trail-mane 1.9s linear infinite');
    expect(avatarFrameSource).toContain('stroke-width: 1.28');
    expect(avatarFrameSource).toContain('transform: rotate(11deg) scaleY(1.16)');
    expect(avatarFrameSource).toContain('animation: frame-dragon-trail-left 2.8s -0.9s linear infinite');
    expect(avatarFrameSource).toContain('animation: frame-dragon-trail-right 2.7s -1.8s linear infinite');
    expect(avatarFrameSource).toContain('animation: frame-dragon-trail-bottom 3.2s -0.6s linear infinite');
    expect(avatarFrameSource).toContain('animation: frame-dragon-cloud-light 4.6s');
    expect(avatarFrameSource).toContain('animation: frame-dragon-pearl-light 3.6s');
    expect(avatarFrameSource).toContain('animation: frame-dragon-orbit-shimmer 4.8s');
    expect(avatarFrameSource).not.toContain('frame-dragon-coil-breathe');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-layer avatar-frame__dragon-layer--body"');
    expect(avatarFrameSource).not.toContain('avatar-frame__dragon-mane');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-layer avatar-frame__dragon-layer--cloud-flame"');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-trail avatar-frame__dragon-trail--mane"');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-trail avatar-frame__dragon-trail--base"');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-trail avatar-frame__dragon-trail--left"');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-trail avatar-frame__dragon-trail--right"');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-trail avatar-frame__dragon-trail--bottom"');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-flow"');
    expect(avatarFrameSource).toContain('avatar-frame__dragon-flow-group--mane');
    expect(avatarFrameSource).toContain('avatar-frame__dragon-flow-group--left');
    expect(avatarFrameSource).toContain('avatar-frame__dragon-flow-group--right');
    expect(avatarFrameSource).toContain('avatar-frame__dragon-flow-group--bottom');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-layer avatar-frame__dragon-layer--pearl"');
    expect(avatarFrameSource).toContain('class="avatar-frame__dragon-layer avatar-frame__dragon-layer--head"');
    expect(avatarFrameSource).toMatch(/\.avatar-frame__dragon-layer--body\s*\{[^}]*z-index:\s*4;[^}]*\}/);
    expect(avatarFrameSource).not.toMatch(/\.avatar-frame__dragon-layer--body\s*\{[^}]*mask-image:/);
    expect(avatarFrameSource).toMatch(/\.avatar-frame__dragon-layer--head\s*\{[^}]*z-index:\s*10;[^}]*clip-path:/);
    expect(avatarFrameSource).not.toMatch(/\.avatar-frame__dragon-layer--body\s*\{[^}]*animation:/);
    expect(avatarFrameSource).not.toMatch(/\.avatar-frame__dragon-layer--head\s*\{[^}]*animation:/);
    expect(avatarFrameSource).not.toContain('@keyframes frame-dragon-mane-upper');
    expect(avatarFrameSource).not.toContain('@keyframes frame-dragon-mane-middle');
    expect(avatarFrameSource).not.toContain('@keyframes frame-dragon-mane-lower');
    expect(avatarFrameSource).toContain('animation: frame-celestial-unfold 5s');
    const celestialKeyframes = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-celestial-unfold'),
      avatarFrameSource.indexOf('@keyframes frame-page-flutter'),
    );
    expect(celestialKeyframes).not.toContain('steps(');
    expect(avatarFrameSource).toContain('transform: rotate(316deg) scale(0.78)');
    expect(avatarFrameSource).toContain('class="avatar-frame__celestial-wing avatar-frame__celestial-wing--left"');
    expect(avatarFrameSource).toContain('class="avatar-frame__celestial-wing avatar-frame__celestial-wing--right"');
    expect(avatarFrameSource).toContain('transform-origin: 35% 78%');
    expect(avatarFrameSource).toContain('transform-origin: 65% 78%');
    expect(avatarFrameSource).toContain('3.4s linear infinite alternate');
    expect(avatarFrameSource).not.toContain('frame-celestial-wing-back-left');
    expect(avatarFrameSource).not.toMatch(/\.avatar-frame--celestial \.avatar-frame__art\s*\{[^}]*clip-path:/);
    expect(avatarFrameSource).toContain('class="avatar-frame__eternal-rabbit-runner"');
    expect(avatarFrameSource).toContain('class="avatar-frame__eternal-rabbit-direction"');
    expect(avatarFrameSource).toContain('class="avatar-frame__eternal-rabbit-sprite"');
    expect(avatarFrameSource).not.toContain('avatar-frame__eternal-rabbit-pose');
    expect(avatarFrameSource).toContain('background-size: 400% 400%');
    for (const calibratedRabbitPosition of [
      '0 6.63%',
      '33.333% 6.94%',
      '66.667% 6.84%',
      '100% 7.37%',
      '0 36.88%',
      '33.333% 36.03%',
      '66.667% 34.86%',
      '100% 35.49%',
      '0 67.13%',
      '33.333% 69.78%',
      '66.667% 68.72%',
      '100% 69.04%',
      '0 99.08%',
      '33.333% 99.29%',
      '66.667% 99.18%',
      '100% 99.71%',
    ]) {
      expect(avatarFrameSource, calibratedRabbitPosition).toContain(`background-position: ${calibratedRabbitPosition}`);
    }
    expect(avatarFrameSource).toContain('frame-eternal-rabbit-sprite 0.8s step-end infinite');
    expect(avatarFrameSource).toContain('frame-eternal-rabbit-body-arc 0.8s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-eternal-rabbit-bridge 4.8s linear infinite');
    expect(avatarFrameSource).toContain('animation: frame-eternal-rabbit-direction 4.8s linear infinite');
    expect(avatarFrameSource).not.toMatch(/\.avatar-frame__eternal-rabbit-sprite\s*\{[^}]*filter:/);
    expect(avatarFrameSource).toContain('transform: scaleX(-1)');
    expect(avatarFrameSource).toContain('translate(11.333px, -1px)');
    expect(avatarFrameSource).toContain('translate(26.667px, -5px)');
    expect(avatarFrameSource).toContain('translate(42px, -9px)');
    expect(avatarFrameSource).toContain('class="avatar-frame__eternal-object avatar-frame__eternal-object--sun"');
    expect(avatarFrameSource).toContain('@keyframes frame-ambient-breathe');
    expect(avatarFrameSource).toContain('.avatar-frame--motion-ceiling .avatar-frame__ambient');
    expect(avatarFrameSource).toContain("artwork.value.motion !== 'static'");
    for (const detailVariant of [
      'flame',
      'ocean',
      'aurora',
      'note-masterpiece',
      'file-vault',
      'bookmark-archive',
      'note-constellation',
      'file-constellation',
    ]) {
      expect(avatarFrameSource, detailVariant).toContain(`'${detailVariant}'`);
    }
    expect(avatarFrameSource).toContain('class="avatar-frame__art-detail"');
    expect(avatarFrameSource).not.toContain('@keyframes frame-library-stars');
    expect(avatarFrameSource).not.toMatch(/\.avatar-frame__portrait\s*\{[^}]*animation:/);

    for (const artKeyframe of [
      'frame-gold-breathe',
      'frame-sakura-bloom',
      'frame-sunset-sky',
      'frame-moonlight-breathe',
      'frame-vault-metal-light',
      'frame-ocean-metal-light',
      'frame-aurora-metal-light',
      'frame-flame-metal-light',
      'frame-neon-pulse',
      'frame-galaxy-breathe',
      'frame-dragon-metal-light',
      'frame-celestial-unfold',
      'frame-library-metal-light',
      'frame-constellation-ink',
      'frame-archive-metal-light',
      'frame-eternal-time-light',
    ]) {
      const keyframeStart = avatarFrameSource.indexOf(`@keyframes ${artKeyframe} {`);
      const nextKeyframe = avatarFrameSource.indexOf('@keyframes ', keyframeStart + 1);
      const keyframeSource = avatarFrameSource.slice(keyframeStart, nextKeyframe);
      expect(keyframeSource, `${artKeyframe} 不得把整张头像框做统一缩放`).not.toMatch(/\bscale(?:X|Y)?\(/);
    }

    for (const stableFrameKeyframe of [
      'frame-ocean-metal-light',
      'frame-flame-metal-light',
      'frame-dragon-metal-light',
      'frame-dragon-cloud-light',
      'frame-dragon-pearl-light',
      'frame-dragon-orbit-shimmer',
    ]) {
      const keyframeStart = avatarFrameSource.indexOf(`@keyframes ${stableFrameKeyframe} {`);
      const nextKeyframe = avatarFrameSource.indexOf('@keyframes ', keyframeStart + 1);
      const keyframeSource = avatarFrameSource.slice(keyframeStart, nextKeyframe);
      expect(keyframeSource, `${stableFrameKeyframe} 的主体框必须保持稳定`).not.toMatch(
        /rotate\(|skew|translateX\(|translateY\(/,
      );
    }
    for (const pixelAlignedDetailKeyframe of ['frame-note-water-flow', 'frame-vault-cloud-gate']) {
      const keyframeStart = avatarFrameSource.indexOf(`@keyframes ${pixelAlignedDetailKeyframe} {`);
      const nextKeyframe = avatarFrameSource.indexOf('@keyframes ', keyframeStart + 1);
      const keyframeSource = avatarFrameSource.slice(keyframeStart, nextKeyframe);
      const transforms = [...keyframeSource.matchAll(/transform:\s*([^;]+);/g)].map((match) => match[1]);
      expect(transforms.length, `${pixelAlignedDetailKeyframe} 必须声明固定对齐矩阵`).toBeGreaterThan(0);
      expect(new Set(transforms), `${pixelAlignedDetailKeyframe} 的同源高光副本不得偏离原画`).toEqual(
        new Set(['translate(-50%, -50%)']),
      );
    }
    expect(avatarFrameSource).not.toContain(
      '.avatar-frame--dynamic.avatar-frame--note-masterpiece .avatar-frame__art {\n    animation:',
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--bookmark-archive \.avatar-frame__ambient\s*\{[\s\S]*?filter:\s*none;/,
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--file-constellation \.avatar-frame__ambient\s*\{[\s\S]*?filter:\s*none;/,
    );

    const oceanWaterStart = avatarFrameSource.indexOf('@keyframes frame-ocean-water-flow {');
    const oceanWaterEnd = avatarFrameSource.indexOf('@keyframes ', oceanWaterStart + 1);
    const oceanWaterSource = avatarFrameSource.slice(oceanWaterStart, oceanWaterEnd);
    expect(oceanWaterSource).not.toMatch(/translateX\(|translateY\(|rotate\(|skew/);
    expect(oceanWaterSource).toContain('clip-path: polygon(');

    const oceanStructureStart = avatarFrameSource.indexOf(
      '.avatar-frame--dynamic.avatar-frame--ocean .avatar-frame__art',
    );
    const oceanStructureEnd = avatarFrameSource.indexOf(
      '.avatar-frame--dynamic.avatar-frame--aurora .avatar-frame__art',
    );
    const oceanStructureSource = avatarFrameSource.slice(oceanStructureStart, oceanStructureEnd);
    expect(oceanStructureSource).toContain('background: linear-gradient(');
    expect(oceanStructureSource).toContain('animation: frame-ocean-undertow 4.8s');
    expect(oceanStructureSource).toContain('animation: frame-ocean-return 4.8s');
    expect(oceanStructureSource).toContain('animation: frame-ocean-crest-run 4.8s');
    expect(oceanStructureSource).toMatch(
      /\.avatar-frame--ocean \.avatar-frame__motion--back::before\s*\{[\s\S]*?width:\s*31px;/,
    );
    expect(oceanStructureSource).toMatch(
      /\.avatar-frame--ocean \.avatar-frame__motion--front::before\s*\{[\s\S]*?width:\s*28px;/,
    );

    const auroraStructureStart = avatarFrameSource.indexOf(
      '.avatar-frame--dynamic.avatar-frame--aurora .avatar-frame__art',
    );
    const auroraStructureEnd = avatarFrameSource.indexOf(
      '.avatar-frame--dynamic.avatar-frame--flame .avatar-frame__art',
    );
    const auroraStructureSource = avatarFrameSource.slice(auroraStructureStart, auroraStructureEnd);
    expect(auroraStructureSource).toContain('.avatar-frame--aurora .avatar-frame__motion--back i');
    expect(auroraStructureSource).toContain('animation: frame-aurora-ribbon-flow 4.2s');
    expect(auroraStructureSource).toContain('animation: frame-aurora-core-charge 4.2s');
    expect(auroraStructureSource).toContain('animation: frame-aurora-veil-left 3.8s');
    expect(auroraStructureSource).toContain('animation: frame-aurora-veil-right 3.8s -1.9s');
    expect(auroraStructureSource).toMatch(
      /\.avatar-frame--aurora \.avatar-frame__motion--back::before,[\s\S]*?width:\s*24px;/,
    );
    expect(auroraStructureSource).toMatch(
      /\.avatar-frame--aurora \.avatar-frame__motion--front i:nth-child\(3\)\s*\{[\s\S]*?left:\s*9px;/,
    );

    const flameStructureStart = avatarFrameSource.indexOf(
      '.avatar-frame--dynamic.avatar-frame--flame .avatar-frame__art',
    );
    const flameStructureEnd = avatarFrameSource.indexOf('/* 积分传说严格递进', flameStructureStart);
    const flameStructureSource = avatarFrameSource.slice(flameStructureStart, flameStructureEnd);
    expect(flameStructureSource).toContain('animation: frame-flame-tongue 2.8s');
    expect(flameStructureSource).toContain('animation: frame-flame-side-burn 2.9s -1.45s');
    expect(flameStructureSource).toContain('animation: frame-flame-material 3.6s');
    expect(flameStructureSource).toMatch(
      /\.avatar-frame--flame \.avatar-frame__motion--back::before,[\s\S]*?display:\s*none;/,
    );
    expect(flameStructureSource).toMatch(
      /\.avatar-frame--flame \.avatar-frame__motion--front::after\s*\{[\s\S]*?height:\s*13px;/,
    );
    expect(flameStructureSource).toMatch(
      /\.avatar-frame--flame \.avatar-frame__motion--front i:nth-child\(3\)\s*\{[\s\S]*?left:\s*9px;/,
    );

    const libraryMotionStart = avatarFrameSource.indexOf('@keyframes frame-page-flutter {');
    const libraryMotionEnd = avatarFrameSource.indexOf('@keyframes frame-constellation-draw {');
    const libraryMotionSource = avatarFrameSource.slice(libraryMotionStart, libraryMotionEnd);
    expect(libraryMotionSource).not.toMatch(/scaleX\(1\.1/);
    expect(libraryMotionSource).not.toMatch(/translateY\(-[234]px\)/);
  });

  it('pauses decorative motion offscreen, on explicit opt-out and for reduced-motion users', () => {
    expect(avatarFrameSource).toContain("'avatar-frame--motion-paused': isMotionPaused");
    expect(avatarFrameSource).toContain('const isMotionVisible = ref(!props.pauseWhenOffscreen)');
    expect(avatarFrameSource).toContain("rootMargin: '24px 0px'");
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--motion-paused \.avatar-frame__ambient[\s\S]*?animation:\s*none !important;/,
    );
    expect(avatarFrameSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.avatar-frame__art[\s\S]*?animation:\s*none !important;/,
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--motion-paused \.avatar-frame__art-detail[\s\S]*?animation:\s*none !important;/,
    );
    expect(pointsShopSource).toContain('pause-when-offscreen');
    expect(framePickerSource).toContain('pause-when-offscreen');
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

  it('returns the active growth content scroller to the top on tab changes and active-tab reselection', () => {
    expect(growthPageSource).toContain('@select="handleSectionTabSelect"');
    expect(growthPageSource).toContain(
      'resetMobileScrollElement(useWideDesktopLayout.value ? growthMainRef.value : growthPageRef.value)',
    );
    expect(growthPageSource).toContain('resetMobileScrollElement(growthMainRef.value)');
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
