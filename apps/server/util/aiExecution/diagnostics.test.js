import { describe, expect, it } from 'vitest';
import { buildAiInputDiagnostics, diagnosticUrl, readAiInputDiagnostics } from './diagnostics.js';

describe('AI administrator input diagnostics', () => {
  it('retains only bounded numeric reservation components without copying arbitrary diagnostics', () => {
    const reservationBudget = {
      inputTokens: 1200,
      evidenceTokens: 8000,
      protocolTokens: 8000,
      outputTokens: 8192,
      visionTokens: 0,
      totalTokens: 25392,
      unclampedTokens: 25392,
    };
    const result = buildAiInputDiagnostics(
      { skillId: 'note.transform_text', input: { operation: 'polish', text: 'private body' } },
      { reservationBudget: { ...reservationBudget, text: 'private body' } },
    );
    expect(result).toEqual({ version: 1, operation: 'polish', reservationBudget });
    expect(readAiInputDiagnostics(result, 'note.transform_text')).toEqual(result);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(
      buildAiInputDiagnostics(
        { skillId: 'help.answer' },
        { reservationBudget: { ...reservationBudget, inputTokens: -1 } },
      ),
    ).toBeNull();
  });
  it('retains URL routing parameters but removes credentials, arbitrary query values and fragments', () => {
    expect(diagnosticUrl('https://alice:secret@example.com/watch?v=abc_123&token=secret&q=private#session')).toEqual({
      url: 'https://example.com/watch?v=abc_123',
      urlRedacted: true,
    });
    expect(diagnosticUrl('https://example.com/article/42')).toEqual({
      url: 'https://example.com/article/42',
      urlRedacted: false,
    });
    for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'invalid', 'https://example.com/' + 'a'.repeat(2000)]) {
      expect(diagnosticUrl(url)).toBeNull();
    }
  });

  it('projects only safe input fields and never serializes page content or free text', () => {
    const result = buildAiInputDiagnostics({
      skillId: 'bookmark.parse_url',
      input: {
        url: 'https://example.com/?id=42&signature=private',
        pageContext: { text: 'private body', title: 'private title' },
        question: 'private question',
        prompt: 'private prompt',
        resourceId: 'private id',
      },
    });
    expect(result).toEqual({
      version: 1,
      url: 'https://example.com/?id=42',
      urlRedacted: true,
      pageContextProvided: true,
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(readAiInputDiagnostics(JSON.stringify(result), 'bookmark.parse_url')).toEqual(result);
    expect(buildAiInputDiagnostics({ skillId: 'help.answer', input: { question: 'private' } })).toBeNull();
  });

  it('revalidates stored fields, preserves redaction and tolerates old or corrupt records', () => {
    const snapshot = {
      version: 1,
      operation: 'translate',
      detailLevel: 'detailed',
      targetLength: 300,
      text: 'private',
      resourceTypes: ['note', 'private', 'note'],
      url: 'https://private.example',
    };
    expect(readAiInputDiagnostics(snapshot, 'note.transform_text')).toEqual({
      version: 1,
      operation: 'translate',
      detailLevel: 'detailed',
      targetLength: 300,
      resourceTypes: ['note'],
    });
    for (const item of [null, '{broken', { version: 2 }, {}])
      expect(readAiInputDiagnostics(item, 'bookmark.parse_url')).toBeNull();
  });
});
