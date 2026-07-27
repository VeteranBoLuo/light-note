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
  it('只把三个资料列表路由归入顶部资料切换', () => {
    expect(getMobileResourcePath('home')).toBe('/home');
    expect(getMobileResourcePath('home:id')).toBe('/home');
    expect(getMobileResourcePath('home:search')).toBe('/home');
    expect(getMobileResourcePath('noteLibrary')).toBe('/noteLibrary');
    expect(getMobileResourcePath('cloudSpace')).toBe('/cloudSpace');
    expect(getMobileResourcePath('noteDetail')).toBeNull();
    expect(getMobileResourcePath('personCenter')).toBeNull();
  });

  it('保持资料切换与底部主导航的固定顺序', () => {
    expect(MOBILE_RESOURCE_NAVIGATION.map((item) => item.key)).toEqual(['bookmark', 'note', 'cloud']);
    expect(MOBILE_BOTTOM_NAVIGATION.map((item) => item.key)).toEqual(['resources', 'todo', 'ai', 'search', 'profile']);
  });

  it('拒绝把详情页或任意字符串当成资料根路径', () => {
    expect(isMobileResourcePath('/home')).toBe(true);
    expect(isMobileResourcePath('/noteLibrary')).toBe(true);
    expect(isMobileResourcePath('/cloudSpace')).toBe(true);
    expect(isMobileResourcePath('/noteLibrary/123')).toBe(false);
    expect(isMobileResourcePath('/search')).toBe(false);
  });

  it('只把资源筛选识别为移动端待整理视图', () => {
    expect(['all', 'bookmark', 'note', 'file'].every(isMobileResourceInboxTab)).toBe(true);
    expect(isMobileResourceInboxTab('todo')).toBe(false);
    expect(isMobileResourceInboxTab(undefined)).toBe(false);
  });

  it('按当前路由绑定顶部搜索和新增动作，并在离开后清理', () => {
    const add = vi.fn();
    const unregister = registerMobileTopBarBinding(['noteLibrary'], {
      showSearch: false,
      showMoreMenu: false,
      getSearchValue: () => '方案',
      onAdd: add,
    });
    try {
      expect(getMobileTopBarBinding('noteLibrary')).toMatchObject({
        showSearch: false,
        showMoreMenu: false,
      });
      expect(getMobileTopBarBinding('noteLibrary')?.getSearchValue?.()).toBe('方案');
      getMobileTopBarBinding('noteLibrary')?.onAdd?.();
      expect(add).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
    expect(getMobileTopBarBinding('noteLibrary')).toBeNull();
  });
});
