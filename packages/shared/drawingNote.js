export const DRAWING_NOTE_TYPE = 'drawing';
export const DRAWING_SCENE_VERSION = 2;
export const DRAWING_LEGACY_SCENE_VERSION = 1;
export const DRAWING_SCENE_MAX_BYTES = 750_000;
export const DRAWING_SCENE_LIMITS = Object.freeze({
  maxElements: 1_000,
  maxStrokes: 800,
  maxPointPairs: 50_000,
  maxTexts: 200,
  maxTextCharacters: 50_000,
  maxTextElementCharacters: 4_000,
});
export const DRAWING_PAGE = Object.freeze({ width: 1448, height: 1448 });
export const DRAWING_LEGACY_PAGE = Object.freeze({ width: 1024, height: 1448 });
export const DRAWING_COLORS = Object.freeze(['#1f2937', '#00a884', '#615ced', '#ec4899']);
export const DRAWING_STROKE_WIDTH_RANGE = Object.freeze({ min: 1, max: 24 });
export const DRAWING_FONT_SIZE_RANGE = Object.freeze({ min: 12, max: 72 });
export const DRAWING_STROKE_WIDTHS = Object.freeze([2, 4, 7]);
export const DRAWING_FONT_SIZES = Object.freeze([20, 28, 36]);

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const MIN_COORDINATE = -4096;
// V1 最右侧合法坐标升级时会整体右移 212，V2 上限需覆盖该值，避免旧数据在升级时被截断或拒绝。
const MAX_COORDINATE = 8404;

export class DrawingSceneValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DrawingSceneValidationError';
    this.code = code;
    this.status = 400;
  }
}

function invalid(code, message) {
  throw new DrawingSceneValidationError(code, message);
}

function byteLength(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength;
  return unescape(encodeURIComponent(value)).length;
}

function finiteCoordinate(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < MIN_COORDINATE || number > MAX_COORDINATE) {
    invalid('DRAWING_INVALID_COORDINATE', `${field} 坐标无效`);
  }
  return Math.round(number * 100) / 100;
}

function boundedInteger(value, range, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < range.min || number > range.max) {
    invalid('DRAWING_INVALID_STYLE', `${field} 不受支持`);
  }
  return number;
}

function normalizeElementId(value) {
  const id = String(value || '');
  if (!ID_PATTERN.test(id)) invalid('DRAWING_INVALID_ELEMENT_ID', '手绘元素 ID 无效');
  return id;
}

function normalizeColor(value) {
  const color = String(value || '');
  if (!COLOR_PATTERN.test(color)) invalid('DRAWING_INVALID_STYLE', '手绘颜色不受支持');
  return color.toLowerCase();
}

function normalizeStroke(element) {
  if (!Array.isArray(element.points) || element.points.length < 2 || element.points.length % 2 !== 0) {
    invalid('DRAWING_INVALID_POINTS', '画笔轨迹坐标无效');
  }
  return {
    id: normalizeElementId(element.id),
    kind: 'stroke',
    color: normalizeColor(element.color),
    width: boundedInteger(element.width, DRAWING_STROKE_WIDTH_RANGE, '画笔宽度'),
    points: element.points.map((point, index) => finiteCoordinate(point, `points[${index}]`)),
  };
}

function normalizeText(element) {
  const text = String(element.text ?? '');
  if (!text || text.length > DRAWING_SCENE_LIMITS.maxTextElementCharacters) {
    invalid('DRAWING_INVALID_TEXT', '文本内容为空或过长');
  }
  return {
    id: normalizeElementId(element.id),
    kind: 'text',
    x: finiteCoordinate(element.x, 'x'),
    y: finiteCoordinate(element.y, 'y'),
    width: Math.max(40, finiteCoordinate(element.width, 'width')),
    fontSize: boundedInteger(element.fontSize, DRAWING_FONT_SIZE_RANGE, '文字大小'),
    color: normalizeColor(element.color),
    text,
  };
}

export function createEmptyDrawingScene() {
  return {
    v: DRAWING_SCENE_VERSION,
    page: { ...DRAWING_PAGE },
    elements: [],
  };
}

export function normalizeDrawingScene(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('DRAWING_INVALID_SCENE', '手绘正文必须是对象');
  }
  const version = Number(input.v);
  if (version !== DRAWING_SCENE_VERSION && version !== DRAWING_LEGACY_SCENE_VERSION) {
    invalid('DRAWING_UNSUPPORTED_VERSION', '手绘正文版本不受支持');
  }
  const expectedPage = version === DRAWING_LEGACY_SCENE_VERSION ? DRAWING_LEGACY_PAGE : DRAWING_PAGE;
  if (
    !input.page ||
    Number(input.page.width) !== expectedPage.width ||
    Number(input.page.height) !== expectedPage.height
  ) {
    invalid('DRAWING_INVALID_PAGE', '手绘页面尺寸无效');
  }
  if (!Array.isArray(input.elements) || input.elements.length > DRAWING_SCENE_LIMITS.maxElements) {
    invalid('DRAWING_TOO_MANY_ELEMENTS', '手绘元素数量超出限制');
  }

  const ids = new Set();
  let strokeCount = 0;
  let pointPairCount = 0;
  let textCount = 0;
  let textCharacterCount = 0;
  const elements = input.elements.map((element) => {
    if (!element || typeof element !== 'object' || Array.isArray(element)) {
      invalid('DRAWING_INVALID_ELEMENT', '手绘元素无效');
    }
    let normalized;
    if (element.kind === 'stroke') {
      normalized = normalizeStroke(element);
      strokeCount += 1;
      pointPairCount += normalized.points.length / 2;
    } else if (element.kind === 'text') {
      normalized = normalizeText(element);
      textCount += 1;
      textCharacterCount += normalized.text.length;
    } else {
      invalid('DRAWING_UNSUPPORTED_ELEMENT', '手绘元素类型不受支持');
    }
    if (ids.has(normalized.id)) invalid('DRAWING_DUPLICATE_ELEMENT_ID', '手绘元素 ID 重复');
    ids.add(normalized.id);
    return normalized;
  });

  if (strokeCount > DRAWING_SCENE_LIMITS.maxStrokes) {
    invalid('DRAWING_TOO_MANY_STROKES', '画笔轨迹数量超出限制');
  }
  if (pointPairCount > DRAWING_SCENE_LIMITS.maxPointPairs) {
    invalid('DRAWING_TOO_MANY_POINTS', '画笔轨迹点数量超出限制');
  }
  if (textCount > DRAWING_SCENE_LIMITS.maxTexts || textCharacterCount > DRAWING_SCENE_LIMITS.maxTextCharacters) {
    invalid('DRAWING_TOO_MUCH_TEXT', '手绘文本数量或长度超出限制');
  }

  const scene = {
    v: version,
    page: { ...expectedPage },
    elements,
  };
  const serialized = JSON.stringify(scene);
  if (byteLength(serialized) > DRAWING_SCENE_MAX_BYTES) {
    invalid('DRAWING_SCENE_TOO_LARGE', '手绘正文大小超出限制');
  }
  return scene;
}

export function parseDrawingScene(value) {
  if (typeof value !== 'string') return normalizeDrawingScene(value);
  if (byteLength(value) > DRAWING_SCENE_MAX_BYTES) invalid('DRAWING_SCENE_TOO_LARGE', '手绘正文大小超出限制');
  let input;
  try {
    input = JSON.parse(value);
  } catch {
    invalid('DRAWING_INVALID_JSON', '手绘正文不是有效 JSON');
  }
  return normalizeDrawingScene(input);
}

export function serializeDrawingScene(value) {
  return JSON.stringify(parseDrawingScene(value));
}

export function upgradeDrawingScene(value) {
  const scene = parseDrawingScene(value);
  if (scene.v === DRAWING_SCENE_VERSION) return scene;
  const offsetX = (DRAWING_PAGE.width - DRAWING_LEGACY_PAGE.width) / 2;
  return normalizeDrawingScene({
    v: DRAWING_SCENE_VERSION,
    page: DRAWING_PAGE,
    elements: scene.elements.map((element) =>
      element.kind === 'stroke'
        ? {
            ...element,
            points: element.points.map((coordinate, index) => (index % 2 === 0 ? coordinate + offsetX : coordinate)),
          }
        : { ...element, x: element.x + offsetX },
    ),
  });
}

export function serializeCurrentDrawingScene(value) {
  return JSON.stringify(upgradeDrawingScene(value));
}
