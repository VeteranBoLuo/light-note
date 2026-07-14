import { defineStore } from 'pinia';
import icon from '@/config/icon.ts';
import bookmarkStore from './bookmark.ts';

// 接口定义
interface UserLocation {
  province: string;
  city: string;
  rectangle: string;
}

interface UserInfo {
  id: string;
  userName: string;
  alias: string;
  password: string;
  role: string;
  adminPreview: boolean;
  visitorWorkspace: boolean;
  headPicture: string;
  email: string;
  tagTotal: number;
  bookmarkTotal: number;
  noteTotal: number;
  opinionTotal: number;
  pendingOpinionTotal: number;
  unreadOpinionReplyTotal: number;
  pendingSecurityTotal: number;
  criticalSecurityTotal: number;
  location: UserLocation;
  storageUsed: number; // 已使用单位：MB
  preferences: {
    theme: 'day' | 'night' | 'system' | string; // 主题
    noteViewMode: 'card' | 'list'; // 笔记展示模式：卡片/列表
    lang?: 'zh-CN' | 'en-US'; // 语言
    homePage?: 'landing' | 'workbench' | 'resourceCenter' | 'bookmark' | 'noteLibrary' | 'cloudSpace'; // 默认首页
    uiScale?: 'small' | 'medium' | 'large'; // 界面缩放(整体风格:小/标准/大,用 zoom 实现)
    resourceView?: 'card' | 'list'; // 资源中心视图
    cloudView?: 'card' | 'table'; // 云空间视图:卡片/表格
    tagView?: 'card' | 'graph'; // 标签详情视图
    tagManageView?: 'card' | 'list'; // 标签管理页视图:卡片/列表
    openBookmarkIn?: 'newTab' | 'current'; // 书签打开方式:新标签页/当前标签页
    hideEmptyTags?: boolean; // 首页标签列表是否隐藏空标签(默认 false=不隐藏)
    resourceSort?: 'relevance' | 'updated' | 'name'; // 资源中心默认排序
    weeklyReport?: boolean; // 每周成长周报推送
    notifyLevelUp?: boolean; // 升级提醒通知推送
    notifyOpinionReply?: boolean; // 反馈回复通知推送
  };
}

interface UserState extends UserInfo {}

// 默认用户状态
const createDefaultUserState = (): UserState => ({
  id: '',
  userName: '默认用户名',
  alias: '默认昵称',
  password: '',
  role: 'visitor',
  adminPreview: false,
  visitorWorkspace: false,
  headPicture: icon.navigation.user,
  email: '',
  tagTotal: 0,
  bookmarkTotal: 0,
  noteTotal: 0,
  opinionTotal: 0,
  pendingOpinionTotal: 0,
  unreadOpinionReplyTotal: 0,
  pendingSecurityTotal: 0,
  criticalSecurityTotal: 0,
  storageUsed: 0,
  location: {
    province: '',
    city: '',
    rectangle: '',
  },
  preferences: {
    theme: 'day', // 主题
    noteViewMode: 'card', // 笔记展示模式：卡片/列表
    lang: 'zh-CN', // 语言
    homePage: 'landing', // 默认首页（未设置时进官网）
    hideEmptyTags: false, // 首页标签列表是否隐藏空标签(默认不隐藏)
  },
});

const normalizePreferences = (preferences: Partial<UserInfo['preferences']> | string | null | undefined) => {
  const defaultPreferences = createDefaultUserState().preferences;
  if (!preferences) {
    return defaultPreferences;
  }
  if (typeof preferences === 'string') {
    try {
      return { ...defaultPreferences, ...JSON.parse(preferences) };
    } catch (e) {
      return defaultPreferences;
    }
  }
  return { ...defaultPreferences, ...preferences };
};

export default defineStore('user', {
  state: (): UserState => createDefaultUserState(),
  getters: {
    /**
     * 获取当前主题
     */
    currentTheme(state): string {
      return state.preferences.theme === 'system'
        ? typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'night'
          : 'day'
        : state.preferences.theme;
    },
    /**
     * 获取图标颜色
     */
    iconColor(state): string {
      const theme = state.preferences.theme;
      if (theme === 'system') {
        return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'white'
          : 'black';
      }
      return theme === 'day' ? 'black' : 'white';
    },
  },
  actions: {
    /**
     * 设置用户信息
     */
    setUserInfo(val: Partial<UserInfo>): void {
      const prevId = this.id;
      const nextUser = { ...createDefaultUserState(), ...val };
      nextUser.preferences = normalizePreferences(val.preferences);
      Object.assign(this, nextUser);
      // 账号发生切换时,作废上一账号的书签/标签缓存,
      // 避免游客浏览后注册自动登录、左侧标签仍显示上一账号(游客)的旧数据。
      if (prevId !== this.id) {
        bookmarkStore().reset();
      }
    },
    /**
     * 重置用户信息
     */
    resetUserInfo(): void {
      Object.assign(this, createDefaultUserState());
      // 登出时一并清空资源缓存,避免下一个账号看到上一个账号残留的标签/书签。
      bookmarkStore().reset();
    },
    /**
     * 获取用户信息（敏感信息除外）
     */
    getUserInfo(): Omit<UserInfo, 'password'> {
      const { password, ...info } = this;
      return info;
    },
  },
});
