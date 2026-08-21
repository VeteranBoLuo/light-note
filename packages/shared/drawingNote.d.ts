/** 经过协议校验的六位十六进制颜色（例如 #1f2937）。 */
export type DrawingColor = string;
/** 协议允许范围内的整数画笔宽度。 */
export type DrawingStrokeWidth = number;
/** 协议允许范围内的整数文字字号。 */
export type DrawingFontSize = number;

export interface DrawingStrokeElement {
  id: string;
  kind: "stroke";
  color: DrawingColor;
  width: DrawingStrokeWidth;
  points: number[];
  /** 只作用于当前笔画的持久化像素擦除采样。 */
  erasures?: DrawingErasureTrail[];
}

export interface DrawingErasureTrail {
  id: string;
  width: number;
  points: number[];
}

export interface DrawingTextElement {
  id: string;
  kind: "text";
  x: number;
  y: number;
  width: number;
  fontSize: DrawingFontSize;
  color: DrawingColor;
  text: string;
}

export type DrawingShapeType =
  | "line"
  | "arrow"
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "triangle"
  | "diamond";

export interface DrawingShapeElement {
  id: string;
  kind: "shape";
  shape: DrawingShapeType;
  x: number;
  y: number;
  /** 有符号宽度；线条和箭头用符号保留拖动方向。 */
  width: number;
  /** 有符号高度；线条和箭头用符号保留拖动方向。 */
  height: number;
  color: DrawingColor;
  strokeWidth: DrawingStrokeWidth;
  /** 只作用于当前形状轮廓的持久化像素擦除采样。 */
  erasures?: DrawingErasureTrail[];
}

export interface DrawingFillElement {
  id: string;
  kind: "fill";
  color: DrawingColor;
  /** 区域整体平移量；扫描段仍保留首次填充时的画纸像素坐标。 */
  x: number;
  y: number;
  /** 扁平化的 [y, xStart, xEndExclusive] 扫描段，按 y/x 严格升序。 */
  spans: number[];
  /** 只作用于当前填充区域的持久化像素擦除采样。 */
  erasures?: DrawingErasureTrail[];
}

export type DrawingLegacyElement = DrawingStrokeElement | DrawingTextElement;
export type DrawingElement =
  DrawingLegacyElement | DrawingShapeElement | DrawingFillElement;

export interface DrawingLegacyScene {
  v: 1;
  page: { width: 1024; height: 1448 };
  elements: DrawingLegacyElement[];
}

export interface DrawingCurrentScene {
  v: 4;
  page: { width: 1448; height: 1448 };
  elements: DrawingElement[];
}

export interface DrawingShapeScene {
  v: 2;
  page: { width: 1448; height: 1448 };
  elements: Exclude<DrawingElement, DrawingFillElement>[];
}

export interface DrawingEraserScene {
  v: 3;
  page: { width: 1448; height: 1448 };
  elements: Exclude<DrawingElement, DrawingFillElement>[];
}

export type DrawingScene =
  | DrawingLegacyScene
  | DrawingShapeScene
  | DrawingEraserScene
  | DrawingCurrentScene;

export declare const DRAWING_NOTE_TYPE: "drawing";
export declare const DRAWING_SCENE_VERSION: 4;
/** 派生缩略图渲染算法版本；变化时使旧位图缓存自动失效。 */
export declare const DRAWING_THUMBNAIL_RENDERER_VERSION: 2;
export declare const DRAWING_LEGACY_SCENE_VERSION: 1;
export declare const DRAWING_SHAPE_SCENE_VERSION: 2;
export declare const DRAWING_ERASER_SCENE_VERSION: 3;
export declare const DRAWING_SCENE_MAX_BYTES: 750000;
export declare const DRAWING_SCENE_LIMITS: Readonly<{
  maxElements: 1000;
  maxStrokes: 800;
  maxPointPairs: 50000;
  maxErasureTrails: 2000;
  maxErasurePointPairs: 50000;
  maxTexts: 200;
  maxShapes: 300;
  maxFills: 100;
  maxFillSpans: 20000;
  maxTextCharacters: 50000;
  maxTextElementCharacters: 4000;
}>;
export declare const DRAWING_PAGE: Readonly<{ width: 1448; height: 1448 }>;
export declare const DRAWING_LEGACY_PAGE: Readonly<{
  width: 1024;
  height: 1448;
}>;
export declare const DRAWING_COLORS: readonly DrawingColor[];
export declare const DRAWING_SHAPE_TYPES: readonly DrawingShapeType[];
export declare const DRAWING_STROKE_WIDTH_RANGE: Readonly<{ min: 1; max: 24 }>;
export declare const DRAWING_FONT_SIZE_RANGE: Readonly<{ min: 12; max: 72 }>;
/** 常用画笔宽度快捷值；不是协议允许值全集。 */
export declare const DRAWING_STROKE_WIDTHS: readonly DrawingStrokeWidth[];
/** 常用文字字号快捷值；不是协议允许值全集。 */
export declare const DRAWING_FONT_SIZES: readonly DrawingFontSize[];

export declare class DrawingSceneValidationError extends Error {
  code: string;
  status: 400;
}

export declare function createEmptyDrawingScene(): DrawingCurrentScene;
export declare function normalizeDrawingScene(input: unknown): DrawingScene;
export declare function parseDrawingScene(input: unknown): DrawingScene;
export declare function serializeDrawingScene(input: unknown): string;
/** 将 V1 竖版场景在水平方向居中平移为当前方形场景，不缩放或裁剪元素。 */
export declare function upgradeDrawingScene(
  input: unknown,
): DrawingCurrentScene;
export declare function serializeCurrentDrawingScene(input: unknown): string;
