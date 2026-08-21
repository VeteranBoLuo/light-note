import { defineStore } from 'pinia';
import icon from '@/config/icon.ts';
import bookmarkStore from './bookmark.ts';
import cloudSpaceStore from './cloudSpace.ts';
import useNoteLibraryCacheStore from './noteLibraryCache.ts';
import { resolveSystemTheme } from '@/utils/systemTheme';

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
  adminContext: {
    id: string;
    subjectUserId: string;
    subjectRole: string;
    subjectAlias: string;
    mode: 'readonly' | 'maintain';
    issuedAt: string;
    expiresAt: string;
    capabilities: string[];
  } | null;
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
    noteSidebarMode?: 'directory' | 'tags'; // 笔记库默认侧栏：目录/标签
    noteDirectEdit?: boolean; // PC 点击已有笔记时是否跳过预览直接编辑
    noteParentOpenMode?: 'children' | 'preview'; // PC 点击父页面时打开子页面目录或预览当前页面
    lang?: 'zh-CN' | 'en-US'; // 语言
    homePage?: 'landing' | 'workbench' | 'resourceCenter' | 'bookmark' | 'noteLibrary' | 'cloudSpace'; // 默认首页
    uiScale?: 'small' | 'medium' | 'large'; // 界面缩放(整体风格:小/标准/大,用 zoom 实现)
    resourceView?: 'card' | 'list'; // 资源中心视图
    todoView?: 'list' | 'agenda' | 'calendar' | 'matrix'; // 待办默认视图
    cloudView?: 'card' | 'table'; // 云空间视图:卡片/表格
    tagView?: 'card' | 'graph'; // 标签详情视图
    tagManageView?: 'card' | 'list'; // 标签管理页视图:卡片/列表
    openBookmarkIn?: 'newTab' | 'current'; // 书签打开方式:新标签页/当前标签页
    hideEmptyTags?: boolean; // 首页标签列表是否隐藏空标签(默认 false=不隐藏)
    resourceSort?: 'relevance' | 'updated' | 'name'; // 资源中心默认排序
    weeklyReport?: boolean; // 每周成长周报推送
    notifyLevelUp?: boolean; // 升级提醒通知推送
    notifyOpinionReply?: boolean; // 反馈回复通知推送
    notifyFeatureRequest?: boolean; // 共建轻笺建议进度通知
    notificationsInApp?: boolean; // 待办等站内通知总开关
    notificationsEmail?: boolean; // 待办等邮件通知总开关
    notificationsBrowser?: boolean; // 前台页面浏览器系统通知
    notificationsDnd?: boolean; // 是否启用免打扰时段
    notificationsDndStart?: string; // 免打扰开始时间，HH:mm
    notificationsDndEnd?: string; // 免打扰结束时间，HH:mm
    notificationsTimezoneOffset?: number; // 保存免打扰设置时的客户端时区偏移（分钟）
    aiEnabled?: boolean; // 是否显示 AI 助手入口
    aiStyle?: 'strict' | 'balanced' | 'creative'; // AI 回答风格
    aiCloudHistory?: boolean; // 是否把新 AI 对话同步到云端
    aiDefaultFullscreen?: boolean; // 桌面端 AI 助手默认是否全屏打开
  };
}

interface UserState extends UserInfo {}

const getResourceIdentityKey = (user: UserInfo) =>
  [
    user.id || '',
    user.role || '',
    user.visitorWorkspace ? 'visitor-workspace' : '',
    user.adminContext?.subjectUserId || '',
    user.adminContext?.mode || '',
  ].join('|');

// 默认用户状态
const createDefaultUserState = (): UserState => ({
  id: '',
  userName: '默认用户名',
  alias: '默认昵称',
  password: '',
  role: 'visitor',
  adminPreview: false,
  visitorWorkspace: false,
  adminContext: null,
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
    noteSidebarMode: 'directory', // 笔记库默认展示目录
    noteDirectEdit: false, // PC 默认先预览已有笔记；移动端始终直接编辑
    noteParentOpenMode: 'children', // 父页面默认进入子页面目录；PC 可改为预览当前页面
    todoView: 'list', // 待办默认视图
    lang: 'zh-CN', // 语言
    hideEmptyTags: false, // 首页标签列表是否隐藏空标签(默认不隐藏)
    notifyFeatureRequest: true,
    notificationsInApp: true,
    notificationsEmail: true,
    notificationsBrowser: false,
    notificationsDnd: false,
    notificationsDndStart: '22:00',
    notificationsDndEnd: '08:00',
    notificationsTimezoneOffset: new Date().getTimezoneOffset(),
    aiEnabled: true,
    aiStyle: 'balanced',
    aiCloudHistory: true,
    aiDefaultFullscreen: false,
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
      // 'system' 的判定统一走 resolveSystemTheme：App 内 prefers-color-scheme 不可信，
      // 必须用原生给的 uiMode 信号（详见 utils/systemTheme.ts）
      return state.preferences.theme === 'system' ? resolveSystemTheme() : state.preferences.theme;
    },
    /**
     * 获取图标颜色
     */
    iconColor(state): string {
      const theme = state.preferences.theme;
      if (theme === 'system') {
        return resolveSystemTheme() === 'night' ? 'white' : 'black';
      }
      return theme === 'day' ? 'black' : 'white';
    },
  },
  actions: {
    /**
     * 设置用户信息
     */
    setUserInfo(val: Partial<UserInfo>): void {
      const previousResourceIdentity = getResourceIdentityKey(this);
      const nextUser = { ...createDefaultUserState(), ...val };
      nextUser.preferences = normalizePreferences(val.preferences);
      Object.assign(this, nextUser);
      // 账号发生切换时,作废上一账号的资源缓存,
      // 避免游客浏览后登录/注册，首帧仍显示游客的书签、文件夹或文件。
      if (previousResourceIdentity !== getResourceIdentityKey(this)) {
        bookmarkStore().reset();
        cloudSpaceStore().reset({ showLoading: true });
        useNoteLibraryCacheStore().reset();
      }
    },
    /**
     * 重置用户信息
     */
    resetUserInfo(): void {
      Object.assign(this, createDefaultUserState());
      // 登出时一并清空资源缓存,避免下一个账号看到上一个账号残留的数据。
      bookmarkStore().reset();
      cloudSpaceStore().reset({ showLoading: true });
      useNoteLibraryCacheStore().reset();
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
