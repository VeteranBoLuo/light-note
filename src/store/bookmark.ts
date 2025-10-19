import { defineStore } from 'pinia';
import { TagInterface } from '@/config/bookmarkCfg.ts';
import Viewer from 'viewerjs';

export default defineStore('bookmark', {
  state: () =>
    <
      {
        tagData?: TagInterface;
        tagList?: TagInterface[]; // 标签列表
        bookmarkList?: []; // 书签列表
        noteList?: []; // 笔记列表
        imgList?: any; // 网站图标列表
        refreshKey?: boolean;
        refreshTagKey?: boolean;
        type: 'all' | 'normal' | 'search';
        bookmarkSearch?: any;
        screenWidth: number;
        screenHeight: number;
        isFold?: boolean; // 手机模式下菜单的折叠状态
        theme: 'day' | 'night' | 'system' | string; // 主题
        isShowLogin: boolean; // 是否弹出登录页面
        viewerKey: string;
        bookmarkLoading: boolean;
        viewer: {
          container: Viewer;
          src: string;
          options: Viewer.Options;
        };
        browserId: string; // 浏览器指纹
      }
    >{
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
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
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
    },
  getters: {
    isMobile() {
      return this.screenWidth <= 1000;
    },
    iconColor() {
        let  theme=  this.theme
        if(theme === 'system') {
          return  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'white' : 'black'
        }
        return theme === 'day' ? 'black' : 'white';

    },
    currentTheme() {
      return this.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'night'
          : 'day'
        : this.theme;
    },
  },
  actions: {
    refreshData() {
      this.refreshKey = !this.refreshKey;
    },
    refreshTag() {
      this.refreshTagKey = !this.refreshTagKey;
    },
    refreshViewer(src: string, options?: Viewer.Options) {
      console.log(src);
      this.viewer.src = src;
      this.viewer.options = options;
      this.viewerKey = (Math.random() * 9000000).toString();
    },
    reset() {
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
