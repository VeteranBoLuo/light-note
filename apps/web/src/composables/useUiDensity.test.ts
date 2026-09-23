import { describe, expect, it } from 'vitest';
import { watch } from 'vue';
import { applyUiDensity, useUiDensity } from './useUiDensity';

describe('density layout transitions', () => {
  it('lets synchronous consumers capture old geometry before changing styles', () => {
    applyUiDensity('medium');
    const { density, dimension } = useUiDensity();
    const captured: string[] = [];
    const stop = watch(density, () => {
      captured.push(document.documentElement.style.getPropertyValue('--ui-layout-60'));
    }, { flush: 'sync' });
    try {
      applyUiDensity('small');
      expect(captured).toEqual(['60px']);
      expect(document.documentElement.style.getPropertyValue('--ui-layout-60')).toBe('54px');
      expect(dimension(60, 'layout')).toBe(54);
      applyUiDensity('small');
      expect(captured).toHaveLength(1);
      applyUiDensity('large', true);
      expect(captured).toEqual(['60px', '54px']);
      expect(dimension(60, 'layout')).toBe(60);
    } finally {
      stop();
      applyUiDensity('medium');
    }
  });
});
