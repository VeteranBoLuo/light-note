import { describe, expect, it } from 'vitest';
import { buildFileListOrderBy, normalizeFileListSort } from './fileListSort.js';

describe('云空间服务端排序白名单', () => {
  it('名称与大小排序都生成稳定的全量 ORDER BY', () => {
    expect(buildFileListOrderBy({ field: 'fileName', order: 'asc' })).toBe(
      'files.file_name ASC, files.create_time DESC, files.id DESC',
    );
    expect(buildFileListOrderBy({ field: 'fileSize', order: 'desc' })).toBe(
      'files.file_size DESC, files.create_time DESC, files.id DESC',
    );
  });

  it('拒绝请求注入的列名和方向并回退到默认时间倒序', () => {
    expect(normalizeFileListSort({ field: 'notAllowed', order: 'asc' })).toEqual({
      field: 'createTime',
      order: 'desc',
    });
    expect(normalizeFileListSort({ field: 'file_name; DROP TABLE files', order: 'asc; --' })).toEqual({
      field: 'createTime',
      order: 'desc',
    });
    expect(buildFileListOrderBy({ field: 'file_name; DROP TABLE files', order: 'asc; --' })).toBe(
      'files.create_time DESC, files.id DESC',
    );
  });
});
