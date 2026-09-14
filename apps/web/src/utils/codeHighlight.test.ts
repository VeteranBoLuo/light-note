import { describe, expect, it, vi } from 'vitest';
import hljs from 'highlight.js/lib/core';

describe('code highlighting cache', () => {
  it('reuses unchanged code, separates languages and evicts old entries', async () => {
    const instance = hljs.newInstance();
    const highlight = vi.spyOn(instance, 'highlight');
    const create = vi.spyOn(hljs, 'newInstance').mockReturnValueOnce(instance);
    const { highlightCode } = await import('./codeHighlight');
    try {
      const source = 'const cachedValue = 42;';
      expect(highlightCode(source, 'js')).toContain('hljs-keyword');
      const count = highlight.mock.calls.length;
      highlightCode(source, 'javascript');
      expect(highlight).toHaveBeenCalledTimes(count);
      highlightCode(source, 'python');
      expect(highlight).toHaveBeenCalledTimes(count + 1);
      for (let i = 0; i < 130; i++) highlightCode(`const value = ${i};`, 'js');
      const after = highlight.mock.calls.length;
      highlightCode(source, 'javascript');
      expect(highlight).toHaveBeenCalledTimes(after + 1);
    } finally {
      create.mockRestore();
      highlight.mockRestore();
    }
  });
});
