import { defineStore } from 'pinia';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import { CLOUD_FILE_CATEGORY_ORDER, type CloudFileCategory } from '@/constants/cloudFileCategory.ts';
import i18n from '@/i18n';
import { RESOURCE_LIST_PAGE_SIZE, mergeResourcePage } from '@/utils/resourcePagination';
import type { CloudFolderNode } from '@/types/cloudFolder';
import { cloudFolderAncestors, normalizeCloudFolderList } from '@/utils/cloudFolderTree';

export type CloudFileSortField = 'createTime' | 'fileName' | 'fileSize';
export type CloudFileSortOrder = 'asc' | 'desc';
export interface CloudFileSort {
  field: CloudFileSortField;
  order: CloudFileSortOrder;
}

export const CLOUD_FILE_SORT_STORAGE_KEY = 'light-note:cloud-space:file-sort';
const DEFAULT_CLOUD_FILE_SORT: CloudFileSort = { field: 'createTime', order: 'desc' };

function normalizeCloudFileSort(value: Partial<CloudFileSort> | null | undefined): CloudFileSort {
  if (!['createTime', 'fileName', 'fileSize'].includes(String(value?.field))) return { ...DEFAULT_CLOUD_FILE_SORT };
  const field = value?.field as CloudFileSortField;
  return { field, order: value?.order === 'asc' ? 'asc' : 'desc' };
}

function loadCloudFileSort(): CloudFileSort {
  if (typeof window === 'undefined') return { ...DEFAULT_CLOUD_FILE_SORT };
  try {
    return normalizeCloudFileSort(JSON.parse(window.localStorage.getItem(CLOUD_FILE_SORT_STORAGE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_CLOUD_FILE_SORT };
  }
}

function saveCloudFileSort(sort: CloudFileSort) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLOUD_FILE_SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {
    // 无痕模式或存储被禁用时仍保留当前会话内排序，不影响文件查询。
  }
}

export default defineStore('dom', {
  state: () =>
    <
      {
        usedSpace: number;
        activeSpace: number;
        trashSpace: number;
        maxSpace: number;
        sharedWithTrash: boolean;
        folderList: CloudFolderNode[];
        allFileCount: number;
        folderMaxDepth: number;
        expandedFolderIds: string[];
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
        folderLoading: boolean;
        loadingMore: boolean;
        filePage: number;
        fileTotal: number;
        fileHasMore: boolean;
        fileRequestVersion: number;
        fileSort: CloudFileSort;
        folderRequestVersion: number;
        usedSpaceRequestVersion: number;
        cacheImgArr: any[]; // 记录需要清空缓存的图片，因为图片直接覆盖后地址不变，需要手动记录一下方便浏览器清空老图片缓存
        draggingFile: { id: string; folderId?: string } | null;
      }
    >{
      usedSpace: 0,
      activeSpace: 0,
      trashSpace: 0,
      maxSpace: 1024, // 兜底为 Lv.1 1GB；真实配额由后端按角色、等级与永久扩容权益覆盖
      sharedWithTrash: true,
      folderList: [],
      allFileCount: 0,
      folderMaxDepth: 8,
      expandedFolderIds: [],
      fileList: [],
      typeCheckValue: [...CLOUD_FILE_CATEGORY_ORDER],
      folder: {
        // store 在组件外,按项目约定用 i18n.global.t(复用 cloudSpace.allFile 现成键),不再硬编码中文
        name: i18n.global.t('cloudSpace.allFile'),
        id: 'all',
      },
      searchFileName: '',
      loading: false,
      folderLoading: false,
      loadingMore: false,
      filePage: 0,
      fileTotal: 0,
      fileHasMore: false,
      fileRequestVersion: 0,
      fileSort: loadCloudFileSort(),
      folderRequestVersion: 0,
      usedSpaceRequestVersion: 0,
      cacheImgArr: [],
      draggingFile: null,
    },
  getters: {},
  actions: {
    /**
     * 拉取当前文件夹/筛选下的文件。
     *
     * silent 供下拉刷新使用：不进 loading，页面保留旧文件列表（骨架屏由 loading 驱动），
     * 顶部指示器负责表达进度。失败时同样保留旧列表，不清空。
     */
    async queryFieldList(options: { append?: boolean; silent?: boolean } = {}) {
      const append = options.append === true;
      const silent = options.silent === true;
      if (append && (this.loading || this.loadingMore || !this.fileHasMore)) return false;

      const requestVersion = append ? this.fileRequestVersion : ++this.fileRequestVersion;
      const targetPage = append ? this.filePage + 1 : 1;
      if (append) {
        this.loadingMore = true;
      } else if (silent) {
        // 只重置分页游标：翻页状态必须回到第一页，但列表与 loading 都不动
        this.loadingMore = false;
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
          sort: this.fileSort,
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
    async refreshAfterFileMutation() {
      const [filesOk, foldersOk] = await Promise.all([this.queryFieldList(), this.queryFolder()]);
      return filesOk && foldersOk;
    },
    setFileSortValue(sort: CloudFileSort) {
      const nextSort = normalizeCloudFileSort(sort);
      if (this.fileSort.field === nextSort.field && this.fileSort.order === nextSort.order) {
        return Promise.resolve(true);
      }
      this.fileSort = nextSort;
      saveCloudFileSort(this.fileSort);
      return this.queryFieldList();
    },
    setFileSort(field: Exclude<CloudFileSortField, 'createTime'>) {
      const defaultOrder: CloudFileSortOrder = field === 'fileName' ? 'asc' : 'desc';
      const nextSort: CloudFileSort =
        this.fileSort.field === field
          ? { field, order: this.fileSort.order === 'asc' ? 'desc' : 'asc' }
          : { field, order: defaultOrder };
      return this.setFileSortValue(nextSort);
    },
    /**
     * 空间用量。返回是否成功,供下拉刷新判断「部分数据刷新失败」。
     * 失败时保留上一次的用量,不写成 0 —— 那会让用户以为空间被清空了。
     */
    async getUsedSpace() {
      const requestVersion = ++this.usedSpaceRequestVersion;
      try {
        const res = await apiBasePost('/api/file/queryTotalFileSize');
        if (requestVersion !== this.usedSpaceRequestVersion) return false;
        if (res?.status !== 200) return false;
        this.usedSpace = Number(res.data.totalSizeMB || 0);
        this.activeSpace = Number(res.data.activeSizeMB ?? res.data.totalSizeMB ?? 0);
        this.trashSpace = Number(res.data.trashSizeMB || 0);
        this.sharedWithTrash = res.data.sharedWithTrash !== false;
        if (res.data.quotaMB) this.maxSpace = res.data.quotaMB;
        return true;
      } catch (error) {
        console.warn('加载云空间用量失败:', error);
        return false;
      }
    },
    /**
     * 文件夹列表。返回是否成功,理由同上:失败保留旧文件夹,不清空成空列表。
     */
    async queryFolder() {
      const requestVersion = ++this.folderRequestVersion;
      if (!this.folderList.length) this.folderLoading = true;
      try {
        const res = await apiBasePost('/api/file/queryFolder', { treeVersion: 2 });
        if (requestVersion !== this.folderRequestVersion) return false;
        if (res?.status !== 200) return false;
        const folders = normalizeCloudFolderList(res.data?.items);
        this.folderList = folders;
        this.allFileCount = Math.max(0, Number(res.data?.allFileCount || 0));
        const maxDepth = Number(res.data?.maxDepth);
        if (Number.isInteger(maxDepth) && maxDepth > 0) this.folderMaxDepth = maxDepth;
        if (this.folder?.id && this.folder.id !== 'all') {
          const current = folders.find((folder) => folder.id === String(this.folder?.id));
          if (current) {
            this.folder = { id: current.id, name: current.name };
            this.expandFolderAncestors(current.id);
          }
        }
        return true;
      } catch (error) {
        console.warn('加载云空间文件夹失败:', error);
        return false;
      } finally {
        if (requestVersion === this.folderRequestVersion) this.folderLoading = false;
      }
    },
    setFolderExpanded(folderId: string, expanded: boolean) {
      const id = String(folderId || '').trim();
      if (!id) return;
      const next = new Set(this.expandedFolderIds);
      if (expanded) next.add(id);
      else next.delete(id);
      this.expandedFolderIds = [...next];
    },
    toggleFolderExpanded(folderId: string) {
      const id = String(folderId || '').trim();
      if (!id) return;
      this.setFolderExpanded(id, !this.expandedFolderIds.includes(id));
    },
    expandFolderAncestors(folderId: string) {
      const next = new Set(this.expandedFolderIds);
      for (const folder of cloudFolderAncestors(this.folderList, folderId)) {
        if (folder.id !== String(folderId)) next.add(folder.id);
      }
      this.expandedFolderIds = [...next];
    },
    /**
     * 账号身份变化时清空所有账号归属数据，并递增请求版本使旧身份的在途响应失效。
     * showLoading 用于登录/登出切换：如果云空间仍在当前视图，立即显示加载态而不是空状态。
     */
    reset(options: { showLoading?: boolean } = {}) {
      this.fileRequestVersion += 1;
      this.folderRequestVersion += 1;
      this.usedSpaceRequestVersion += 1;
      this.usedSpace = 0;
      this.activeSpace = 0;
      this.trashSpace = 0;
      this.maxSpace = 1024;
      this.sharedWithTrash = true;
      this.folderList = [];
      this.allFileCount = 0;
      this.folderMaxDepth = 8;
      this.expandedFolderIds = [];
      this.fileList = [];
      this.typeCheckValue = [...CLOUD_FILE_CATEGORY_ORDER];
      this.folder = {
        name: i18n.global.t('cloudSpace.allFile'),
        id: 'all',
      };
      this.searchFileName = '';
      this.loading = options.showLoading === true;
      this.folderLoading = options.showLoading === true;
      this.loadingMore = false;
      this.filePage = 0;
      this.fileTotal = 0;
      this.fileHasMore = false;
      this.cacheImgArr = [];
      this.draggingFile = null;
    },
  },
});
