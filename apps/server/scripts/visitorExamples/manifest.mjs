import crypto from 'node:crypto';
import { visitorNotes } from './notes.mjs';
export const version = 'visitor-resources-v1';
export const stableId = (key) => {
  const h = crypto.createHash('sha256').update(`light-note:visitor-resources:v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const workshopId = (key) => {
  const h = crypto.createHash('sha256').update(`light-note:visitor-workshop:20260909:v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export { visitorNotes };
export const files = [
  ['访谈摘要.pdf', 'application/pdf'],
  ['研究报告模板.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['阅读与复习计划表.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['研究结论演示稿.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['访谈记录扫描示例.png', 'image/png'],
  ['访谈编码.csv', 'text/csv'],
  ['每周知识回顾指南.md', 'text/markdown'],
].map(([name, type]) => ({ name, type }));
export const associations = [
  {
    key: 'research-interviews',
    notes: ['interview-guide', 'interview-findings', 'meeting'],
    bookmark: '秘塔AI搜索',
    files: ['访谈摘要.pdf', '访谈编码.csv', '访谈记录扫描示例.png'],
  },
  {
    key: 'research-tool-selection',
    notes: ['collaboration', 'meeting'],
    bookmark: '轻笺知识管理',
    files: ['研究报告模板.docx'],
  },
  {
    key: 'learning-markdown',
    notes: ['markdown', 'markdown-practice', 'review'],
    bookmark: '菜鸟教程',
    files: ['阅读与复习计划表.xlsx'],
  },
  {
    key: 'learning-critical-reading',
    notes: ['reading', 'mindmap', 'review'],
    bookmark: '少数派 - 高效工作，品质生活',
    files: ['阅读与复习计划表.xlsx'],
  },
  {
    key: 'writing-weekly-report',
    notes: ['weekly', 'daily', 'weekly-rewrite'],
    bookmark: '网道',
    files: ['研究结论演示稿.pptx', '研究报告模板.docx'],
  },
  {
    key: 'writing-tutorial',
    notes: ['tutorial', 'markdown', 'weekly'],
    bookmark: 'MDN Web Docs',
    files: ['每周知识回顾指南.md'],
  },
];
