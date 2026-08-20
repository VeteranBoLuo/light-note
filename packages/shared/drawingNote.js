export const DRAWING_NOTE_TYPE = "drawing";
export const DRAWING_SCENE_VERSION = 3;
export const DRAWING_LEGACY_SCENE_VERSION = 1;
export const DRAWING_SHAPE_SCENE_VERSION = 2;
export const DRAWING_SCENE_MAX_BYTES = 750_000;
export const DRAWING_SCENE_LIMITS = Object.freeze({
  maxElements: 1_000,
  maxStrokes: 800,
  maxPointPairs: 50_000,
  maxErasureTrails: 2_000,
  maxErasurePointPairs: 50_000,
  maxTexts: 200,
  maxShapes: 300,
  maxTextCharacters: 50_000,
  maxTextElementCharacters: 4_000,
});
export const DRAWING_PAGE = Object.freeze({ width: 1448, height: 1448 });
export const DRAWING_LEGACY_PAGE = Object.freeze({ width: 1024, height: 1448 });
export const DRAWING_COLORS = Object.freeze([
  "#1f2937",
  "#6b7280",
  "#ffffff",
  "#615ced",
  "#00a884",
  "#2563eb",
  "#dc2626",
  "#ea580c",
]);
export const DRAWING_SHAPE_TYPES = Object.freeze([
  "line",
  "arrow",
  "rectangle",
  "rounded-rectangle",
  "ellipse",
  "triangle",
  "diamond",
]);
export const DRAWING_STROKE_WIDTH_RANGE = Object.freeze({ min: 1, max: 24 });
export const DRAWING_FONT_SIZE_RANGE = Object.freeze({ min: 12, max: 72 });
export const DRAWING_STROKE_WIDTHS = Object.freeze([2, 4, 7, 12, 20]);
export const DRAWING_FONT_SIZES = Object.freeze([20, 28, 36]);

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const SHAPE_TYPES = new Set(DRAWING_SHAPE_TYPES);
const MIN_COORDINATE = -4096;
// V1 最右侧合法坐标升级时会整体右移 212，当前协议上限需覆盖该值，避免旧数据在升级时被截断或拒绝。
const MAX_COORDINATE = 8404;
const ERASER_WIDTH_RANGE = Object.freeze({ min: 4, max: 64 });

export class DrawingSceneValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DrawingSceneValidationError";
    this.code = code;
    this.status = 400;
  }
}

function invalid(code, message) {
  throw new DrawingSceneValidationError(code, message);
}

function byteLength(value) {
  if (typeof TextEncoder !== "undefined")
    return new TextEncoder().encode(value).byteLength;
  return unescape(encodeURIComponent(value)).length;
}

function finiteCoordinate(value, field) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < MIN_COORDINATE ||
    number > MAX_COORDINATE
  ) {
    invalid("DRAWING_INVALID_COORDINATE", `${field} 坐标无效`);
  }
  return Math.round(number * 100) / 100;
}

function boundedInteger(value, range, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < range.min || number > range.max) {
    invalid("DRAWING_INVALID_STYLE", `${field} 不受支持`);
  }
  return number;
}

function normalizeElementId(value) {
  const id = String(value || "");
  if (!ID_PATTERN.test(id))
    invalid("DRAWING_INVALID_ELEMENT_ID", "手绘元素 ID 无效");
  return id;
}

function normalizeColor(value) {
  const color = String(value || "");
  if (!COLOR_PATTERN.test(color))
    invalid("DRAWING_INVALID_STYLE", "手绘颜色不受支持");
  return color.toLowerCase();
}

function normalizeErasureTrail(trail) {
  if (
    !trail ||
    typeof trail !== "object" ||
    Array.isArray(trail) ||
    !Array.isArray(trail.points) ||
    trail.points.length < 2 ||
    trail.points.length % 2 !== 0
  ) {
    invalid("DRAWING_INVALID_ERASURE", "橡皮擦轨迹坐标无效");
  }
  return {
    id: normalizeElementId(trail.id),
    width: boundedInteger(trail.width, ERASER_WIDTH_RANGE, "橡皮擦宽度"),
    points: trail.points.map((point, index) =>
      finiteCoordinate(point, `erasures.points[${index}]`),
    ),
  };
}

function normalizeElementErasures(element, allowErasures) {
  if (!allowErasures || element.erasures === undefined) return undefined;
  if (!Array.isArray(element.erasures)) {
    invalid("DRAWING_INVALID_ERASURE", "橡皮擦轨迹无效");
  }
  const erasures = element.erasures.map(normalizeErasureTrail);
  const ids = new Set();
  erasures.forEach((trail) => {
    if (ids.has(trail.id))
      invalid("DRAWING_DUPLICATE_ERASURE_ID", "橡皮擦轨迹 ID 重复");
    ids.add(trail.id);
  });
  return erasures.length ? erasures : undefined;
}

function normalizeStroke(element, allowErasures) {
  if (
    !Array.isArray(element.points) ||
    element.points.length < 2 ||
    element.points.length % 2 !== 0
  ) {
    invalid("DRAWING_INVALID_POINTS", "画笔轨迹坐标无效");
  }
  const stroke = {
    id: normalizeElementId(element.id),
    kind: "stroke",
    color: normalizeColor(element.color),
    width: boundedInteger(
      element.width,
      DRAWING_STROKE_WIDTH_RANGE,
      "画笔宽度",
    ),
    points: element.points.map((point, index) =>
      finiteCoordinate(point, `points[${index}]`),
    ),
  };
  const erasures = normalizeElementErasures(element, allowErasures);
  if (erasures) stroke.erasures = erasures;
  return stroke;
}

function normalizeText(element) {
  const text = String(element.text ?? "");
  if (!text || text.length > DRAWING_SCENE_LIMITS.maxTextElementCharacters) {
    invalid("DRAWING_INVALID_TEXT", "文本内容为空或过长");
  }
  return {
    id: normalizeElementId(element.id),
    kind: "text",
    x: finiteCoordinate(element.x, "x"),
    y: finiteCoordinate(element.y, "y"),
    width: Math.max(40, finiteCoordinate(element.width, "width")),
    fontSize: boundedInteger(
      element.fontSize,
      DRAWING_FONT_SIZE_RANGE,
      "文字大小",
    ),
    color: normalizeColor(element.color),
    text,
  };
}

function normalizeShape(element, allowErasures) {
  const shape = String(element.shape || "");
  if (!SHAPE_TYPES.has(shape))
    invalid("DRAWING_INVALID_SHAPE", "手绘形状不受支持");
  const width = finiteCoordinate(element.width, "width");
  const height = finiteCoordinate(element.height, "height");
  const isLinear = shape === "line" || shape === "arrow";
  if (
    (isLinear && Math.hypot(width, height) < 1) ||
    (!isLinear && (Math.abs(width) < 1 || Math.abs(height) < 1))
  ) {
    invalid("DRAWING_INVALID_SHAPE", "手绘形状尺寸无效");
  }
  const normalized = {
    id: normalizeElementId(element.id),
    kind: "shape",
    shape,
    x: finiteCoordinate(element.x, "x"),
    y: finiteCoordinate(element.y, "y"),
    width,
    height,
    color: normalizeColor(element.color),
    strokeWidth: boundedInteger(
      element.strokeWidth,
      DRAWING_STROKE_WIDTH_RANGE,
      "形状线宽",
    ),
  };
  const erasures = normalizeElementErasures(element, allowErasures);
  if (erasures) normalized.erasures = erasures;
  return normalized;
}

export function createEmptyDrawingScene() {
  return {
    v: DRAWING_SCENE_VERSION,
    page: { ...DRAWING_PAGE },
    elements: [],
  };
}

export function normalizeDrawingScene(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    invalid("DRAWING_INVALID_SCENE", "手绘正文必须是对象");
  }
  const version = Number(input.v);
  if (
    version !== DRAWING_SCENE_VERSION &&
    version !== DRAWING_SHAPE_SCENE_VERSION &&
    version !== DRAWING_LEGACY_SCENE_VERSION
  ) {
    invalid("DRAWING_UNSUPPORTED_VERSION", "手绘正文版本不受支持");
  }
  const expectedPage =
    version === DRAWING_LEGACY_SCENE_VERSION
      ? DRAWING_LEGACY_PAGE
      : DRAWING_PAGE;
  if (
    !input.page ||
    Number(input.page.width) !== expectedPage.width ||
    Number(input.page.height) !== expectedPage.height
  ) {
    invalid("DRAWING_INVALID_PAGE", "手绘页面尺寸无效");
  }
  if (
    !Array.isArray(input.elements) ||
    input.elements.length > DRAWING_SCENE_LIMITS.maxElements
  ) {
    invalid("DRAWING_TOO_MANY_ELEMENTS", "手绘元素数量超出限制");
  }

  const ids = new Set();
  let strokeCount = 0;
  let pointPairCount = 0;
  let erasureTrailCount = 0;
  let erasurePointPairCount = 0;
  let textCount = 0;
  let shapeCount = 0;
  let textCharacterCount = 0;
  const elements = input.elements.map((element) => {
    if (!element || typeof element !== "object" || Array.isArray(element)) {
      invalid("DRAWING_INVALID_ELEMENT", "手绘元素无效");
    }
    let normalized;
    if (element.kind === "stroke") {
      normalized = normalizeStroke(element, version === DRAWING_SCENE_VERSION);
      strokeCount += 1;
      pointPairCount += normalized.points.length / 2;
      erasureTrailCount += normalized.erasures?.length || 0;
      erasurePointPairCount +=
        normalized.erasures?.reduce(
          (count, trail) => count + trail.points.length / 2,
          0,
        ) || 0;
    } else if (element.kind === "text") {
      normalized = normalizeText(element);
      textCount += 1;
      textCharacterCount += normalized.text.length;
    } else if (
      element.kind === "shape" &&
      version !== DRAWING_LEGACY_SCENE_VERSION
    ) {
      normalized = normalizeShape(element, version === DRAWING_SCENE_VERSION);
      shapeCount += 1;
      erasureTrailCount += normalized.erasures?.length || 0;
      erasurePointPairCount +=
        normalized.erasures?.reduce(
          (count, trail) => count + trail.points.length / 2,
          0,
        ) || 0;
    } else {
      invalid("DRAWING_UNSUPPORTED_ELEMENT", "手绘元素类型不受支持");
    }
    if (ids.has(normalized.id))
      invalid("DRAWING_DUPLICATE_ELEMENT_ID", "手绘元素 ID 重复");
    ids.add(normalized.id);
    return normalized;
  });

  if (strokeCount > DRAWING_SCENE_LIMITS.maxStrokes) {
    invalid("DRAWING_TOO_MANY_STROKES", "画笔轨迹数量超出限制");
  }
  if (pointPairCount > DRAWING_SCENE_LIMITS.maxPointPairs) {
    invalid("DRAWING_TOO_MANY_POINTS", "画笔轨迹点数量超出限制");
  }
  if (
    erasureTrailCount > DRAWING_SCENE_LIMITS.maxErasureTrails ||
    erasurePointPairCount > DRAWING_SCENE_LIMITS.maxErasurePointPairs
  ) {
    invalid("DRAWING_TOO_MANY_ERASURES", "橡皮擦轨迹数量超出限制");
  }
  if (
    textCount > DRAWING_SCENE_LIMITS.maxTexts ||
    textCharacterCount > DRAWING_SCENE_LIMITS.maxTextCharacters
  ) {
    invalid("DRAWING_TOO_MUCH_TEXT", "手绘文本数量或长度超出限制");
  }
  if (shapeCount > DRAWING_SCENE_LIMITS.maxShapes) {
    invalid("DRAWING_TOO_MANY_SHAPES", "手绘形状数量超出限制");
  }

  const scene = {
    v: version,
    page: { ...expectedPage },
    elements,
  };
  const serialized = JSON.stringify(scene);
  if (byteLength(serialized) > DRAWING_SCENE_MAX_BYTES) {
    invalid("DRAWING_SCENE_TOO_LARGE", "手绘正文大小超出限制");
  }
  return scene;
}

export function parseDrawingScene(value) {
  if (typeof value !== "string") return normalizeDrawingScene(value);
  if (byteLength(value) > DRAWING_SCENE_MAX_BYTES)
    invalid("DRAWING_SCENE_TOO_LARGE", "手绘正文大小超出限制");
  let input;
  try {
    input = JSON.parse(value);
  } catch {
    invalid("DRAWING_INVALID_JSON", "手绘正文不是有效 JSON");
  }
  return normalizeDrawingScene(input);
}

export function serializeDrawingScene(value) {
  return JSON.stringify(parseDrawingScene(value));
}

export function upgradeDrawingScene(value) {
  const scene = parseDrawingScene(value);
  if (scene.v === DRAWING_SCENE_VERSION) return scene;
  const offsetX =
    scene.v === DRAWING_LEGACY_SCENE_VERSION
      ? (DRAWING_PAGE.width - DRAWING_LEGACY_PAGE.width) / 2
      : 0;
  return normalizeDrawingScene({
    v: DRAWING_SCENE_VERSION,
    page: DRAWING_PAGE,
    elements: scene.elements.map((element) =>
      element.kind === "stroke"
        ? {
            ...element,
            points: element.points.map((coordinate, index) =>
              index % 2 === 0 ? coordinate + offsetX : coordinate,
            ),
          }
        : { ...element, x: element.x + offsetX },
    ),
  });
}

export function serializeCurrentDrawingScene(value) {
  return JSON.stringify(upgradeDrawingScene(value));
}
