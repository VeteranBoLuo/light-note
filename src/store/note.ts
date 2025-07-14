import { defineStore } from 'pinia';
import { nextTick } from 'vue';

export default defineStore('note', {
  state: () =>
    <
      {
        headings?: { element: Element; text: string; level: number }[];
      }
    >{
      headings: [],
    },
  getters: {},
  actions: {
    generateTOC() {
      nextTick(() => {
        const container = document.getElementById('editor-container');
        if (!container) return;
        const hTags = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
        this.headings = Array.from(hTags)
          .filter((heading: any) => heading.innerText.trim() !== '' || heading.textContent.trim() !== '')
          .map((heading: any, index) => {
            const level = parseInt((heading.tagName as string).replace('H', ''), 10);
            return { element: heading, text: heading.innerText || heading.textContent || '', level };
          });
      }).then();
    },
  },
});
