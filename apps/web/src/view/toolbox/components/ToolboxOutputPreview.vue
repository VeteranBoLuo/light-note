<template>
  <span class="tool-output-preview" :class="`is-${kind}`" aria-hidden="true">
    <span class="tool-output-preview__label">{{ t('toolbox.presentation.preview') }}</span>
    <span v-if="kind === 'flashcards'" class="preview-flashcards">
      <span><b>Q</b>{{ label('question') }}</span
      ><span><b>A</b>{{ label('answer') }}</span>
    </span>
    <span v-else-if="kind === 'pages'" class="preview-pages">
      <span v-for="page in 3" :key="page"
        ><span class="preview-page"><i v-for="line in 4" :key="line" /></span><small>{{ page }}</small></span
      >
    </span>
    <span v-else-if="kind === 'matrix'" class="preview-matrix">
      <span v-for="key in ['materialA', 'materialB', 'consensus']" :key="key">
        <small>{{ label(key) }}</small
        ><i v-for="line in 3" :key="line" />
      </span>
    </span>
    <span v-else-if="kind === 'map'" class="preview-map">
      <span>{{ label('topic') }}</span
      ><span>{{ label('concept') }}</span
      ><span>{{ label('relation') }}</span>
    </span>
    <span v-else class="preview-outline">
      <span v-for="(key, index) in labels" :key="key"
        ><b>{{ kind === 'draft' ? `${index + 1}.` : '•' }}</b
        ><small>{{ label(key) }}</small
        ><i
      /></span>
    </span>
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  const props = defineProps<{ kind: 'note' | 'report' | 'flashcards' | 'pages' | 'matrix' | 'map' | 'draft' }>();
  const { t } = useI18n();
  const label = (key: string) => t(`toolbox.presentation.previewLabels.${key}`);
  const labels = computed(() =>
    props.kind === 'report'
      ? ['conclusion', 'evidence', 'verify']
      : props.kind === 'draft'
        ? ['positioning', 'outline', 'draft']
        : ['focus', 'explanation', 'source'],
  );
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .tool-output-preview {
    .workspace-canvas-surface();
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-10, 10px);
    border-radius: 8px;
    min-width: 0;
    color: var(--workspace-muted);
    box-sizing: border-box;
    font-size: var(--ui-font-11, 11px);
    line-height: 1.35;
  }
  .tool-output-preview__label {
    font-size: var(--ui-font-10, 10px);
  }
  .preview-outline,
  .preview-matrix,
  .preview-flashcards,
  .preview-map,
  .preview-pages {
    min-height: var(--ui-layout-60, 60px);
    min-width: 0;
  }
  i {
    display: block;
    background: var(--workspace-border);
    height: var(--ui-space-3, 3px);
    border-radius: 2px;
  }
  small {
    font-size: inherit;
  }
  .preview-outline {
    display: grid;
    gap: var(--ui-space-6, 6px);
    align-content: center;
  }
  .preview-outline > span {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
  }
  .preview-outline b {
    color: var(--tool-accent);
    font-weight: 600;
  }
  .preview-outline small {
    flex-shrink: 0;
  }
  .preview-outline i {
    flex: 1;
    max-width: 45%;
  }
  .is-note .preview-outline > span:nth-child(2) {
    padding-left: var(--ui-space-8, 8px);
  }
  .is-report .preview-outline > span:first-child {
    color: var(--workspace-text);
    font-weight: 600;
  }
  .preview-flashcards {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--ui-space-4, 4px);
  }
  .preview-flashcards > span {
    .workspace-content-surface();
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-5, 5px);
    border: 1px solid var(--workspace-border);
    border-radius: 6px;
    padding: var(--ui-space-8, 8px);
    min-width: 0;
    flex: 1;
    transform: rotate(-5deg);
    z-index: 1;
  }
  .preview-flashcards > span + span {
    transform: translateY(15%) rotate(4deg);
    margin-left: calc(-1 * var(--ui-space-10, 10px));
    z-index: 0;
  }
  .preview-flashcards b {
    color: var(--tool-accent);
    font-size: var(--ui-font-14, 14px);
  }
  .preview-pages {
    display: flex;
    justify-content: center;
    gap: var(--ui-space-10, 10px);
  }
  .preview-pages > span {
    display: grid;
    gap: var(--ui-space-3, 3px);
    flex: 1;
    max-width: var(--ui-layout-40, 40px);
    text-align: center;
  }
  .preview-page {
    .workspace-content-surface();
    display: grid;
    align-content: center;
    gap: var(--ui-space-4, 4px);
    padding: var(--ui-space-6, 6px);
    border: 1px solid var(--workspace-border);
    border-radius: 3px;
  }
  .preview-page i:last-child {
    width: 70%;
  }
  .preview-matrix {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .preview-matrix > span {
    display: grid;
    gap: var(--ui-space-7, 7px);
    padding: 0 var(--ui-space-5, 5px);
    align-content: center;
  }
  .preview-matrix > span + span {
    border-left: 1px solid var(--workspace-border);
  }
  .preview-matrix small {
    overflow-wrap: anywhere;
    font-size: var(--ui-font-10, 10px);
  }
  .preview-matrix i:nth-child(3) {
    width: 65%;
    background: var(--tool-accent);
    opacity: 0.45;
  }
  .preview-map {
    display: grid;
    position: relative;
    grid-template-columns: 1fr 1fr;
    gap: var(--ui-space-8, 8px);
    justify-items: center;
    align-items: center;
  }
  .preview-map::before {
    content: '';
    position: absolute;
    width: 50%;
    height: 50%;
    top: 30%;
    border: 1px solid var(--workspace-border);
    border-bottom: 0;
  }
  .preview-map > span {
    position: relative;
    .workspace-content-surface();
    padding: var(--ui-space-3, 3px) var(--ui-space-8, 8px);
    border: 1px solid var(--workspace-border);
    border-radius: 20px;
  }
  .preview-map > span:first-child {
    grid-column: 1 / -1;
    color: var(--workspace-purple-text);
    border-color: var(--workspace-purple-text);
  }
  @media (max-width: 767px) {
    .tool-output-preview {
      padding: var(--ui-space-8, 8px);
      gap: var(--ui-space-6, 6px);
    }
    .preview-outline,
    .preview-matrix,
    .preview-flashcards,
    .preview-map,
    .preview-pages {
      min-height: var(--ui-layout-54, 54px);
    }
    .preview-flashcards > span {
      padding: var(--ui-space-6, 6px) var(--ui-space-4, 4px);
    }
  }
</style>
