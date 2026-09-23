import { UI_DENSITY_EXTRA_SIZES } from './uiDensitySizes';

/** Interface dimensions only: document geometry and measured coordinates are never scaled. */
export type UiDensity = 'compact' | 'standard' | 'comfortable';
export type DensityDimension = 'space' | 'control' | 'layout' | 'font' | 'icon' | 'card';
export const UI_DENSITIES: readonly UiDensity[] = ['compact', 'standard', 'comfortable'];
export const UI_DENSITY_DIMENSIONS = {
  compact: { spacing: 0.85, controlDelta: -4, layout: 0.9, font: 0.9, card: 0.86 },
  standard: { spacing: 1, controlDelta: 0, layout: 1, font: 1, card: 1 },
  comfortable: { spacing: 1.15, controlDelta: 4, layout: 1.1, font: 1.05, card: 1.1 },
} as const;

/** Public standalone pages keep their original dimensions, even after leaving a desktop workspace. */
const STANDARD_DENSITY_ROUTES = new Set([
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
]);

export function requiresStandardDensity(
  route: { name?: unknown; meta?: Record<string, unknown> },
  isDesktop: boolean,
): boolean {
  return !isDesktop || route.meta?.publicStandalone === true || STANDARD_DENSITY_ROUTES.has(String(route.name ?? ''));
}

export function resolveUiDensity(preference: unknown, forceStandard = false): UiDensity {
  if (forceStandard) return 'standard';
  return preference === 'small' ? 'compact' : preference === 'large' ? 'comfortable' : 'standard';
}

export function densityDimension(base: number, kind: DensityDimension, density: UiDensity): number {
  if (!Number.isFinite(base) || base <= 0 || density === 'standard') return base;
  const definition = UI_DENSITY_DIMENSIONS[density];
  if (kind === 'font') return Math.max(Math.min(base, 11), Math.round(base * definition.font));
  if (kind === 'layout' || kind === 'icon') return Math.max(1, Math.round(base * definition.layout));
  if (kind === 'card') return Math.round(base * definition.card);
  return kind === 'space'
    ? Math.max(Math.min(base, 2), Math.round(base * definition.spacing))
    : Math.max(24, base + definition.controlDelta);
}

/** Finite shared token range; arbitrary JS row heights use densityDimension directly. */
export function densityCssVariables(density: UiDensity): Record<string, string> {
  const result: Record<string, string> = { '--bookmark-description-lines': density === 'compact' ? '2' : '3' };
  for (let base = 1; base <= 128; base++) {
    result[`--ui-space-${base}`] = `${densityDimension(base, 'space', density)}px`;
    if (base >= 24) result[`--ui-control-${base}`] = `${densityDimension(base, 'control', density)}px`;
  }
  for (let base = 10; base <= 40; base++) result[`--ui-font-${base}`] = `${densityDimension(base, 'font', density)}px`;
  for (const base of [
    14, 18, 20, 22, 26, 28, 30, 32, 34, 36, 40, 44, 48, 54, 60, 64, 80, 88, 100, 108, 112, 120, 140, 142, 180, 200, 220,
    228, 230, 240, 260, 280, 300, 320, 360, 460,
  ])
    result[`--ui-layout-${base}`] = `${densityDimension(base, 'layout', density)}px`;
  for (const base of [154, 164, 240, 260, 278, 282, 300])
    result[`--ui-card-${base}`] = `${densityDimension(base, 'card', density)}px`;
  for (const [kind, sizes] of Object.entries(UI_DENSITY_EXTRA_SIZES)) {
    for (const base of sizes)
      result[`--ui-${kind}-${String(base).replace('.', '_')}`] =
        `${densityDimension(base, kind as DensityDimension, density)}px`;
  }
  return result;
}
