import { auditDensityTokens } from '../../scripts/density-token-audit.mjs';
import { describe, expect, it, vi } from 'vitest';
import {
  densityCssVariables,
  densityDimension,
  resolveUiDensity,
  requiresStandardDensity,
  UI_DENSITIES,
} from './uiDensity';
import { applyUiDensity, useUiDensity } from '@/composables/useUiDensity';

describe('interface density', () => {
  it('maps existing preferences, rejects invalid values and preserves touch layout', () => {
    expect(resolveUiDensity('small')).toBe('compact');
    expect(resolveUiDensity('large')).toBe('comfortable');
    for (const value of [undefined, null, '', 'invalid', 'medium']) expect(resolveUiDensity(value)).toBe('standard');
    expect(resolveUiDensity('small', true)).toBe('standard');
  });
  it('preserves standard dimensions and readable control minimums', () => {
    expect(densityDimension(32, 'control', 'compact')).toBe(28);
    expect(densityDimension(24, 'control', 'compact')).toBe(24);
    expect(densityDimension(32, 'control', 'comfortable')).toBe(36);
    expect(densityDimension(15, 'space', 'compact')).toBe(13);
    expect(densityDimension(15, 'space', 'comfortable')).toBe(17);
    expect(densityDimension(0, 'space', 'compact')).toBe(0);
    expect(densityDimension(1, 'space', 'standard')).toBe(1);
    expect(densityDimension(1, 'space', 'compact')).toBe(1);
    expect(densityDimension(0.5, 'space', 'compact')).toBeLessThanOrEqual(0.5);
  });
  it('reduces card and navigation capacity costs without making interface text too small', () => {
    expect(densityDimension(164, 'card', 'compact')).toBeLessThan(145);
    expect(densityDimension(228, 'layout', 'compact')).toBeLessThan(228);
    expect(densityDimension(15, 'font', 'compact')).toBe(14);
    expect(densityDimension(12, 'font', 'compact')).toBe(11);
    expect(densityDimension(10, 'font', 'compact')).toBe(10);
    expect(densityDimension(28, 'icon', 'compact')).toBe(25);
    for (const kind of ['card', 'layout', 'font', 'icon'] as const) {
      expect(densityDimension(28, kind, 'standard')).toBe(28);
      expect(densityDimension(28, kind, 'comfortable')).toBeGreaterThan(28);
    }
  });
  it('CSS and numerical consumers use identical dimensions', () => {
    for (const density of UI_DENSITIES) {
      const variables = densityCssVariables(density);
      for (const [name, value] of Object.entries(variables)) {
        const match = name.match(/^--ui-(\w+)-([\d_]+)$/);
        if (!match) continue;
        const [, kind, base] = match;
        expect(value).toBe(
          `${densityDimension(Number(base.replace('_', '.')), kind as Parameters<typeof densityDimension>[1], density)}px`,
        );
      }
      for (let base = 1; base <= 128; base++) {
        expect(variables[`--ui-space-${base}`]).toBe(`${densityDimension(base, 'space', density)}px`);
        if (base >= 24)
          expect(variables[`--ui-control-${base}`]).toBe(`${densityDimension(base, 'control', density)}px`);
      }
    }
  });
  it('switches CSS and reactive dimensions together without changing preferences or coordinates', () => {
    const root = document.documentElement;
    const { density, dimension } = useUiDensity();
    root.style.zoom = '0.9';
    root.style.setProperty('--ln-aux-zoom', '1.111');
    applyUiDensity('small');
    expect(root.style.zoom).toBe('');
    expect(root.style.getPropertyValue('--ln-aux-zoom')).toBe('');
    expect(root.dataset.density).toBe('compact');
    expect(density.value).toBe('compact');
    expect(root.style.getPropertyValue('--ui-control-32')).toBe(`${dimension(32, 'control')}px`);
    applyUiDensity('large', true);
    expect(dimension(32, 'control')).toBe(32);
    expect(density.value).toBe('standard');
  });
});

// Standard density is a compatibility contract, including every explicit fallback
// authored by a page. This also catches new variable names missing from the catalog.
it('defines every authored density token and preserves its standard fallback', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const standard = densityCssVariables('standard');
  async function check(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        await check(file);
        continue;
      }
      if (!/\.(vue|less|css)$/.test(file)) continue;
      const source = await readFile(file, 'utf8');
      expect(auditDensityTokens(source, standard), file).toEqual([]);
    }
  }
  await check(join(process.cwd(), 'src'));
});

it('rejects missing tokens, misspelled names, missing and incorrect standard fallbacks', () => {
  const standard = densityCssVariables('standard');
  expect(auditDensityTokens('.a { gap: var( --ui-space-12, 12px ); }', standard)).toEqual([]);
  expect(auditDensityTokens('width: var(--ui-layout-60, 60px);', standard)).toEqual([]);
  for (const reference of [
    'var(--ui-layotu-60, 60px)',
    'var(--ui-layout-999999, 999999px)',
    'var(--ui-layout-60)',
    'var(--ui-layout-60, 61px)',
    'var(--ui-layout-60, calc(60px))',
  ])
    expect(auditDensityTokens(reference, standard), reference).toHaveLength(1);
  expect(auditDensityTokens('a {}\n.b { gap: var(--ui-missing, 2px); }', standard)[0].line).toBe(2);
});

it('does not rewrite density variables when navigation reapplies the same preference', () => {
  applyUiDensity('small');
  const root = document.documentElement;
  const before = root.style.cssText;
  const write = vi.spyOn(root.style, 'setProperty');
  try {
    for (let navigation = 0; navigation < 10; navigation++) applyUiDensity('small');
    expect(write).not.toHaveBeenCalled();
    expect(root.style.cssText).toBe(before);
    applyUiDensity('large');
    expect(write).toHaveBeenCalled();
    expect(root.style.getPropertyValue('--ui-layout-60')).toBe('66px');
  } finally {
    write.mockRestore();
    applyUiDensity('medium');
  }
});

it('keeps public and touch routes standard and restores the saved desktop density on return', () => {
  const workspace = { name: 'workbenches', meta: {} };
  const publicRoutes = [
    'updateLogs',
    'githubCallBack',
    'not-found',
    'not-role',
    'landing',
    'banned',
    'quickSave',
    'browserExtensionLanding',
    'extensionAuthorize',
    'noteShare',
    'fileShare',
    'legacyShareDownload',
    'downloadAndroid',
  ].map((name) => ({ name, meta: {} }));
  publicRoutes.push({ name: 'futurePublicPage', meta: { publicStandalone: true } });
  for (const route of publicRoutes) {
    expect(requiresStandardDensity(route, true), String(route.name)).toBe(true);
  }
  expect(requiresStandardDensity(workspace, true)).toBe(false);
  expect(requiresStandardDensity(workspace, false)).toBe(true);
  for (const preference of ['small', 'medium', 'large']) {
    try {
      applyUiDensity(preference, requiresStandardDensity(workspace, true));
      const desktopVariables = document.documentElement.style.cssText;
      // Route classification is checked exhaustively above; one real DOM round trip
      // per preference exercises the shared forced-standard rendering behavior.
      applyUiDensity(preference, requiresStandardDensity(publicRoutes[0], true));
      expect(useUiDensity().density.value).toBe('standard');
      expect(useUiDensity().dimension(60, 'layout')).toBe(60);
      applyUiDensity(preference, requiresStandardDensity(workspace, true));
      expect(document.documentElement.style.cssText).toBe(desktopVariables);
      applyUiDensity(preference, requiresStandardDensity(workspace, false));
      expect(useUiDensity().density.value).toBe('standard');
      expect(useUiDensity().dimension(60, 'layout')).toBe(60);
    } finally {
      applyUiDensity('medium');
    }
  }
});


it('runs density browser fixtures in the production standards mode required by TinyMCE', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const directory = join(process.cwd(), 'e2e');
  for (const name of await readdir(directory)) {
    if (!name.includes('density') || !name.endsWith('.html')) continue;
    const source = await readFile(join(directory, name), 'utf8');
    const document = new DOMParser().parseFromString(source, 'text/html');
    expect(document.compatMode, name).toBe('CSS1Compat');
  }
});
