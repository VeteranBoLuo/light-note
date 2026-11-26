import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useUserStore from './useUser';
import bookmarkStore from './bookmark';
import cloudSpaceStore from './cloudSpace';
import { searchIdentityVersion } from '@/api/searchCache';

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
    cloud.folderList = [{ id: 'guest-folder', name: '游客文件夹' }] as any;

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

  it('代管会话变化与登出各释放一次搜索缓存，普通资料刷新沿用当前身份', () => {
    const user = useUserStore();
    const adminContext = {
      id: 'context-1', mode: 'readonly' as const, subjectUserId: 'owner', subjectRole: 'user',
      subjectAlias: '', issuedAt: '', expiresAt: '', capabilities: [],
    };
    user.setUserInfo({ id: 'owner', role: 'user', adminContext });
    const current = searchIdentityVersion();
    user.setUserInfo({ id: 'owner', role: 'user', adminContext, alias: 'New label' });
    expect(searchIdentityVersion()).toBe(current);
    user.setUserInfo({ id: 'owner', role: 'user', adminContext: { ...adminContext, id: 'context-2' } });
    expect(searchIdentityVersion()).toBe(current + 1);
    user.resetUserInfo();
    expect(searchIdentityVersion()).toBe(current + 2);
  });
});
