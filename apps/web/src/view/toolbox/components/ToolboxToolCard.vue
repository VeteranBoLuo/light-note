<template>
  <BButton
    class="toolbox-tool-card"
    :class="[`is-${presentation.accent}`, { 'is-featured': featured }]"
    :aria-label="`${name} · ${billing}`"
    :title="description"
    @click="$emit('open')"
  >
    <span class="toolbox-tool-card__head">
      <span class="toolbox-tool-card__icon"><SvgIcon :src="presentation.icon" size="22" /></span>
      <strong>{{ name }}</strong>
      <SvgIcon class="toolbox-tool-card__arrow" :src="icon.ai.sourceArrow" size="15" />
    </span>
    <span class="toolbox-tool-card__description">{{ shortDescription }}</span>
    <ToolboxOutputPreview v-if="featured && preview" :kind="preview" />
    <span v-else-if="featured" class="toolbox-tool-card__output"
      >{{ t('toolbox.outputLabel') }} · {{ t(`toolbox.tool.${toolId}.output`) }}</span
    >
    <span class="toolbox-tool-card__billing">{{ billing }}</span>
  </BButton>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { TOOLBOX_PRESENTATION } from '@/config/toolbox';
  import ToolboxOutputPreview from './ToolboxOutputPreview.vue';
  const props = defineProps<{
    toolId: string;
    name: string;
    description: string;
    billing: string;
    featured?: boolean;
  }>();
  defineEmits<{ open: [] }>();
  const { t, te } = useI18n();
  const presentation = computed(
    () => TOOLBOX_PRESENTATION[props.toolId as ToolboxToolId] || TOOLBOX_PRESENTATION.material_to_note,
  );
  const shortDescription = computed(() =>
    te(`toolbox.presentation.shortDescription.${props.toolId}`)
      ? t(`toolbox.presentation.shortDescription.${props.toolId}`)
      : props.description,
  );
  const previews = {
    material_to_note: 'note',
    research_brief: 'report',
    source_comparison: 'matrix',
    study_kit: 'flashcards',
    concept_map: 'map',
    idea_to_draft: 'draft',
    pdf_organizer: 'pages',
  } as const;
  const preview = computed(() => previews[props.toolId as keyof typeof previews]);
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .toolbox-tool-card.b_btn {
    .workspace-content-surface();
    --tool-accent: var(--workspace-purple-text);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--ui-space-8, 8px);
    width: 100%;
    height: 100%;
    min-width: 0;
    padding: var(--ui-space-14, 14px);
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    color: var(--workspace-text);
    line-height: 1.5;
    white-space: normal;
    text-align: left;
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }
  .toolbox-tool-card.is-blue {
    --tool-accent: var(--info-color);
  }
  .toolbox-tool-card.is-teal {
    --tool-accent: var(--workspace-note-text);
  }
  .toolbox-tool-card.is-amber {
    --tool-accent: var(--workspace-file-text);
  }
  .toolbox-tool-card.is-rose {
    --tool-accent: var(--danger-color);
  }
  .toolbox-tool-card__head {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    min-width: 0;
  }
  .toolbox-tool-card__icon {
    flex-shrink: 0;
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: var(--tool-accent);
    background: var(--workspace-canvas);
  }
  strong {
    flex: 1;
    min-width: 0;
    font-size: var(--ui-font-14, 14px);
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .toolbox-tool-card__arrow {
    flex-shrink: 0;
    color: var(--workspace-muted);
  }
  .toolbox-tool-card__description {
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-muted);
  }
  .toolbox-tool-card__output {
    .workspace-canvas-surface();
    padding: var(--ui-space-12, 12px);
    border-radius: 8px;
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-muted);
  }
  .toolbox-tool-card__billing {
    margin-top: auto;
    padding-right: var(--ui-space-30, 30px);
    font-size: var(--ui-font-11, 11px);
    color: var(--workspace-muted);
  }
  .is-featured .toolbox-tool-card__description {
    /* ui-density-fixed: Reserve two description lines; em follows the shared font density. */
    min-height: 3em;
  }
  @media (hover: hover) and (pointer: fine) {
    .toolbox-tool-card.b_btn:hover {
      .workspace-content-surface();
      border-color: var(--workspace-purple-text);
      box-shadow: var(--surface-card-shadow);
    }
  }
  @media (max-width: 767px) {
    .toolbox-tool-card.b_btn {
      padding: var(--ui-space-10, 10px);
      gap: var(--ui-space-7, 7px);
    }
    .toolbox-tool-card__head {
      gap: var(--ui-space-6, 6px);
    }
    .toolbox-tool-card__icon {
      width: var(--ui-layout-26, 26px);
      height: var(--ui-layout-30, 30px);
      background: transparent;
    }
    .toolbox-tool-card__arrow {
      display: none;
    }
    strong {
      font-size: var(--ui-font-13, 13px);
    }
    .toolbox-tool-card__description {
      font-size: var(--ui-font-11, 11px);
    }
    .toolbox-tool-card__billing {
      font-size: var(--ui-font-10, 10px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toolbox-tool-card.b_btn {
      transition: none;
    }
  }
</style>
