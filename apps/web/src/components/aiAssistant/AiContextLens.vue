<template>
  <section class="ai-context-lens" :aria-label="t('ai.contextLens.title')">
    <BPopover v-model:open="open" trigger="click" placement="top-left" overlay-class-name="ai-context-lens-popover">
      <BButton class="ai-context-lens__summary" :aria-expanded="open" aria-haspopup="dialog" :aria-label="summaryLabel">
        <SvgIcon :src="icon.noteTemplate.knowledge" size="14" aria-hidden="true" />
        <strong>{{ t('ai.contextLens.scope') }}</strong>
        <span>{{ materialSummary }}</span>
        <SvgIcon class="ai-context-lens__arrow" :src="icon.ai.sourceArrow" size="12" aria-hidden="true" />
      </BButton>

      <template #content>
        <BCard as="div" variant="raised" padding="12px" radius="12px" class="ai-context-lens__panel" role="dialog">
          <div class="ai-context-lens__panel-heading">
            <div>
              <strong>{{ t('ai.contextLens.title') }}</strong>
              <small>{{ t('ai.contextLens.description') }}</small>
            </div>
            <BButton class="ai-context-lens__close" :aria-label="t('common.close')" @click="open = false">
              <SvgIcon :src="icon.common.close" size="14" aria-hidden="true" />
            </BButton>
          </div>

          <div class="ai-context-lens__section">
            <span class="ai-context-lens__label">{{ t('ai.contextLens.materials') }}</span>
            <div v-if="materials.length" class="ai-context-lens__materials">
              <div v-for="material in materials" :key="material.key" class="ai-context-lens__material">
                <SvgIcon :src="material.icon" size="14" aria-hidden="true" />
                <span :title="material.title">{{ material.title }}</span>
                <small>{{ material.kindLabel }}</small>
                <BButton
                  class="ai-context-lens__remove"
                  :aria-label="t('ai.contextLens.removeMaterial', { title: material.title })"
                  @click="removeMaterial(material)"
                >
                  <SvgIcon :src="icon.common.close" size="12" aria-hidden="true" />
                </BButton>
              </div>
            </div>
            <div v-else class="ai-context-lens__empty">{{ t('ai.contextLens.empty') }}</div>
          </div>

          <div class="ai-context-lens__policy-row">
            <span>
              <SvgIcon :src="icon.ai.internet" size="14" aria-hidden="true" />
              <span>
                <strong>{{ t('ai.contextLens.externalWeb') }}</strong>
                <small>{{ t('ai.contextLens.externalDisabled') }}</small>
              </span>
            </span>
            <span class="ai-context-lens__off">{{ t('common.off') }}</span>
          </div>

          <div v-if="pendingCount" class="ai-context-lens__warning" role="status">
            <SvgIcon :src="icon.message.warning" size="14" aria-hidden="true" />
            {{ t('ai.contextLens.pending', { count: pendingCount }) }}
          </div>
        </BCard>
      </template>
    </BPopover>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { AiAttachment } from '@/api/aiAttachmentApi';
  import type { SearchType } from '@/api/search';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  export type AiContextScopeMode = 'selected' | 'workspace';

  interface ContextRef {
    type: SearchType;
    id: string;
    title: string;
  }

  const props = withDefaults(
    defineProps<{
      contexts?: ContextRef[];
      attachments?: AiAttachment[];
    }>(),
    {
      contexts: () => [],
      attachments: () => [],
    },
  );
  const emit = defineEmits<{
    'update:contexts': [ContextRef[]];
    'update:attachments': [AiAttachment[]];
  }>();
  const { t } = useI18n();
  const open = ref(false);
  const pendingCount = computed(
    () => props.attachments.filter((item) => !['ready', 'failed'].includes(String(item.status || ''))).length,
  );
  const materialSummary = computed(() => {
    const count = props.contexts.length + props.attachments.length;
    if (!count) return t('ai.contextLens.noMaterials');
    return t('ai.contextLens.materialCount', { count });
  });
  const summaryLabel = computed(() =>
    [t('ai.contextLens.title'), materialSummary.value, t('ai.contextLens.adjust')].join('，'),
  );
  const materials = computed(() => [
    ...props.contexts.map((item) => ({
      key: `context:${item.type}:${item.id}`,
      kind: 'context' as const,
      id: item.id,
      type: item.type,
      title: item.title,
      kindLabel: t(`ai.sourceTypes.${item.type}`),
      icon: resourceIcon(item.type),
    })),
    ...props.attachments.map((item) => ({
      key: `attachment:${item.id}`,
      kind: 'attachment' as const,
      id: item.id,
      type: 'file' as const,
      title: item.fileName,
      kindLabel: t('ai.contextLens.attachment'),
      icon: icon.resource.file,
    })),
  ]);

  function resourceIcon(type: SearchType) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    if (type === 'tag') return icon.resource.tag;
    return icon.resource.bookmark;
  }

  function removeMaterial(material: (typeof materials.value)[number]) {
    if (material.kind === 'attachment') {
      emit(
        'update:attachments',
        props.attachments.filter((item) => item.id !== material.id),
      );
      return;
    }
    emit(
      'update:contexts',
      props.contexts.filter((item) => !(item.id === material.id && item.type === material.type)),
    );
  }
</script>

<style scoped lang="less">
  .ai-context-lens {
    display: flex;
    min-width: 0;
    padding: 0 1.5rem 4px;
    background: var(--background-color);
  }

  .ai-context-lens__summary {
    width: 100%;
    min-height: 26px;
    justify-content: flex-start;
    gap: 6px;
    padding: 3px 9px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--primary-color) 14%, var(--surface-border-color));
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 3%, var(--workspace-panel-bg-color));
    color: var(--desc-color);
    font-size: 11px;
  }

  .ai-context-lens__summary strong {
    flex: 0 0 auto;
    color: var(--text-color);
    font-size: 11px;
  }

  .ai-context-lens__summary > span:not(.ai-context-lens__policy) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-context-lens__policy {
    margin-left: auto;
    white-space: nowrap;
  }

  .ai-context-lens__arrow {
    flex: 0 0 auto;
    transform: rotate(-90deg);
  }

  .ai-context-lens__panel {
    width: min(420px, calc(100vw - 24px));
    max-height: min(620px, calc(100vh - 40px));
    overflow-y: auto;
  }

  .ai-context-lens__panel-heading,
  .ai-context-lens__policy-row,
  .ai-context-lens__material {
    display: flex;
    align-items: center;
  }

  .ai-context-lens__panel-heading {
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--surface-border-color);
  }

  .ai-context-lens__panel-heading > div,
  .ai-context-lens__policy-row > span > span {
    display: grid;
    gap: 2px;
  }

  .ai-context-lens__panel-heading strong,
  .ai-context-lens__policy-row strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .ai-context-lens__panel-heading small,
  .ai-context-lens__policy-row small,
  .ai-context-lens__hint {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.45;
  }

  .ai-context-lens__close,
  .ai-context-lens__remove {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--desc-color);
  }

  .ai-context-lens__section {
    display: grid;
    gap: 7px;
    padding-top: 12px;
  }

  .ai-context-lens__label {
    color: var(--text-color);
    font-size: 11px;
    font-weight: 650;
  }

  .ai-context-lens__materials {
    display: grid;
    gap: 5px;
  }

  .ai-context-lens__material {
    gap: 6px;
    min-width: 0;
    min-height: 34px;
    padding: 3px 4px 3px 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--card-background);
    color: var(--primary-color);
  }

  .ai-context-lens__material > span {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--text-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-context-lens__material small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .ai-context-lens__empty,
  .ai-context-lens__warning {
    padding: 9px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 9px;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
  }

  .ai-context-lens__hint {
    margin: 0;
  }

  .ai-context-lens__policy-row {
    justify-content: space-between;
    gap: 10px;
    margin-top: 12px;
    padding: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }

  .ai-context-lens__policy-row > span:first-child {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--desc-color);
  }

  .ai-context-lens__off {
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 650;
  }

  .ai-context-lens__warning {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    border-style: solid;
    border-color: color-mix(in srgb, var(--warning-color, #c47f17) 22%, var(--surface-border-color));
    color: var(--warning-color, #c47f17);
  }

  @container ai-chat (max-width: 520px) {
    .ai-context-lens {
      padding-inline: 0.5rem;
    }

    .ai-context-lens__policy {
      display: none;
    }

    .ai-context-lens__summary {
      min-height: 44px;
    }

    .ai-context-lens__close,
    .ai-context-lens__remove {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
  }
</style>
