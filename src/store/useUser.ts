import { defineStore } from 'pinia';
import icon from '@/config/icon.ts';

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
  headPicture: string;
  email: string;
  tagTotal: number;
  bookmarkTotal: number;
  noteTotal: number;
  opinionTotal: number;
  location: UserLocation;
  storageUsed: number; // 已使用单位：MB
  preferences: {
    theme: 'day' | 'night' | 'system' | string; // 主题
    noteViewMode: 'card' | 'list'; // 笔记展示模式：卡片/列表
  };
}

interface UserState extends UserInfo {}

// 默认用户状态
const defaultUserState: UserState = {
  id: '',
  userName: '默认用户名',
  alias: '默认昵称',
  password: '',
  role: 'visitor',
  headPicture: icon.navigation.user,
  email: '',
  tagTotal: 0,
  bookmarkTotal: 0,
  noteTotal: 0,
  opinionTotal: 0,
  storageUsed: 0,
  location: {
    province: '',
    city: '',
    rectangle: '',
  },
  preferences: {
    theme: 'day', // 主题
    noteViewMode: 'card', // 笔记展示模式：卡片/列表
  },
};

export default defineStore('user', {
  state: (): UserState => ({ ...defaultUserState }),
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
      Object.assign(this, { ...defaultUserState, ...val });
      if (val.preferences === null) {
        this.preferences = defaultUserState.preferences;
      }
    },
    /**
     * 重置用户信息
     */
    resetUserInfo(): void {
      Object.assign(this, defaultUserState);
      localStorage.setItem('userId', '');
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
