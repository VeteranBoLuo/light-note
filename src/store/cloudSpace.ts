import { defineStore } from 'pinia';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';

export default defineStore('dom', {
  state: () =>
    <
      {
        usedSpace: number;
        maxSpace: number;
        folderList: { name: string; id?: string; isRename?: boolean }[];
        fileList: {
          id: string;
          fileName: string;
          fileSize: number;
          uploadTime: string;
          folderName: string;
          isRename?: boolean;
          fileType: string;
          fileUrl: string;
        }[];
        typeCheckValue: any[];
        folder?: { id: string; name: string };
        searchFileName: string;
        loading: boolean;
        cacheImgArr: any[]; // 记录需要清空缓存的图片，因为图片直接覆盖后地址不变，需要手动记录一下方便浏览器清空老图片缓存
      }
    >{
      usedSpace: 0,
      maxSpace: 1000,
      folderList: [],
      fileList: [],
      typeCheckValue: ['image', 'pdf', 'word', 'excel', 'audio', 'video', 'other'],
      folder: {
        name: '全部文件',
        id: 'all',
      },
      searchFileName: '',
      loading: false,
      cacheImgArr: [],
    },
  getters: {},
  actions: {
    queryFieldList() {
      this.loading = true;
      apiQueryPost('/api/file/queryFiles', {
        filters: {
          fileName: this.searchFileName,
          type: this.typeCheckValue,
          folderId: this.folder?.id ?? 'all',
        },
      })
        .then((res) => {
          this.fileList = res.data;
        })
        .finally(() => {
          this.loading = false;
          this.getUsedSpace();
        });
    },
    getUsedSpace() {
      apiBasePost('/api/file/queryTotalFileSize').then((res) => {
        if (res.status === 200) {
          this.usedSpace = res.data.totalSizeMB;
        }
      });
    },
    queryFolder() {
      apiQueryPost('/api/file/queryFolder').then((res) => {
        if (res.status === 200) {
          this.folderList = res.data.items;
        }
      });
    },
  },
});
