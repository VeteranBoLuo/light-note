import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { normalizeCodeLanguage } from '@/config/codeLanguages';

export interface MarkdownCodeLanguage {
  from: number;
  to: number;
  language: string;
}
/** 使用编辑器已有增量语法树，避免每次移动光标重新扫描整篇正文。 */
export function currentMarkdownCodeLanguage(state: EditorState, position?: number): MarkdownCodeLanguage | null {
  const selection = state.selection.main;
  let node = syntaxTree(state).resolveInner(position ?? selection.from, 1);
  while (node.name !== 'FencedCode') {
    if (!node.parent) return null;
    node = node.parent;
  }
  if (position === undefined && selection.to > node.to) return null;
  const info = node.getChild('CodeInfo');
  const mark = node.getChild('CodeMark');
  if (!mark) return null;
  const raw = info ? state.sliceDoc(info.from, info.to) : '';
  const token = raw.match(/^\S*/u)?.[0] || '';
  return {
    from: info?.from ?? mark.to,
    to: info ? info.from + token.length : mark.to,
    language: normalizeCodeLanguage(token),
  };
}
