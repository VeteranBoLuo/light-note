import { defineStore } from 'pinia';
import { TagInterface } from '@/config/bookmarkCfg.ts';
import Viewer from 'viewerjs';

const VIEWPORT_BREAKPOINTS = {
  mobile: 768,
  desktop: 1200,
} as const;

// 接口定义
interface BookmarkState {
  tagData: Partial<TagInterface>;
  tagList: TagInterface[];
  bookmarkList: any[];
  noteList: any[];
  imgList: any[];
  refreshKey: boolean;
  refreshTagKey: boolean;
  type: 'all' | 'normal' | 'search';
  bookmarkSearch: string;
  screenWidth: number;
  screenHeight: number;
  isFold: boolean;
  theme: 'day' | 'night' | 'system' | string;
  isShowLogin: boolean;
  authModalTab: '登录' | '注册' | '重置';
  viewerKey: string;
  bookmarkLoading: boolean;
  viewer: {
    container?: Viewer;
    src: string;
    options: Viewer.Options;
  };
  browserId: string;
}

export default defineStore('bookmark', {
  state: () => ({
    tagData: {
      relatedTagList: [], // 当前选中标签详情
    },
    tagList: [], // 标签列表
    bookmarkList: [], // 书签列表
    noteList: [],
    imgList: [],
    refreshKey: false,
    refreshTagKey: false,
    type: 'all',
    bookmarkSearch: '',
    screenWidth: typeof window !== 'undefined' ? window.innerWidth : 1920, // SSR 安全
    screenHeight: typeof window !== 'undefined' ? window.innerHeight : 1080,
    isFold: true,
    theme: 'day',
    isShowLogin: false,
    authModalTab: '登录' as '登录' | '注册' | '重置',
    viewerKey: '',
    bookmarkLoading: false,
    tagLoading: false,
    viewer: {
      src: '',
      options: {},
    },
    browserId: '',
  }),
  getters: {
    /**
     * 判断当前布局类型。
     * 这里按视口宽度分层，而不是按设备 UA 判断；适配逻辑本质上应该跟可用空间走。
     */
    deviceType(): 'mobile' | 'tablet' | 'desktop' {
      const width = this.screenWidth;

      if (width < VIEWPORT_BREAKPOINTS.mobile) {
        return 'mobile';
      }
      if (width < VIEWPORT_BREAKPOINTS.desktop) {
        return 'tablet';
      }
      return 'desktop';
    },

    /**
     * 判断是否为手机布局
     */
    isMobile(): boolean {
      return this.deviceType === 'mobile';
    },

    /**
     * 判断是否为平板/中等宽度布局
     */
    isTablet(): boolean {
      return this.deviceType === 'tablet';
    },

    /**
     * 判断是否为桌面布局
     */
    isDesktop(): boolean {
      return this.deviceType === 'desktop';
    },

    /**
     * 判断是否为窄屏布局（包含手机和平板宽度）
     */
    isMobileDevice(): boolean {
      return this.isMobile || this.isTablet;
    },

    /**
     * 判断当前主要输入方式是否偏触摸。
     * 交互能力与布局宽度分开判断，避免把 iPad、折叠屏、桌面窄窗口混为一类。
     */
    isTouchDevice(): boolean {
      return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    },

    /**
     *  判断当前语言
     */
    locale(): string {
      return localStorage.getItem('lang') || 'zh-CN';
    },
  },
  actions: {
    /**
     * 刷新数据
     */
    refreshData(): void {
      this.refreshKey = !this.refreshKey;
    },
    /**
     * 刷新标签
     */
    refreshTag(): void {
      this.refreshTagKey = !this.refreshTagKey;
    },
    /**
     * 刷新查看器
     */
    refreshViewer(src: string, options?: Viewer.Options): void {
      this.viewer.src = src;
      this.viewer.options = options || {};
      this.viewerKey = Math.random().toString(36).substr(2, 9); // 生成随机键
    },
    /**
     * 重置状态
     */
    reset(): void {
      this.tagData = {
        relatedTagList: [],
      };
      this.tagList = [];
      this.bookmarkList = [];
      this.refreshKey = false;
      this.refreshTagKey = false;
      this.type = 'all';
      this.bookmarkSearch = '';
      this.isShowLogin = false;
    },
    /**
     * 打开登录/注册弹窗，并指定初始展示的标签页（默认登录）
     */
    openAuthModal(tab: '登录' | '注册' | '重置' = '登录'): void {
      this.authModalTab = tab;
      this.isShowLogin = true;
    },
  },
});
