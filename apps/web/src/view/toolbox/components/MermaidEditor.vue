<template>
  <section class="mermaid-tool" :aria-label="t('toolbox.tool.mermaid_editor.name')">
    <div class="mermaid-tool__toolbar">
      <div>
        <label id="mermaid-sample">{{ t('toolbox.local.diagramTemplate') }}</label>
        <BSelect
          v-model:value="sampleType"
          :options="sampleOptions"
          aria-labelledby="mermaid-sample"
          @change="loadSample"
        />
      </div>
      <span>{{ t('toolbox.local.mermaidAutoPreview') }}</span>
      <BButton @click="copySource"
        ><SvgIcon :src="icon.toolbox.copy" size="15" />{{ t('toolbox.local.copySource') }}</BButton
      >
      <BButton @click="downloadSource"><SvgIcon :src="icon.toolbox.download" size="15" />MMD</BButton>
      <BButton type="primary" :loading="rendering" :disabled="!source.trim()" @click="renderNow">{{
        t('toolbox.local.renderNow')
      }}</BButton>
    </div>

    <div class="mermaid-tool__workspace">
      <div class="mermaid-tool__editor">
        <header
          ><strong>Mermaid</strong><span>{{ source.length.toLocaleString() }}/100,000</span></header
        >
        <BInput
          v-model:value="source"
          type="textarea"
          :rows="20"
          :maxlength="100000"
          :placeholder="t('toolbox.local.mermaidPlaceholder')"
        />
      </div>

      <div class="mermaid-tool__preview" :class="{ 'is-error': error }">
        <header>
          <div
            ><strong>{{ t('toolbox.local.livePreview') }}</strong
            ><span>{{ diagramTypeLabel }}</span></div
          >
          <div>
            <BButton size="small" :disabled="!svg" @click="downloadSvg"
              ><SvgIcon :src="icon.toolbox.download" size="14" />SVG</BButton
            >
            <BButton size="small" :loading="pngExporting" :disabled="!svg" @click="downloadPng"
              ><SvgIcon :src="icon.toolbox.download" size="14" />PNG</BButton
            >
          </div>
        </header>
        <div v-if="rendering && !svg" class="mermaid-tool__loading"
          ><BLoading inline loading :title="t('toolbox.local.renderingDiagram')"
        /></div>
        <div v-else-if="error" class="mermaid-tool__error" role="alert"
          ><SvgIcon :src="icon.message.info" size="18" /><span>{{ error }}</span></div
        >
        <!-- SVG 由项目内 Mermaid 以 strict 安全级别生成，属于运行时数据可视化。 -->
        <div v-else-if="svg" class="mermaid-tool__canvas" v-html="svg"></div>
        <div v-else class="mermaid-tool__empty">{{ t('toolbox.local.mermaidEmpty') }}</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { renderMermaidSource } from '@/utils/mermaidRender';
  import { downloadToolboxBlob, toolboxSvgToPng } from '@/utils/toolboxLocal';

  type SampleType = 'flowchart' | 'mindmap' | 'sequence' | 'timeline';
  const samples: Record<SampleType, string> = {
    flowchart:
      'flowchart TD\n  A[收集资料] --> B[整理观点]\n  B --> C{证据充分?}\n  C -->|是| D[形成结论]\n  C -->|否| E[继续核验]\n  E --> B',
    mindmap:
      'mindmap\n  root((知识项目))\n    资料\n      书签\n      文件\n    产出\n      笔记\n      行动项\n    复习\n      记忆卡片\n      自测题',
    sequence:
      'sequenceDiagram\n  participant U as 用户\n  participant L as 轻笺\n  U->>L: 选择资料\n  L-->>U: 返回处理结果\n  U->>L: 存入笔记',
    timeline:
      'timeline\n  title 知识项目里程碑\n  第 1 周 : 收集资料\n  第 2 周 : 对照分析\n  第 3 周 : 形成结论\n  第 4 周 : 复盘更新',
  };

  const { t } = useI18n();
  const sampleType = ref<SampleType>('flowchart');
  const source = ref(samples.flowchart);
  const svg = ref('');
  const error = ref('');
  const rendering = ref(false);
  const pngExporting = ref(false);
  let timer = 0;
  let renderVersion = 0;
  let themeObserver: MutationObserver | null = null;

  const sampleOptions = computed(() => [
    { value: 'flowchart', label: t('toolbox.local.diagramFlowchart') },
    { value: 'mindmap', label: t('toolbox.local.diagramMindmap') },
    { value: 'sequence', label: t('toolbox.local.diagramSequence') },
    { value: 'timeline', label: t('toolbox.local.diagramTimeline') },
  ]);
  const diagramTypeLabel = computed(
    () => sampleOptions.value.find((item) => item.value === sampleType.value)?.label || '',
  );

  async function renderNow() {
    window.clearTimeout(timer);
    const code = source.value.trim();
    renderVersion += 1;
    const version = renderVersion;
    if (!code) {
      svg.value = '';
      error.value = '';
      return;
    }
    rendering.value = true;
    error.value = '';
    try {
      const rendered = await renderMermaidSource(code);
      if (version === renderVersion) svg.value = rendered;
    } catch (cause) {
      if (version === renderVersion) {
        svg.value = '';
        error.value = String((cause as Error)?.message || t('toolbox.local.mermaidInvalid'))
          .replace(/\s+/gu, ' ')
          .slice(0, 240);
      }
    } finally {
      if (version === renderVersion) rendering.value = false;
    }
  }

  function scheduleRender() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void renderNow(), 450);
  }

  function loadSample() {
    source.value = samples[sampleType.value];
    void renderNow();
  }

  async function copySource() {
    const copied = await copyTextToClipboard(source.value);
    message[copied ? 'success' : 'error'](t(copied ? 'toolbox.local.copySuccess' : 'toolbox.local.copyFailed'));
  }

  function downloadSource() {
    downloadToolboxBlob(new Blob([source.value], { type: 'text/plain;charset=utf-8' }), 'lightnote-diagram.mmd');
  }

  function downloadSvg() {
    if (svg.value)
      downloadToolboxBlob(new Blob([svg.value], { type: 'image/svg+xml;charset=utf-8' }), 'lightnote-diagram.svg');
  }

  async function downloadPng() {
    if (!svg.value || pngExporting.value) return;
    pngExporting.value = true;
    try {
      downloadToolboxBlob(await toolboxSvgToPng(svg.value, 2), 'lightnote-diagram.png');
    } catch {
      message.error(t('toolbox.local.exportPngFailed'));
    } finally {
      pngExporting.value = false;
    }
  }

  watch(source, scheduleRender);
  onMounted(() => {
    themeObserver = new MutationObserver(() => void renderNow());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    void renderNow();
  });
  onBeforeUnmount(() => {
    window.clearTimeout(timer);
    renderVersion += 1;
    themeObserver?.disconnect();
  });
</script>

<style scoped lang="less">
  .mermaid-tool {
    display: grid;
    gap: 16px;
  }
  .mermaid-tool__toolbar {
    padding: 13px;
    display: flex;
    align-items: end;
    justify-content: flex-end;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .mermaid-tool__toolbar > div:first-child {
    width: min(280px, 100%);
    margin-right: auto;
    display: grid;
    gap: 6px;
  }
  .mermaid-tool__toolbar label {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }
  .mermaid-tool__toolbar > span {
    align-self: center;
    color: var(--desc-color);
    font-size: 12px;
  }
  .mermaid-tool__workspace {
    display: grid;
    grid-template-columns: minmax(330px, 0.8fr) minmax(0, 1.2fr);
    gap: 12px;
    align-items: stretch;
  }
  .mermaid-tool__editor,
  .mermaid-tool__preview {
    min-width: 0;
    min-height: 520px;
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .mermaid-tool__editor header,
  .mermaid-tool__preview > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .mermaid-tool__editor header span,
  .mermaid-tool__preview header span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .mermaid-tool__editor :deep(textarea) {
    min-height: 455px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    line-height: 1.6;
  }
  .mermaid-tool__preview > header > div {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mermaid-tool__canvas,
  .mermaid-tool__loading,
  .mermaid-tool__error,
  .mermaid-tool__empty {
    min-height: 455px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }
  .mermaid-tool__canvas {
    padding: 18px;
    overflow: auto;
  }
  .mermaid-tool__canvas :deep(svg) {
    max-width: 100%;
    height: auto;
  }
  .mermaid-tool__error {
    padding: 24px;
    gap: 9px;
    border: 1px solid var(--danger-color, #dc3e4d);
    color: var(--danger-color, #dc3e4d);
    text-align: left;
  }
  .mermaid-tool__empty {
    color: var(--desc-color);
  }
  @media (max-width: 1000px) {
    .mermaid-tool__workspace {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 767px) {
    .mermaid-tool__toolbar {
      align-items: stretch;
      flex-direction: column;
    }
    .mermaid-tool__toolbar > div:first-child {
      width: 100%;
      margin-right: 0;
    }
    .mermaid-tool__toolbar > span {
      align-self: flex-start;
    }
    .mermaid-tool__editor,
    .mermaid-tool__preview {
      min-height: 390px;
    }
    .mermaid-tool__editor :deep(textarea),
    .mermaid-tool__canvas,
    .mermaid-tool__loading,
    .mermaid-tool__error,
    .mermaid-tool__empty {
      min-height: 330px;
    }
    .mermaid-tool__preview > header {
      align-items: flex-start;
      flex-direction: column;
    }
  }
  html.light-note-mobile-rendering .mermaid-tool__canvas,
  html.light-note-mobile-rendering .mermaid-tool__loading,
  html.light-note-mobile-rendering .mermaid-tool__empty {
    background: var(--card-background);
    box-shadow: none;
  }
</style>
