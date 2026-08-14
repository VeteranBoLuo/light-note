import { parseDrawingScene } from '@lightnote/shared/drawing-note';

export const DRAWING_PREVIEW_MAX_ELEMENTS = 120;
export const DRAWING_PREVIEW_MAX_POINT_PAIRS = 1_600;
export const DRAWING_PREVIEW_MAX_TEXT_CHARACTERS = 4_000;

const evenlySample = (items, limit) => {
  if (items.length <= limit) return items;
  if (limit <= 1) return [items[items.length - 1]];
  const sampled = [];
  for (let index = 0; index < limit; index += 1) {
    sampled.push(items[Math.round((index * (items.length - 1)) / (limit - 1))]);
  }
  return sampled;
};

const sampleStrokePoints = (points, maxPairs) => {
  const pairCount = points.length / 2;
  if (pairCount <= maxPairs) return points;
  const sampled = [];
  for (let index = 0; index < maxPairs; index += 1) {
    const pairIndex = Math.round((index * (pairCount - 1)) / Math.max(1, maxPairs - 1));
    sampled.push(points[pairIndex * 2], points[pairIndex * 2 + 1]);
  }
  return sampled;
};

// 卡片只需要辨认轮廓，不需要编辑级精度。先限制元素，再对每条轨迹等距抽样，
// 保留首尾点与原始绘制顺序；这样大场景也不会通过预览接口放大响应和浏览器解析成本。
export function buildDrawingScenePreview(content) {
  const scene = parseDrawingScene(content);
  const elements = evenlySample(scene.elements, DRAWING_PREVIEW_MAX_ELEMENTS);
  const strokeCount = elements.reduce((count, element) => count + Number(element.kind === 'stroke'), 0);
  const maxPairsPerStroke = strokeCount
    ? Math.max(2, Math.floor(DRAWING_PREVIEW_MAX_POINT_PAIRS / strokeCount))
    : DRAWING_PREVIEW_MAX_POINT_PAIRS;
  let remainingTextCharacters = DRAWING_PREVIEW_MAX_TEXT_CHARACTERS;

  return {
    v: scene.v,
    page: scene.page,
    elements: elements.flatMap((element) => {
      if (element.kind === 'stroke') {
        return [{ ...element, points: sampleStrokePoints(element.points, maxPairsPerStroke) }];
      }
      if (remainingTextCharacters <= 0) return [];
      const text = element.text.slice(0, Math.min(240, remainingTextCharacters));
      remainingTextCharacters -= text.length;
      return text ? [{ ...element, text }] : [];
    }),
  };
}
