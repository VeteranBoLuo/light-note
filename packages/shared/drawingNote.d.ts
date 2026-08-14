export type DrawingColor = '#1f2937' | '#00a884' | '#615ced' | '#ec4899';
export type DrawingStrokeWidth = 2 | 4 | 7;
export type DrawingFontSize = 20 | 28 | 36;

export interface DrawingStrokeElement {
  id: string;
  kind: 'stroke';
  color: DrawingColor;
  width: DrawingStrokeWidth;
  points: number[];
}

export interface DrawingTextElement {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  width: number;
  fontSize: DrawingFontSize;
  color: DrawingColor;
  text: string;
}

export type DrawingElement = DrawingStrokeElement | DrawingTextElement;

export interface DrawingScene {
  v: 1;
  page: { width: 1024; height: 1448 };
  elements: DrawingElement[];
}

export declare const DRAWING_NOTE_TYPE: 'drawing';
export declare const DRAWING_SCENE_VERSION: 1;
export declare const DRAWING_SCENE_MAX_BYTES: 750000;
export declare const DRAWING_SCENE_LIMITS: Readonly<{
  maxElements: 1000;
  maxStrokes: 800;
  maxPointPairs: 50000;
  maxTexts: 200;
  maxTextCharacters: 50000;
  maxTextElementCharacters: 4000;
}>;
export declare const DRAWING_PAGE: Readonly<{ width: 1024; height: 1448 }>;
export declare const DRAWING_COLORS: readonly DrawingColor[];
export declare const DRAWING_STROKE_WIDTHS: readonly DrawingStrokeWidth[];
export declare const DRAWING_FONT_SIZES: readonly DrawingFontSize[];

export declare class DrawingSceneValidationError extends Error {
  code: string;
  status: 400;
}

export declare function createEmptyDrawingScene(): DrawingScene;
export declare function normalizeDrawingScene(input: unknown): DrawingScene;
export declare function parseDrawingScene(input: unknown): DrawingScene;
export declare function serializeDrawingScene(input: unknown): string;
