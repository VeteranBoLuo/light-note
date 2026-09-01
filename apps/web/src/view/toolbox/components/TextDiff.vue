<template>
  <section class="text-diff-tool" :aria-label="t('toolbox.tool.text_diff.name')">
    <div class="text-diff-tool__toolbar">
      <div class="text-diff-tool__options">
        <BCheckbox :checked="ignoreWhitespace" @update:checked="ignoreWhitespace = $event">{{
          t('toolbox.local.ignoreWhitespace')
        }}</BCheckbox>
        <BCheckbox :checked="ignoreCase" @update:checked="ignoreCase = $event">{{
          t('toolbox.local.ignoreCase')
        }}</BCheckbox>
        <BCheckbox :checked="showUnchanged" @update:checked="showUnchanged = $event">{{
          t('toolbox.local.showUnchanged')
        }}</BCheckbox>
      </div>
      <BButton @click="swap"><SvgIcon :src="icon.toolbox.swap" size="15" />{{ t('toolbox.local.swapSides') }}</BButton>
      <BButton @click="loadSample">{{ t('toolbox.local.loadSample') }}</BButton>
      <BButton :disabled="!left && !right" @click="clear">{{ t('common.clear') }}</BButton>
    </div>

    <div class="text-diff-tool__editors">
      <div>
        <header
          ><strong>{{ t('toolbox.local.originalText') }}</strong
          ><span>{{ left.length.toLocaleString() }}</span></header
        >
        <BInput
          v-model:value="left"
          type="textarea"
          :rows="13"
          :maxlength="300000"
          :placeholder="t('toolbox.local.originalTextPlaceholder')"
        />
      </div>
      <div>
        <header
          ><strong>{{ t('toolbox.local.revisedText') }}</strong
          ><span>{{ right.length.toLocaleString() }}</span></header
        >
        <BInput
          v-model:value="right"
          type="textarea"
          :rows="13"
          :maxlength="300000"
          :placeholder="t('toolbox.local.revisedTextPlaceholder')"
        />
      </div>
    </div>

    <div v-if="error" class="text-diff-tool__error" role="alert">{{ error }}</div>

    <div class="text-diff-tool__actions">
      <div v-if="result" class="text-diff-tool__stats">
        <BChip tone="neutral">{{ t('toolbox.local.unchangedLines', { count: result.stats.unchanged }) }}</BChip>
        <BChip tone="pending">{{ t('toolbox.local.changedLines', { count: result.stats.changed }) }}</BChip>
        <BChip tone="success">{{ t('toolbox.local.addedLines', { count: result.stats.added }) }}</BChip>
        <BChip tone="danger">{{ t('toolbox.local.removedLines', { count: result.stats.removed }) }}</BChip>
      </div>
      <span v-else>{{ t('toolbox.local.diffHint') }}</span>
      <BButton :disabled="!result" @click="copyDiff"
        ><SvgIcon :src="icon.toolbox.copy" size="15" />{{ t('toolbox.local.copyDiff') }}</BButton
      >
      <BButton :disabled="!result" @click="downloadDiff"
        ><SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolbox.local.downloadDiff') }}</BButton
      >
      <BButton type="primary" :disabled="!left && !right" @click="compare">{{ t('toolbox.local.compareNow') }}</BButton>
    </div>

    <section v-if="result" class="text-diff-result" aria-live="polite">
      <header
        ><strong>{{ t('toolbox.local.originalText') }}</strong
        ><span>{{ t('toolbox.local.diffChangeType') }}</span
        ><strong>{{ t('toolbox.local.revisedText') }}</strong></header
      >
      <div v-if="visibleRows.length" class="text-diff-result__rows">
        <article v-for="row in visibleRows" :key="row.id" :class="`is-${row.kind}`">
          <div class="text-diff-result__cell is-left">
            <strong class="text-diff-result__mobile-label">{{ t('toolbox.local.originalText') }}</strong>
            <span>{{ row.leftLine ?? '·' }}</span
            ><pre>{{ row.left || ' ' }}</pre>
          </div>
          <div class="text-diff-result__status">
            <span>{{ diffKindLabel(row.kind) }}</span>
          </div>
          <div class="text-diff-result__cell is-right">
            <strong class="text-diff-result__mobile-label">{{ t('toolbox.local.revisedText') }}</strong>
            <span>{{ row.rightLine ?? '·' }}</span
            ><pre>{{ row.right || ' ' }}</pre>
          </div>
        </article>
      </div>
      <div v-else class="text-diff-result__empty">{{ t('toolbox.local.noDiff') }}</div>
    </section>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { compareTextLines, ToolboxTextError, type TextDiffResult } from '@/utils/toolboxTextTools';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';

  const { t } = useI18n();
  const left = ref('');
  const right = ref('');
  const ignoreWhitespace = ref(false);
  const ignoreCase = ref(false);
  const showUnchanged = ref(false);
  const result = ref<TextDiffResult | null>(null);
  const error = ref('');
  const visibleRows = computed(() =>
    (result.value?.rows || []).filter((row) => showUnchanged.value || row.kind !== 'equal'),
  );

  function diffKindLabel(kind: TextDiffResult['rows'][number]['kind']) {
    return t(`toolbox.local.diffKind.${kind}`);
  }

  function compare() {
    error.value = '';
    try {
      result.value = compareTextLines(left.value, right.value, {
        ignoreWhitespace: ignoreWhitespace.value,
        ignoreCase: ignoreCase.value,
      });
    } catch (cause) {
      result.value = null;
      error.value =
        cause instanceof ToolboxTextError && cause.code === 'DIFF_TOO_COMPLEX'
          ? t('toolbox.local.diffTooComplex')
          : cause instanceof ToolboxTextError && cause.code === 'INPUT_TOO_LARGE'
            ? t('toolbox.local.textTooLarge')
            : t('toolbox.local.compareFailed');
    }
  }

  function swap() {
    [left.value, right.value] = [right.value, left.value];
    result.value = null;
    error.value = '';
  }

  function loadSample() {
    left.value = '项目目标\n整理已有资料\n生成一份研究简报\n周五前完成核对';
    right.value = '项目目标\n整理已有资料与会议记录\n生成学习套件\n下周一前完成核对';
    result.value = null;
    error.value = '';
  }

  function clear() {
    left.value = '';
    right.value = '';
    result.value = null;
    error.value = '';
  }

  function diffText() {
    if (!result.value) return '';
    return result.value.rows
      .map((row) => {
        if (row.kind === 'equal') return `  ${row.left}`;
        const before = row.left ? `- ${row.left}` : '';
        const after = row.right ? `+ ${row.right}` : '';
        return [before, after].filter(Boolean).join('\n');
      })
      .join('\n');
  }

  async function copyDiff() {
    const copied = await copyTextToClipboard(diffText());
    message[copied ? 'success' : 'error'](t(copied ? 'toolbox.local.copySuccess' : 'toolbox.local.copyFailed'));
  }

  function downloadDiff() {
    downloadToolboxBlob(new Blob([diffText()], { type: 'text/plain;charset=utf-8' }), 'lightnote-text-diff.txt');
  }

  watch([left, right, ignoreWhitespace, ignoreCase], () => {
    result.value = null;
    error.value = '';
  });
</script>

<style scoped lang="less">
  .text-diff-tool {
    display: grid;
    gap: 16px;
  }
  .text-diff-tool__toolbar {
    padding: 12px 13px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .text-diff-tool__options {
    margin-right: auto;
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .text-diff-tool__editors {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .text-diff-tool__editors > div {
    min-width: 0;
    padding: 12px;
    display: grid;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .text-diff-tool__editors header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .text-diff-tool__editors header span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .text-diff-tool__editors :deep(textarea) {
    height: 260px;
    min-height: 260px;
    max-height: 260px;
    resize: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    line-height: 1.55;
  }
  .text-diff-tool__actions {
    min-height: 48px;
    padding: 10px 13px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }
  .text-diff-tool__actions > span,
  .text-diff-tool__stats {
    margin-right: auto;
  }
  .text-diff-tool__actions > span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .text-diff-tool__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .text-diff-tool__error {
    padding: 11px 13px;
    border: 1px solid var(--danger-color, #dc3e4d);
    border-radius: 11px;
    color: var(--danger-color, #dc3e4d);
    background: var(--card-background);
  }
  .text-diff-result {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .text-diff-result > header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 76px minmax(0, 1fr);
    align-items: center;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
  .text-diff-result > header strong {
    padding: 11px 13px;
  }
  .text-diff-result > header > span {
    align-self: stretch;
    display: grid;
    place-items: center;
    color: var(--desc-color);
    border-right: 1px solid var(--surface-border-color);
    border-left: 1px solid var(--surface-border-color);
    font-size: 11px;
    font-weight: 650;
  }
  .text-diff-result__rows article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 76px minmax(0, 1fr);
    border-bottom: 1px solid var(--surface-border-color);
  }
  .text-diff-result__rows article:last-child {
    border-bottom: 0;
  }
  .text-diff-result__cell {
    min-width: 0;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .text-diff-result__mobile-label {
    display: none;
  }
  .text-diff-result__status {
    display: grid;
    place-items: center;
    padding: 6px;
    border-right: 1px solid var(--surface-border-color);
    border-left: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
  .text-diff-result__status span {
    min-width: 48px;
    padding: 4px 6px;
    color: var(--desc-color);
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    background: var(--card-background);
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }
  .text-diff-result__cell > span {
    padding: 8px 7px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font:
      11px ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      monospace;
    text-align: right;
  }
  .text-diff-result__cell pre {
    min-width: 0;
    margin: 0;
    padding: 8px 10px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    font:
      12px/1.5 ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      monospace;
  }
  .text-diff-result__rows article.is-changed .is-left pre,
  .text-diff-result__rows article.is-removed .is-left pre {
    color: var(--danger-color);
    border-left: 3px solid var(--danger-color);
    background: rgba(194, 75, 104, 0.08);
  }
  .text-diff-result__rows article.is-changed .is-right pre,
  .text-diff-result__rows article.is-added .is-right pre {
    color: var(--success-color);
    border-left: 3px solid var(--success-color);
    background: rgba(7, 131, 95, 0.08);
  }
  .text-diff-result__rows article.is-changed .text-diff-result__status span {
    color: var(--warning-color);
    border-color: var(--warning-color);
    background: rgba(184, 117, 8, 0.12);
  }
  .text-diff-result__rows article.is-added .text-diff-result__status span {
    color: var(--success-color);
    border-color: var(--success-color);
    background: rgba(7, 131, 95, 0.12);
  }
  .text-diff-result__rows article.is-removed .text-diff-result__status span {
    color: var(--danger-color);
    border-color: var(--danger-color);
    background: rgba(194, 75, 104, 0.12);
  }
  .text-diff-result__empty {
    padding: 28px;
    color: var(--desc-color);
    text-align: center;
  }
  @media (max-width: 767px) {
    .text-diff-tool__toolbar {
      align-items: stretch;
      flex-direction: column;
    }
    .text-diff-tool__actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .text-diff-tool__options,
    .text-diff-tool__actions > span,
    .text-diff-tool__stats {
      margin-right: 0;
    }
    .text-diff-tool__actions > span,
    .text-diff-tool__stats {
      grid-column: 1 / -1;
    }
    .text-diff-tool__actions :deep(.b_btn) {
      width: 100%;
      padding: 0 7px;
    }
    .text-diff-tool__editors {
      grid-template-columns: 1fr;
    }
    .text-diff-tool__editors :deep(textarea) {
      height: 220px;
      min-height: 220px;
      max-height: 220px;
    }
    .text-diff-result > header {
      display: none;
    }
    .text-diff-result__rows article {
      grid-template-columns: 1fr;
    }
    .text-diff-result__status {
      grid-row: 1;
      justify-items: start;
      padding: 8px 9px 0;
      border: 0;
      background: var(--card-background);
    }
    .text-diff-result__cell.is-left {
      grid-row: 2;
    }
    .text-diff-result__cell.is-right {
      grid-row: 3;
      border-top: 1px solid var(--surface-border-color);
      border-left: 0;
    }
    .text-diff-result__mobile-label {
      grid-column: 1 / -1;
      padding: 6px 9px;
      display: block;
      color: var(--desc-color);
      background: var(--card-background);
      font-size: 11px;
      font-weight: 650;
    }
  }
  html.light-note-mobile-rendering .text-diff-tool__actions,
  html.light-note-mobile-rendering .text-diff-result__cell > span {
    background: var(--card-background);
    box-shadow: none;
  }
</style>
