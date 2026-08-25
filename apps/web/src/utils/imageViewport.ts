export interface ImageViewportPadding {
  x: number;
  top: number;
  bottom: number;
}

export interface ImageViewportLayoutInput {
  naturalWidth: number;
  naturalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  padding: ImageViewportPadding;
  scale: number;
  rotation: number;
}

export interface ImageViewportLayout {
  imageWidth: number;
  imageHeight: number;
  boundsWidth: number;
  boundsHeight: number;
  stageWidth: number;
  stageHeight: number;
  /** 图片在 scale=1 时为适应视口所使用的原图缩放倍率。 */
  fitScale: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 计算可滚动图片视口的真实布局尺寸。
 *
 * 图片放大不能只改 transform：transform 不参与布局，overflow 因此得不到新的滚动范围。
 * 这里把缩放后的包围盒落实为 stage 的真实宽高，图片只保留旋转 transform，桌面拖动和
 * 移动端单指浏览都可以直接复用浏览器原生滚动。
 */
export function resolveImageViewportLayout(input: ImageViewportLayoutInput): ImageViewportLayout {
  const naturalWidth = finiteNonNegative(input.naturalWidth);
  const naturalHeight = finiteNonNegative(input.naturalHeight);
  const viewportWidth = finiteNonNegative(input.viewportWidth);
  const viewportHeight = finiteNonNegative(input.viewportHeight);
  const scale = finiteNonNegative(input.scale) || 1;
  const padding = {
    x: finiteNonNegative(input.padding.x),
    top: finiteNonNegative(input.padding.top),
    bottom: finiteNonNegative(input.padding.bottom),
  };

  if (!naturalWidth || !naturalHeight || !viewportWidth || !viewportHeight) {
    return {
      imageWidth: 0,
      imageHeight: 0,
      boundsWidth: 0,
      boundsHeight: 0,
      stageWidth: viewportWidth,
      stageHeight: viewportHeight,
      fitScale: 1,
    };
  }

  const normalizedQuarterTurns = Math.abs(Math.round(input.rotation / 90)) % 2;
  const quarterTurn = normalizedQuarterTurns === 1;
  const naturalBoundsWidth = quarterTurn ? naturalHeight : naturalWidth;
  const naturalBoundsHeight = quarterTurn ? naturalWidth : naturalHeight;
  const availableWidth = Math.max(1, viewportWidth - padding.x * 2);
  const availableHeight = Math.max(1, viewportHeight - padding.top - padding.bottom);
  const fitScale = Math.min(1, availableWidth / naturalBoundsWidth, availableHeight / naturalBoundsHeight);
  const imageWidth = naturalWidth * fitScale * scale;
  const imageHeight = naturalHeight * fitScale * scale;
  const boundsWidth = quarterTurn ? imageHeight : imageWidth;
  const boundsHeight = quarterTurn ? imageWidth : imageHeight;

  return {
    imageWidth,
    imageHeight,
    boundsWidth,
    boundsHeight,
    stageWidth: Math.max(viewportWidth, boundsWidth + padding.x * 2),
    stageHeight: Math.max(viewportHeight, boundsHeight + padding.top + padding.bottom),
    fitScale,
  };
}
