import { describe, expect, it } from 'vitest';
import type { CloudFolderNode } from '@/types/cloudFolder';
import { resolveMobileUploadDefaultFolderId } from './mobileUploadDestination';

const folders = [{ id: 'folder-1' }, { id: 'folder-2' }] as CloudFolderNode[];

describe('移动端全局上传默认文件夹', () => {
  it('在云空间继承当前有效的文件夹筛选', () => {
    expect(resolveMobileUploadDefaultFolderId('cloudSpace', 'folder-2', folders)).toBe('folder-2');
  });

  it('云空间全部文件、失效文件夹与其他页面都回退根目录', () => {
    expect(resolveMobileUploadDefaultFolderId('cloudSpace', 'all', folders)).toBeNull();
    expect(resolveMobileUploadDefaultFolderId('cloudSpace', 'deleted', folders)).toBeNull();
    expect(resolveMobileUploadDefaultFolderId('noteLibrary', 'folder-1', folders)).toBeNull();
  });
});
