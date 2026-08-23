<template>
  <section class="ai-material-hub" :class="{ 'has-contexts': hasContexts, 'has-attachment': hasAttachment }">
    <div class="ai-material-hub__bar">
      <AiContextChips
        v-if="hasContexts"
        class="ai-material-hub__chips"
        :model-value="modelValue"
        :scope-model-value="scopeModelValue"
        @update:model-value="emit('update:modelValue', $event)"
        @update:scope-model-value="emit('update:scopeModelValue', $event)"
      />

      <BPopover
        v-if="!isMobile"
        v-model:open="desktopOpen"
        trigger="click"
        placement="top-right"
        overlay-class-name="ai-material-hub-popover"
      >
        <BButton
          class="ai-material-hub__trigger"
          :aria-label="t('ai.material.add')"
          :title="t('ai.material.add')"
          :aria-expanded="desktopOpen"
          aria-haspopup="dialog"
        >
          <SvgIcon :src="icon.common.plus" size="14" aria-hidden="true" />
          <span>{{ t('ai.material.add') }}</span>
          <span v-if="materialCount" class="ai-material-hub__count">{{ materialCount }}</span>
        </BButton>
        <template #content>
          <AiMaterialPanel
            :model-value="modelValue"
            :scope-model-value="scopeModelValue"
            :material-count="materialCount"
            :has-attachment="hasAttachment"
            :attachment-busy="attachmentBusy"
            @update:model-value="emit('update:modelValue', $event)"
            @update:scope-model-value="emit('update:scopeModelValue', $event)"
            @file-selected="attachSelectedCloudFile"
            @upload="openUpload"
            @clear="clearAll"
            @close="desktopOpen = false"
          />
        </template>
      </BPopover>

      <BButton
        v-else
        class="ai-material-hub__trigger"
        :aria-label="t('ai.material.add')"
        :title="t('ai.material.add')"
        :aria-expanded="mobileOpen"
        aria-haspopup="dialog"
        @click="mobileOpen = true"
      >
        <span class="ai-material-hub__trigger-icon">
          <SvgIcon :src="icon.common.plus" size="15" aria-hidden="true" />
        </span>
        <span>{{ t('ai.material.add') }}</span>
        <span v-if="materialCount" class="ai-material-hub__count">{{ materialCount }}</span>
      </BButton>
    </div>

    <AiAttachmentPicker
      ref="attachmentPicker"
      :model-value="attachments"
      :prepare-action-fn="prepareActionFn"
      :show-upload-trigger="false"
      @update:model-value="emit('update:attachments', $event)"
      @prompt="emit('prompt', $event)"
      @busy-change="attachmentBusy = $event"
    />

    <BDrawer
      v-if="isMobile"
      :open="mobileOpen"
      :title="t('ai.material.title')"
      placement="bottom"
      height="auto"
      body-padding="12px 16px max(18px, env(safe-area-inset-bottom))"
      @close="mobileOpen = false"
    >
      <AiMaterialPanel
        :model-value="modelValue"
        :scope-model-value="scopeModelValue"
        :material-count="materialCount"
        :has-attachment="hasAttachment"
        :attachment-busy="attachmentBusy"
        :show-title="false"
        @update:model-value="emit('update:modelValue', $event)"
        @update:scope-model-value="emit('update:scopeModelValue', $event)"
        @file-selected="attachSelectedCloudFile"
        @upload="openUpload"
        @clear="clearAll"
        @close="mobileOpen = false"
      />
    </BDrawer>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AiAttachmentPicker from './AiAttachmentPicker.vue';
  import AiContextChips from './AiContextChips.vue';
  import AiMaterialPanel from './AiMaterialPanel.vue';
  import icon from '@/config/icon';
  import type { AiAttachment } from '@/api/aiAttachmentApi';
  import type { AiAttachmentDirectActionName } from '@/config/aiTools';
  import type { AiAttachmentActionRequest } from './attachmentActions';
  import type { AiResourceContext, AiScopeRef } from '@/types/aiScope';

  const props = withDefaults(
    defineProps<{
      modelValue: AiResourceContext[];
      scopeModelValue?: AiScopeRef[];
      attachments: AiAttachment[];
      isMobile: boolean;
      prepareActionFn: (request: AiAttachmentActionRequest) => Promise<void>;
    }>(),
    { scopeModelValue: () => [] },
  );
  const emit = defineEmits<{
    'update:modelValue': [value: AiResourceContext[]];
    'update:scopeModelValue': [value: AiScopeRef[]];
    'update:attachments': [value: AiAttachment[]];
    prompt: [value: string];
    clear: [];
  }>();
  const { t } = useI18n();
  const desktopOpen = ref(false);
  const mobileOpen = ref(false);
  const attachmentBusy = ref(false);
  const attachmentPicker = ref<{
    attachCloudFile: (fileId: string) => Promise<void>;
    openAction: (toolName: AiAttachmentDirectActionName, args?: Record<string, unknown>) => boolean;
    openUpload: () => boolean;
    uploadPastedImage: (file: File) => Promise<boolean>;
  } | null>(null);

  const hasContexts = computed(() => Boolean(props.modelValue.length || props.scopeModelValue.length));
  const hasAttachment = computed(() => props.attachments.length > 0);
  const materialCount = computed(
    () => props.modelValue.length + props.scopeModelValue.length + props.attachments.length,
  );

  function closePanel() {
    desktopOpen.value = false;
    mobileOpen.value = false;
  }

  function openUpload() {
    if (attachmentPicker.value?.openUpload()) closePanel();
  }

  function clearAll() {
    emit('clear');
    closePanel();
  }

  async function attachSelectedCloudFile(item: AiResourceContext) {
    await attachmentPicker.value?.attachCloudFile(item.id);
  }

  function attachCloudFile(fileId: string) {
    return attachmentPicker.value?.attachCloudFile(fileId);
  }

  function openAction(toolName: AiAttachmentDirectActionName, args?: Record<string, unknown>) {
    return attachmentPicker.value?.openAction(toolName, args) ?? false;
  }

  function uploadPastedImage(file: File) {
    return attachmentPicker.value?.uploadPastedImage(file) ?? Promise.resolve(false);
  }

  defineExpose({ attachCloudFile, openAction, openUpload, uploadPastedImage });
</script>

<style scoped lang="less">
  .ai-material-hub {
    display: grid;
    gap: 6px;
    width: 100%;
    min-width: 0;
  }

  .ai-material-hub__bar {
    display: grid;
    grid-template-columns: auto;
    align-items: start;
    gap: 6px;
    min-width: 0;
  }

  .ai-material-hub.has-contexts .ai-material-hub__bar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ai-material-hub__chips {
    min-width: 0;
  }

  .ai-material-hub__trigger {
    display: inline-flex;
    gap: 5px;
    width: max-content;
    max-width: 100%;
    min-height: 30px;
    padding: 3px 8px;
    border: 1px solid var(--primary-color);
    border-color: color-mix(in srgb, var(--primary-color) 28%, var(--surface-border-color));
    border-radius: 9px;
    background: var(--card-background);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .ai-material-hub__count {
    display: grid;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    place-items: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 14%, var(--card-background));
    color: var(--primary-color);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .ai-material-hub__trigger-icon {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 7px;
    background: var(--primary-color);
    color: white;
  }

  .ai-material-hub :deep(.ai-attachment-picker) {
    width: 100%;
  }

  @media (hover: hover) and (pointer: fine) {
    .ai-material-hub__trigger:hover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background));
    }
  }

  @media (max-width: 767px) {
    .ai-material-hub__trigger {
      min-height: 34px;
      padding: 3px 8px 3px 4px;
    }

    .ai-material-hub.has-contexts .ai-material-hub__bar {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }

  html.light-note-mobile-rendering .ai-material-hub__trigger {
    border-color: var(--primary-color);
    background: var(--card-background);
    color: var(--primary-color);
  }
</style>

<style lang="less">
  .ai-material-hub-popover {
    width: min(370px, calc(100vw - 20px));
    max-height: min(620px, calc(100vh - 24px));
    padding: 12px;
    overflow: auto;
  }
</style>
