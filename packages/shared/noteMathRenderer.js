import katex from 'katex';
import { NOTE_MATH_MAX_LENGTH, escapeMathHtml } from './noteMath.js';

export function renderNoteMathSource(source, mode = 'inline') {
  try {
    if (!source.trim() || source.length > NOTE_MATH_MAX_LENGTH) throw new Error('invalid source');
    return {
      html: katex.renderToString(source, {
        displayMode: mode === 'block',
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        maxExpand: 500,
        maxSize: 20,
        output: 'htmlAndMathml',
      }),
      error: false,
    };
  } catch {
    // Renderer diagnostics may include user input. Only expose a stable error state.
    return { html: escapeMathHtml(source), error: true };
  }
}
