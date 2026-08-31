import { describe, expect, it } from 'vitest';
import { PRIMARY_PRODUCTION_STUDIOS, PRODUCTION_STUDIOS, productionStudioForProjectType } from './productionStudios';

describe('production studios', () => {
  it('keeps surfaces separate from one-off tool ids and maps every project type', () => {
    expect(PRODUCTION_STUDIOS.map((studio) => studio.projectType)).toEqual(['document', 'presentation', 'workbook']);
    expect(new Set(PRODUCTION_STUDIOS.map((studio) => studio.listRouteName)).size).toBe(3);
    expect(new Set(PRODUCTION_STUDIOS.map((studio) => studio.projectRouteName)).size).toBe(3);
    expect(new Set(PRODUCTION_STUDIOS.map((studio) => studio.icon)).size).toBe(3);
    expect(PRODUCTION_STUDIOS.every((studio) => studio.icon.includes('<svg'))).toBe(true);
    expect(PRIMARY_PRODUCTION_STUDIOS.map((studio) => studio.projectType)).toEqual(['presentation', 'workbook']);
    expect(PRODUCTION_STUDIOS.find((studio) => studio.projectType === 'document')?.entry).toBe('legacy');
    expect(productionStudioForProjectType('presentation').id).toBe('presentation');
  });
});
