import { describe, expect, it } from 'vitest';
import { getPublicToolboxCatalog, normalizeToolboxInput, quoteToolboxPoints, toolboxInputDigest } from './catalog.js';

describe('toolbox catalog', () => {
  it('quotes the documented bounded price ranges', () => {
    expect(quoteToolboxPoints('idea_to_draft', { itemCount: 0, options: { detailLevel: 'concise' } })).toBe(12);
    expect(
      quoteToolboxPoints('idea_to_draft', { itemCount: 0, snapshot: { options: { detailLevel: 'detailed' } } }),
    ).toBe(28);
    expect(quoteToolboxPoints('material_to_note', { itemCount: 2 })).toBe(8);
    expect(quoteToolboxPoints('research_brief', { itemCount: 4 })).toBe(20);
    expect(quoteToolboxPoints('study_kit', { itemCount: 4 })).toBe(26);
    expect(quoteToolboxPoints('concept_map', { itemCount: 3 })).toBe(21);
    expect(quoteToolboxPoints('action_plan', { itemCount: 3 })).toBe(16);
    expect(quoteToolboxPoints('source_comparison', { itemCount: 4 })).toBe(25);
    expect(quoteToolboxPoints('knowledge_audit', { itemCount: 5 })).toBe(32);
    expect(quoteToolboxPoints('ocr_to_text', { itemCount: 1, totalBytes: 4 * 1024 * 1024 })).toBe(9);
    expect(quoteToolboxPoints('ocr_to_text', { itemCount: 99, totalBytes: 100 * 1024 * 1024 })).toBe(30);
  });

  it('normalizes paid inputs and refuses a server job for local tools', () => {
    const promptInput = normalizeToolboxInput('idea_to_draft', {
      options: { question: '写一篇介绍个人知识库价值的文章', intent: 'article' },
    });
    expect(promptInput.resourceRefs).toEqual([]);
    expect(promptInput.options.question).toBe('写一篇介绍个人知识库价值的文章');
    expect(() => normalizeToolboxInput('idea_to_draft', { options: {} })).toThrowError(
      expect.objectContaining({ code: 'TOOLBOX_QUESTION_REQUIRED' }),
    );
    const input = normalizeToolboxInput('research_brief', {
      resourceRefs: [{ type: 'note', id: 'note-1' }],
      options: { question: '这些材料有哪些共同结论？', detailLevel: 'detailed' },
    });
    expect(input.resourceRefs).toEqual([{ type: 'note', id: 'note-1' }]);
    expect(input.options.question).toBe('这些材料有哪些共同结论？');
    expect(() => normalizeToolboxInput('pdf_organizer', {})).toThrow(/浏览器本地/);
    expect(() => normalizeToolboxInput('knowledge_structure_audit', {})).toThrow(/免费工具/);
  });

  it('单一处理要求保留合并后的 1000 字输入边界', () => {
    expect(
      normalizeToolboxInput('research_brief', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: 'a'.repeat(1000) },
      }).options.question,
    ).toHaveLength(1000);
    expect(() =>
      normalizeToolboxInput('research_brief', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: 'a'.repeat(1001) },
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_QUESTION_TOO_LONG' }));
    expect(() =>
      normalizeToolboxInput('research_brief', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: '问题', instruction: '第二个用户输入字段' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_OPTIONS_UNKNOWN_FIELD' }));
    expect(
      normalizeToolboxInput('research_brief', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: '问题', intent: 'decision' },
      }).options.intent,
    ).toBe('decision');
    expect(() =>
      normalizeToolboxInput('research_brief', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: '问题', intent: 'synthesize' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_INTENT_INVALID' }));
  });

  it('uses a canonical digest and exposes exactly one billing medium', () => {
    expect(toolboxInputDigest({ b: 2, a: 1 })).toBe(toolboxInputDigest({ a: 1, b: 2 }));
    const catalog = getPublicToolboxCatalog({ disabledToolIds: ['ocr_to_text'] });
    expect(catalog).not.toHaveProperty('aiFollowupBilling');
    expect(catalog.tools.find((item) => item.id === 'ocr_to_text')?.availability.enabled).toBe(false);
    expect(catalog.tools.find((item) => item.id === 'image_optimizer')?.billingMedium).toBe('free');
    expect(catalog.tools).toHaveLength(41);
    expect(getPublicToolboxCatalog().tools.filter((item) => item.availability.enabled)).toHaveLength(20);
    expect(catalog.tools.filter((item) => item.availability.enabled)).toHaveLength(19);
    expect(catalog.tools.find((item) => item.id === 'action_plan')?.availability.enabled).toBe(false);
    expect(catalog.tools.find((item) => item.id === 'browser_sql')?.availability.enabled).toBe(false);
    expect(catalog.tools.filter((item) => item.executionMode === 'browser')).toHaveLength(27);
    expect(catalog.tools.filter((item) => item.executionMode === 'service')).toHaveLength(5);
    expect(
      catalog.tools
        .filter((item) => item.executionMode === 'browser')
        .every((item) => item.billingMedium === 'free' && item.price.kind === 'free'),
    ).toBe(true);
    for (const tool of catalog.tools.filter((item) => item.billingMedium === 'points')) {
      expect(tool.price.min).toBeGreaterThan(0);
      expect(tool.price.max).toBeGreaterThanOrEqual(tool.price.min);
    }
  });

  it('fails closed on unknown fields, duplicate resources and out-of-range input counts', () => {
    expect(() =>
      normalizeToolboxInput('research_brief', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        unexpected: true,
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_INPUT_UNKNOWN_FIELD' }));
    expect(() =>
      normalizeToolboxInput('material_to_note', {
        resourceRefs: [
          { type: 'note', id: 'note-1' },
          { type: 'note', id: 'note-1' },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_RESOURCE_DUPLICATED' }));
    expect(() =>
      normalizeToolboxInput('material_to_note', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_INPUT_COUNT_INVALID' }));
  });

  it('keeps OCR document-only and rejects unsupported resource types before quoting', () => {
    expect(() =>
      normalizeToolboxInput('ocr_to_text', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_INPUT_TYPE_INVALID' }));
  });
});
