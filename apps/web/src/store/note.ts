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
}

export default defineStore('note', {
  state: (): NoteState => ({
    headings: [],
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
      const collectHeadings = (attempt = 0) => {
        const container = document.getElementById('editor-container');
        if (!container) {
          if (attempt < 6) {
            setTimeout(() => collectHeadings(attempt + 1), 120);
            return;
          }
          this.headings = [];
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
      };
      setTimeout(() => collectHeadings(), 100);
    },
  },
});

interface MarkdownSourceHeading {
  text: string;
  level: number;
  sourceOffset: number;
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
