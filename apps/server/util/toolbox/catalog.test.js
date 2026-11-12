import { describe, expect, it } from 'vitest';
import {
  getPublicToolboxCatalog,
  normalizeToolboxBillingMedium,
  normalizeToolboxInput,
  quoteToolboxPoints,
  toolboxInputDigest,
} from './catalog.js';

describe('toolbox catalog', () => {
  it('quotes the documented bounded price ranges', () => {
    expect(quoteToolboxPoints('material_to_note', { itemCount: 2 })).toBe(8);
    expect(quoteToolboxPoints('material_to_note', { itemCount: 20 })).toBe(30);
    expect(quoteToolboxPoints('study_kit', { itemCount: 4 })).toBe(26);
    expect(quoteToolboxPoints('ocr_to_text', { itemCount: 1, totalBytes: 4 * 1024 * 1024 })).toBe(9);
    expect(quoteToolboxPoints('ocr_to_text', { itemCount: 99, totalBytes: 100 * 1024 * 1024 })).toBe(30);
    for (const toolId of ['idea_to_draft', 'research_brief', 'concept_map', 'source_comparison', 'knowledge_audit']) {
      expect(() => quoteToolboxPoints(toolId, { itemCount: 2 })).toThrowError(
        expect.objectContaining({ code: 'TOOLBOX_QUOTE_NOT_REQUIRED' }),
      );
    }
  });

  it('normalizes paid inputs and refuses a server job for local tools', () => {
    const input = normalizeToolboxInput('study_kit', {
      resourceRefs: [{ type: 'note', id: 'note-1' }],
      options: { question: '这些材料有哪些共同结论？', detailLevel: 'detailed' },
    });
    expect(input.resourceRefs).toEqual([{ type: 'note', id: 'note-1' }]);
    expect(input.options.question).toBe('这些材料有哪些共同结论？');
    expect(() => normalizeToolboxInput('pdf_organizer', {})).toThrow(/浏览器本地/);
    expect(() => normalizeToolboxInput('forms', {})).toThrow(/免费工具/);
  });

  it('单一处理要求保留合并后的 1000 字输入边界', () => {
    expect(
      normalizeToolboxInput('study_kit', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: 'a'.repeat(1000) },
      }).options.question,
    ).toHaveLength(1000);
    expect(() =>
      normalizeToolboxInput('study_kit', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: 'a'.repeat(1001) },
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_QUESTION_TOO_LONG' }));
    expect(() =>
      normalizeToolboxInput('study_kit', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: '问题', instruction: '第二个用户输入字段' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_OPTIONS_UNKNOWN_FIELD' }));
    expect(
      normalizeToolboxInput('study_kit', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: '问题', intent: 'memorize' },
      }).options.intent,
    ).toBe('memorize');
    expect(() =>
      normalizeToolboxInput('study_kit', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        options: { question: '问题', intent: 'synthesize' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_INTENT_INVALID' }));
  });

  it('uses a canonical digest and exposes only the billing media each tool supports', () => {
    expect(toolboxInputDigest({ b: 2, a: 1 })).toBe(toolboxInputDigest({ a: 1, b: 2 }));
    const catalog = getPublicToolboxCatalog({ disabledToolIds: ['ocr_to_text'] });
    expect(catalog).not.toHaveProperty('aiFollowupBilling');
    expect(catalog.tools.find((item) => item.id === 'ocr_to_text')?.availability.enabled).toBe(false);
    expect(catalog.tools.find((item) => item.id === 'pdf_organizer')?.billingMedium).toBe('free');
    expect(catalog.tools.find((item) => item.id === 'study_kit')?.billingMedia).toEqual(['points', 'ai_quota']);
    expect(catalog.tools.find((item) => item.id === 'ocr_to_text')?.billingMedia).toEqual([
      'ai_quota',
      'points',
      'free',
    ]);
    expect(catalog.tools).toHaveLength(17);
    expect(getPublicToolboxCatalog().tools.filter((item) => item.availability.enabled)).toHaveLength(9);
    expect(catalog.tools.filter((item) => item.availability.enabled)).toHaveLength(8);
    expect(
      catalog.tools.some((item) => ['action_plan', 'data_workbench', 'image_optimizer', 'knowledge_structure_audit', 'extraction'].includes(item.id)),
    ).toBe(false);
    expect(catalog.tools.filter((item) => item.executionMode === 'browser')).toHaveLength(4);
    expect(catalog.tools.filter((item) => item.executionMode === 'service')).toHaveLength(4);
    // 已下架的 AI 工具只保留历史名称，不再可报价。
    expect(
      catalog.tools
        .filter((item) => ['idea_to_draft', 'research_brief', 'concept_map', 'source_comparison', 'knowledge_audit'].includes(item.id))
        .map((item) => [item.availability.enabled, item.price.min, item.price.max]),
    ).toEqual(Array.from({ length: 5 }, () => [false, 0, 0]));
    expect(
      catalog.tools
        .filter((item) => item.executionMode === 'browser')
        .every((item) => item.billingMedium === 'free' && item.price.kind === 'free'),
    ).toBe(true);
    for (const tool of catalog.tools.filter((item) => item.billingMedium === 'points' && item.availability.enabled)) {
      expect(tool.price.min).toBeGreaterThan(0);
      expect(tool.price.max).toBeGreaterThanOrEqual(tool.price.min);
    }
    expect(normalizeToolboxBillingMedium('study_kit', 'ai_quota')).toBe('ai_quota');
    expect(normalizeToolboxBillingMedium('study_kit', 'points')).toBe('points');
    expect(normalizeToolboxBillingMedium('ocr_to_text', 'ai_quota')).toBe('ai_quota');
  });

  it('fails closed on unknown fields, duplicate resources and out-of-range input counts', () => {
    expect(() =>
      normalizeToolboxInput('study_kit', {
        resourceRefs: [{ type: 'note', id: 'note-1' }],
        unexpected: true,
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_INPUT_UNKNOWN_FIELD' }));
    expect(() =>
      normalizeToolboxInput('material_to_note', {
        resourceRefs: [{ type: 'note', id: 'a' }, { type: 'note', id: 'b' }],
        options: { question: '价格', resultMode: 'table', columns: [{ label: '价格' }] },
      }),
    ).toThrowError(expect.objectContaining({ code: 'TOOLBOX_OPTIONS_UNKNOWN_FIELD' }));
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
        resourceRefs: [],
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
