import { describe, it, expect } from 'vitest';
import { buildNoteExportPaths } from './noteExportPaths';
describe('hierarchical note export', () => {
  it('keeps parent bodies and child folders in agreement with sibling collisions', () => {
    const paths = buildNoteExportPaths(
      [
        { id: 'root', title: '开发文档' },
        { id: 'a', title: '指南', parentId: 'root' },
        { id: 'b', title: '指南', parentId: 'root' },
        { id: 'c', title: '常见问题', parentId: 'b' },
      ],
      'root',
    );
    expect(paths.get('b')).toBe('开发文档/指南 (2)');
    expect(paths.get('c')).toBe('开发文档/指南 (2)/常见问题');
  });
  it('rejects broken parent chains', () => {
    expect(() =>
      buildNoteExportPaths(
        [
          { id: 'a', parentId: 'b' },
          { id: 'b', parentId: 'a' },
        ],
        'missing',
      ),
    ).toThrow();
  });
  it('sanitizes paths and reserved filenames', () => {
    const paths = buildNoteExportPaths([{ id: 'a', title: '../CON' }], 'a');
    expect(paths.get('a')).not.toContain('/');
  });
});
