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
    async generateTOC(): Promise<void> {
      await nextTick();

      const container = document.getElementById('editor-container');
      if (!container) {
        console.warn('Editor container not found');
        return;
      }

      try {
        const hTags = container.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6');
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
    },
  },
});
