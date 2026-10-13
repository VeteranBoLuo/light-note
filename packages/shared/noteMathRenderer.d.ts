import type { NoteMathMode } from "./noteMath";
export function renderNoteMathSource(
  source: string,
  mode?: NoteMathMode,
): { html: string; error: boolean };
