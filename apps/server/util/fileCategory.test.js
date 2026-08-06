import { describe, expect, it } from 'vitest';
import { buildFileCategorySql, resolveFileCategory } from './fileCategory.js';

describe('file category filtering', () => {
  it('keeps MIME precedence ahead of extension fallback', () => {
    expect(resolveFileCategory({ fileName: 'photo.txt', fileType: 'image/png' })).toBe('image');
    expect(resolveFileCategory({ fileName: 'archive.zip', fileType: 'application/octet-stream' })).toBe('compress');
  });

  it('builds a SQL expression that can filter before LIMIT/OFFSET', () => {
    const expression = buildFileCategorySql();
    expect(expression).toContain("LOWER(TRIM(SUBSTRING_INDEX(COALESCE(files.file_type, ''), ';', 1)))");
    expect(expression).toContain("LOCATE('.', COALESCE(files.file_name, ''), 2) > 0");
    expect(expression).toContain("ELSE 'other' END");
  });

  it.each([
    ['photo.avif', 'image'],
    ['clip.ogv', 'video'],
    ['voice.m4a', 'audio'],
    ['voice.opus', 'audio'],
    ['source.py', 'text'],
    ['component.vue', 'text'],
    ['config.toml', 'text'],
  ])('recognizes the new preview category for %s', (fileName, expectedCategory) => {
    expect(resolveFileCategory({ fileName, fileType: 'application/octet-stream' })).toBe(expectedCategory);
  });
});
