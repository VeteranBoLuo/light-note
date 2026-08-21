import type { DrawingColor, DrawingFillElement } from '@lightnote/shared/drawing-note';
import { paintDrawingWithErasures } from './drawingMask';

export type DrawingFillResult =
  | { status: 'filled'; spans: number[]; pixelCount: number }
  | { status: 'open' | 'same-color' | 'empty' | 'limit'; spans: []; pixelCount: 0 };

const DEFAULT_COLOR_TOLERANCE = 32;

function colorChannels(color: DrawingColor) {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ] as const;
}

function pixelMatches(
  pixels: Uint8ClampedArray,
  pixelIndex: number,
  target: readonly [number, number, number, number],
  tolerance: number,
) {
  const offset = pixelIndex * 4;
  return (
    Math.abs(pixels[offset] - target[0]) <= tolerance &&
    Math.abs(pixels[offset + 1] - target[1]) <= tolerance &&
    Math.abs(pixels[offset + 2] - target[2]) <= tolerance &&
    Math.abs(pixels[offset + 3] - target[3]) <= tolerance
  );
}

/**
 * 在一张已经扁平渲染的画纸上做四向扫描线填充，并把区域压缩为
 * [y, xStart, xEndExclusive]。区域一旦接触画纸边缘就判定为未闭合，绝不填满背景。
 */
export function buildDrawingFillSpans(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: { x: number; y: number },
  color: DrawingColor,
  options: { tolerance?: number; maxSpans?: number } = {},
): DrawingFillResult {
  const seedX = Math.floor(point.x);
  const seedY = Math.floor(point.y);
  if (
    width < 1 ||
    height < 1 ||
    pixels.length !== width * height * 4 ||
    seedX < 0 ||
    seedX >= width ||
    seedY < 0 ||
    seedY >= height
  ) {
    return { status: 'empty', spans: [], pixelCount: 0 };
  }

  const tolerance = Math.max(0, Math.min(64, Math.round(options.tolerance ?? DEFAULT_COLOR_TOLERANCE)));
  const maxSpans = Math.max(1, Math.floor(options.maxSpans ?? Number.POSITIVE_INFINITY));
  const seedIndex = seedY * width + seedX;
  const seedOffset = seedIndex * 4;
  const target = [pixels[seedOffset], pixels[seedOffset + 1], pixels[seedOffset + 2], pixels[seedOffset + 3]] as const;
  const nextColor = colorChannels(color);
  if (
    target[3] > 0 &&
    Math.abs(target[0] - nextColor[0]) <= tolerance &&
    Math.abs(target[1] - nextColor[1]) <= tolerance &&
    Math.abs(target[2] - nextColor[2]) <= tolerance
  ) {
    return { status: 'same-color', spans: [], pixelCount: 0 };
  }

  const visited = new Uint8Array(width * height);
  const stack = [seedX, seedY];
  const spans: number[] = [];
  let pixelCount = 0;

  while (stack.length) {
    const y = stack.pop() as number;
    const candidateX = stack.pop() as number;
    const candidateIndex = y * width + candidateX;
    if (visited[candidateIndex] || !pixelMatches(pixels, candidateIndex, target, tolerance)) continue;

    let start = candidateX;
    while (start > 0) {
      const index = y * width + start - 1;
      if (visited[index] || !pixelMatches(pixels, index, target, tolerance)) break;
      start -= 1;
    }
    let end = candidateX + 1;
    while (end < width) {
      const index = y * width + end;
      if (visited[index] || !pixelMatches(pixels, index, target, tolerance)) break;
      end += 1;
    }

    // 命中画纸边缘说明该区域与背景连通。尽早停止，避免一次误点扫描整张画纸。
    if (start === 0 || end === width || y === 0 || y === height - 1) {
      return { status: 'open', spans: [], pixelCount: 0 };
    }

    for (let x = start; x < end; x += 1) visited[y * width + x] = 1;
    spans.push(y, start, end);
    pixelCount += end - start;
    if (spans.length / 3 > maxSpans) return { status: 'limit', spans: [], pixelCount: 0 };

    for (const adjacentY of [y - 1, y + 1]) {
      let x = start;
      while (x < end) {
        const index = adjacentY * width + x;
        if (!visited[index] && pixelMatches(pixels, index, target, tolerance)) {
          stack.push(x, adjacentY);
          while (x < end) {
            const runIndex = adjacentY * width + x;
            if (visited[runIndex] || !pixelMatches(pixels, runIndex, target, tolerance)) break;
            x += 1;
          }
        } else {
          x += 1;
        }
      }
    }
  }

  if (!spans.length) return { status: 'empty', spans: [], pixelCount: 0 };
  const rows = Array.from({ length: spans.length / 3 }, (_, index) => spans.slice(index * 3, index * 3 + 3));
  rows.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  return { status: 'filled', spans: rows.flat(), pixelCount };
}

export function drawingFillBounds(element: DrawingFillElement) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < element.spans.length; index += 3) {
    minY = Math.min(minY, element.spans[index]);
    minX = Math.min(minX, element.spans[index + 1]);
    maxX = Math.max(maxX, element.spans[index + 2]);
    maxY = Math.max(maxY, element.spans[index] + 1);
  }
  return {
    x: element.x + minX,
    y: element.y + minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function drawingFillContainsPoint(element: DrawingFillElement, point: { x: number; y: number }) {
  const x = Math.floor(point.x - element.x);
  const y = Math.floor(point.y - element.y);
  for (let index = 0; index < element.spans.length; index += 3) {
    const row = element.spans[index];
    if (row > y) return false;
    if (row === y && x >= element.spans[index + 1] && x < element.spans[index + 2]) return true;
  }
  return false;
}

export function drawingFillTouchesCircle(
  element: DrawingFillElement,
  center: { x: number; y: number },
  radius: number,
) {
  const localX = center.x - element.x;
  const localY = center.y - element.y;
  const firstRow = Math.floor(localY - radius);
  const lastRow = Math.ceil(localY + radius);
  for (let index = 0; index < element.spans.length; index += 3) {
    const row = element.spans[index];
    if (row < firstRow) continue;
    if (row > lastRow) return false;
    const verticalDistance = Math.max(0, Math.abs(localY - (row + 0.5)) - 0.5);
    if (verticalDistance > radius) continue;
    const horizontalRadius = Math.sqrt(Math.max(0, radius * radius - verticalDistance * verticalDistance));
    if (localX + horizontalRadius >= element.spans[index + 1] && localX - horizontalRadius < element.spans[index + 2]) {
      return true;
    }
  }
  return false;
}

export function paintDrawingFill(context: CanvasRenderingContext2D, element: DrawingFillElement, scale: number) {
  const bounds = drawingFillBounds(element);
  paintDrawingWithErasures(context, bounds, scale, element.erasures, (target) => {
    target.fillStyle = element.color;
    target.beginPath();
    for (let index = 0; index < element.spans.length; index += 3) {
      target.rect(
        element.x + element.spans[index + 1],
        element.y + element.spans[index],
        element.spans[index + 2] - element.spans[index + 1],
        1,
      );
    }
    // 相邻逻辑行必须在同一个路径内一次栅格化。逐行 fillRect 在 30%～99% 缩放时
    // 会让每条矩形边缘分别抗锯齿，最终在本应连续的填色中形成可见横纹。
    target.fill();
  });
}
