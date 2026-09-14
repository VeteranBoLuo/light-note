import { createVNode, render, type AppContext } from 'vue';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { isolateHistory } from '@codemirror/commands';
import { Transaction, type Range } from '@codemirror/state';
import MarkdownCodeLanguagePicker from '@/components/noteLibrary/detail/MarkdownCodeLanguagePicker.vue';
import { CODE_LANGUAGES } from '@/config/codeLanguages';
import { currentMarkdownCodeLanguage } from './markdownCodeLanguage';

/** 控件附着在可见围栏行上；不跟随光标增删编辑器布局，也不扫描全文。 */
export function markdownCodeLanguageControls(appContext: AppContext) {
  class LanguageWidget extends WidgetType {
    constructor(readonly language: string) {
      super();
    }
    eq(other: LanguageWidget) {
      return this.language === other.language;
    }
    toDOM(view: EditorView) {
      const dom = document.createElement('span');
      dom.className = 'cm-code-language-widget';
      dom.contentEditable = 'false';
      const vnode = createVNode(MarkdownCodeLanguagePicker, {
        language: this.language,
        onChange: (value: unknown) => {
          if (view.state.readOnly || typeof value !== 'string' || !CODE_LANGUAGES.some((item) => item.value === value))
            return;
          // 使用当前 DOM 对应的位置，前文插入、删除或撤销后不会指向另一个代码块。
          const current = currentMarkdownCodeLanguage(view.state, view.posAtDOM(dom));
          if (!current || current.language === value) return;
          const scrollTop = view.scrollDOM.scrollTop;
          const scrollLeft = view.scrollDOM.scrollLeft;
          view.dispatch({
            changes: { from: current.from, to: current.to, insert: value },
            annotations: [Transaction.userEvent.of('input.codeLanguage'), isolateHistory.of('full')],
          });
          view.contentDOM.focus({ preventScroll: true });
          view.scrollDOM.scrollTop = scrollTop;
          view.scrollDOM.scrollLeft = scrollLeft;
        },
      });
      vnode.appContext = appContext;
      render(vnode, dom);
      return dom;
    }
    destroy(dom: HTMLElement) {
      render(null, dom);
    }
    ignoreEvent() {
      return true;
    }
  }
  function decorations(view: EditorView): DecorationSet {
    if (view.state.readOnly) return Decoration.none;
    const ranges: Range<Decoration>[] = [];
    const seen = new Set<number>();
    for (const visible of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from: visible.from,
        to: visible.to,
        enter(node) {
          if (node.name !== 'FencedCode') return;
          const mark = node.node.getChild('CodeMark');
          if (mark && mark.from >= visible.from && mark.from <= visible.to && !seen.has(mark.from)) {
            seen.add(mark.from);
            const current = currentMarkdownCodeLanguage(view.state, mark.to);
            if (current) {
              ranges.push(
                Decoration.line({ class: 'cm-code-language-line' }).range(view.state.doc.lineAt(mark.from).from),
              );
              ranges.push(Decoration.widget({ widget: new LanguageWidget(current.language), side: 1 }).range(mark.to));
            }
          }
          return false;
        },
      });
    }
    return Decoration.set(ranges, true);
  }
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = decorations(view);
        }
        update(update: import('@codemirror/view').ViewUpdate) {
          if (
            update.docChanged ||
            update.viewportChanged ||
            update.startState.readOnly !== update.state.readOnly ||
            syntaxTree(update.startState) !== syntaxTree(update.state)
          ) {
            this.decorations = decorations(update.view);
          }
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    EditorView.theme({
      '.cm-line.cm-code-language-line': {
        position: 'relative',
        paddingRight: '134px',
        minHeight: '32px',
        lineHeight: '32px',
      },
      '.cm-code-language-widget': {
        position: 'absolute',
        right: '0',
        top: '0',
        width: '124px',
        height: '32px',
        userSelect: 'none',
        lineHeight: 'normal',
      },
    }),
  ];
}
