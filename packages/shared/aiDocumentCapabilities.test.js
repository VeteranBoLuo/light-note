import { describe, expect, it } from 'vitest';
import { AI_DOCUMENT_SUPPORTED_EXTENSIONS, isAiDocumentFileNameSupported } from './index.js';

describe('AI document capabilities', () => {
  it('前后端可共用同一份扩展名能力清单', () => {
    expect(AI_DOCUMENT_SUPPORTED_EXTENSIONS).toContain('.png');
    expect(AI_DOCUMENT_SUPPORTED_EXTENSIONS).toContain('.docx');
    expect(isAiDocumentFileNameSupported('截图.PNG')).toBe(true);
    expect(isAiDocumentFileNameSupported('/资料/计划.markdown')).toBe(true);
    expect(isAiDocumentFileNameSupported('压缩包.zip')).toBe(false);
    expect(isAiDocumentFileNameSupported('伪装.pdf.exe')).toBe(false);
  });
});
