import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const pickerSource = source('src/components/personCenter/myInfo/AvatarPicker.vue');
const desktopProfileSource = source('src/components/personCenter/myInfo/MyInfo.vue');
const mobileProfileSource = source('src/components/personCenter/myInfo/MyInfoMobile.vue');

describe('avatar picker integration', () => {
  it('uses the adaptive B-component shell and keeps custom upload as a secondary choice', () => {
    expect(pickerSource).toContain('isMobileLayout.value ? BDrawer : BModal');
    expect(pickerSource).toContain('<BUpload');
    expect(pickerSource).toContain('v-for="avatar in BUILTIN_AVATARS"');
    expect(pickerSource).toContain('renderBuiltinAvatar(selectedId.value)');
  });

  it('does not introduce raw controls or inline static svg icons', () => {
    expect(pickerSource).not.toMatch(/<(?:button|input|select|textarea)\b/u);
    expect(pickerSource).not.toMatch(/<(?:svg|path)\b/u);
  });

  it('routes both desktop and mobile avatar clicks through the picker', () => {
    [desktopProfileSource, mobileProfileSource].forEach((profileSource) => {
      expect(profileSource).toContain('<AvatarPicker');
      expect(profileSource).toContain('@select="handleAvatarSelected"');
      expect(profileSource).not.toContain('<BUpload');
      expect(profileSource).not.toContain('handleAvatarChange');
    });
  });
});
