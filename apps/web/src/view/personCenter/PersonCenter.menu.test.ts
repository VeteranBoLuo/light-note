import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import icon from '@/config/icon';
import {
  DESKTOP_PERSON_CENTER_PRIMARY_ENTRIES,
  DESKTOP_PERSON_CENTER_SECONDARY_ENTRIES,
  MOBILE_PERSON_CENTER_COMMUNICATION_ENTRIES,
  MOBILE_PERSON_CENTER_QUICK_ENTRIES,
  PERSON_CENTER_ENTRIES,
} from '@/config/personCenterEntries';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const desktopSource = source('src/view/personCenter/PersonCenter.vue');
const mobileSource = source('src/view/personCenter/PersonCenterMobile.vue');

describe('personal center menu contract', () => {
  it('keeps the desktop hierarchy deliberate and separates secondary actions', () => {
    expect(DESKTOP_PERSON_CENTER_PRIMARY_ENTRIES.map((entry) => entry.name)).toEqual([
      'growth',
      'entitlementStore',
      'settings',
      'trash',
      'coBuild',
      'feedback',
      'help',
      'updateLogs',
    ]);
    expect(DESKTOP_PERSON_CENTER_SECONDARY_ENTRIES.map((entry) => entry.name)).toEqual(['support']);
    expect(desktopSource).toContain('<div class="menu-group-divider" aria-hidden="true" />');
    expect(PERSON_CENTER_ENTRIES.trash.tone).toBe('neutral');
  });

  it('shares entry semantics across desktop and mobile without changing mobile trash routing', () => {
    expect(MOBILE_PERSON_CENTER_QUICK_ENTRIES.map((entry) => entry.name)).toEqual([
      'growth',
      'entitlementStore',
      'resourceCenter',
      'trash',
    ]);
    expect(PERSON_CENTER_ENTRIES.trash.mobilePath).toBe('/ptrash');
    expect(MOBILE_PERSON_CENTER_COMMUNICATION_ENTRIES.map((entry) => entry.name)).toEqual([
      'coBuild',
      'feedback',
      'help',
      'updateLogs',
      'support',
    ]);
    expect(mobileSource).toContain('goToProfileModule(entry.mobilePath || entry.path)');
  });

  it('uses real shared icons and a unified optical canvas for the redesigned desktop entries', () => {
    for (const entry of Object.values(PERSON_CENTER_ENTRIES)) {
      expect(entry.icon).toBeTruthy();
      expect(entry.icon).not.toBe(icon.nullImg);
    }

    for (const svg of Object.values(icon.userCenter.menu)) {
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('currentColor');
    }
  });

  it('uses BButton with left-aligned fixed icon slots and explicit semantic tones', () => {
    expect(desktopSource).toContain('import BButton');
    expect(desktopSource).toContain('justify-content: flex-start');
    expect(desktopSource).toMatch(/\.menu-entry__icon\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;/);
    expect(desktopSource).toContain('<svg-icon size="16" :src="menuItem.icon"');
    expect(desktopSource).toContain('.menu-entry--growth .menu-entry__icon');
    expect(desktopSource).toContain('.menu-entry--store .menu-entry__icon');
    expect(desktopSource).toContain('.menu-entry--community .menu-entry__icon');
    expect(desktopSource).not.toContain('class="flex-center li"');
  });

  it('keeps visitor, signed-in and unread-growth states explicit', () => {
    expect(desktopSource).toContain("user.role === 'visitor' ? icon.navigation.user : icon.userCenter.menu.logout");
    expect(desktopSource).toContain("user.role === 'visitor' ? t('personCenter.loginRegister') : t('personCenter.logout')");
    expect(desktopSource).toContain("menuItem.name === 'growth' && growthInfo?.hasUnreadLevelUp");
  });
});
