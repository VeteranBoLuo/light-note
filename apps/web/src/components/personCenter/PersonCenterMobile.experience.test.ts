import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const personCenterSource = source('src/view/personCenter/PersonCenterMobile.vue');
const desktopPersonCenterSource = source('src/view/personCenter/PersonCenter.vue');
const myInfoSource = source('src/components/personCenter/myInfo/MyInfoMobile.vue');
const framePickerSource = source('src/components/growth/AvatarFramePickerDrawer.vue');
const opinionSource = source('src/components/personCenter/opinions/OpinionPanel.vue');
const passwordDialogSource = source('src/components/personCenter/myInfo/PassConfigDlg.vue');

describe('mobile personal center experience', () => {
  it('keeps quick access entries in a strict four-column equal-width grid', () => {
    expect(personCenterSource).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(personCenterSource).toMatch(/\.profile-quick-item\s*\{[\s\S]*?width:\s*100%;/);
    expect(personCenterSource).not.toContain('profile-overview');
  });

  it('keeps co-build visible in both desktop and mobile personal centers for visitors', () => {
    expect(personCenterSource).toContain("goToProfileModule('/co-build')");
    expect(personCenterSource).toContain("t('personCenter.coBuildDesc')");
    expect(desktopPersonCenterSource).toContain("path: '/co-build'");
    expect(desktopPersonCenterSource).not.toMatch(/name:\s*'coBuild'[\s\S]{0,180}authOnly:\s*true/);
  });

  it('exposes the equipped frame and the frame picker from profile editing', () => {
    expect(myInfoSource).toContain('<AvatarFramePreview');
    expect(myInfoSource).toContain('<AvatarFramePickerDrawer v-model:open="frameDrawerOpen" />');
    expect(myInfoSource).toContain('<MobileStickyActionBar');
    expect(framePickerSource).toContain('await buyItem(frame.id)');
    expect(framePickerSource).toContain('await equipFrame(frame.id)');
    expect(framePickerSource).not.toContain('dvh');
  });

  it('closes avatar overlay history before navigating and stabilizes the initial frame tabs', () => {
    expect(framePickerSource).toContain('closeCurrentMobileOverlayThen(closeDrawer');
    expect(framePickerSource).toContain('flex: 0 0 38px');
    expect(framePickerSource).toContain('flex: 1 1 50%');
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
