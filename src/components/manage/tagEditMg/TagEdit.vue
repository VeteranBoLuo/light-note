<template>
  <div class="tag-edit-container">
    <b-loading :loading="loading">
      <div class="tag-edit-body">
        <div class="base-card">
          <div class="tag-attr-item">
            <span class="tag-attr-label">{{ $t('tagManage.tagName') }}</span>
            <b-input v-model:value="tag.name" />
          </div>
          <div class="tag-attr-item" style="position: relative">
            <div class="tag-attr-head">
              <div class="tag-label-with-preview">
                <span class="tag-attr-label">{{ $t('tagManage.icon') }}</span>
                <span class="icon-preview-box" :class="{ empty: !iconPreviewSrc }">
                  <svg-icon v-if="iconPreviewSrc" :src="iconPreviewSrc" size="18" />
                  <svg-icon v-else :src="icon.nullImg" size="16" />
                </span>
              </div>
              <a-tooltip :title="$t('tagManage.generateIconDesc')">
                <button
                  type="button"
                  class="generate-icon-action"
                  @click="generateTagIcon"
                  :class="{ loading: generatingIcon }"
                >
                  <svg-icon :src="icon.common.magicWand" :title="$t('tagManage.generateIconTitle')" />
                  <span>{{ $t('tagManage.generateIconTitle') }}</span>
                </button>
              </a-tooltip>
            </div>
            <b-input v-model:value="tag.iconUrl" :placeholder="$t('tagManage.iconPlaceholder')">
              <template #prefix>
                <svg-icon
                  title="获取图标"
                  :src="icon.file_down"
                  class="dom-hover-click"
                  size="20"
                  color="#5c82ff"
                  style="height: 32px"
                  @click.stop="downTagImg"
                  v-click-log="OPERATION_LOG_MAP.tagDetail.viewCopyTip"
                />
              </template>
              <template #suffix>
                <svg-icon
                  title="上传图标"
                  :src="icon.file_upload"
                  class="dom-hover-click"
                  size="20"
                  style="height: 32px"
                  v-click-log="OPERATION_LOG_MAP.tagDetail.uploadIcon"
                  @click.stop="uploadTagImg"
                />
              </template>
            </b-input>
          </div>
          <div class="tag-attr-item">
            <span class="tag-attr-label">{{ $t('tagManage.relatedTag') }}</span>
            <a-select
              v-model:value="tag.relatedTagIds"
              mode="multiple"
              show-search
              :max-tag-count="4"
              :options="tagOptions"
              :filter-option="SelectionSearch"
            />
          </div>
        </div>

        <div class="summary-grid">
          <div
            v-for="card in sectionCards"
            :key="card.type"
            class="summary-card"
            :style="{ '--section-color': card.color }"
          >
            <div class="summary-label">{{ card.label }}</div>
            <div class="summary-value">{{ card.count }}</div>
          </div>
        </div>

        <div class="resource-panel">
          <div
            v-for="section in resourceSections"
            :key="section.type"
            class="resource-section"
            :style="{ '--section-color': section.color }"
          >
            <div class="section-header">
              <div class="section-title-wrap">
                <span class="section-dot"></span>
                <span class="section-title">{{ section.label }}</span>
                <span class="section-count">{{ section.selectedCount }}/{{ section.items.length }}</span>
              </div>
              <b-input
                v-model:value="searchMap[section.type]"
                class="section-search"
                :placeholder="$t('placeholder.searchPlaceholder')"
              />
            </div>
            <div class="resource-grid">
              <label
                v-for="item in section.filteredItems"
                :key="`${section.type}-${item.rawId}`"
                class="resource-card"
                :class="{ active: section.selectedIds.includes(item.rawId) }"
              >
                <a-checkbox
                  :checked="section.selectedIds.includes(item.rawId)"
                  @change="toggleResource(section.type, item.rawId, $event.target.checked)"
                />
                <div class="resource-info">
                  <div class="resource-name text-hidden">{{ item.name }}</div>
                  <div class="resource-meta">{{ section.label }}</div>
                </div>
              </label>
              <div v-if="!section.filteredItems.length" class="resource-empty">
                {{ $t('tagManage.listEmptyText') }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </b-loading>

    <div class="edit-tag-footer">
      <div class="footer-summary">
        <div class="footer-summary-text">
          <span class="footer-title">{{ handleType === 'add' ? '新建标签' : '编辑标签' }}</span>
          <span class="footer-desc">已关联 {{ totalSelectedCount }} 项内容</span>
        </div>
        <div class="footer-summary-chips">
          <span
            v-for="card in sectionCards"
            :key="`footer-${card.type}`"
            class="footer-chip"
            :style="{ '--section-color': card.color }"
          >
            <span class="footer-chip-dot"></span>
            <span>{{ card.label }}</span>
            <strong>{{ card.count }}</strong>
          </span>
        </div>
      </div>
      <b-space class="footer-actions">
        <b-button @click="$router.back()">返回</b-button>
        <b-button type="primary" @click="submit">确定</b-button>
      </b-space>
    </div>

    <b-modal
      :esc-closable="false"
      title="图标复制示例"
      v-model:visible="tagImgTipsVisible"
      :show-footer="false"
      top="50%"
    >
      <div>
        <p>1、点击<a href="https://icon-sets.iconify.design/" target="_blank">此链接</a>跳转至图标网搜索想的图标</p>
        <p>2、根据下方图片示例复制图标代码</p>
        <img @click="bookmark.refreshViewer(iconifyImg)" :src="iconifyImg" width="1152" height="552" />
        <p>3、将图标代码粘贴至图标输入框</p>
        <img src="../../../assets/img/iconify教程2.jpg" />
      </div>
    </b-modal>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref } from 'vue';
  import { TagInterface } from '@/config/bookmarkCfg.ts';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { useRouter } from 'vue-router';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import { message } from 'ant-design-vue';
  import { SelectionSearch } from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import iconifyImg from '@/assets/img/iconify教程.jpg';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { RESOURCE_COLOR_HEX, type ResourceType } from '@/config/resourceColor.ts';
  import { CLOUD_FILE_CATEGORY_ORDER } from '@/constants/cloudFileCategory.ts';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';

  type ResourceItem = { rawId: string; name: string; type: ResourceType };

  const router = useRouter();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const { t } = useI18n();
  const loading = ref(false);
  const tagImgTipsVisible = ref(false);
  const generatingIcon = ref(false);

  const tag = ref<TagInterface>({
    id: '',
    name: '',
    iconUrl: '',
    color: '',
    createTime: '',
    updateTime: '',
    bookmarkList: [],
    noteList: [],
    fileList: [],
  });

  const allResources = ref<ResourceItem[]>([]);
  const selectedBookmarkIds = ref<string[]>([]);
  const selectedNoteIds = ref<string[]>([]);
  const selectedFileIds = ref<string[]>([]);
  const tagOptions = ref<{ label: string; value: string }[]>([]);
  const searchMap = reactive<Record<'bookmark' | 'note' | 'file', string>>({
    bookmark: '',
    note: '',
    file: '',
  });

  const iconPreviewSrc = computed(() => {
    const raw = String(tag.value.iconUrl || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:image/')) return raw;
    if (raw.includes('<svg')) return raw;
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 64) {
      return `data:image/svg+xml;base64,${raw}`;
    }
    return raw;
  });

  function normalizeIconUrl(input: string) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:image/')) return raw;
    if (raw.includes('<svg')) return raw;
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 64) {
      return `data:image/svg+xml;base64,${raw}`;
    }
    return raw;
  }

  const handleType = computed(() => (router.currentRoute.value.params.id === 'add' ? 'add' : 'edit'));

  const sectionCards = computed(() => [
    {
      type: 'bookmark',
      label: '书签',
      count: selectedBookmarkIds.value.length,
      color: RESOURCE_COLOR_HEX.bookmark,
    },
    {
      type: 'note',
      label: '笔记',
      count: selectedNoteIds.value.length,
      color: RESOURCE_COLOR_HEX.note,
    },
    {
      type: 'file',
      label: '文件',
      count: selectedFileIds.value.length,
      color: RESOURCE_COLOR_HEX.file,
    },
  ]);

  const totalSelectedCount = computed(
    () => selectedBookmarkIds.value.length + selectedNoteIds.value.length + selectedFileIds.value.length,
  );

  function getResourceItems(type: 'bookmark' | 'note' | 'file') {
    return allResources.value.filter((item) => item.type === type);
  }

  function filterItems(type: 'bookmark' | 'note' | 'file') {
    const keyword = String(searchMap[type] || '')
      .trim()
      .toLowerCase();
    const items = getResourceItems(type);
    if (!keyword) return items;
    return items.filter((item) => item.name.toLowerCase().includes(keyword));
  }

  const resourceSections = computed(() => [
    {
      type: 'bookmark' as const,
      label: '书签',
      color: RESOURCE_COLOR_HEX.bookmark,
      items: getResourceItems('bookmark'),
      filteredItems: filterItems('bookmark'),
      selectedIds: selectedBookmarkIds.value,
      selectedCount: selectedBookmarkIds.value.length,
    },
    {
      type: 'note' as const,
      label: '笔记',
      color: RESOURCE_COLOR_HEX.note,
      items: getResourceItems('note'),
      filteredItems: filterItems('note'),
      selectedIds: selectedNoteIds.value,
      selectedCount: selectedNoteIds.value.length,
    },
    {
      type: 'file' as const,
      label: '文件',
      color: RESOURCE_COLOR_HEX.file,
      items: getResourceItems('file'),
      filteredItems: filterItems('file'),
      selectedIds: selectedFileIds.value,
      selectedCount: selectedFileIds.value.length,
    },
  ]);

  function toggleResource(type: 'bookmark' | 'note' | 'file', id: string, checked: boolean) {
    const map = {
      bookmark: selectedBookmarkIds,
      note: selectedNoteIds,
      file: selectedFileIds,
    };
    const target = map[type].value;
    if (checked) {
      if (!target.includes(id)) target.push(id);
      return;
    }
    map[type].value = target.filter((item) => item !== id);
  }

  async function getAllResources() {
    const [bookmarkRes, noteRes, fileRes] = await Promise.all([
      apiQueryPost('/api/bookmark/getBookmarkList', {
        filters: { userId: localStorage.getItem('userId'), type: 'all' },
      }),
      apiBasePost('/api/note/queryNoteList'),
      apiBasePost('/api/file/queryFiles', { filters: { category: CLOUD_FILE_CATEGORY_ORDER } }),
    ]);

    const resources: ResourceItem[] = [];
    if (bookmarkRes.status === 200) {
      bookmarkRes.data.items.forEach((item: any) => {
        resources.push({ rawId: String(item.id), name: item.name, type: 'bookmark' });
      });
    }
    if (noteRes.status === 200) {
      (noteRes.data ?? []).forEach((item: any) => {
        resources.push({ rawId: String(item.id), name: item.title || '未命名笔记', type: 'note' });
      });
    }
    if (fileRes.status === 200) {
      (fileRes.data ?? []).forEach((item: any) => {
        resources.push({ rawId: String(item.id), name: item.fileName, type: 'file' });
      });
    }
    allResources.value = resources;
  }

  async function getTagSelect() {
    const res = await apiQueryPost('/api/bookmark/queryTagList', {
      filters: { userId: user.id },
    });
    if (res.status === 200) {
      bookmark.tagList = res.data;
      tagOptions.value = (res.data || [])
        .filter((item: any) => item.id !== router.currentRoute.value.params.id)
        .map((item: any) => ({ label: item.name, value: item.id }));
    }
  }

  function downTagImg() {
    tagImgTipsVisible.value = true;
  }

  function uploadTagImg() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', function (event: any) {
      const file = event.target.files[0];
      if (!file) return;
      const maxFileSize = 5 * 1024;
      if (file.size > maxFileSize) {
        message.warning('自定义的图标大小不能超过5KB');
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        tag.value.iconUrl = String(e.target?.result || '');
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  async function generateTagIcon() {
    if (!tag.value.name?.trim()) {
      message.warning(t('tagManage.generateIconNeedName'));
      return;
    }
    generatingIcon.value = true;
    try {
      const res = await apiBasePost('/api/chat/generateTagIcon', {
        tagName: tag.value.name.trim(),
      });
      const iconUrl = String(res?.data?.iconUrl || '');
      if (!iconUrl) {
        message.warning(t('tagManage.generateIconInvalid'));
        return;
      }
      tag.value.iconUrl = iconUrl;
      recordOperation({ module: '标签详情', operation: `生成标签图标成功【${tag.value.name.trim()}】` });
      message.success(t('tagManage.generateIconSuccess'));
    } catch (error) {
      console.error('generate tag icon failed', error);
      message.error(t('tagManage.generateIconFailed'));
    } finally {
      generatingIcon.value = false;
    }
  }

  async function submit() {
    if (loading.value) {
      message.warning('请等待数据请求完毕');
      return;
    }
    tag.value.iconUrl = normalizeIconUrl(tag.value.iconUrl);
    tag.value.bookmarkList = selectedBookmarkIds.value;
    tag.value.noteList = selectedNoteIds.value;
    tag.value.fileList = selectedFileIds.value;
    const url = handleType.value === 'add' ? '/api/bookmark/addTag' : '/api/bookmark/updateTag';
    const res = await apiBasePost(url, tag.value);
    if (res.status === 200) {
      recordOperation({
        module: '标签详情',
        operation: `${handleType.value === 'add' ? '新增' : '保存'}标签成功【${tag.value.name}】`,
      });
      message.success('保存成功');
      router.back();
    }
  }

  onMounted(async () => {
    loading.value = true;
    try {
      await Promise.all([getAllResources(), getTagSelect()]);
      if (handleType.value === 'add') return;

      const res = await apiQueryPost('/api/bookmark/getTagDetail', {
        filters: { id: router.currentRoute.value.params?.id },
      });
      tag.value = res.data;

      const [bookmarkListRes, noteListRes, fileListRes, relatedRes] = await Promise.all([
        apiQueryPost('/api/bookmark/getBookmarkList', {
          filters: { userId: user.id, tagId: tag.value.id, type: 'normal' },
        }),
        apiBasePost('/api/note/queryNoteList', { tagId: tag.value.id }),
        apiBasePost('/api/file/queryFiles', { filters: { tagId: tag.value.id, category: CLOUD_FILE_CATEGORY_ORDER } }),
        apiQueryPost('/api/bookmark/getRelatedTag', {
          filters: { userId: user.id, id: tag.value.id },
        }),
      ]);

      selectedBookmarkIds.value = (bookmarkListRes.data.items || []).map((item: any) => String(item.id));
      selectedNoteIds.value = (noteListRes.data || []).map((item: any) => String(item.id));
      selectedFileIds.value = (fileListRes.data || []).map((item: any) => String(item.id));
      tag.value.relatedTagIds = (relatedRes.data || []).map((item: any) => item.id);
    } finally {
      loading.value = false;
    }
  });
</script>

<style lang="less" scoped>
  .tag-edit-container {
    height: calc(100vh - 76px);
    width: 100%;
    padding: 20px 20px 220px;
    box-sizing: border-box;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .tag-edit-body {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .base-card,
  .resource-section,
  .summary-card {
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    border-radius: 8px;
  }

  .base-card {
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .tag-attr-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .tag-attr-label {
    font-size: 13px;
    color: var(--desc-color);
  }

  .tag-attr-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .tag-label-with-preview {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .icon-preview-box {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    &.empty {
      opacity: 0.6;
    }
  }

  .generate-icon-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid color-mix(in srgb, var(--resource-tag-color) 26%, var(--card-border-color));
    background: color-mix(in srgb, var(--resource-tag-color) 8%, var(--background-color));
    color: var(--resource-tag-color);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    transition:
      transform 0.2s ease,
      border-color 0.2s ease,
      background-color 0.2s ease;

    &:hover {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--resource-tag-color) 44%, var(--card-border-color));
      background: color-mix(in srgb, var(--resource-tag-color) 12%, var(--background-color));
    }

    &.loading {
      opacity: 0.72;
      cursor: wait;
    }
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-card {
    padding: 14px 16px;
    border-top: 3px solid var(--section-color);
  }

  .summary-label {
    font-size: 13px;
    color: var(--desc-color);
  }

  .summary-value {
    font-size: 26px;
    font-weight: 600;
    margin-top: 6px;
    color: var(--text-color);
  }

  .resource-panel {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    padding-bottom: 48px;
  }

  .resource-section {
    padding: 14px;
  }

  .resource-section:last-child {
    margin-bottom: 72px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .section-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--section-color);
  }

  .section-title {
    font-weight: 600;
  }

  .section-count {
    font-size: 12px;
    color: var(--desc-color);
  }

  .section-search {
    width: 240px;
  }

  .resource-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
    max-height: 260px;
    overflow: auto;
  }

  .resource-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--card-border-color);
    cursor: pointer;
    min-width: 0;
  }

  .resource-card.active {
    border-color: var(--section-color);
    background: color-mix(in srgb, var(--section-color) 8%, var(--background-color));
  }

  .resource-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .resource-meta {
    font-size: 12px;
    color: var(--desc-color);
  }

  .resource-empty {
    color: var(--desc-color);
    font-size: 13px;
    padding: 8px 0;
  }

  .edit-tag-footer {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    width: min(1180px, calc(100vw - 40px));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    background: color-mix(in srgb, var(--background-color) 94%, transparent);
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(12px);
    z-index: 20;
  }

  .footer-summary {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }

  .footer-summary-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .footer-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    line-height: 1.2;
  }

  .footer-desc {
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.2;
  }

  .footer-summary-chips {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .footer-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--section-color) 35%, var(--card-border-color));
    background: color-mix(in srgb, var(--section-color) 9%, var(--background-color));
    font-size: 12px;
    color: var(--text-color);
    white-space: nowrap;
  }

  .footer-chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--section-color);
    flex: 0 0 auto;
  }

  .footer-actions {
    flex: 0 0 auto;
    align-items: center;
  }

  @media (max-width: 1100px) {
    .tag-edit-container {
      padding-bottom: 190px;
    }

    .resource-section:last-child {
      margin-bottom: 56px;
    }

    .edit-tag-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .footer-actions {
      width: 100%;
      justify-content: flex-end;
    }
  }

  @media (max-width: 1100px) {
    .base-card {
      grid-template-columns: 1fr;
    }
  }
</style>
