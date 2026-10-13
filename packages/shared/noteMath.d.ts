export type NoteMathMode = "inline" | "block";
export const NOTE_MATH_MAX_LENGTH: number;
export const NOTE_MATH_SELECTOR: string;
export const NOTE_MATH_STYLES: string;
export function escapeMathHtml(value: unknown): string;
export function readNoteMath(
  mode: unknown,
  source: unknown,
): { mode: NoteMathMode; source: string } | null;
export function noteMathHtml(source: string, mode?: NoteMathMode): string;
export function noteMathMarkdown(source: string, mode?: NoteMathMode): string;
export function noteMathMarkedExtension(): import("marked").MarkedExtension;
export function bundleNoteMathCss(
  css: string,
  readFont: (name: string) => Promise<string>,
): Promise<string>;
export const noteMathTurndownRule: {
  filter(node: HTMLElement): boolean;
  replacement(content: string, node: HTMLElement): string;
};
