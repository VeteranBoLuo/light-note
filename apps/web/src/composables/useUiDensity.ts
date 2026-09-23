import { readonly, shallowRef } from 'vue';
import {
  densityCssVariables,
  densityDimension,
  resolveUiDensity,
  type DensityDimension,
  type UiDensity,
} from '@/config/uiDensity';

const activeDensity = shallowRef<UiDensity>('standard');

/** One application state for root/Teleport CSS and numeric layout consumers. */
export function applyUiDensity(preference: unknown, forceStandard = false): void {
  const density = resolveUiDensity(preference, forceStandard);
  const root = document.documentElement;
  root.style.removeProperty('zoom');
  root.style.removeProperty('--ln-aux-zoom');
  root.style.removeProperty('font-size');
  if (activeDensity.value === density && root.dataset.density === density) return;
  // Synchronous subscribers capture reading anchors before CSS changes geometry.
  activeDensity.value = density;
  root.dataset.density = density;
  for (const [name, value] of Object.entries(densityCssVariables(density))) root.style.setProperty(name, value);
}

export function useUiDensity() {
  return {
    density: readonly(activeDensity),
    dimension: (base: number, kind: DensityDimension = 'space') => densityDimension(base, kind, activeDensity.value),
  };
}
