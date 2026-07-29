import { defineStore } from 'pinia';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import { CLOUD_FILE_CATEGORY_ORDER, type CloudFileCategory } from '@/constants/cloudFileCategory.ts';
import i18n from '@/i18n';
import { RESOURCE_LIST_PAGE_SIZE, mergeResourcePage } from '@/utils/resourcePagination';

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
        loadingMore: boolean;
        filePage: number;
        fileTotal: number;
        fileHasMore: boolean;
        fileRequestVersion: number;
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
      loadingMore: false,
      filePage: 0,
      fileTotal: 0,
      fileHasMore: false,
      fileRequestVersion: 0,
      cacheImgArr: [],
      draggingFile: null,
    },
  getters: {},
  actions: {
    async queryFieldList(options: { append?: boolean } = {}) {
      const append = options.append === true;
      if (append && (this.loading || this.loadingMore || !this.fileHasMore)) return false;

      const requestVersion = append ? this.fileRequestVersion : ++this.fileRequestVersion;
      const targetPage = append ? this.filePage + 1 : 1;
      if (append) {
        this.loadingMore = true;
      } else {
        this.loading = true;
        this.loadingMore = false;
        this.filePage = 0;
        this.fileHasMore = false;
      }

      try {
        const res = await apiQueryPost('/api/file/queryFiles', {
          pageSize: RESOURCE_LIST_PAGE_SIZE,
          currentPage: targetPage,
          filters: {
            fileName: this.searchFileName,
            category: this.typeCheckValue,
            folderId: this.folder?.id ?? 'all',
          },
        });
        if (requestVersion !== this.fileRequestVersion) return false;
        // 校验业务码:失败时保留旧列表并兜底为数组,避免 fileList 被置成 undefined 导致模板 .length 抛错。
        if (res?.status !== 200) {
          this.fileList = this.fileList ?? [];
          return false;
        }

        const pageItems = Array.isArray(res.data?.items) ? res.data.items : [];
        this.fileList = append ? mergeResourcePage(this.fileList, pageItems) : pageItems;
        this.filePage = Number(res.data?.page || targetPage);
        this.fileTotal = Number(res.data?.total || 0);
        this.fileHasMore = Boolean(res.data?.hasMore);
        return true;
      } catch (error) {
        console.warn('加载云空间文件失败:', error);
        return false;
      } finally {
        if (requestVersion === this.fileRequestVersion) {
          this.loading = false;
          this.loadingMore = false;
        }
        if (!append) void this.getUsedSpace();
      }
    },
    loadMoreFiles() {
      return this.queryFieldList({ append: true });
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
