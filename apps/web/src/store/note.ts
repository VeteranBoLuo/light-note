import { defineStore } from 'pinia';
import { nextTick } from 'vue';

// 接口定义
export interface Heading {
  element: HTMLElement | null;
  text: string;
  level: number;
  sourceOffset?: number;
}

interface NoteState {
  headings: Heading[];
  // 当前正在编辑的笔记标题:供全局 AI 抽屉的「@当前页面」显示真实笔记名(抽屉是全局组件,拿不到详情页的响应式 note)。
  currentTitle: string;
}

export default defineStore('note', {
  state: (): NoteState => ({
    headings: [],
    currentTitle: '',
  }),
  getters: {},
  actions: {
    /**
     * 生成目录（Table of Contents）
     */
    async generateTOC(content?: string, type?: string): Promise<void> {
      // Markdown 目录以真实预览 DOM 为准，再按顺序补充源码位置：
      // 这样目录点击、滚动高亮和实际渲染结果始终使用同一组标题。
      if (type === 'markdown') {
        await nextTick();
        const sourceHeadings = extractMdSourceHeadings(content || '');
        const preview = document.querySelector<HTMLElement>('#editor-container .md-preview');
        const renderedHeadings = preview
          ? Array.from(preview.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).filter(
              (heading) => (heading.textContent || '').trim() !== '',
            )
          : [];

        if (!renderedHeadings.length) {
          this.headings = sourceHeadings.map((heading) => ({ ...heading, element: null }));
          return;
        }

        this.headings = renderedHeadings.map((heading, index) => {
          heading.dataset.tocIndex = String(index);
          return {
            element: heading,
            text: (heading.innerText || heading.textContent || '').trim(),
            level: Number(heading.tagName.slice(1)) || sourceHeadings[index]?.level || 1,
            sourceOffset: sourceHeadings[index]?.sourceOffset,
          };
        });
        return;
      }

      // HTML 模式：从 DOM 提取标题（原有逻辑）
      await nextTick();
      /*
       * 富文本要等 TinyMCE 把内容铺进 DOM，所以这里有重试。
       * 整个重试过程包在 Promise 里，让 await generateTOC() 真的等到目录落定 ——
       * 调用方据此判断「首屏目录已定型」（见 NoteDetail 的 catalogTransitionReady），
       * 否则函数早在重试中途就返回了，等于没等。
       */
      await new Promise<void>((resolve) => {
        const collectHeadings = (attempt = 0) => {
          const container = document.getElementById('editor-container');
          if (!container) {
            if (attempt < 6) {
              setTimeout(() => collectHeadings(attempt + 1), 120);
              return;
            }
            this.headings = [];
            resolve();
            return;
          }
          try {
            const hTags = container.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6');
            if (hTags.length === 0 && attempt < 6) {
              setTimeout(() => collectHeadings(attempt + 1), 120);
              return;
            }
            this.headings = Array.from(hTags)
              .filter((heading) => {
                const text = heading.innerText || heading.textContent || '';
                return text.trim() !== '';
              })
              .map((heading) => {
                const level = parseInt(heading.tagName.replace('H', ''), 10);
                const text = heading.innerText || heading.textContent || '';
                return { element: heading, text, level };
              });
          } catch (error) {
            console.error('Error generating TOC:', error);
            this.headings = [];
          }
          resolve();
        };
        setTimeout(() => collectHeadings(), 100);
      });
    },
  },
});

interface MarkdownSourceHeading {
  text: string;
  level: number;
  sourceOffset: number;
}

/**
 * 只凭内容字符串粗判「这篇笔记有没有标题」。
 *
 * 用途是首屏定版面：generateTOC 必须等编辑器把内容铺进 DOM 才能解析（富文本还要重试），
 * 那之前的一百多毫秒里 headings 是空的。若按此渲染，正文会先占满整宽、解析完再被目录
 * 推回去——就是进笔记时正文闪一下的由来。而内容此刻其实已经在手里了，先粗判一次，
 * 首帧就把目录该占的位置留出来。
 *
 * 粗判只决定「留不留位置」，目录内容仍以 generateTOC 的解析结果为准；
 * 万一判错，等解析完成会自行纠正（那时过渡已启用，是一次平滑的收放）。
 */
export function contentLikelyHasHeadings(content?: string, type?: string): boolean {
  const text = content || '';
  if (!text) return false;
  // markdown 复用源码解析：它会跳过 fenced code 里看着像标题的行，比正则准
  if (type === 'markdown') return extractMdSourceHeadings(text).length > 0;
  // 富文本存的是 HTML；代码块里的尖括号是转义的（&lt;h1&gt;），不会被这里误判
  return /<h[1-6][\s>]/i.test(text);
}

/**
 * 提取 Markdown 标题的源码位置。
 * 支持 ATX/Setext 标题，并跳过 fenced code 内看似标题的内容。
 */
export function extractMdSourceHeadings(md: string): MarkdownSourceHeading[] {
  if (!md) return [];
  const lines = md.split('\n');
  const headings: MarkdownSourceHeading[] = [];
  let sourceOffset = 0;
  let fenceChar = '';
  let fenceLength = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineOffset = sourceOffset;
    sourceOffset += line.length + (index < lines.length - 1 ? 1 : 0);

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fenceChar) {
        fenceChar = marker[0];
        fenceLength = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
        fenceChar = '';
        fenceLength = 0;
      }
      continue;
    }

    if (fenceChar) continue;

    const atxMatch = line.match(/^\s{0,3}(#{1,6})(?:[\t ]+|$)(.*)$/);
    if (atxMatch) {
      const text = atxMatch[2].replace(/[\t ]+#+[\t ]*$/, '').trim();
      if (text) {
        headings.push({
          text,
          level: atxMatch[1].length,
          sourceOffset: lineOffset + (line.match(/^\s*/)?.[0].length || 0),
        });
      }
      continue;
    }

    const nextLine = lines[index + 1] || '';
    const setextMatch = nextLine.match(/^\s{0,3}(=+|-+)\s*$/);
    const text = line.trim();
    if (text && setextMatch) {
      headings.push({
        text,
        level: setextMatch[1][0] === '=' ? 1 : 2,
        sourceOffset: lineOffset + (line.match(/^\s*/)?.[0].length || 0),
      });
    }
  }

  return headings;
}
