import { describe, it, expect } from 'vitest';
import { splitTranslationText, validateTranslationSegment, translationNoteContent } from './translationText.js';
import { normalizeToolboxInput, normalizeToolboxBillingMedium } from './catalog.js';
describe('translation material and structure', () => {
  it('preserves every character and immutable Markdown data across long segments', () => {
    const text = '# Title\n\n' + 'A paragraph 🌏. '.repeat(1600) + '\n\n| Name | Value |\n| --- | --- |\n| item | `code()` |\n\n[Docs](https://example.com/a?q=1)\n\n```js\nconst x = "original";\n```\n';
    const segments = splitTranslationText(text);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.map(s => s.original).join('')).toBe(text);
    expect(segments.map(s => validateTranslationSegment(s, s.source)).join('')).toBe(text);
    expect(segments.every(s => s.source.length <= 2200)).toBe(true);
  });
  it('rejects lost/reordered placeholders and missing table columns', () => {
    const [segment] = splitTranslationText('# Hello\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n[link](https://example.com)');
    expect(() => validateTranslationSegment(segment, segment.source.replace(segment.tokens[0].token,''))).toThrow();
    expect(() => validateTranslationSegment(segment, segment.source.replace('|',''))).toThrow();
    expect(() => validateTranslationSegment(segment,'')).toThrow();
  });
  it('requires a single material, supported languages and AI quota only', () => {
    const options = {targetLanguage:'en'};
    expect(normalizeToolboxInput('translation',{text:'hello',options})).toMatchObject({text:'hello',options:{sourceLanguage:'auto',targetLanguage:'en'}});
    for (const input of [{text:'x'}, {text:'x'.repeat(30001),options}, {text:'x',resourceRefs:[{type:'note',id:'n1'}],options}, {text:'x',options:{targetLanguage:'xx'}}]) expect(() => normalizeToolboxInput('translation',input)).toThrow();
    expect(normalizeToolboxBillingMedium('translation','ai_quota')).toBe('ai_quota');
    expect(() => normalizeToolboxBillingMedium('translation','points')).toThrow();
  });
  it('formats both views from the same persisted pairs without any model call', () => {
    const artifact = {content:'译文',meta:{translation:{segments:[{original:'Original',translated:'译文'}]}}};
    expect(translationNoteContent(artifact)).toBe('译文');
    expect(translationNoteContent(artifact,'bilingual')).toContain('Original\n\n### 译文');
    expect(() => translationNoteContent(artifact,'bad')).toThrow();
  });
});
