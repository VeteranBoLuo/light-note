import { densityCssVariables } from '@/config/uiDensity';

const standard = densityCssVariables('standard');

/** Existing source-layout contracts compare actual standard values, not var() spelling. */
export function standardDensitySource(source: string): string {
  return source.replace(/var\((--ui-[\w-]+),\s*([\d.]+px)\)/g, (_, name: string, fallback: string) => {
    const value = standard[name];
    if (!value || value !== fallback) throw new Error(`Invalid standard density token: ${name}, ${fallback}`);
    return value;
  });
}
