import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_FRAME_ARTWORK } from '@/config/avatarFrameArtwork';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const personCenterSource = source('src/view/personCenter/PersonCenterMobile.vue');
const desktopPersonCenterSource = source('src/view/personCenter/PersonCenter.vue');
const personCenterEntriesSource = source('src/config/personCenterEntries.ts');
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
  it('root 管理工具区同时提供后台管理与服务器管理入口', () => {
    expect(personCenterSource).toContain("goToProfileModule('/admin')");
    expect(personCenterSource).toContain("goToProfileModule('/serverManagement')");
    expect(personCenterSource).toContain('icon.infrastructure.server');
  });

  it('keeps quick access entries in a strict four-column equal-width grid', () => {
    expect(personCenterSource).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(personCenterSource).toMatch(/\.profile-quick-item\s*\{[\s\S]*?width:\s*100%;/);
    expect(personCenterSource).not.toContain('profile-overview');
  });

  it('uses the first quick entry for the growth center while profile editing remains in the identity card', () => {
    expect(personCenterSource).toContain('v-for="entry in mobileQuickEntries"');
    expect(personCenterSource).toContain('MOBILE_PERSON_CENTER_QUICK_ENTRIES');
    expect(personCenterEntriesSource).toContain('PERSON_CENTER_ENTRIES.growth');
    expect(personCenterEntriesSource).toContain("labelKey: 'growth.entry'");
    expect(personCenterSource).toContain('class="profile-card__edit" @click="goToProfileModule(\'/myInfo\')"');
  });

  it('shows only the account email in the profile summary and keeps role labels inside profile editing', () => {
    expect(personCenterSource).toContain('<span v-if="user.email">{{ user.email }}</span>');
    expect(personCenterSource).not.toContain('{{ roleName }}');
    expect(myInfoSource).toContain('resolveAccountRoleLabelKey(user.role, user.id)');
    expect(desktopMyInfoSource).toContain('resolveAccountRoleLabelKey(user.role, user.id)');
  });

  it('keeps co-build visible in both desktop and mobile personal centers for visitors', () => {
    expect(personCenterSource).toContain('mobileCommunicationEntries');
    expect(desktopPersonCenterSource).toContain('DESKTOP_PERSON_CENTER_PRIMARY_ENTRIES');
    expect(personCenterEntriesSource).toContain("path: '/co-build'");
    expect(personCenterEntriesSource).toContain("descriptionKey: 'personCenter.coBuildDesc'");
    expect(personCenterEntriesSource).not.toMatch(/name:\s*'coBuild'[\s\S]{0,220}authOnly:\s*true/);
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

  it('keeps avatar artwork crisp for visitors and locked frame previews', () => {
    expect(desktopMyInfoSource).toMatch(/\.user_icon\.disabled\s*\{[^}]*opacity:\s*1;/);
    expect(myInfoSource).toMatch(/\.profile-avatar\.disabled\s*\{[^}]*opacity:\s*1;/);
    expect(framePickerSource).toMatch(/\.frame-card\.is-locked\s*\{[^}]*opacity:\s*1;/);
    expect(framePickerSource).not.toMatch(/\.frame-card\.is-locked\s*\{[^}]*opacity:\s*0\.[0-9]+;/);
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
    expect(avatarFrameSource).toContain("layoutMode?: 'outer' | 'slot'");
    expect(avatarFrameSource).toContain("layoutMode: 'outer'");
    expect(avatarFrameSource).toContain("'avatar-frame--layout-slot': props.layoutMode === 'slot'");
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--layout-slot\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/,
    );
    const backCanvasStart = avatarFrameSource.indexOf('<span class="avatar-frame__canvas">');
    const frontCanvasStart = avatarFrameSource.indexOf('class="avatar-frame__canvas avatar-frame__canvas--front"');
    const frontCanvasEnd = avatarFrameSource.indexOf('</span>\n    <span v-if="artwork"', frontCanvasStart);
    const backCanvasSource = avatarFrameSource.slice(backCanvasStart, frontCanvasStart);
    const frontCanvasSource = avatarFrameSource.slice(frontCanvasStart, frontCanvasEnd);
    expect(backCanvasSource).toContain('v-if="artwork && !usesFrontStructuralShell"');
    expect(backCanvasSource).toContain('class="avatar-frame__art"');
    expect(backCanvasSource).toContain('class="avatar-frame__art-detail"');
    expect(backCanvasSource).toContain('class="avatar-frame__inner-ring"');
    expect(backCanvasSource).toContain('class="avatar-frame__art-inner"');
    expect(backCanvasSource).toContain(
      'v-if="artwork && !usesDedicatedInnerRing && !usesFrontStructuralShell"',
    );
    expect(frontCanvasSource).toContain('v-if="artwork && usesFrontStructuralShell"');
    expect(frontCanvasSource).toContain('class="avatar-frame__art avatar-frame__art--front-shell"');
    expect(frontCanvasSource).toContain('class="avatar-frame__art-focus"');
    expect(frontCanvasSource).toContain('avatar-frame__art-focus--sakura-top');
    expect(frontCanvasSource).toContain('avatar-frame__art-focus--sakura-bottom');
    expect(backCanvasSource).not.toContain('avatar-frame__sunset-cloud--left');
    expect(backCanvasSource).not.toContain('avatar-frame__sunset-cloud--right');
    expect(frontCanvasSource).toContain('avatar-frame__sunset-cloud--left');
    expect(frontCanvasSource).toContain('avatar-frame__sunset-cloud--right');
    expect(avatarFrameSource).toContain("['gold', 'sakura', 'sunset'].includes(variant.value || '')");
    expect(avatarFrameSource).toContain("artwork.value?.motion === 'static' || artwork.value?.foregroundShell === true");
    expect(frontCanvasSource).not.toContain('avatar-frame__flame-dragon-focus');
    expect(frontCanvasSource).toContain('avatar-frame__flame-fire--${layer}');
    expect(backCanvasSource).not.toContain('avatar-frame__flame-fire');
    expect(frontCanvasSource).not.toContain('avatar-frame__streak-sun');
    expect(frontCanvasSource).not.toContain('avatar-frame__art-focus--streak-cloud');
    expect(avatarFrameSource).toContain('50% 16%,');
    expect(avatarFrameSource).toContain('46.7% 20%');
    expect(avatarFrameSource).toContain('50% 78.1%,');
    expect(avatarFrameSource).toContain('49.35% 79.2%');
    // 天穹双翼为同画布分层素材:必须位于前景画布内、且排在实体框壳之前,被环体压住翼根。
    expect(backCanvasSource).not.toContain('avatar-frame__wing-layer');
    expect(frontCanvasSource).toContain('avatar-frame__wing-layer avatar-frame__wing-layer--left');
    expect(frontCanvasSource).toContain('avatar-frame__wing-layer avatar-frame__wing-layer--right');
    expect(frontCanvasSource.indexOf('avatar-frame__wing-layer--left')).toBeLessThan(
      frontCanvasSource.indexOf('avatar-frame__art avatar-frame__art--front-shell'),
    );
    // 岁序三翼同样必须在前景画布内、排在实体框壳之前。
    for (const eternalWing of ['spring', 'autumn', 'winter']) {
      expect(frontCanvasSource).toContain(`avatar-frame__wing-layer avatar-frame__wing-layer--${eternalWing}`);
      expect(frontCanvasSource.indexOf(`avatar-frame__wing-layer--${eternalWing}`)).toBeLessThan(
        frontCanvasSource.indexOf('avatar-frame__art avatar-frame__art--front-shell'),
      );
    }
    expect(avatarFrameSource).not.toContain('avatar-frame__book-layer');
    expect(frontCanvasSource).toContain('avatar-frame__motion--front');
    expect(desktopPersonCenterSource).toContain(':size="32"');
    expect(desktopPersonCenterSource).toContain('layout-mode="slot"');
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
    expect(communityChatSource).toContain('layout-mode="slot"');
    expect(navigationRightAreaSource).toMatch(/\.navigation-icon\.has-frame\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(navigationRightAreaSource).toContain('layout-mode="slot"');
    expect(mobileTopBarSource).toMatch(/\.mobile-top-bar__profile\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(mobileTopBarSource).toContain(':size="26"');
    expect(mobileTopBarSource).toContain('layout-mode="slot"');
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
    expect(myInfoSource).toMatch(/\.profile-hero--framed\s*\{[\s\S]*?padding-top:\s*16px;/);
    expect(myInfoSource).toMatch(
      /\.profile-avatar\.profile-avatar--framed\s*\{[\s\S]*?width:\s*auto;[\s\S]*?height:\s*auto;[\s\S]*?flex:\s*0 0 auto;[\s\S]*?overflow:\s*visible;/,
    );
    const maxMyInfoArtworkOverflow = Math.max(
      ...Object.values(AVATAR_FRAME_ARTWORK).map(({ artSize, outerSize }) =>
        Math.max(0, ((artSize - outerSize) * 64) / 64 / 2),
      ),
    );
    expect(8 + 16 - maxMyInfoArtworkOverflow).toBeGreaterThanOrEqual(8);
    expect(desktopMyInfoSource).toContain(':class="{ \'home-container--framed\': equippedFrameId }"');
    expect(desktopMyInfoSource).toContain(':size="80"');
    expect(desktopMyInfoSource).toMatch(/\.home-container--framed\s*\{[\s\S]*?padding-top:\s*56px;/);
    expect(desktopMyInfoSource).toMatch(/\.home-container--framed \.home-user-body\s*\{[\s\S]*?margin-top:\s*54px;/);
    const maxDesktopMyInfoArtworkOverflow = Math.max(
      ...Object.values(AVATAR_FRAME_ARTWORK).map(({ artSize }) => Math.max(0, ((artSize - 64) * 80) / 64 / 2)),
    );
    expect(56 - maxDesktopMyInfoArtworkOverflow).toBeGreaterThanOrEqual(8);
    expect(54 - maxDesktopMyInfoArtworkOverflow).toBeGreaterThanOrEqual(8);
    expect(avatarPickerSource).toMatch(
      /\.avatar-picker__preview-shell\s*\{[\s\S]*?width:\s*180px;[\s\S]*?height:\s*180px;[\s\S]*?overflow:\s*visible;/,
    );
    expect(avatarPickerSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.avatar-picker__preview-shell\s*\{[\s\S]*?width:\s*160px;[\s\S]*?height:\s*160px;/,
    );
  });

  it('implements all 29 unique themes and the static-to-ceiling motion ladder', () => {
    const variants = Object.keys(AVATAR_FRAME_ARTWORK);
    const staticVariants = variants.filter(
      (variant) => AVATAR_FRAME_ARTWORK[variant as keyof typeof AVATAR_FRAME_ARTWORK].motion === 'static',
    );

    expect(variants).toHaveLength(29);
    expect(variants.length - staticVariants.length).toBe(18);
    expect(new Set(Object.values(AVATAR_FRAME_ARTWORK).map((item) => item.src)).size).toBe(29);
    expect(staticVariants).toEqual([
      'mint',
      'ink',
      'moonstone',
      'first-light',
      'note-seed',
      'bookmark-intro',
      'file-intro',
      'streak-seed',
      'bookmark-seed',
      'note-flow',
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
    expect(avatarFrameSource).toMatch(
      /usesDedicatedInnerRing = computed\(\(\) =>\s*\[\s*'streak-seed',\s*'gold',\s*'sakura',\s*'sunset',\s*'neon',\s*'galaxy',\s*'dragon',\s*'celestial',\s*'bookmark-archive',\s*'note-constellation',\s*'file-constellation',\s*'streak-eternal',\s*\]/,
    );
    expect(avatarFrameSource).toMatch(/\.avatar-frame--dragon \.avatar-frame__bezel\s*\{[\s\S]*?border-color:\s*rgba\(255, 224, 130/);
    expect(AVATAR_FRAME_ARTWORK.dragon.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.galaxy.outerSize);
    expect(AVATAR_FRAME_ARTWORK.celestial.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.dragon.outerSize);
    expect(avatarArtworkSource.match(/\.webp';/g)).toHaveLength(48);
    for (const layeredArtwork of [
      'frame_ocean_v2.webp',
      'frame_ocean_current_left_v1.webp',
      'frame_ocean_current_right_v1.webp',
      'frame_aurora_v3.webp',
      'frame_aurora_flow_left_v1.webp',
      'frame_aurora_flow_right_v1.webp',
      'frame_aurora_crystal_v1.webp',
      'frame_flame_v7.webp',
      'frame_flame_effect_v4.webp',
      'frame_flame_embers_v3.webp',
      'frame_flame_particle_tall_v1.webp',
      'frame_flame_particle_slender_v1.webp',
      'frame_flame_particle_curl_v3.webp',
      'frame_neon_v3.webp',
      'frame_galaxy_v3.webp',
      'frame_dragon_v4.webp',
      'frame_dragon_trails_v6.webp',
      'frame_celestial_base_v4.webp',
      'frame_celestial_wing_left_v1.webp',
      'frame_celestial_wing_right_v1.webp',
      'frame_bookmark_archive_v2.webp',
      'frame_note_constellation_v2.webp',
      'frame_file_constellation_v2.webp',
      'frame_streak_eternal_base_v5.webp',
      'frame_streak_eternal_wing_spring_v1.webp',
      'frame_streak_eternal_wing_autumn_v1.webp',
      'frame_streak_eternal_wing_winter_v1.webp',
    ]) {
      expect(avatarArtworkSource, layeredArtwork).toContain(layeredArtwork);
    }
  });

  it('uses theme-specific local motion instead of one shared rotating ornament', () => {
    for (const keyframe of [
      'frame-gold-material-flow',
      'frame-gold-glint',
      'frame-gold-fleck',
      'frame-sakura-blossom-shimmer',
      'frame-sakura-pollen-glint',
      'frame-petal-drift',
      'frame-sunset-cloud-drift-left',
      'frame-sunset-cloud-drift-right',
      'frame-achievement-material-flow',
      'frame-moon-orbit-glint',
      'frame-moon-star-twinkle',
      'frame-note-current-glide',
      'frame-vault-cloud-current',
      'frame-vault-gate-light',
      'frame-vault-data-rise',
      'frame-corridor-gate-light',
      'frame-corridor-floor-glint',
      'frame-corridor-bookmark-glint',
      'frame-ocean-surge',
      'frame-ocean-crest-sway',
      'frame-ocean-return-flow',
      'frame-ocean-foam-lilt-left',
      'frame-ocean-foam-lilt-right',
      'frame-ocean-bubble-drift-left',
      'frame-ocean-bubble-drift-right',
      'frame-aurora-source-flow-left',
      'frame-aurora-source-flow-right',
      'frame-aurora-crystal-charge',
      'frame-aurora-particle-left',
      'frame-aurora-particle-right',
      'frame-flame-heat-sweep',
      'frame-flame-heat-sweep-reverse',
      'frame-flame-spark-rise',
      'frame-flame-real-embers',
      'frame-flame-metal-light',
      'frame-legend-ring-spin',
      'frame-celestial-wing-flap-left',
      'frame-celestial-wing-flap-right',
      'frame-celestial-dust-rise',
      'frame-eternal-wing-sway',
      'frame-eternal-mote-fall',
      'frame-eternal-mote-rise',
      'frame-neon-pulse',
      'frame-neon-pixel',
      'frame-neon-crystal-charge',
      'frame-galaxy-breathe',
      'frame-galaxy-planet-orbit',
      'frame-galaxy-planet-orbit-minor',
      'frame-galaxy-flow',
      'frame-dragon-metal-light',
      'frame-dragon-focus-charge',
      'frame-dragon-trail-breathe',
      'frame-dragon-energy-tour',
      'frame-dragon-flame-breathe',
      'frame-dragon-energy-orbit',
      'frame-dragon-particle-drift',
      'frame-celestial-glow',
      'frame-celestial-halo-eclipse',
      'frame-celestial-core-charge',
      'frame-library-metal-light',
      'frame-library-page-glow',
      'frame-library-page-glint',
      'frame-library-stardust',
      'frame-constellation-ink',
      'frame-constellation-ink-flow',
      'frame-constellation-pen-light',
      'frame-constellation-gather',
      'frame-cloudvault-light',
      'frame-cloudvault-cloud-flow',
      'frame-cloudvault-pavilion',
      'frame-cloudvault-scroll-glint',
      'frame-eternal-time-light',
      'frame-eternal-season-tour',
      'frame-eternal-crown-flame',
      'frame-eternal-gem-glint',
      'frame-eternal-petal-drift',
      'frame-eternal-firefly',
      'frame-eternal-leaf-drift',
      'frame-eternal-snow-drift',
      'frame-local-twinkle',
    ]) {
      expect(avatarFrameSource, keyframe).toContain(`@keyframes ${keyframe}`);
    }

    expect(avatarFrameSource).toContain('animation: frame-achievement-material-flow 4.8s linear infinite');
    expect(avatarFrameSource).toContain('animation: frame-moon-orbit-glint 5.2s linear infinite');
    expect(avatarFrameSource).toContain('animation: frame-moon-star-twinkle 3.6s');
    expect(avatarFrameSource).toContain('animation: frame-gold-material-flow 2.4s linear infinite');
    expect(avatarFrameSource).toContain('animation: frame-gold-glint 2.2s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-gold-glint 2.2s 1.1s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-gold-fleck 2.6s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-sakura-blossom-shimmer 2.8s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-sakura-pollen-glint 2.4s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-petal-drift 3.6s ease-in-out infinite');
    expect(avatarFrameSource).toContain(
      'animation: frame-sunset-cloud-drift-left 7.2s cubic-bezier(0.45, 0, 0.55, 1) infinite',
    );
    expect(avatarFrameSource).toContain(
      'animation: frame-sunset-cloud-drift-right 7.6s -1.9s cubic-bezier(0.45, 0, 0.55, 1) infinite',
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame__art-focus,\s*\.avatar-frame__sunset-orbit,\s*\.avatar-frame__sunset-cloud,\s*\.avatar-frame__ocean-current,[\s\S]*?position: absolute;/,
    );
    expect(avatarFrameSource).not.toContain('.avatar-frame--sunset .avatar-frame__art {');
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--sunset \.avatar-frame__art-focus\s*\{[\s\S]*?clip-path:\s*polygon\([\s\S]*?50% 73%,[\s\S]*?49% 77%[\s\S]*?\);/,
    );
    expect(avatarFrameSource).toContain("v-if=\"artwork && variant === 'sunset'\"");
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame__sunset-orbit\s*\{[\s\S]*?width:\s*94px;[\s\S]*?height:\s*94px;[\s\S]*?border:\s*1px solid rgba\(232, 143, 133, 0\.92\);/,
    );
    const sunsetOrbitStyle = avatarFrameSource.slice(
      avatarFrameSource.indexOf('.avatar-frame__sunset-orbit {'),
      avatarFrameSource.indexOf('.avatar-frame__sunset-cloud {'),
    );
    expect(sunsetOrbitStyle).not.toContain('animation:');
    expect(avatarFrameSource).not.toContain('frame-sunset-star-twinkle');
    expect(avatarFrameSource).not.toContain('frame-sunset-cloud-spark');
    expect(avatarFrameSource).toContain('animation: frame-note-current-glide 4.8s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-vault-gate-light 4.4s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-vault-cloud-current 5.2s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-vault-data-rise 3.8s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-corridor-gate-light 4.2s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-corridor-floor-glint 4.2s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-corridor-bookmark-glint 4.2s ease-in-out infinite');
    expect(avatarFrameSource).toContain('avatar-frame__aurora-flow--left');
    expect(avatarFrameSource).toContain('avatar-frame__aurora-flow--right');
    expect(avatarFrameSource).toContain('avatar-frame__aurora-crystal--top');
    expect(avatarFrameSource).toContain('avatar-frame__aurora-crystal--bottom');
    expect(avatarFrameSource).toContain(
      'animation: frame-aurora-particle-left 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    );
    expect(avatarFrameSource).toContain(
      'animation: frame-aurora-particle-right 4.8s -2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    );
    expect(avatarFrameSource).toContain('transform: translate3d(23px, -58px, 0) rotate(27deg) scale(0.64)');
    expect(avatarFrameSource).toContain('transform: translate3d(-23px, -58px, 0) rotate(-27deg) scale(0.64)');

    // 龙曜主体单图保持固定；只移动同画布高光遮罩，龙气点和火星均为无结构独立粒子。
    const dragonEnergyTour = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-dragon-energy-tour'),
      avatarFrameSource.indexOf('@keyframes frame-dragon-flame-breathe'),
    );
    expect(dragonEnergyTour).toContain('mask-position');
    expect(dragonEnergyTour).not.toContain('transform:');
    expect(avatarFrameSource).toContain('animation: frame-dragon-energy-tour 4.2s linear infinite');
    expect(avatarFrameSource).toContain('animation: frame-dragon-focus-charge 4.2s ease-in-out infinite');
    expect(avatarFrameSource).toContain(
      'animation: frame-dragon-energy-orbit 7.2s var(--dragon-orbit-delay) linear infinite',
    );
    const dragonOrbitSource = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-dragon-energy-orbit'),
      avatarFrameSource.indexOf('@keyframes frame-dragon-particle-drift'),
    );
    const dragonOrbitPoints = [...dragonOrbitSource.matchAll(/translate\((-?\d+)px,\s*(-?\d+)px\)/g)].map(
      ([, x, y]) => [Number(x), Number(y)] as const,
    );
    expect(dragonOrbitPoints).toHaveLength(9);
    const dragonOrbitSteps = dragonOrbitPoints.slice(1).map(([x, y], index) => {
      const [previousX, previousY] = dragonOrbitPoints[index];
      return Math.hypot(x - previousX, y - previousY);
    });
    expect(Math.max(...dragonOrbitSteps) - Math.min(...dragonOrbitSteps)).toBeLessThan(0.1);
    const dragonOrbitParticleSource = avatarFrameSource.slice(
      avatarFrameSource.indexOf('const dragonOrbitParticles = ['),
      avatarFrameSource.indexOf('] as const;', avatarFrameSource.indexOf('const dragonOrbitParticles = [')),
    );
    expect(dragonOrbitParticleSource.match(/id:\s*'/g)).toHaveLength(4);
    expect(new Set([...dragonOrbitParticleSource.matchAll(/--dragon-orbit-size':\s*'([\d.]+)px'/g)].map(([, size]) => size)).size).toBe(4);
    expect(new Set([...dragonOrbitParticleSource.matchAll(/--dragon-orbit-delay':\s*'(-?[\d.]+)s'/g)].map(([, delay]) => delay)).size).toBe(4);
    expect(avatarFrameSource).toContain('v-for="particle in dragonOrbitParticles"');
    const dragonArtLayerSource = avatarFrameSource.slice(
      avatarFrameSource.indexOf('.avatar-frame__art {'),
      avatarFrameSource.indexOf('// 只复制需要“素材本体局部运动”的主题区域'),
    );
    const dragonOrbitLayerSource = avatarFrameSource.slice(
      avatarFrameSource.indexOf('.avatar-frame__dragon-orbit-particles {'),
      avatarFrameSource.indexOf('.avatar-frame__dragon-orbit-particles i {'),
    );
    const dragonParticleLayerSource = avatarFrameSource.slice(
      avatarFrameSource.indexOf('.avatar-frame__dragon-particles {'),
      avatarFrameSource.indexOf('.avatar-frame__dragon-particles i {'),
    );
    expect(dragonArtLayerSource).toContain('z-index: 3');
    expect(dragonOrbitLayerSource).toContain('z-index: 2');
    expect(dragonParticleLayerSource).toContain('z-index: 2');
    expect(avatarFrameSource).toContain('让龙头、龙身和金属环按原画 Alpha 自然遮挡');
    const dragonFocusSource = avatarFrameSource.slice(
      avatarFrameSource.indexOf('.avatar-frame--dragon .avatar-frame__art-detail'),
      avatarFrameSource.indexOf('// 三段高光层保持', avatarFrameSource.indexOf('.avatar-frame--dragon .avatar-frame__art-detail')),
    );
    expect(dragonFocusSource).toContain('circle at 50% 14%');
    expect(dragonFocusSource).toContain('circle at 50% 84%');
    expect(dragonFocusSource).not.toContain('circle at 24% 28%');
    expect(dragonFocusSource).not.toContain('circle at 64% 31%');
    expect(avatarFrameSource).toContain("v-for=\"layer in ['tail', 'body', 'mane']\"");
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame__dragon-trail\s*\{[\s\S]*?transform:\s*translate\(-50%, -50%\);[\s\S]*?mix-blend-mode:\s*normal;/,
    );
    expect(avatarFrameSource).toMatch(
      /@keyframes frame-dragon-trail-breathe\s*\{[\s\S]*?opacity:\s*0\.32;/,
    );
    const dragonParticleSource = avatarFrameSource.slice(
      avatarFrameSource.indexOf('const dragonParticles = ['),
      avatarFrameSource.indexOf('] as const;', avatarFrameSource.indexOf('const dragonParticles = [')),
    );
    expect(dragonParticleSource.match(/id:\s*'/g)).toHaveLength(18);
    const dragonParticleSizes = [
      ...dragonParticleSource.matchAll(/--dragon-particle-size':\s*'([\d.]+)px'/g),
    ].map(([, size]) => Number(size));
    const dragonParticleDx = [
      ...dragonParticleSource.matchAll(/--dragon-particle-dx':\s*'(-?\d+)px'/g),
    ].map(([, distance]) => Number(distance));
    const dragonParticleDy = [
      ...dragonParticleSource.matchAll(/--dragon-particle-dy':\s*'(-?\d+)px'/g),
    ].map(([, distance]) => Number(distance));
    expect(new Set(dragonParticleSizes).size).toBeGreaterThanOrEqual(10);
    expect(dragonParticleDx.some((distance) => distance < 0)).toBe(true);
    expect(dragonParticleDx.some((distance) => distance > 0)).toBe(true);
    expect(dragonParticleDy.some((distance) => distance < 0)).toBe(true);
    expect(dragonParticleDy.some((distance) => distance > 0)).toBe(true);
    expect(avatarFrameSource).toContain('v-for="particle in dragonParticles"');
    expect(avatarFrameSource).toContain('animation: frame-dragon-particle-drift var(--dragon-particle-duration)');
    // 天穹双翼为独立分层素材:开合只绕翼根旋转、不平移不缩放;环体在底图上零位移。
    const wingFlapKeyframes = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-celestial-wing-flap-left'),
      avatarFrameSource.indexOf('@keyframes frame-celestial-halo-eclipse'),
    );
    expect(wingFlapKeyframes).toContain('rotate(-5deg)');
    expect(wingFlapKeyframes).toContain('rotate(5deg)');
    expect(wingFlapKeyframes).not.toContain('translate(');
    expect(wingFlapKeyframes).not.toContain('scale(');
    expect(avatarFrameSource).toContain('animation: frame-celestial-wing-flap-left 5.2s ease-in-out infinite');
    expect(avatarFrameSource).toContain('animation: frame-celestial-wing-flap-right 5.2s ease-in-out infinite');
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--celestial \.avatar-frame__wing-layer--left\s*\{[\s\S]*?transform-origin:\s*31\.25% 69%;/,
    );
    const pageGlowKeyframes = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-library-page-glow {'),
      avatarFrameSource.indexOf('@keyframes frame-library-page-glint {'),
    );
    expect(pageGlowKeyframes).toContain('mask-position');
    expect(avatarFrameSource).not.toContain('avatar-frame__ambient');
    const coloredGlowRadii = [...avatarFrameSource.matchAll(/drop-shadow\(0 0 ([\d.]+)px var\(--frame-glow\)\)/g)].map(
      ([, value]) => Number(value),
    );
    expect(Math.max(...coloredGlowRadii)).toBeLessThanOrEqual(5);
    expect(wingFlapKeyframes).not.toContain('var(--frame-glow)');
    expect(avatarFrameSource).toContain("artwork.value.motion !== 'static'");
    for (const detailVariant of [
      'gold',
      'sakura',
      'flame',
      'aurora',
      'streak-month',
      'note-masterpiece',
      'file-vault',
      'bookmark-corridor',
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
      'frame-gold-material-flow',
      'frame-sakura-blossom-shimmer',
      'frame-sunset-cloud-drift-left',
      'frame-sunset-cloud-drift-right',
      'frame-moonlight-breathe',
      'frame-vault-metal-light',
      'frame-aurora-metal-light',
      'frame-flame-metal-light',
      'frame-neon-pulse',
      'frame-galaxy-breathe',
      'frame-dragon-metal-light',
      'frame-celestial-glow',
      'frame-library-metal-light',
      'frame-constellation-ink',
      'frame-cloudvault-light',
      'frame-eternal-time-light',
    ]) {
      const keyframeStart = avatarFrameSource.indexOf(`@keyframes ${artKeyframe} {`);
      const nextKeyframe = avatarFrameSource.indexOf('@keyframes ', keyframeStart + 1);
      const keyframeSource = avatarFrameSource.slice(keyframeStart, nextKeyframe);
      expect(keyframeSource, `${artKeyframe} 不得把整张头像框做统一缩放`).not.toMatch(/\bscale(?:X|Y)?\(/);
    }

    for (const stableFrameKeyframe of [
      'frame-flame-metal-light',
      'frame-dragon-metal-light',
      'frame-dragon-energy-tour',
      'frame-eternal-season-tour',
    ]) {
      const keyframeStart = avatarFrameSource.indexOf(`@keyframes ${stableFrameKeyframe} {`);
      const nextKeyframe = avatarFrameSource.indexOf('@keyframes ', keyframeStart + 1);
      const keyframeSource = avatarFrameSource.slice(keyframeStart, nextKeyframe);
      expect(keyframeSource, `${stableFrameKeyframe} 的主体框必须保持稳定`).not.toMatch(
        /rotate\(|skew|translateX\(|translateY\(/,
      );
    }
    for (const pixelAlignedDetailKeyframe of ['frame-achievement-material-flow']) {
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
    for (const stableAchievementVariant of [
      'streak-month',
      'note-masterpiece',
      'file-vault',
      'bookmark-corridor',
    ]) {
      expect(avatarFrameSource, stableAchievementVariant).not.toContain(
        `.avatar-frame--dynamic.avatar-frame--${stableAchievementVariant} .avatar-frame__art {\n    animation:`,
      );
    }

    expect(avatarFrameSource).toContain(
      'class="avatar-frame__ocean-current avatar-frame__ocean-current--surge"',
    );
    expect(avatarFrameSource).toContain(
      'class="avatar-frame__ocean-current avatar-frame__ocean-current--crest"',
    );
    expect(avatarFrameSource).toContain(
      'class="avatar-frame__ocean-current avatar-frame__ocean-current--return"',
    );
    expect(avatarFrameSource).not.toContain(
      '.avatar-frame--dynamic.avatar-frame--ocean .avatar-frame__art {\n    animation:',
    );

    const oceanStructureStart = avatarFrameSource.indexOf('.avatar-frame--ocean .avatar-frame__motion--back');
    const oceanStructureEnd = avatarFrameSource.indexOf(
      '.avatar-frame--aurora .avatar-frame__motion--back::before',
    );
    const oceanStructureSource = avatarFrameSource.slice(oceanStructureStart, oceanStructureEnd);
    expect(oceanStructureSource).toContain('animation: frame-ocean-surge 3.8s linear infinite');
    expect(oceanStructureSource).toContain('animation: frame-ocean-crest-sway 4.4s -1.5s linear infinite');
    expect(oceanStructureSource).toContain('animation: frame-ocean-return-flow 5s -2.7s linear infinite');
    expect(oceanStructureSource).toContain('animation: frame-ocean-bubble-drift-left 3.4s');
    expect(oceanStructureSource).toContain('animation: frame-ocean-bubble-drift-right 4s -1.4s');
    expect(oceanStructureSource).toMatch(
      /\.avatar-frame__ocean-current\s*\{[\s\S]*?mix-blend-mode:\s*screen;/,
    );
    expect(oceanStructureSource).toMatch(
      /\.avatar-frame--ocean \.avatar-frame__motion--back\s*\{[\s\S]*?display:\s*none;/,
    );
    expect(oceanStructureSource).toMatch(
      /\.avatar-frame--ocean \.avatar-frame__motion--front i\s*\{[\s\S]*?border-radius:\s*50%;/,
    );
    const oceanKeyframeSource = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-ocean-surge'),
      avatarFrameSource.indexOf('@keyframes frame-ocean-foam-lilt-left'),
    );
    expect(oceanKeyframeSource).toContain('mask-position:');
    expect(oceanKeyframeSource).not.toContain('translate3d(');
    expect(oceanKeyframeSource).not.toMatch(/transform:\s*[^;]*scale\(/);

    const auroraStructureStart = avatarFrameSource.indexOf(
      '.avatar-frame--aurora .avatar-frame__motion--back::before',
    );
    const auroraStructureEnd = avatarFrameSource.indexOf(
      '.avatar-frame--dynamic.avatar-frame--flame .avatar-frame__art',
    );
    const auroraStructureSource = avatarFrameSource.slice(auroraStructureStart, auroraStructureEnd);
    expect(auroraStructureSource).toContain('.avatar-frame--aurora .avatar-frame__motion--back i');
    expect(auroraStructureSource).toContain('animation: frame-aurora-source-flow-left 4.8s linear infinite');
    expect(auroraStructureSource).toContain('animation: frame-aurora-source-flow-right 4.8s -2.4s linear infinite');
    expect(auroraStructureSource).toContain('animation: frame-aurora-crystal-charge 4.8s ease-in-out infinite');
    expect(auroraStructureSource).toContain('animation: frame-aurora-particle-left 4.8s');
    expect(auroraStructureSource).toContain('animation: frame-aurora-particle-right 4.8s -2.4s');
    expect(auroraStructureSource).toMatch(
      /\.avatar-frame--aurora \.avatar-frame__motion--back::before,[\s\S]*?display:\s*none;/,
    );
    expect(auroraStructureSource).toMatch(
      /\.avatar-frame--aurora \.avatar-frame__motion--front i:nth-child\(3\),[\s\S]*?display:\s*none;/,
    );
    expect(auroraStructureSource).not.toContain('frame-aurora-ribbon-flow');

    const flameStructureStart = avatarFrameSource.indexOf(
      '.avatar-frame--dynamic.avatar-frame--flame .avatar-frame__art',
    );
    const flameStructureEnd = avatarFrameSource.indexOf('/* 积分传说严格递进', flameStructureStart);
    const flameStructureSource = avatarFrameSource.slice(flameStructureStart, flameStructureEnd);
    expect(flameStructureSource).toContain('animation: frame-flame-heat-sweep 9.2s linear infinite');
    expect(flameStructureSource).toContain('animation: frame-flame-heat-sweep-reverse 11.6s -5.8s linear infinite');
    expect(flameStructureSource).toContain(
      'animation: frame-flame-spark-rise var(--flame-duration) var(--flame-delay) linear infinite',
    );
    expect(flameStructureSource).toContain('animation: frame-flame-real-embers 8.4s linear infinite');
    expect(flameStructureSource).toContain('animation: frame-flame-metal-light 6.4s linear infinite');
    expect(avatarFrameSource).toContain("id: 'left-tip'");
    expect(avatarFrameSource).toContain("id: 'right-tip'");
    expect(avatarFrameSource).toContain("id: 'outer-left-mid'");
    expect(avatarFrameSource).toContain("id: 'outer-right-mid'");
    expect(avatarFrameSource).toContain("id: 'outer-bottom-center'");
    expect(flameStructureSource).not.toContain('frame-flame-burn-left');
    expect(flameStructureSource).not.toContain('frame-flame-particle-life');
    expect(avatarFrameSource).toMatch(
      /@keyframes frame-flame-spark-rise[\s\S]*?72%[\s\S]*?translateY\(calc\(var\(--flame-rise\) \* -1\)\)[\s\S]*?100%[\s\S]*?translateY\(calc\(var\(--flame-rise\) \* -1\)\)/,
    );
    expect(flameStructureSource).toMatch(
      /\.avatar-frame--flame \.avatar-frame__motion--back::before,[\s\S]*?display:\s*none;/,
    );
    expect(flameStructureSource).toMatch(
      /\.avatar-frame--flame \.avatar-frame__motion--front::after\s*\{[\s\S]*?display:\s*none;/,
    );
    expect(flameStructureSource).toMatch(
      /\.avatar-frame--flame \.avatar-frame__motion--front i\s*\{[\s\S]*?display:\s*none;/,
    );

    const libraryGlowSource = avatarFrameSource.slice(
      avatarFrameSource.indexOf('@keyframes frame-library-page-glow {'),
      avatarFrameSource.indexOf('@keyframes frame-library-page-glint {'),
    );
    expect(libraryGlowSource).not.toMatch(/scaleX\(1\.1/);
    expect(libraryGlowSource).not.toMatch(/translateY\(-[234]px\)/);
  });

  it('pauses decorative motion offscreen, on explicit opt-out and for reduced-motion users', () => {
    expect(avatarFrameSource).toContain("'avatar-frame--motion-paused': isMotionPaused");
    expect(avatarFrameSource).toContain('const isMotionVisible = ref(!props.pauseWhenOffscreen)');
    expect(avatarFrameSource).toContain("rootMargin: '24px 0px'");
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--motion-paused \.avatar-frame__art[\s\S]*?animation:\s*none !important;/,
    );
    expect(avatarFrameSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.avatar-frame__art[\s\S]*?animation:\s*none !important;/,
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--motion-paused \.avatar-frame__art-detail[\s\S]*?animation:\s*none !important;/,
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--motion-paused \.avatar-frame__dragon-trail[\s\S]*?animation:\s*none !important;/,
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--motion-paused \.avatar-frame__dragon-particles i[\s\S]*?animation:\s*none !important;/,
    );
    expect(avatarFrameSource).toMatch(
      /\.avatar-frame--motion-paused \.avatar-frame__dragon-orbit-particles i[\s\S]*?animation:\s*none !important;/,
    );
    expect(avatarFrameSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.avatar-frame__dragon-trail[\s\S]*?animation:\s*none !important;/,
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
