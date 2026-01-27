import { defineStore } from 'pinia';
import { TagInterface } from '@/config/bookmarkCfg.ts';
import Viewer from 'viewerjs';

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
    viewerKey: '',
    bookmarkLoading: false,
    viewer: {
      src: '',
      options: {},
    },
    browserId: '',
  }),
  getters: {
    /**
     * 判断设备类型
     */
    deviceType(): 'mobile' | 'tablet' | 'desktop' {
      if (typeof window === 'undefined') return 'desktop'; // SSR 默认桌面

      const userAgent = navigator.userAgent.toLowerCase();
      const width = this.screenWidth;

      // 移动设备检测
      const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      const isTablet = /ipad|android|tablet|silk|kindle/i.test(userAgent) && !/mobile/i.test(userAgent);

      // 根据宽度和设备特征综合判断
      if (width <= 768 || (isMobile && width < 1024)) {
        return 'mobile';
      } else if ((width > 768 && width <= 1024) || isTablet) {
        return 'tablet';
      } else {
        return 'desktop';
      }
    },

    /**
     * 判断是否为移动设备（手机）
     */
    isMobile(): boolean {
      return this.deviceType === 'mobile';
    },

    /**
     * 判断是否为平板设备
     */
    isTablet(): boolean {
      return this.deviceType === 'tablet';
    },

    /**
     * 判断是否为桌面设备
     */
    isDesktop(): boolean {
      return this.deviceType === 'desktop';
    },

    /**
     * 判断是否为移动端（包含手机和平板）
     */
    isMobileDevice(): boolean {
      return this.isMobile || this.isTablet;
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
  },
});
