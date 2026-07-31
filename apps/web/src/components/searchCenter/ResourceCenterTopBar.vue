<template>
  <!--
    资源中心（全部资源 / 待整理）共用的移动端顶栏。

    这两个分区是两个路由，但对用户是同一个页面的两个页签，顶栏必须完全一致，
    否则切换时会看到 Logo 忽有忽无。它也不能用共享顶栏——那里的全局搜索按钮
    在本页会变成第二个搜索入口。

    右侧动作按分区不同：全部资源是「取消」（离开），待整理是「创建」（快速添加）。
  -->
  <header class="resource-center-topbar">
    <BButton class="resource-center-topbar__back" :aria-label="t('common.back')" @click="emit('back')">
      <SvgIcon :src="icon.noteDetail.back" size="19" aria-hidden="true" />
    </BButton>

    <BInput
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

    <BButton
      v-if="action === 'create'"
      class="resource-center-topbar__action resource-center-topbar__action--icon"
      :aria-label="createLabel || t('inbox.quickCapture')"
      :title="createLabel || t('inbox.quickCapture')"
      @click="emit('create')"
    >
      <SvgIcon :src="icon.common.plus" size="20" aria-hidden="true" />
    </BButton>
    <BButton v-else class="resource-center-topbar__action" @click="emit('back')">
      {{ t('globalSearch.cancel') }}
    </BButton>
  </header>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  withDefaults(
    defineProps<{
      keyword: string;
      inputId: string;
      /** 右侧动作：全部资源用 cancel（离开），待整理用 create（快速添加） */
      action?: 'cancel' | 'create';
      placeholder?: string;
      createLabel?: string;
    }>(),
    { action: 'cancel', placeholder: '', createLabel: '' },
  );

  const emit = defineEmits<{
    'update:keyword': [value: string];
    submit: [];
    back: [];
    create: [];
  }>();

  const { t } = useI18n();
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

  .resource-center-topbar__input :deep(.b-input) {
    border-radius: 10px;
    font-size: 13px;
  }

  .resource-center-topbar__action {
    flex: 0 0 auto;
    height: 38px;
    padding: 0 8px;
    color: var(--desc-color);
    background: transparent !important;
    font-size: 13px;
  }

  .resource-center-topbar__action--icon {
    width: 38px;
    min-width: 38px;
    padding: 0;
    border-radius: 11px;
    color: var(--text-color);
  }

  .resource-center-topbar__action:active {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent) !important;
  }
</style>
