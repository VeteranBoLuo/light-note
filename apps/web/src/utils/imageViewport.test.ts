import { describe, expect, it } from 'vitest';
import { resolveImageViewportLayout } from './imageViewport';

const padding = { x: 24, top: 24, bottom: 24 };

describe('resolveImageViewportLayout', () => {
  it('小图不主动放大，并让舞台至少铺满视口', () => {
    expect(
      resolveImageViewportLayout({
        naturalWidth: 320,
        naturalHeight: 180,
        viewportWidth: 1000,
        viewportHeight: 700,
        padding,
        scale: 1,
        rotation: 0,
      }),
    ).toMatchObject({
      imageWidth: 320,
      imageHeight: 180,
      stageWidth: 1000,
      stageHeight: 700,
      fitScale: 1,
    });
  });

  it('长图先适应可用视口，再用真实舞台尺寸产生缩放后的滚动范围', () => {
    const layout = resolveImageViewportLayout({
      naturalWidth: 1200,
      naturalHeight: 3600,
      viewportWidth: 900,
      viewportHeight: 700,
      padding,
      scale: 3,
      rotation: 0,
    });

    expect(layout.fitScale).toBeCloseTo(652 / 3600);
    expect(layout.imageHeight).toBeCloseTo(1956);
    expect(layout.stageHeight).toBeCloseTo(2004);
    expect(layout.stageHeight).toBeGreaterThan(700);
  });

  it('旋转九十度时按交换后的包围盒适配与扩展舞台', () => {
    const layout = resolveImageViewportLayout({
      naturalWidth: 1600,
      naturalHeight: 900,
      viewportWidth: 1000,
      viewportHeight: 700,
      padding,
      scale: 2,
      rotation: 90,
    });

    expect(layout.fitScale).toBeCloseTo(652 / 1600);
    expect(layout.boundsWidth).toBeCloseTo(900 * layout.fitScale * 2);
    expect(layout.boundsHeight).toBeCloseTo(1600 * layout.fitScale * 2);
    expect(layout.stageHeight).toBeGreaterThan(700);
  });

  it('图片尚未加载时仍返回稳定视口舞台，不产生 NaN', () => {
    expect(
      resolveImageViewportLayout({
        naturalWidth: 0,
        naturalHeight: 0,
        viewportWidth: 840,
        viewportHeight: 560,
        padding,
        scale: 1,
        rotation: 0,
      }),
    ).toEqual({
      imageWidth: 0,
      imageHeight: 0,
      boundsWidth: 0,
      boundsHeight: 0,
      stageWidth: 840,
      stageHeight: 560,
      fitScale: 1,
    });
  });
});
