import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useUserStore from './useUser';
import bookmarkStore from './bookmark';
import cloudSpaceStore from './cloudSpace';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('用户身份切换资源隔离', () => {
  it('从游客登录为正式账号时同步清空书签和云空间缓存', () => {
    const user = useUserStore();
    const bookmark = bookmarkStore();
    const cloud = cloudSpaceStore();
    user.setUserInfo({ id: 'visitor-1', role: 'visitor' });
    bookmark.bookmarkList = [{ id: 'guest-bookmark' }];
    bookmark.tagList = [{ id: 'guest-tag', name: '游客标签' }] as any;
    cloud.fileList = [{ id: 'guest-file', fileName: '游客文件' }] as any;
    cloud.folderList = [{ id: 'guest-folder', name: '游客文件夹' }];

    user.setUserInfo({ id: 'user-1', role: 'user' });

    expect(bookmark.bookmarkList).toEqual([]);
    expect(bookmark.tagList).toEqual([]);
    expect(cloud.fileList).toEqual([]);
    expect(cloud.folderList).toEqual([]);
    expect(cloud.loading).toBe(true);
    expect(cloud.folderLoading).toBe(true);
  });

  it('用户 ID 相同但游客身份发生变化时仍会清空资源缓存', () => {
    const user = useUserStore();
    const cloud = cloudSpaceStore();
    user.setUserInfo({ id: 'shared-identity', role: 'visitor', visitorWorkspace: true });
    cloud.fileList = [{ id: 'guest-file', fileName: '游客文件' }] as any;

    user.setUserInfo({ id: 'shared-identity', role: 'user', visitorWorkspace: false });

    expect(cloud.fileList).toEqual([]);
    expect(cloud.loading).toBe(true);
  });
});
