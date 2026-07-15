<template>
  <div class="tag-icon-picker">
    <div class="picker-head">
      <div class="picker-label-wrap">
        <span class="picker-label">{{ t('tagManage.icon') }}</span>
        <span class="icon-preview" :class="{ empty: !previewSrc }">
          <SvgIcon :src="previewSrc || icon.nullImg" size="20" />
        </span>
      </div>
      <span class="picker-status">{{ previewSrc ? t('tagManage.iconSelected') : t('tagManage.iconNotSelected') }}</span>
    </div>

    <div class="picker-actions">
      <BButton size="small" type="primary" @click="openPicker">{{ t('tagManage.smartChooseIcon') }}</BButton>
      <BButton size="small" @click="uploadIcon">{{ t('tagManage.uploadIcon') }}</BButton>
      <BButton size="small" @click="showAdvanced = !showAdvanced">{{ t('tagManage.moreIconMethods') }}</BButton>
      <BButton v-if="value" size="small" @click="clearIcon">{{ t('tagManage.removeIcon') }}</BButton>
    </div>
    <div class="picker-help">{{ t('tagManage.smartChooseIconDesc') }}</div>

    <BInput
      v-if="showAdvanced"
      v-model:value="value"
      class="advanced-input"
      :placeholder="t('tagManage.iconPlaceholder')"
    />

    <BModal
      v-model:visible="pickerVisible"
      :title="t('tagManage.iconPickerTitle')"
      :show-footer="false"
      width="min(720px, calc(100vw - 32px))"
    >
      <div class="picker-modal-body">
        <div class="search-row">
          <BInput
            v-model:value="searchQuery"
            :placeholder="t('tagManage.iconSearchPlaceholder')"
            :maxlength="80"
            clearable
            @enter="runSearch(0)"
          />
          <BButton type="primary" :loading="searching" @click="runSearch(0)">{{
            t('tagManage.iconSearchButton')
          }}</BButton>
        </div>

        <div v-if="translatedQuery" class="translation-hint">
          {{ t('tagManage.iconSearchKeywords', { keywords: translatedQuery }) }}
        </div>

        <BLoading :loading="searching || resolving" style="min-height: 240px">
          <div v-if="resultIcons.length" class="icon-grid">
            <BButton
              v-for="iconName in resultIcons"
              :key="iconName"
              class="icon-option"
              :class="{ selected: selectedIcon === iconName }"
              :title="iconName"
              @click="chooseIcon(iconName)"
            >
              <Icon :icon="iconName" width="30" height="30" />
              <span>{{ iconLabel(iconName) }}</span>
            </BButton>
          </div>
          <div v-else-if="searched" class="empty-state">
            <strong>{{ t('tagManage.iconSearchEmptyTitle') }}</strong>
            <span>{{ t('tagManage.iconSearchEmptyDesc') }}</span>
          </div>
          <div v-else class="empty-state">
            <strong>{{ t('tagManage.iconSearchStartTitle') }}</strong>
            <span>{{ t('tagManage.iconSearchStartDesc') }}</span>
          </div>
        </BLoading>

        <div class="picker-footer">
          <div class="page-actions">
            <BButton v-if="page > 0" size="small" @click="runSearch(page - 1)">{{
              t('tagManage.previousIcons')
            }}</BButton>
            <BButton v-if="hasMore" size="small" @click="runSearch(page + 1)">{{ t('tagManage.nextIcons') }}</BButton>
          </div>
          <a href="https://icon-sets.iconify.design/" target="_blank" rel="noopener noreferrer">
            {{ t('tagManage.openIconify') }}
          </a>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { Icon } from '@iconify/vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { resolveTagIcon, searchTagIcons, type TagIconSearchResult } from '@/api/tagIconApi.ts';

  const props = defineProps<{ tagName?: string }>();
  const value = defineModel<string | undefined>('value', { default: '' });
  const { t } = useI18n();
  const pickerVisible = ref(false);
  const showAdvanced = ref(false);
  const searchQuery = ref('');
  const resultIcons = ref<string[]>([]);
  const translatedQuery = ref('');
  const selectedIcon = ref('');
  const searching = ref(false);
  const resolving = ref(false);
  const searched = ref(false);
  const page = ref(0);
  const hasMore = ref(false);
  const lastTagName = ref('');

  const previewSrc = computed(() => {
    const raw = String(value.value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:image/') || raw.includes('<svg')) return raw;
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 64) return `data:image/svg+xml;base64,${raw}`;
    return raw;
  });

  function iconLabel(iconName: string) {
    return iconName.split(':')[1]?.replace(/-/g, ' ') || iconName;
  }

  async function openPicker() {
    const tagName = String(props.tagName || '').trim();
    if (!tagName) {
      message.warning(t('tagManage.generateIconNeedName'));
      return;
    }
    pickerVisible.value = true;
    if (!searchQuery.value || lastTagName.value !== tagName) searchQuery.value = tagName;
    lastTagName.value = tagName;
    await runSearch(0);
  }

  async function runSearch(targetPage = 0) {
    const query = String(searchQuery.value || '').trim();
    if (!query || searching.value) return;
    searching.value = true;
    try {
      const res = await searchTagIcons(query, targetPage);
      if (res.status !== 200) throw new Error(res.msg || 'search failed');
      const data = (res.data || {}) as TagIconSearchResult;
      resultIcons.value = data.icons || [];
      translatedQuery.value = data.translatedQuery || '';
      page.value = data.page || 0;
      hasMore.value = !!data.hasMore;
      searched.value = true;
      recordOperation({ module: '标签详情', operation: `搜索标签图标【${query}】` });
    } catch (error) {
      console.error('search tag icons failed', error);
      message.error(t('tagManage.iconSearchFailed'));
    } finally {
      searching.value = false;
    }
  }

  async function chooseIcon(iconName: string) {
    if (resolving.value) return;
    resolving.value = true;
    selectedIcon.value = iconName;
    try {
      const res = await resolveTagIcon(iconName);
      const iconUrl = String(res?.data?.iconUrl || '');
      if (res.status !== 200 || !iconUrl) throw new Error(res.msg || 'resolve failed');
      value.value = iconUrl;
      pickerVisible.value = false;
      recordOperation({ module: '标签详情', operation: `选择标签图标【${iconName}】` });
      message.success(t('tagManage.iconSelectSuccess'));
    } catch (error) {
      selectedIcon.value = '';
      console.error('resolve tag icon failed', error);
      message.error(t('tagManage.iconResolveFailed'));
    } finally {
      resolving.value = false;
    }
  }

  function uploadIcon() {
    // 项目暂无 B 系列文件选择器；文件选择必须由浏览器原生 file input 触发。
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        message.warning(t('tagManage.iconUploadTooLarge'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        value.value = String(reader.result || '');
        recordOperation({ module: '标签详情', operation: '上传标签图标' });
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function clearIcon() {
    value.value = '';
    selectedIcon.value = '';
    recordOperation({ module: '标签详情', operation: '移除标签图标' });
  }
</script>

<style scoped lang="less">
  .tag-icon-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .picker-head,
  .picker-label-wrap,
  .picker-actions,
  .search-row,
  .picker-footer,
  .page-actions {
    display: flex;
    align-items: center;
  }

  .picker-head,
  .picker-footer {
    justify-content: space-between;
    gap: 12px;
  }

  .picker-label-wrap,
  .picker-actions,
  .page-actions {
    gap: 8px;
  }

  .picker-actions {
    flex-wrap: wrap;
  }

  .picker-label,
  .picker-status,
  .picker-help,
  .translation-hint {
    font-size: 12px;
    color: var(--desc-color);
  }

  .icon-preview {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--card-border-color);
    border-radius: 7px;
    color: var(--resource-tag-color);
    background: var(--background-color);
  }

  .icon-preview.empty {
    opacity: 0.55;
  }

  .advanced-input {
    margin-top: 2px;
  }

  .picker-modal-body {
    min-width: 0;
  }

  .search-row {
    gap: 10px;
  }

  .translation-hint {
    margin-top: 8px;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
    padding: 16px 0;
  }

  :deep(.icon-option) {
    width: 100%;
    height: 76px;
    padding: 8px 4px;
    flex-direction: column;
    gap: 7px;
    line-height: 1.1;
    overflow: hidden;
    color: var(--text-color);
  }

  :deep(.icon-option span) {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    color: var(--desc-color);
  }

  :deep(.icon-option.selected) {
    outline: 2px solid var(--resource-tag-color);
  }

  .empty-state {
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    color: var(--desc-color);
  }

  .empty-state strong {
    color: var(--text-color);
  }

  .picker-footer {
    min-height: 32px;
  }

  .picker-footer a {
    color: var(--resource-tag-color);
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .icon-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .picker-status {
      display: none;
    }

    .search-row {
      align-items: stretch;
    }
  }
</style>
