<template>
  <section class="markup-tool" :aria-label="t('toolbox.tool.markdown_converter.name')">
    <div class="markup-tool__toolbar">
      <div>
        <label id="markup-direction">{{ t('toolbox.local.conversionDirection') }}</label>
        <BSelect
          v-model:value="direction"
          :options="directionOptions"
          :disabled="converting"
          aria-labelledby="markup-direction"
        />
      </div>
      <BButton :disabled="converting" @click="swapDirection"
        ><SvgIcon :src="icon.toolbox.swap" size="15" />{{ t('toolbox.local.swapDirection') }}</BButton
      >
      <BButton :disabled="converting" @click="loadSample">{{ t('toolbox.local.loadSample') }}</BButton>
      <BButton :disabled="converting || (!source && !output)" @click="clear">{{ t('common.clear') }}</BButton>
    </div>

    <div class="markup-tool__editors">
      <div>
        <header
          ><strong>{{ inputLabel }}</strong
          ><span>{{ source.length.toLocaleString() }}/500,000</span></header
        >
        <BInput
          v-model:value="source"
          type="textarea"
          :rows="16"
          :maxlength="500000"
          :disabled="converting"
          :placeholder="inputPlaceholder"
        />
      </div>
      <span class="markup-tool__bridge" aria-hidden="true"><SvgIcon :src="icon.toolbox.arrow" size="18" /></span>
      <div>
        <header
          ><strong>{{ outputLabel }}</strong
          ><span>{{ output.length.toLocaleString() }}</span></header
        >
        <BInput
          v-model:value="output"
          type="textarea"
          :rows="16"
          readonly
          :placeholder="t('toolbox.local.outputPlaceholder')"
        />
      </div>
    </div>

    <div v-if="error" class="markup-tool__error" role="alert">{{ error }}</div>

    <div class="markup-tool__actions">
      <span>{{ t('toolbox.local.markupHint') }}</span>
      <BButton :disabled="!output" @click="copyOutput"
        ><SvgIcon :src="icon.toolbox.copy" size="15" />{{ t('toolbox.local.copyResult') }}</BButton
      >
      <BButton :disabled="!output" @click="downloadOutput"
        ><SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolbox.local.downloadResult') }}</BButton
      >
      <BButton type="primary" :loading="converting" :disabled="!source.trim()" @click="convert">
        {{ converting ? t('toolbox.local.converting') : t('toolbox.local.convertNow') }}
      </BButton>
    </div>

    <section v-if="output && direction === 'markdown_to_html'" class="markup-tool__preview">
      <header
        ><strong>{{ t('toolbox.local.safePreview') }}</strong
        ><span>{{ t('toolbox.local.previewSanitized') }}</span></header
      >
      <!-- output 已经过轻笺统一 marked + DOMPurify 管线，不渲染未经消毒的用户 HTML。 -->
      <div class="markup-tool__preview-body" v-html="output"></div>
    </section>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { convertMarkup, ToolboxTextError, type MarkupDirection } from '@/utils/toolboxTextTools';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';

  const { t } = useI18n();
  const direction = ref<MarkupDirection>('markdown_to_html');
  const source = ref('');
  const output = ref('');
  const converting = ref(false);
  const error = ref('');

  const directionOptions = computed(() => [
    { value: 'markdown_to_html', label: t('toolbox.local.markdownToHtml') },
    { value: 'html_to_markdown', label: t('toolbox.local.htmlToMarkdown') },
  ]);
  const inputLabel = computed(() => (direction.value === 'markdown_to_html' ? 'Markdown' : 'HTML'));
  const outputLabel = computed(() => (direction.value === 'markdown_to_html' ? 'HTML' : 'Markdown'));
  const inputPlaceholder = computed(() =>
    direction.value === 'markdown_to_html'
      ? t('toolbox.local.markdownInputPlaceholder')
      : t('toolbox.local.htmlInputPlaceholder'),
  );

  function showError(cause: unknown) {
    error.value =
      cause instanceof ToolboxTextError && cause.code === 'INPUT_TOO_LARGE'
        ? t('toolbox.local.textTooLarge')
        : t('toolbox.local.convertFailed');
  }

  async function convert() {
    if (!source.value.trim() || converting.value) return;
    converting.value = true;
    error.value = '';
    try {
      output.value = await convertMarkup(source.value, direction.value);
    } catch (cause) {
      output.value = '';
      showError(cause);
    } finally {
      converting.value = false;
    }
  }

  function swapDirection() {
    direction.value = direction.value === 'markdown_to_html' ? 'html_to_markdown' : 'markdown_to_html';
    if (output.value) source.value = output.value;
    output.value = '';
    error.value = '';
  }

  function loadSample() {
    source.value =
      direction.value === 'markdown_to_html'
        ? '# 项目结论\n\n- 已完成资料整理\n- [ ] 核对关键数据\n\n| 项目 | 状态 |\n| --- | --- |\n| 研究简报 | 完成 |'
        : '<h1>项目结论</h1><p>把网页内容整理成可继续编辑的笔记。</p><ul><li><strong>保留</strong>结构</li><li>清理多余样式</li></ul>';
    output.value = '';
    error.value = '';
  }

  function clear() {
    source.value = '';
    output.value = '';
    error.value = '';
  }

  async function copyOutput() {
    const copied = await copyTextToClipboard(output.value);
    message[copied ? 'success' : 'error'](t(copied ? 'toolbox.local.copySuccess' : 'toolbox.local.copyFailed'));
  }

  function downloadOutput() {
    const extension = direction.value === 'markdown_to_html' ? 'html' : 'md';
    const type = direction.value === 'markdown_to_html' ? 'text/html' : 'text/markdown';
    downloadToolboxBlob(
      new Blob([output.value], { type: `${type};charset=utf-8` }),
      `lightnote-converted.${extension}`,
    );
  }

  watch(source, () => {
    if (output.value) output.value = '';
    error.value = '';
  });
</script>

<style scoped lang="less">
  .markup-tool {
    display: grid;
    gap: 16px;
  }
  .markup-tool__toolbar {
    padding: 13px;
    display: flex;
    align-items: end;
    justify-content: flex-end;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .markup-tool__toolbar > div {
    width: min(300px, 100%);
    margin-right: auto;
    display: grid;
    gap: 6px;
  }
  .markup-tool__toolbar label {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }
  .markup-tool__editors {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
  }
  .markup-tool__editors > div {
    min-width: 0;
    padding: 12px;
    display: grid;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .markup-tool__editors header,
  .markup-tool__preview header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .markup-tool__editors header span,
  .markup-tool__preview header span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .markup-tool__editors :deep(textarea) {
    min-height: 340px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    line-height: 1.6;
  }
  .markup-tool__bridge {
    align-self: center;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .markup-tool__actions {
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }
  .markup-tool__actions > span {
    margin-right: auto;
    color: var(--desc-color);
    font-size: 12px;
  }
  .markup-tool__error {
    padding: 11px 13px;
    border: 1px solid var(--danger-color, #dc3e4d);
    border-radius: 11px;
    color: var(--danger-color, #dc3e4d);
    background: var(--card-background);
  }
  .markup-tool__preview {
    padding: 16px;
    display: grid;
    gap: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .markup-tool__preview-body {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.75;
  }
  .markup-tool__preview-body :deep(pre) {
    padding: 12px;
    overflow: auto;
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }
  .markup-tool__preview-body :deep(table) {
    width: 100%;
    border-collapse: collapse;
  }
  .markup-tool__preview-body :deep(th),
  .markup-tool__preview-body :deep(td) {
    padding: 7px 9px;
    border: 1px solid var(--surface-border-color);
    text-align: left;
  }
  @media (max-width: 900px) {
    .markup-tool__editors {
      grid-template-columns: 1fr;
    }
    .markup-tool__bridge {
      justify-self: center;
      transform: rotate(90deg);
    }
  }
  @media (max-width: 767px) {
    .markup-tool__toolbar {
      align-items: stretch;
      flex-direction: column;
    }
    .markup-tool__toolbar > div {
      width: 100%;
      margin-right: 0;
    }
    .markup-tool__editors :deep(textarea) {
      min-height: 260px;
    }
    .markup-tool__actions {
      align-items: stretch;
      flex-direction: column;
    }
    .markup-tool__actions > span {
      margin-right: 0;
    }
  }
  html.light-note-mobile-rendering .markup-tool__actions {
    background: var(--card-background);
    box-shadow: none;
  }
</style>
