import {
  codeLanguageLabel,
  normalizeCodeLanguage,
  supportsCodeHighlight,
  MAX_CODE_HIGHLIGHT_LENGTH,
  MAX_NOTE_HIGHLIGHT_LENGTH,
} from '@/config/codeLanguages';
import '@/assets/css/note-code-highlight.less';

/** 只装饰已净化的展示 DOM，不能用于编辑器正文、摘要或持久化。 */
export async function highlightNoteCodeBlocks(root: HTMLElement, isCurrent: () => boolean = () => true): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>('pre');
  if (!blocks.length) return;
  let engine: typeof import('./noteCodeHighlightRuntime') | undefined;
  let remaining = MAX_NOTE_HIGHLIGHT_LENGTH;
  let sliceStart = performance.now();
  for (const pre of blocks) {
    if (!isCurrent()) return;
    const code = pre.querySelector<HTMLElement>('code') || pre;
    const languageClass = [...code.classList, ...pre.classList].find((name) => name.startsWith('language-'));
    const language = normalizeCodeLanguage(languageClass?.slice(9) || pre.dataset.language || '');
    if (language === 'mermaid') continue;
    pre.dataset.lnCodeLanguage = codeLanguageLabel(language);
    const text = code.textContent || '';
    if (!supportsCodeHighlight(language) || !text || text.length > MAX_CODE_HIGHLIGHT_LENGTH || text.length > remaining)
      continue;
    remaining -= text.length;
    engine ||= await import('./noteCodeHighlightRuntime');
    if (!isCurrent() || !root.contains(pre)) return;
    if (performance.now() - sliceStart >= 6) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!isCurrent() || !root.contains(pre)) return;
      sliceStart = performance.now();
    }
    // 富文本的语言通常在 pre 上；包一层 code，保留 pre 的原有样式与属性。
    const target = code === pre ? document.createElement('code') : code;
    target.innerHTML = engine.highlightCode(text, language);
    target.classList.add('hljs');
    if (code === pre) pre.replaceChildren(target);
    pre.classList.add('ln-code-highlight');
  }
}
