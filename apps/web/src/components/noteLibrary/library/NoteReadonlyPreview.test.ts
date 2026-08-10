import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/library/NoteReadonlyPreview.vue'),
  'utf8',
);

describe('NoteReadonlyPreview', () => {
  it('正文加载态在可用预览区域内水平与垂直居中', () => {
    expect(source).toContain('<div v-if="loading" class="note-readonly-preview__loading">');
    expect(source).toMatch(
      /\.note-readonly-preview__loading\s*\{[\s\S]*min-height:\s*100%;[\s\S]*display:\s*grid;[\s\S]*place-items:\s*center;/u,
    );
  });
});
