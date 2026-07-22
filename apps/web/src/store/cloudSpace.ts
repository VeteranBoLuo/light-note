import { defineStore } from 'pinia';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import { CLOUD_FILE_CATEGORY_ORDER, type CloudFileCategory } from '@/constants/cloudFileCategory.ts';
import i18n from '@/i18n';

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
          folderId?: string;
          category?: CloudFileCategory;
          ext?: string;
          isRename?: boolean;
          fileType: string;
          fileUrl: string;
          tags?: { id: string; name: string }[];
          isPending?: boolean;
        }[];
        typeCheckValue: CloudFileCategory[];
        folder?: { id: string; name: string };
        searchFileName: string;
        loading: boolean;
        cacheImgArr: any[]; // 记录需要清空缓存的图片，因为图片直接覆盖后地址不变，需要手动记录一下方便浏览器清空老图片缓存
        draggingFile: { id: string; folderId?: string } | null;
      }
    >{
      usedSpace: 0,
      maxSpace: 512, // 兜底基础配额(MB);真实配额由后端 /queryTotalFileSize 下发 quotaMB 覆盖(按角色/等级)
      folderList: [],
      fileList: [],
      typeCheckValue: [...CLOUD_FILE_CATEGORY_ORDER],
      folder: {
        // store 在组件外,按项目约定用 i18n.global.t(复用 cloudSpace.allFile 现成键),不再硬编码中文
        name: i18n.global.t('cloudSpace.allFile'),
        id: 'all',
      },
      searchFileName: '',
      loading: false,
      cacheImgArr: [],
      draggingFile: null,
    },
  getters: {},
  actions: {
    queryFieldList() {
      this.loading = true;
      apiQueryPost('/api/file/queryFiles', {
        filters: {
          fileName: this.searchFileName,
          category: this.typeCheckValue,
          folderId: this.folder?.id ?? 'all',
        },
      })
        .then((res) => {
          // 校验业务码:失败时保留旧列表并兜底为数组,避免 fileList 被置成 undefined 导致模板 .length 抛错
          if (res?.status === 200) {
            this.fileList = res.data ?? [];
          } else {
            this.fileList = this.fileList ?? [];
          }
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
          if (res.data.quotaMB) this.maxSpace = res.data.quotaMB;
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
