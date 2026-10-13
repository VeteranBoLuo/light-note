import {
  FILE_CATEGORY_CASES,
  FILE_CATEGORY_PARITY_INPUTS,
} from '../../../packages/shared/fileCategory.cases.js';
import { resolveFileCategory as sharedCategory } from '@lightnote/shared/file-category';
import { describe, expect, it } from 'vitest';
import { buildFileCategorySql, resolveFileCategory } from './fileCategory.js';

describe('file category filtering', () => {
  it.each(['text/csv', 'text/plain', 'application/octet-stream', 'application/vnd.ms-excel', ''])(
    'CSV 归入表格并覆盖旧文本分类：%s',
    (fileType) => {
      expect(resolveFileCategory({ fileName: '方案对比表.CSV', fileType, category: 'text' })).toBe('excel');
    },
  );
  it('仅在没有明确扩展名时按 CSV MIME 识别', () => {
    for (const fileType of [
      'text/csv; charset=utf-8',
      'text/csv ; charset=utf-8',
      'application/csv',
      'text/x-csv',
      'application/x-csv',
    ]) {
      expect(resolveFileCategory({ fileName: '数据', fileType })).toBe('excel');
    }
    expect(resolveFileCategory({ fileName: 'readme.txt', fileType: 'text/csv' })).toBe('text');
  });
  it('known extensions precede MIME and unknown extensions retain MIME classification', () => {
    expect(resolveFileCategory({ fileName: 'photo.txt', fileType: 'image/png' })).toBe('text');
    expect(resolveFileCategory({ fileName: 'archive.zip', fileType: 'application/octet-stream' })).toBe(
      'compress',
    );
  });

  it.each([
    ['photo.avif', 'image'],
    ['clip.ogv', 'video'],
    ['voice.m4a', 'audio'],
    ['voice.opus', 'audio'],
    ['source.py', 'text'],
    ['component.vue', 'text'],
    ['config.toml', 'text'],
    ['events.jsonl', 'text'],
    ['captions.vtt', 'text'],
    ['歌词.lrc', 'text'],
    ['歌词.LRC', 'text'],
    ['calendar.ics', 'text'],
    ['document.odt', 'word'],
    ['sheet.ods', 'excel'],
    ['slides.odp', 'ppt'],
    ['backup.tgz', 'compress'],
  ])('recognizes the new preview category for %s', (fileName, expectedCategory) => {
    expect(resolveFileCategory({ fileName, fileType: 'application/octet-stream' })).toBe(expectedCategory);
  });
});

describe('shared category contract', () => {
  it.each(FILE_CATEGORY_CASES)('%j → %s', (file, expected) =>
    expect(resolveFileCategory(file)).toBe(expected),
  );
  it('all format aliases use the shared resolver', () => {
    for (const file of FILE_CATEGORY_PARITY_INPUTS)
      expect(resolveFileCategory(file)).toBe(sharedCategory(file));
  });
});
