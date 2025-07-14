import { defineStore } from 'pinia';
import icon from '@/config/icon.ts';

export default defineStore('user', {
  state: () => ({
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
    location: {
      province: '',
      city: '',
      rectangle: '',
    },
  }),
  actions: {
    setUserInfo(val) {
      this.id = val.id ?? '';
      this.userName = val.userName ?? '默认用户名';
      this.alias = val.alias ?? '默认昵称';
      this.password = val.password ?? '';
      this.role = val.role ?? 'visitor';
      this.headPicture = val.headPicture ?? icon.navigation.user;
      this.email = val.email ?? '';
      this.tagTotal = val.tagTotal ?? 0;
      this.bookmarkTotal = val.bookmarkTotal ?? 0;
      this.noteTotal = val.noteTotal ?? 0;
      this.opinionTotal = val.opinionTotal ?? 0;
      this.location = val.location ?? {
        province: '',
        city: '',
        rectangle: '',
      };
    },
    resetUserInfo() {
      this.id = '';
      this.userName = '默认用户名';
      this.alias = '默认昵称';
      this.password = '';
      this.role = 'visitor';
      this.headPicture = icon.navigation.user;
      this.email = '';
      this.tagTotal = 0;
      this.bookmarkTotal = 0;
      localStorage.setItem('userId', '');
    },
    getUserInfo() {
      return {
        id: this.id,
        userName: this.userName,
        alias: this.alias,
        password: this.password,
        role: this.role,
        headPicture: this.headPicture,
      };
    },
  },
});
