import { describe, expect, it } from 'vitest';
import { drawingNoteAiProjection, renderDrawingNoteForAi } from './drawingNoteAi.js';

describe('drawingNoteAi', () => {
  it('SQL 投影只读取元素数量和文本字段，不返回完整画布正文', () => {
    const sql = drawingNoteAiProjection('n');

    expect(sql).toContain("JSON_LENGTH(n.content, '$.elements')");
    expect(sql).toContain("JSON_EXTRACT(n.content, '$.elements[*].text')");
    expect(sql).not.toContain('AS content');
    expect(() => drawingNoteAiProjection('n; DROP TABLE note')).toThrow('DRAWING_AI_SQL_ALIAS_INVALID');
  });

  it('有文本时仅输出去重后的可验证文字和元素数', () => {
    const result = renderDrawingNoteForAi({
      drawing_element_count: 4,
      drawing_texts_json: '[" 项目计划 ","项目计划","下一步"]',
    });

    expect(result).toContain('画布包含 4 个绘制元素');
    expect(result).toContain('画布中的可验证文字：项目计划；下一步');
  });

  it('派生文本数组被长度上限截断时只保留完整字符串，不丢失前序文字', () => {
    const result = renderDrawingNoteForAi({
      drawing_element_count: 4,
      drawing_texts_json: '["项目计划","下一步","未完成',
    });

    expect(result).toContain('画布中的可验证文字：项目计划；下一步');
    expect(result).not.toContain('未完成');
  });

  it('只有画笔轨迹时明确披露视觉能力边界，禁止把它误报成空笔记', () => {
    const result = renderDrawingNoteForAi({ drawing_element_count: 177, drawing_texts_json: null });

    expect(result).toContain('画布包含 177 个绘制元素');
    expect(result).toContain('不能仅凭画笔轨迹可靠判断图像语义');
    expect(result).not.toContain('笔记正文为空');
  });
});
