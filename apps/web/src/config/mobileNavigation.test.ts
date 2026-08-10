import { describe, expect, it, vi } from 'vitest';
import {
  getMobileResourcePath,
  isMobileResourceInboxTab,
  isMobileResourcePath,
  MOBILE_BOTTOM_NAVIGATION,
  MOBILE_RESOURCE_NAVIGATION,
} from './mobileNavigation';
import { getMobileTopBarBinding, registerMobileTopBarBinding } from '@/composables/useMobileTopBar';

describe('移动端导航配置', () => {
  it('只把资料列表路由归入顶部资料切换', () => {
    expect(getMobileResourcePath('home')).toBe('/home');
    expect(getMobileResourcePath('home:id')).toBe('/home');
    expect(getMobileResourcePath('home:search')).toBe('/home');
    expect(getMobileResourcePath('noteLibrary')).toBe('/noteLibrary');
    expect(getMobileResourcePath('cloudSpace')).toBe('/cloudSpace');
    expect(getMobileResourcePath('tagMg')).toBe('/manage/tagMg');
    expect(getMobileResourcePath('tagEditMg')).toBeNull();
    expect(getMobileResourcePath('noteDetail')).toBeNull();
    expect(getMobileResourcePath('personCenter')).toBeNull();
  });

  it('保持资料切换与底部主导航的固定顺序', () => {
    expect(MOBILE_RESOURCE_NAVIGATION.map((item) => item.key)).toEqual(['bookmark', 'note', 'cloud', 'tag']);
    // 今日在首位、AI 居中保持强调；个人中心改由顶栏头像进入，第五位给独立聊天室
    expect(MOBILE_BOTTOM_NAVIGATION.map((item) => item.key)).toEqual(['today', 'resources', 'ai', 'todo', 'community']);
    expect(MOBILE_BOTTOM_NAVIGATION.map((item) => item.key)).not.toContain('search');
    expect(MOBILE_BOTTOM_NAVIGATION.find((item) => item.key === 'today')?.path).toBe('/workbenches');
    expect(MOBILE_BOTTOM_NAVIGATION.find((item) => item.key === 'community')?.path).toBe('/community-chat');
  });

  it('拒绝把详情页或任意字符串当成资料根路径', () => {
    expect(isMobileResourcePath('/home')).toBe(true);
    expect(isMobileResourcePath('/noteLibrary')).toBe(true);
    expect(isMobileResourcePath('/cloudSpace')).toBe(true);
    expect(isMobileResourcePath('/manage/tagMg')).toBe(true);
    expect(isMobileResourcePath('/noteLibrary/123')).toBe(false);
    expect(isMobileResourcePath('/search')).toBe(false);
  });

  it('只把资源筛选识别为移动端待整理视图', () => {
    expect(['all', 'bookmark', 'note', 'file'].every(isMobileResourceInboxTab)).toBe(true);
    expect(isMobileResourceInboxTab('todo')).toBe(false);
    expect(isMobileResourceInboxTab(undefined)).toBe(false);
  });

  it('按当前路由绑定顶部动作，并在离开后清理', () => {
    const add = vi.fn();
    const unregister = registerMobileTopBarBinding(['noteLibrary'], {
      searchMode: 'icon',
      showNotification: false,
      onAdd: add,
    });
    try {
      expect(getMobileTopBarBinding('noteLibrary')).toMatchObject({
        searchMode: 'icon',
        showNotification: false,
      });
      getMobileTopBarBinding('noteLibrary')?.onAdd?.();
      expect(add).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
    expect(getMobileTopBarBinding('noteLibrary')).toBeNull();
  });

  it('顶栏绑定不再代理页面局部搜索', () => {
    const unregister = registerMobileTopBarBinding(['cloudSpace'], { onAdd: () => {} });
    try {
      const binding = getMobileTopBarBinding('cloudSpace') as Record<string, unknown> | null;
      // 顶栏只承载全局搜索；页面关键词过滤下沉到各自筛选区，不得再从顶栏取值回填
      ['getSearchValue', 'setSearchValue', 'onSearchInput', 'onSearchEnter', 'searchPlaceholder'].forEach((key) => {
        expect(binding?.[key]).toBeUndefined();
      });
    } finally {
      unregister();
    }
  });
});
