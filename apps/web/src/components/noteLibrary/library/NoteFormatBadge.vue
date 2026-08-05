<template>
  <span class="note-format-badge" :title="label" :aria-label="label">{{ short }}</span>
</template>

<script lang="ts" setup>
  /**
   * 笔记库里的格式标识（MD / HTML）。
   *
   * 文案与详情页编辑器的 .mode-pill 完全一致——用户在详情页已经认得这两个词，
   * 列表里换成图标或纯色边框都要重新学一遍映射关系。
   *
   * 但**配色刻意不同**：详情页那个胶囊是可点的切换入口，所以用了彩色（紫/绿）；
   * 这里只是信息，用中性色。一排 chip 里若有三种彩色（置顶绿、待整理紫、格式色），
   * 反而谁都不突出。另外紫是 --primary-color、绿是 --resource-note-color（笔记这个
   * 资源类型的代表色），拿来表示「格式」会和「这是一篇笔记」的语义打架。
   */
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { normalizeNoteType } from '@/utils/noteResourceRefs.ts';

  const props = defineProps<{ type?: string | null }>();
  const { t } = useI18n();

  // 与后端同一口径：normalizeNoteType 只把历史值 md 归一为 markdown，
  // 其余（含空值）都按富文本算——线上 339 篇 type 全部有值，空值分支只是兜底。
  const isMarkdown = computed(() => normalizeNoteType(props.type) === 'markdown');
  const short = computed(() => (isMarkdown.value ? 'MD' : 'HTML'));
  const label = computed(() => (isMarkdown.value ? t('note.formatMarkdown') : t('note.formatRichText')));
</script>

<style lang="less" scoped>
  .note-format-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--common-tag-bg-color, #f0f0f0);
    color: var(--chip-neutral-color);
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
    letter-spacing: 0.3px;
    // 数字/字母宽度一致，MD 与 HTML 混排时胶囊边缘不会看着忽宽忽窄
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    user-select: none;
  }
</style>
