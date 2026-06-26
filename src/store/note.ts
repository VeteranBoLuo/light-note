import { defineStore } from 'pinia';
import { nextTick } from 'vue';

// 接口定义
interface Heading {
  element: Element;
  text: string;
  level: number;
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
      // Markdown 模式：从文本提取标题
      if (type === 'markdown' && content) {
        this.headings = extractMdHeadings(content);
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

function extractMdHeadings(md: string): Heading[] {
  if (!md) return [];
  const lines = md.split('\n');
  const headings: Heading[] = [];
  lines.forEach((line) => {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      // 跳过纯图片/链接的标题
      if (!text || text.startsWith('[')) return;
      headings.push({
        element: document.createElement('div'), // dummy element so Catalog can read .textContent
        text,
        level,
      });
    }
  });
  return headings;
}
