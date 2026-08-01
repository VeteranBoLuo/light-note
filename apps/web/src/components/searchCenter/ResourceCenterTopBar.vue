<template>
  <!--
    资源中心（全部资源 / 待整理）共用的移动端顶栏。

    这两个分区是两个路由，但对用户是同一个页面的两个页签，顶栏必须完全一致，
    否则切换时会看到 Logo 忽有忽无。它也不能用共享顶栏——那里的全局搜索按钮
    在本页会变成第二个搜索入口。

    右侧统一为「快速添加」：两侧动作等宽，切换分区时搜索框宽度不跳；
    离开本页由左侧返回箭头承担，不再放与之重复的「取消」。
  -->
  <header class="resource-center-topbar" :class="{ 'is-selection-mode': selectionMode }">
    <BButton
      class="resource-center-topbar__back"
      :aria-label="t(selectionMode ? 'inbox.mobileBatchCancel' : 'common.back')"
      @click="selectionMode ? emit('cancelSelection') : emit('back')"
    >
      <SvgIcon :src="icon.noteDetail.back" size="19" aria-hidden="true" />
    </BButton>

    <strong v-if="selectionMode" class="resource-center-topbar__selection-title">
      {{ t('inbox.selectedCount', { count: selectedCount }) }}
    </strong>
    <strong v-else-if="compactTitle" class="resource-center-topbar__title">{{ title }}</strong>
    <BInput
      v-else
      :id="inputId"
      class="resource-center-topbar__input"
      :value="keyword"
      :placeholder="placeholder || t('globalSearch.placeholder')"
      height="38px"
      clearable
      @update:value="(next: string | number | undefined) => emit('update:keyword', String(next ?? ''))"
      @enter="emit('submit')"
    >
      <template #prefix>
        <SvgIcon :src="icon.navigation.search" size="15" aria-hidden="true" />
      </template>
    </BInput>

    <div v-if="selectionMode" class="resource-center-topbar__selection-actions">
      <BButton
        size="small"
        type="primary"
        :disabled="selectedCount < 1"
        :aria-label="t('inbox.completeSelected')"
        @click="emit('completeSelected')"
      >
        {{ t('inbox.completeSelected') }}
      </BButton>
      <BButton
        size="small"
        type="danger"
        :disabled="selectedCount < 1"
        :aria-label="t('inbox.deleteSelected')"
        @click="emit('deleteSelected')"
      >
        {{ t('inbox.deleteSelected') }}
      </BButton>
    </div>
    <BPopover
      v-else-if="showMenu"
      v-model:open="menuOpen"
      trigger="click"
      placement="bottom-right"
      overlay-class-name="resource-center-menu-popover"
    >
      <BButton
        class="resource-center-topbar__menu"
        :aria-label="t('inbox.mobileMenu')"
        :title="t('inbox.mobileMenu')"
      >
        <SvgIcon :src="icon.navigation.menu" size="19" aria-hidden="true" />
      </BButton>
      <template #content>
        <div class="resource-center-topbar__menu-content">
          <BInput
            :id="`${inputId}-menu-search`"
            :value="keyword"
            :placeholder="placeholder || t('globalSearch.placeholder')"
            clearable
            @update:value="(next: string | number | undefined) => emit('update:keyword', String(next ?? ''))"
            @enter="submitAndClose"
          />
          <BButton @click="emitMenu('create')">{{ createLabel || t('inbox.quickCapture') }}</BButton>
          <BButton @click="emitMenu('batch')">{{ t('inbox.mobileBatchSelect') }}</BButton>
          <BButton @click="emitMenu('sort')">{{ t('inbox.mobileSort') }}</BButton>
          <BButton @click="emitMenu('filter')">{{ t('inbox.mobileFilter') }}</BButton>
        </div>
      </template>
    </BPopover>
    <BButton
      v-else
      class="resource-center-topbar__action"
      :aria-label="createLabel || t('inbox.quickCapture')"
      :title="createLabel || t('inbox.quickCapture')"
      @click="emit('create')"
    >
      <SvgIcon :src="icon.common.plus" size="20" aria-hidden="true" />
    </BButton>
  </header>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  withDefaults(
    defineProps<{
      keyword: string;
      inputId: string;
      placeholder?: string;
      createLabel?: string;
      title?: string;
      compactTitle?: boolean;
      showMenu?: boolean;
      selectionMode?: boolean;
      selectedCount?: number;
    }>(),
    { placeholder: '', createLabel: '', title: '', compactTitle: false, showMenu: false, selectionMode: false, selectedCount: 0 },
  );

  const emit = defineEmits<{
    'update:keyword': [value: string];
    submit: [];
    back: [];
    create: [];
    batch: [];
    sort: [];
    filter: [];
    cancelSelection: [];
    completeSelected: [];
    deleteSelected: [];
  }>();

  const { t } = useI18n();
  const menuOpen = ref(false);

  function emitMenu(event: 'create' | 'batch' | 'sort' | 'filter') {
    menuOpen.value = false;
    emit(event);
  }

  function submitAndClose() {
    menuOpen.value = false;
    emit('submit');
  }
</script>

<style scoped lang="less">
  .resource-center-topbar {
    height: 56px;
    padding: 0 8px 0 4px;
    box-sizing: border-box;
    flex: 0 0 56px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .resource-center-topbar__back {
    width: 38px;
    min-width: 38px;
    height: 38px;
    padding: 0;
    flex: 0 0 auto;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent !important;
  }

  .resource-center-topbar__input {
    min-width: 0;
    flex: 1 1 auto;
  }

  .resource-center-topbar__title,
  .resource-center-topbar__selection-title {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    color: var(--text-color);
    font-size: 16px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-center-topbar__selection-title {
    color: var(--primary-color);
  }

  .resource-center-topbar__selection-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
  }

  .resource-center-topbar__selection-actions :deep(.b_btn) {
    height: 30px;
    padding: 0 7px;
    font-size: 11px;
  }

  .resource-center-topbar__input :deep(.b-input) {
    border-radius: 10px;
    font-size: 13px;
  }

  .resource-center-topbar__action {
    width: 38px;
    min-width: 38px;
    height: 38px;
    padding: 0;
    flex: 0 0 auto;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent !important;
  }

  .resource-center-topbar__menu {
    width: 38px;
    min-width: 38px;
    height: 38px;
    padding: 0;
    flex: 0 0 auto;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent !important;
  }

  .resource-center-topbar__menu-content {
    display: grid;
    min-width: 190px;
    gap: 6px;
  }

  .resource-center-topbar__menu-content :deep(.b_btn) {
    width: 100%;
    justify-content: flex-start;
  }

  .resource-center-topbar__action:active {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent) !important;
  }
</style>
