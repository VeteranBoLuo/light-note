import { describe, expect, it } from 'vitest';
import {
  cloudFolderAncestors,
  cloudFolderDropBlockReason,
  cloudFolderNestBlockReason,
  cloudFolderSubtreeRelativeDepth,
  collectCloudFolderDescendantIds,
  flattenCloudFolderTree,
  normalizeCloudFolderList,
  resolveCloudFolderDropPosition,
} from './cloudFolderTree';

const folders = normalizeCloudFolderList([
  { id: 1, name: '工作', parentId: null, depth: 1, sort: 0, childCount: 2 },
  { id: 2, name: '生活', parentId: null, depth: 1, sort: 1 },
  { id: 3, name: '2026', parentId: 1, depth: 2, sort: 1 },
  { id: 4, name: '2025', parentId: 1, depth: 2, sort: 0 },
  { id: 5, name: '周报', parentId: 3, depth: 3, sort: 0 },
]);

describe('cloudFolderTree', () => {
  it('按同级 sort 展开无可见根节点目录树', () => {
    expect(flattenCloudFolderTree(folders).map((item) => item.name)).toEqual(['工作', '2025', '2026', '周报', '生活']);
    expect(flattenCloudFolderTree(folders, new Set(['1'])).map((item) => item.name)).toEqual([
      '工作',
      '2025',
      '2026',
      '生活',
    ]);
  });

  it('计算后代和当前位置面包屑', () => {
    expect([...collectCloudFolderDescendantIds(folders, '1')]).toEqual(['4', '3', '5']);
    expect(cloudFolderAncestors(folders, '5').map((item) => item.name)).toEqual(['工作', '2026', '周报']);
    expect(cloudFolderSubtreeRelativeDepth(folders, '1')).toBe(2);
  });

  it('任意层级拖拽都按行上中下区分前插、移入和后插', () => {
    expect(resolveCloudFolderDropPosition(folders[0], folders[1], 0.1)).toBe('before');
    expect(resolveCloudFolderDropPosition(folders[0], folders[1], 0.5)).toBe('inside');
    expect(resolveCloudFolderDropPosition(folders[0], folders[1], 0.9)).toBe('after');
    expect(resolveCloudFolderDropPosition(folders[1], folders[2], 0.1)).toBe('before');
    expect(resolveCloudFolderDropPosition(folders[1], folders[2], 0.5)).toBe('inside');
    expect(resolveCloudFolderDropPosition(folders[1], folders[2], 0.9)).toBe('after');
  });

  it('移入前阻止自身循环、无变化、超深和同层重名', () => {
    expect(cloudFolderNestBlockReason(folders, '1', '1', 8)).toBe('cycle');
    expect(cloudFolderNestBlockReason(folders, '1', '5', 8)).toBe('cycle');
    expect(cloudFolderNestBlockReason(folders, '5', '3', 8)).toBe('unchanged');
    expect(cloudFolderNestBlockReason(folders, '1', '2', 3)).toBe('depth');

    const duplicateFolders = normalizeCloudFolderList([
      ...folders,
      { id: 6, name: '工作', parentId: 2, depth: 2, sort: 0 },
    ]);
    expect(cloudFolderNestBlockReason(duplicateFolders, '1', '2', 8)).toBe('duplicate');
    expect(cloudFolderNestBlockReason(folders, '2', '1', 8)).toBeNull();
  });

  it('跨父级前后插入与移回第一层使用目标兄弟组校验', () => {
    expect(cloudFolderDropBlockReason(folders, '2', '1', 8, '3', 'before')).toBeNull();
    expect(cloudFolderDropBlockReason(folders, '5', null, 8, '2', 'before')).toBeNull();
    expect(cloudFolderDropBlockReason(folders, '5', null, 8)).toBeNull();
    expect(cloudFolderDropBlockReason(folders, '2', null, 8)).toBe('unchanged');
    expect(cloudFolderDropBlockReason(folders, '5', '3', 8)).toBe('unchanged');
    expect(cloudFolderDropBlockReason(folders, '1', '3', 8, '5', 'before')).toBe('cycle');
    expect(cloudFolderDropBlockReason(folders, '2', '1', 8, '5', 'before')).toBe('invalid');
  });
});
