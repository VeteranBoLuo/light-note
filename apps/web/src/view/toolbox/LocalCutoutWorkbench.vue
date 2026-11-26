<template>
  <main class="cutout-page" data-mobile-resource-scroll>
    <div class="cutout">
      <ToolboxPageHeader
        compact
        :native-mobile-back="false"
        :title="t('toolbox.presentation.cutoutPreview.name')"
        @back="returnToWorkshop"
      >
        <template #actions>
          <span class="cutout__privacy"><SvgIcon :src="icon.toolbox.local" size="16" />{{ label('local') }}</span>
        </template>
      </ToolboxPageHeader>

      <section ref="editorRoot" class="cutout__board" :aria-label="label('workspace')">
        <BUpload
          ref="picker"
          triggerless
          raw-file
          :multiple="false"
          accept="image/jpeg,image/png,image/webp"
          :max-total-size="null"
          @change="chooseImage"
        />
        <div class="cutout__toolbar" :aria-label="label('operations')">
          <div class="cutout__tools">
            <div class="cutout__segment" role="group" :aria-label="label('selectionTools')">
              <BButton class="mode" data-mode="pick" type="text" aria-pressed="true">
                <SvgIcon :src="icon.toolbox.locate" size="16" aria-hidden="true" />{{ label('pick') }}
              </BButton>
              <BButton class="mode" data-mode="rectangle" type="text" aria-pressed="false">
                <SvgIcon :src="icon.drawingNote.shapeTypes.rectangle" size="16" aria-hidden="true" />{{
                  label('rectangle')
                }}
              </BButton>
              <BButton class="mode" data-mode="add" type="text" aria-pressed="false">
                <SvgIcon :src="icon.common.plus" size="16" aria-hidden="true" />{{ label('add') }}
              </BButton>
              <BButton class="mode" data-mode="erase" type="text" aria-pressed="false">
                <SvgIcon :src="icon.drawingNote.eraser" size="16" aria-hidden="true" />{{ label('erase') }}
              </BButton>
            </div>
            <div class="cutout__history" role="group" :aria-label="label('history')">
              <BButton id="undo" type="text" icon-only :aria-label="label('undo')" :title="label('undo')">
                <SvgIcon :src="icon.noteDetail.toolbar.undo" size="16" aria-hidden="true" />
              </BButton>
              <BButton id="redo" type="text" icon-only :aria-label="label('redo')" :title="label('redo')">
                <SvgIcon :src="icon.noteDetail.toolbar.redo" size="16" aria-hidden="true" />
              </BButton>
              <BButton
                id="reset-selection"
                type="text"
                :aria-label="label('resetSelection')"
                :title="label('resetSelection')"
              >
                <SvgIcon :src="icon.toolbox.rotate" size="16" aria-hidden="true" />{{ label('reset') }}
              </BButton>
            </div>
          </div>
          <div class="cutout__actions">
            <BButton id="upload" type="text"
              ><SvgIcon :src="icon.toolbox.swap" size="16" aria-hidden="true" />{{ label('replace') }}</BButton
            >
            <div class="cutout__segment" role="group" :aria-label="label('zoom')">
              <BButton id="zoom-out" type="text" icon-only :aria-label="label('zoomOut')">
                <SvgIcon :src="icon.cloudSpace.preview.zoomOut" size="16" aria-hidden="true" />
              </BButton>
              <BButton id="zoom-fit" type="text" :title="label('fit')" :aria-label="label('fit')">{{
                label('fit')
              }}</BButton>
              <BButton id="zoom-in" type="text" icon-only :aria-label="label('zoomIn')">
                <SvgIcon :src="icon.cloudSpace.preview.zoomIn" size="16" aria-hidden="true" />
              </BButton>
            </div>
            <div class="cutout__segment" role="group" :aria-label="label('output')">
              <BButton class="output-mode" data-output="keep" type="text" aria-pressed="true">{{
                label('keep')
              }}</BButton>
              <BButton class="output-mode" data-output="remove" type="text" aria-pressed="false">{{
                label('remove')
              }}</BButton>
            </div>
            <BButton id="continue-removal" hidden>{{ label('continueRemoval') }}</BButton>
            <BButton id="download" type="primary">
              <span id="download-icon" aria-hidden="true"><SvgIcon :src="icon.toolbox.download" size="16" /></span>
              <span id="repair-icon" aria-hidden="true" hidden><SvgIcon :src="icon.common.magicWand" size="16" /></span>
              <span id="action-label">{{ label('downloadKeep') }}</span>
            </BButton>
          </div>
        </div>
        <label id="brush-controls" class="cutout__brush" for="brush-size" hidden>
          {{ label('brush') }}
          <input id="brush-size" type="range" min="4" max="72" value="20" />
          <output for="brush-size" id="brush-value">20 px</output>
        </label>

        <div id="empty-stage" class="cutout__empty-stage" @dragover.prevent @drop.prevent="dropImage">
          <div class="cutout__empty">
            <span class="cutout__image-icon" aria-hidden="true"><SvgIcon :src="icon.toolbox.image" size="28" /></span>
            <BButton id="choose" type="primary"
              ><SvgIcon :src="icon.toolbox.upload" size="16" />{{ label('choose') }}</BButton
            >
            <p>{{ label('formats') }}</p>
          </div>
        </div>

        <div id="loaded-stage" class="cutout__panes" hidden>
          <section class="cutout__pane" aria-labelledby="original-title">
            <header class="cutout__pane-head">
              <h2 id="original-title">{{ label('original') }}</h2>
              <span id="canvas-hint">{{ label('pickHint') }}</span>
            </header>
            <div id="original-stage" class="cutout__stage">
              <div id="source-frame" class="cutout__frame" hidden>
                <canvas id="source" tabindex="0" :aria-label="label('canvasLabel')"></canvas>
                <canvas id="outline" aria-hidden="true"></canvas>
                <span id="point" aria-hidden="true" hidden></span>
                <span id="brush-cursor" aria-hidden="true" hidden></span>
              </div>
            </div>
          </section>
          <section class="cutout__pane" aria-labelledby="preview-title">
            <header class="cutout__pane-head">
              <h2 id="preview-title">{{ label('keepPreview') }}</h2>
              <div id="preview-backgrounds" class="cutout__backgrounds" role="group" :aria-label="label('backgrounds')">
                <BButton data-background="checker" type="text" aria-pressed="true">{{ label('checker') }}</BButton>
                <BButton data-background="white" type="text" aria-pressed="false">{{ label('white') }}</BButton>
                <BButton data-background="dark" type="text" aria-pressed="false">{{ label('dark') }}</BButton>
              </div>
            </header>
            <div id="preview-stage" class="cutout__stage" data-background="checker">
              <div id="preview-frame" class="cutout__frame" hidden
                ><canvas id="result" :aria-label="label('result')"></canvas
              ></div>
              <p id="preview-empty">{{ label('emptyKeep') }}</p>
            </div>
          </section>
        </div>

        <footer class="cutout__footer">
          <p class="cutout__file"
            ><span id="file-name">{{ label('noImage') }}</span
            ><span id="file-size"></span
          ></p>
          <p>{{ t('toolbox.localFreeLabel') }}</p>
          <div id="status-row" class="cutout__status" hidden>
            <p id="status" role="status" aria-live="polite"></p>
            <span id="timing"></span>
            <BButton id="cancel-repair" type="text" hidden>{{ label('cancel') }}</BButton>
          </div>
        </footer>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import icon from '@/config/icon';
  import { returnFromToolboxPage } from '@/utils/toolboxNavigation';
  import { createCutoutEditor } from '../../../e2e/portrait-cutout/editor.js';
  import ToolboxPageHeader from './components/ToolboxPageHeader.vue';

  const { t, locale } = useI18n();
  const label = (key: string, params?: Record<string, string | number>) =>
    t(`toolbox.presentation.cutoutPreview.editor.${key}`, params ?? {});
  const router = useRouter();
  const editorRoot = ref<HTMLElement>();
  const picker = ref<InstanceType<typeof BUpload>>();
  let editor: ReturnType<typeof createCutoutEditor> | undefined;

  function returnToWorkshop() {
    returnFromToolboxPage(router, 'workbench');
  }

  useMobileTopBar(['localCutoutPreview'], {
    title: () => t('toolbox.presentation.cutoutPreview.name'),
    onBack: returnToWorkshop,
    ownTopBar: true,
    showNotification: false,
  });

  function chooseImage(files: File[]) {
    editor?.acceptImage(files);
  }

  function dropImage(event: DragEvent) {
    const files = Array.from(event.dataTransfer?.files ?? []);
    chooseImage(files);
  }

  onMounted(() => {
    if (!editorRoot.value) return;
    editor = createCutoutEditor(editorRoot.value, {
      text: label,
      openPicker: () => picker.value?.open(),
    });
  });

  watch(locale, () => editor?.refreshLanguage());

  onUnmounted(() => editor?.dispose());
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  @import './toolboxPageScroll.less';

  .cutout-page {
    .toolbox-page-scroll();
    padding: var(--ui-space-16, 16px) clamp(var(--ui-space-20, 20px), 4vw, var(--ui-space-52, 52px))
      var(--ui-space-20, 20px);
  }

  .cutout {
    --cutout-stage-height: clamp(var(--ui-layout-320, 320px), 55vh, calc(2 * var(--ui-layout-320, 320px)));
    width: min(100%, var(--ui-layout-1240, 1240px));
    box-sizing: border-box;
    margin-inline: auto;
    color: var(--workspace-text);
  }

  .cutout [hidden] {
    display: none !important;
  }

  .cutout p,
  .cutout h2 {
    margin: 0;
  }

  .cutout__privacy {
    display: flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }

  .cutout__board {
    .workspace-content-surface();
    overflow: hidden;
    margin-top: var(--ui-space-8, 8px);
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
  }

  .cutout__empty-stage {
    display: grid;
    place-items: center;
    min-height: calc(var(--cutout-stage-height) + var(--ui-control-40, 40px));
    box-sizing: border-box;
    padding: var(--ui-space-16, 16px);
    background: var(--workspace-canvas);
  }

  .cutout__empty {
    box-sizing: border-box;
    display: grid;
    width: min(100%, var(--ui-layout-460, 460px));
    justify-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-32, 32px) var(--ui-space-12, 12px);
    background: var(--workspace-content);
    border: 1px dashed var(--workspace-border);
    border-radius: 12px;
    color: var(--workspace-muted);
    font-size: var(--ui-font-13, 13px);
    text-align: center;
  }

  .cutout__image-icon {
    display: grid;
    place-items: center;
    width: var(--ui-layout-44, 44px);
    height: var(--ui-layout-44, 44px);
    border-radius: 10px;
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }

  .cutout__toolbar,
  .cutout__tools,
  .cutout__actions,
  .cutout__history,
  .cutout__segment,
  .cutout__backgrounds {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-6, 6px);
  }

  .cutout__toolbar,
  .cutout__brush {
    padding: var(--ui-space-6, 6px) var(--ui-space-10, 10px);
    border-bottom: 1px solid var(--workspace-divider);
  }

  .cutout__actions {
    margin-inline-start: auto;
  }

  .cutout__segment {
    gap: var(--ui-space-2, 2px);
    padding: var(--ui-space-2, 2px);
    border: 1px solid var(--workspace-border);
    border-radius: 9px;
    background: var(--workspace-canvas);
  }

  .cutout .b_btn {
    gap: var(--ui-space-5, 5px);
    padding-inline: var(--ui-space-8, 8px);
  }

  .cutout .b_btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .cutout .b_btn[aria-pressed='true'] {
    border: 1px solid var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
    color: var(--workspace-purple-text);
  }

  .cutout__brush {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--workspace-muted);
    font-size: var(--ui-font-13, 13px);
  }

  .cutout__brush input {
    width: var(--ui-layout-112, 112px);
    accent-color: var(--primary-color);
  }

  .cutout__panes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cutout__pane + .cutout__pane {
    border-inline-start: 1px solid var(--workspace-divider);
  }

  .cutout__pane-head {
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: var(--ui-control-40, 40px);
    gap: var(--ui-space-6, 6px);
    padding: var(--ui-space-4, 4px) var(--ui-space-12, 12px);
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }

  .cutout__pane-head h2 {
    color: var(--workspace-text);
    font-size: var(--ui-font-14, 14px);
  }

  .cutout__pane-head .b_btn {
    padding-inline: var(--ui-space-5, 5px);
    font-size: var(--ui-font-12, 12px);
  }

  .cutout__backgrounds {
    gap: var(--ui-space-2, 2px);
  }

  .cutout__stage {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    overflow: auto;
    box-sizing: border-box;
    height: var(--cutout-stage-height);
    padding: var(--ui-space-14, 14px);
    background: var(--workspace-canvas);
  }

  .cutout__frame {
    position: relative;
    flex: none;
    margin: auto;
  }

  #preview-stage[data-background='checker'] .cutout__frame {
    background: repeating-conic-gradient(var(--workspace-border) 0 25%, var(--workspace-content) 0 50%) 0 0 /
      var(--ui-space-16, 16px) var(--ui-space-16, 16px);
  }

  #preview-stage[data-background='white'] .cutout__frame {
    background: #fff;
  }
  #preview-stage[data-background='dark'] .cutout__frame {
    background: #25263a;
  }

  #preview-empty {
    margin: auto;
    padding: var(--ui-space-8, 8px);
    color: var(--workspace-muted);
    font-size: var(--ui-font-13, 13px);
    text-align: center;
  }

  .cutout__frame canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  #source {
    cursor: crosshair;
    touch-action: auto;
  }
  #source-frame.is-brushing #source,
  #source-frame.is-boxing #source {
    touch-action: none;
  }
  #source-frame.is-brushing #source {
    cursor: none;
  }

  #outline {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  #point,
  #brush-cursor {
    z-index: 1;
    position: absolute;
    pointer-events: none;
    transform: translate(-50%, -50%);
    border-radius: 50%;
  }

  #point {
    /* ui-density-fixed: 图像选点标记与编辑坐标对齐，不参与界面密度缩放 */
    width: 15px;
    /* ui-density-fixed: 图像选点标记与编辑坐标对齐，不参与界面密度缩放 */
    height: 15px;
    border: 2px solid #fff;
    background: var(--primary-color);
    box-shadow: 0 0 0 1px var(--workspace-purple-text);
  }

  #brush-cursor {
    border: 1px solid #fff;
    box-shadow: 0 0 0 1px #131022;
  }

  .cutout__footer {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) var(--ui-space-10, 10px);
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    border-top: 1px solid var(--workspace-divider);
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }

  .cutout__file {
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
  }

  #file-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  #file-size {
    flex: none;
  }

  .cutout__status {
    flex: 0 0 100%;
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }

  #status.is-error {
    color: var(--danger-color);
  }
  #timing {
    flex: none;
    font-variant-numeric: tabular-nums;
  }

  @media (min-width: 768px) {
    .cutout,
    .cutout__board,
    .cutout__pane {
      display: flex;
      flex-direction: column;
    }

    .cutout {
      height: 100%;
    }

    .cutout__board {
      flex: 1;
      min-height: var(--ui-layout-320, 320px);
    }

    .cutout__panes,
    .cutout__empty-stage,
    .cutout__stage {
      flex: 1;
      min-height: 0;
    }

    .cutout__panes {
      grid-template-rows: minmax(0, 1fr);
    }

    .cutout__pane {
      min-height: 0;
    }

    .cutout__pane-head {
      flex: none;
    }

    .cutout__stage {
      height: auto;
    }
  }

  @media (max-width: 767px) {
    .cutout-page {
      padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px)
        calc(var(--ui-space-20, 20px) + env(safe-area-inset-bottom));
    }

    .cutout {
      --cutout-stage-height: clamp(var(--ui-layout-220, 220px), 70vw, var(--ui-layout-360, 360px));
    }
    .cutout__actions {
      margin-inline-start: 0;
    }
    .cutout__actions .b_btn,
    .cutout__tools .b_btn,
    .cutout__empty .b_btn {
      min-height: var(--ui-control-40, 40px);
    }
    .cutout__panes {
      grid-template-columns: minmax(0, 1fr);
    }
    .cutout__pane + .cutout__pane {
      border-inline-start: 0;
      border-top: 1px solid var(--workspace-divider);
    }
    .cutout__stage {
      padding: var(--ui-space-8, 8px);
    }
  }
</style>
