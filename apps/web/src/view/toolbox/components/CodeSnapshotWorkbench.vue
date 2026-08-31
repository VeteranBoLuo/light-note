<template>
  <section class="code-snapshot-workbench" :aria-label="t('toolbox.tool.code_snapshot.name')">
    <section class="code-snapshot-toolbar">
      <div class="code-snapshot-toolbar__intro">
        <span><SvgIcon :src="icon.toolbox.image" size="23" /></span>
        <div
          ><strong>{{ t('toolbox.codeSnapshot.title') }}</strong
          ><small>{{ t('toolbox.codeSnapshot.description') }}</small></div
        >
      </div>
      <div class="code-field">
        <label id="code-language">{{ t('toolbox.codeSnapshot.language') }}</label>
        <BSelect v-model:value="language" :options="languageOptions" aria-labelledby="code-language" />
      </div>
      <div class="code-field">
        <label id="code-theme">{{ t('toolbox.codeSnapshot.theme') }}</label>
        <BSelect v-model:value="theme" :options="themeOptions" aria-labelledby="code-theme" />
      </div>
      <div class="code-field">
        <label id="code-size">{{ t('toolbox.codeSnapshot.fontSize') }}</label>
        <BSelect v-model:value="fontSize" :options="fontSizeOptions" aria-labelledby="code-size" />
      </div>
      <div class="code-field">
        <label id="code-padding">{{ t('toolbox.codeSnapshot.padding') }}</label>
        <BSelect v-model:value="padding" :options="paddingOptions" aria-labelledby="code-padding" />
      </div>
      <div class="code-snapshot-options">
        <BCheckbox v-model="showLineNumbers">{{ t('toolbox.codeSnapshot.lineNumbers') }}</BCheckbox>
        <BCheckbox v-model="showWindow">{{ t('toolbox.codeSnapshot.windowChrome') }}</BCheckbox>
      </div>
    </section>

    <div class="code-snapshot-layout">
      <section class="code-snapshot-editor">
        <header
          ><div
            ><span>01</span><strong>{{ t('toolbox.codeSnapshot.source') }}</strong></div
          ><small>{{ source.length.toLocaleString() }}/200,000</small></header
        >
        <BInput
          v-model:value="source"
          type="textarea"
          :rows="24"
          :maxlength="200000"
          :placeholder="t('toolbox.codeSnapshot.placeholder')"
        />
        <footer>
          <BButton size="small" @click="loadSample">{{ t('toolbox.local.loadSample') }}</BButton>
          <BButton size="small" :disabled="!source" @click="source = ''">{{ t('common.clear') }}</BButton>
        </footer>
      </section>

      <section class="code-snapshot-preview-shell">
        <header
          ><div
            ><span>02</span><strong>{{ t('toolbox.codeSnapshot.preview') }}</strong></div
          ><small>{{ dimensionsLabel }}</small></header
        >
        <div class="code-snapshot-stage" :class="`is-${theme}`">
          <div
            ref="captureRef"
            class="code-snapshot-card"
            :class="[`is-${theme}`, { 'has-window': showWindow }]"
            :style="captureStyle"
          >
            <div v-if="showWindow" class="code-snapshot-windowbar">
              <i></i><i></i><i></i><span>{{ fileName }}</span>
            </div>
            <div class="code-snapshot-code" :class="{ 'has-lines': showLineNumbers }">
              <span v-if="showLineNumbers" class="code-snapshot-lines" aria-hidden="true">
                <i v-for="line in lineCount" :key="line">{{ line }}</i>
              </span>
              <pre><code class="hljs" v-html="highlightedCode"></code></pre>
            </div>
          </div>
        </div>
        <footer>
          <span><SvgIcon :src="icon.toolbox.local" size="16" />{{ t('toolbox.codeSnapshot.localHint') }}</span>
          <BButton type="primary" :disabled="!source.trim()" :loading="exporting" @click="exportPng">
            <SvgIcon v-if="!exporting" :src="icon.toolbox.download" size="15" />{{
              exporting ? t('toolbox.codeSnapshot.exporting') : t('toolbox.codeSnapshot.exportPng')
            }}
          </BButton>
        </footer>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import hljs from 'highlight.js/lib/core';
  import bash from 'highlight.js/lib/languages/bash';
  import css from 'highlight.js/lib/languages/css';
  import javascript from 'highlight.js/lib/languages/javascript';
  import json from 'highlight.js/lib/languages/json';
  import markdown from 'highlight.js/lib/languages/markdown';
  import plaintext from 'highlight.js/lib/languages/plaintext';
  import python from 'highlight.js/lib/languages/python';
  import sql from 'highlight.js/lib/languages/sql';
  import typescript from 'highlight.js/lib/languages/typescript';
  import xml from 'highlight.js/lib/languages/xml';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';

  const { t } = useI18n();
  const captureRef = ref<HTMLElement | null>(null);
  const source = ref('');
  const language = ref('typescript');
  const theme = ref<'midnight' | 'graphite' | 'paper'>('midnight');
  const fontSize = ref(16);
  const padding = ref(32);
  const showLineNumbers = ref(true);
  const showWindow = ref(true);
  const exporting = ref(false);

  const languages = { bash, css, javascript, json, markdown, plaintext, python, sql, typescript, xml };
  Object.entries(languages).forEach(([name, grammar]) => {
    if (!hljs.getLanguage(name)) hljs.registerLanguage(name, grammar);
  });
  hljs.registerAliases(['js'], { languageName: 'javascript' });
  hljs.registerAliases(['ts'], { languageName: 'typescript' });
  hljs.registerAliases(['html'], { languageName: 'xml' });

  const languageOptions = computed(() =>
    ['typescript', 'javascript', 'python', 'sql', 'json', 'html', 'css', 'bash', 'markdown', 'plaintext'].map(
      (value) => ({
        value,
        label: value === 'plaintext' ? t('toolbox.codeSnapshot.plainText') : value.toLocaleUpperCase(),
      }),
    ),
  );
  const themeOptions = computed(() =>
    ['midnight', 'graphite', 'paper'].map((value) => ({ value, label: t(`toolbox.codeSnapshot.themeType.${value}`) })),
  );
  const fontSizeOptions = [14, 16, 18, 20].map((value) => ({ value, label: `${value}px` }));
  const paddingOptions = [20, 32, 44, 56].map((value) => ({ value, label: `${value}px` }));
  const resolvedLanguage = computed(() =>
    language.value === 'html' ? 'xml' : hljs.getLanguage(language.value) ? language.value : 'plaintext',
  );
  const highlightedCode = computed(
    () =>
      hljs.highlight(source.value || t('toolbox.codeSnapshot.previewPlaceholder'), { language: resolvedLanguage.value })
        .value,
  );
  const lineCount = computed(() =>
    Math.max(1, (source.value || t('toolbox.codeSnapshot.previewPlaceholder')).split('\n').length),
  );
  const fileName = computed(() => `snippet.${extensionForLanguage(language.value)}`);
  const captureStyle = computed(() => ({
    '--code-font-size': `${fontSize.value}px`,
    '--code-padding': `${padding.value}px`,
  }));
  const dimensionsLabel = computed(() => t('toolbox.codeSnapshot.scaleHint'));

  function extensionForLanguage(value: string) {
    const extensions: Record<string, string> = {
      typescript: 'ts',
      javascript: 'js',
      python: 'py',
      plaintext: 'txt',
      markdown: 'md',
      html: 'html',
      css: 'css',
      sql: 'sql',
      json: 'json',
      bash: 'sh',
    };
    return extensions[value] || 'txt';
  }

  function loadSample() {
    language.value = 'typescript';
    source.value = `type ToolboxResult<T> = {\n  data: T\n  processedAt: string\n  localOnly: true\n}\n\nexport function createResult<T>(data: T): ToolboxResult<T> {\n  return {\n    data,\n    processedAt: new Date().toISOString(),\n    localOnly: true,\n  }\n}`;
  }

  async function exportPng() {
    if (!captureRef.value || !source.value.trim()) return;
    exporting.value = true;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(captureRef.value, {
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
        backgroundColor: null,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob((blob) => {
        if (blob) downloadToolboxBlob(blob, `lightnote-code-${Date.now()}.png`);
      }, 'image/png');
    } catch {
      message.error(t('toolbox.codeSnapshot.exportFailed'));
    } finally {
      exporting.value = false;
    }
  }
</script>

<style scoped lang="less">
  .code-snapshot-workbench {
    display: grid;
    gap: 16px;
  }

  .code-snapshot-toolbar {
    padding: 13px;
    display: flex;
    align-items: end;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }

  .code-snapshot-toolbar__intro {
    min-width: 260px;
    margin-right: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .code-snapshot-toolbar__intro > span {
    width: 43px;
    height: 43px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 12px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .code-snapshot-toolbar__intro > div {
    display: grid;
    gap: 2px;
  }

  .code-snapshot-toolbar__intro small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .code-field {
    min-width: 110px;
    display: grid;
    gap: 5px;
  }

  .code-field label {
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 650;
  }

  .code-snapshot-options {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .code-snapshot-options :deep(.b-checkbox) {
    min-height: 34px;
    padding: 5px 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
  }

  .code-snapshot-layout {
    display: grid;
    grid-template-columns: minmax(300px, 0.42fr) minmax(0, 1fr);
    gap: 13px;
    align-items: start;
  }

  .code-snapshot-editor,
  .code-snapshot-preview-shell {
    min-width: 0;
    padding: 13px;
    display: grid;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .code-snapshot-editor > header,
  .code-snapshot-preview-shell > header,
  .code-snapshot-editor > footer,
  .code-snapshot-preview-shell > footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 9px;
  }

  .code-snapshot-editor > header > div,
  .code-snapshot-preview-shell > header > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .code-snapshot-editor > header span,
  .code-snapshot-preview-shell > header span {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: #fff;
    background: var(--primary-color);
    font-size: 10px;
    font-weight: 750;
  }

  .code-snapshot-editor > header small,
  .code-snapshot-preview-shell > header small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .code-snapshot-editor :deep(textarea) {
    min-height: 500px;
    resize: vertical;
    border-color: var(--surface-border-color);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.65;
  }

  .code-snapshot-editor > footer {
    justify-content: flex-end;
  }

  .code-snapshot-stage {
    min-height: 500px;
    padding: clamp(24px, 5vw, 70px);
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 13px;
    background:
      radial-gradient(circle at 18% 14%, rgba(150, 144, 255, 0.55), transparent 30%),
      radial-gradient(circle at 82% 84%, rgba(44, 190, 170, 0.28), transparent 32%),
      linear-gradient(135deg, #352fa7, #15162c 70%);
  }

  .code-snapshot-stage.is-graphite {
    background:
      radial-gradient(circle at 80% 10%, rgba(255, 255, 255, 0.14), transparent 30%),
      linear-gradient(145deg, #434550, #15161b);
  }

  .code-snapshot-stage.is-paper {
    background:
      radial-gradient(circle at 10% 15%, rgba(97, 92, 237, 0.16), transparent 34%),
      linear-gradient(145deg, #f4f2ff, #dce7ff);
  }

  .code-snapshot-card {
    --code-bg: #111323;
    --code-fg: #e9eafa;
    width: min(100%, 900px);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    color: var(--code-fg);
    background: var(--code-bg);
    box-shadow: 0 28px 75px rgba(8, 9, 28, 0.4);
  }

  .code-snapshot-card.is-graphite {
    --code-bg: #202126;
    --code-fg: #f0f0f2;
  }

  .code-snapshot-card.is-paper {
    --code-bg: #fbfbfe;
    --code-fg: #262735;
    border-color: rgba(48, 50, 80, 0.13);
    box-shadow: 0 25px 65px rgba(60, 68, 120, 0.2);
  }

  .code-snapshot-windowbar {
    height: 44px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 7px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.09);
    background: rgba(255, 255, 255, 0.035);
  }

  .is-paper .code-snapshot-windowbar {
    border-bottom-color: rgba(30, 32, 55, 0.09);
    background: rgba(30, 32, 55, 0.025);
  }

  .code-snapshot-windowbar i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ff665e;
  }

  .code-snapshot-windowbar i:nth-child(2) {
    background: #ffbd2e;
  }

  .code-snapshot-windowbar i:nth-child(3) {
    background: #27c93f;
  }

  .code-snapshot-windowbar span {
    margin-left: 7px;
    color: currentColor;
    font-size: 11px;
    opacity: 0.52;
  }

  .code-snapshot-code {
    min-width: max-content;
    padding: var(--code-padding);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 15px;
    box-sizing: border-box;
  }

  .code-snapshot-code.has-lines {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .code-snapshot-lines {
    display: grid;
    align-content: start;
    color: currentColor;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: var(--code-font-size);
    line-height: 1.65;
    text-align: right;
    opacity: 0.3;
    user-select: none;
  }

  .code-snapshot-lines i {
    min-width: 2ch;
    font-style: normal;
  }

  .code-snapshot-code pre {
    min-width: 0;
    margin: 0;
    overflow: visible;
  }

  .code-snapshot-code code {
    display: block;
    color: var(--code-fg);
    background: transparent;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: var(--code-font-size);
    line-height: 1.65;
    white-space: pre;
  }

  .code-snapshot-card :deep(.hljs-keyword),
  .code-snapshot-card :deep(.hljs-selector-tag),
  .code-snapshot-card :deep(.hljs-literal) {
    color: #c792ea;
  }

  .code-snapshot-card :deep(.hljs-string),
  .code-snapshot-card :deep(.hljs-attr) {
    color: #c3e88d;
  }

  .code-snapshot-card :deep(.hljs-number),
  .code-snapshot-card :deep(.hljs-built_in) {
    color: #f78c6c;
  }

  .code-snapshot-card :deep(.hljs-title),
  .code-snapshot-card :deep(.hljs-function) {
    color: #82aaff;
  }

  .code-snapshot-card :deep(.hljs-comment) {
    color: #697098;
    font-style: italic;
  }

  .code-snapshot-card.is-paper :deep(.hljs-keyword),
  .code-snapshot-card.is-paper :deep(.hljs-selector-tag),
  .code-snapshot-card.is-paper :deep(.hljs-literal) {
    color: #7a3fb0;
  }

  .code-snapshot-card.is-paper :deep(.hljs-string),
  .code-snapshot-card.is-paper :deep(.hljs-attr) {
    color: #277b52;
  }

  .code-snapshot-card.is-paper :deep(.hljs-title),
  .code-snapshot-card.is-paper :deep(.hljs-function) {
    color: #315bb5;
  }

  .code-snapshot-preview-shell > footer > span {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--desc-color);
    font-size: 10px;
  }

  .code-snapshot-preview-shell > footer > span :deep(.svg-icon) {
    color: #07835f;
  }

  @media (max-width: 1180px) {
    .code-snapshot-toolbar {
      flex-wrap: wrap;
    }

    .code-snapshot-toolbar__intro {
      flex: 1 0 100%;
    }

    .code-snapshot-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 767px) {
    .code-snapshot-toolbar,
    .code-snapshot-options,
    .code-snapshot-preview-shell > footer {
      align-items: stretch;
      flex-direction: column;
    }

    .code-field {
      width: 100%;
    }

    .code-snapshot-editor :deep(textarea) {
      min-height: 320px;
    }

    .code-snapshot-stage {
      min-height: 360px;
      padding: 18px;
      place-items: center;
      overflow: hidden;
    }

    .code-snapshot-card {
      min-width: 0;
      width: 100%;
    }

    .code-snapshot-code {
      min-width: 0;
    }

    .code-snapshot-code code {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  }

  html.light-note-mobile-rendering .code-snapshot-toolbar,
  html.light-note-mobile-rendering .code-snapshot-editor,
  html.light-note-mobile-rendering .code-snapshot-preview-shell {
    box-shadow: none;
  }
</style>
