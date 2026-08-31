import { describe, expect, it } from 'vitest';
import { buildProductionDocumentOutline } from './productionDocumentOutline';

describe('生产文档大纲', () => {
  it('只收集 H1-H3 并保留可定位位置', () => {
    const source = '# 标题\n正文\n## 章节\n### 小节\n#### 不展示';
    expect(buildProductionDocumentOutline(source)).toEqual([
      expect.objectContaining({ id: 'heading-0', level: 1, title: '标题', position: 0 }),
      expect.objectContaining({ level: 2, title: '章节', position: source.indexOf('## 章节') }),
      expect.objectContaining({ level: 3, title: '小节', position: source.indexOf('### 小节') }),
    ]);
  });

  it('忽略代码围栏中的伪标题并兼容结尾井号', () => {
    expect(buildProductionDocumentOutline('```md\n# 代码\n```\n## 正文 ##')).toEqual([
      expect.objectContaining({ level: 2, title: '正文' }),
    ]);
  });
});
