<template>
  <main class="presentation-editor">
    <BLoading
      v-if="loading"
      class="presentation-editor__center"
      inline
      loading
      :title="t('toolboxProject.presentation.editor.loading')"
    />
    <section v-else-if="loadError" class="presentation-editor__center is-error" role="alert">
      <SvgIcon :src="icon.toolbox.task" size="28" />
      <strong>{{ t('toolboxProject.presentation.editor.loadFailed') }}</strong>
      <span>{{ t('toolboxProject.presentation.editor.loadFailedHint') }}</span>
      <div class="presentation-editor__error-actions">
        <BButton @click="goBack">{{ t('toolboxProject.presentation.back') }}</BButton>
        <BButton type="primary" @click="loadProject">{{ t('common.retry') }}</BButton>
      </div>
    </section>
    <template v-else-if="project">
      <header class="presentation-toolbar">
        <BButton class="presentation-toolbar__back" :aria-label="t('toolboxProject.presentation.back')" @click="goBack">
          <SvgIcon :src="icon.toolbox.back" size="18" />
        </BButton>
        <BInput
          v-model:value="draftTitle"
          class="presentation-toolbar__title"
          :maxlength="120"
          :placeholder="t('toolboxProject.presentation.untitled')"
        />
        <BChip :tone="saveTone" class="presentation-toolbar__state">{{ saveLabel }}</BChip>
        <div class="presentation-toolbar__actions">
          <BButton size="small" @click="versionsOpen = true">
            <SvgIcon :src="icon.noteDetail.history" size="15" />
            {{ t('toolboxProject.versions.title') }}
          </BButton>
          <BActionMenu
            :items="exportItems"
            :disabled="exporting"
            placement="bottom-right"
            :aria-label="t('toolboxProject.presentation.editor.export')"
            @select="handleExport"
          >
            <BButton size="small" :loading="exporting">
              <SvgIcon :src="icon.toolbox.download" size="15" />
              {{ t('toolboxProject.presentation.editor.export') }}
            </BButton>
          </BActionMenu>
          <BButton
            type="primary"
            size="small"
            :loading="saveState === 'saving'"
            :disabled="saveState === 'conflict'"
            @click="saveNow"
          >
            <SvgIcon :src="icon.noteDetail.saveLine" size="15" />
            {{ t('toolboxProject.editor.save') }}
          </BButton>
        </div>
      </header>

      <div
        v-if="saveState === 'conflict' || saveState === 'failed' || !localDraftProtected"
        class="presentation-status-stack"
      >
        <section v-if="saveState === 'conflict'" class="presentation-conflict" role="alert">
          <div>
            <strong>{{ t('toolboxProject.presentation.conflict.title') }}</strong>
            <span>{{
              t(
                localDraftProtected
                  ? 'toolboxProject.presentation.conflict.description'
                  : 'toolboxProject.presentation.conflict.unprotectedDescription',
              )
            }}</span>
          </div>
          <div class="presentation-conflict__actions">
            <BButton size="small" @click="copyLocalDraft">
              <SvgIcon :src="icon.toolbox.copy" size="15" />
              {{ t('toolboxProject.presentation.conflict.copy') }}
            </BButton>
            <BButton size="small" @click="handleExport('pptx')">
              <SvgIcon :src="icon.toolbox.download" size="15" />
              {{ t('toolboxProject.presentation.conflict.export') }}
            </BButton>
            <BButton type="primary" size="small" @click="confirmReloadLatest">
              {{ t('toolboxProject.editor.reloadLatest') }}
            </BButton>
          </div>
        </section>
        <section v-else-if="saveState === 'failed'" class="presentation-save-error" role="alert">
          <span>{{ t('toolboxProject.presentation.editor.saveFailedHint') }}</span>
          <BButton size="small" @click="saveNow">{{ t('common.retry') }}</BButton>
        </section>
        <section v-if="!localDraftProtected" class="presentation-draft-warning" role="alert">
          <div>
            <strong>{{ t('toolboxProject.editor.draftUnprotectedTitle') }}</strong>
            <span>{{ t('toolboxProject.editor.draftUnprotectedDescription') }}</span>
          </div>
          <div class="presentation-draft-warning__actions">
            <BButton size="small" @click="copyLocalDraft">
              <SvgIcon :src="icon.toolbox.copy" size="15" />
              {{ t('toolboxProject.presentation.conflict.copy') }}
            </BButton>
            <BButton size="small" @click="handleExport('pptx')">
              <SvgIcon :src="icon.toolbox.download" size="15" />
              {{ t('toolboxProject.editor.exportDraft') }}
            </BButton>
          </div>
        </section>
      </div>

      <div class="presentation-workspace">
        <aside class="presentation-slides" :aria-label="t('toolboxProject.presentation.editor.slides')">
          <header>
            <div>
              <strong>{{ t('toolboxProject.presentation.editor.slides') }}</strong>
              <small>{{
                t('toolboxProject.presentation.editor.slideCount', { count: draftContent.slides.length })
              }}</small>
            </div>
            <BButton size="small" :aria-label="t('toolboxProject.presentation.editor.addSlide')" @click="addSlide">
              <SvgIcon :src="icon.common.plus" size="16" />
            </BButton>
          </header>
          <div class="presentation-slides__list">
            <article
              v-for="(slide, index) in draftContent.slides"
              :key="slide.id"
              class="presentation-slide-item"
              :class="{ 'is-selected': slide.id === selectedSlideId }"
            >
              <BButton
                class="presentation-slide-item__select"
                :aria-label="t('toolboxProject.presentation.editor.selectSlide', { number: index + 1 })"
                @click="selectedSlideId = slide.id"
              >
                <span class="presentation-slide-item__number">{{ index + 1 }}</span>
                <span
                  class="presentation-slide-item__canvas"
                  :class="`is-layout-${slide.layout}`"
                  :style="{ background: draftContent.theme.background, color: draftContent.theme.accent }"
                >
                  <strong>{{ slide.title || t('toolboxProject.presentation.editor.untitledSlide') }}</strong>
                  <small>{{ slide.body.value || t('toolboxProject.presentation.editor.emptyBody') }}</small>
                </span>
              </BButton>
              <div class="presentation-slide-item__actions">
                <BButton
                  size="small"
                  :disabled="index === 0"
                  :aria-label="t('toolboxProject.presentation.editor.moveUp')"
                  @click="moveSlide(index, index - 1)"
                >
                  <SvgIcon class="is-up" :src="icon.noteTree.chevron" size="14" />
                </BButton>
                <BButton
                  size="small"
                  :disabled="index === draftContent.slides.length - 1"
                  :aria-label="t('toolboxProject.presentation.editor.moveDown')"
                  @click="moveSlide(index, index + 1)"
                >
                  <SvgIcon :src="icon.noteTree.chevron" size="14" />
                </BButton>
                <BButton
                  size="small"
                  class="is-danger"
                  :aria-label="t('toolboxProject.presentation.editor.deleteSlide')"
                  @click="deleteSlide(index)"
                >
                  <SvgIcon :src="icon.toolbox.delete" size="14" />
                </BButton>
              </div>
            </article>
          </div>
          <BButton class="presentation-slides__add" @click="addSlide">
            <SvgIcon :src="icon.common.plus" size="15" />
            {{ t('toolboxProject.presentation.editor.addSlide') }}
          </BButton>
        </aside>

        <section class="presentation-stage" :aria-label="t('toolboxProject.presentation.editor.canvas')">
          <header class="presentation-stage__settings">
            <label>
              <span>{{ t('toolboxProject.presentation.editor.layout') }}</span>
              <BSelect v-model:value="selectedLayout" :options="layoutOptions" />
            </label>
            <label>
              <span>{{ t('toolboxProject.presentation.editor.aspectRatio') }}</span>
              <BSelect v-model:value="draftContent.canvas.aspectRatio" :options="aspectOptions" />
            </label>
            <label>
              <span>{{ t('toolboxProject.presentation.editor.theme') }}</span>
              <BSelect v-model:value="selectedTheme" :options="themeOptions" />
            </label>
          </header>
          <nav class="presentation-ribbon" :aria-label="t('toolboxProject.presentation.editor.insertAndArrange')">
            <div class="presentation-ribbon__group">
              <span>{{ t('toolboxProject.presentation.editor.insert') }}</span>
              <BButton size="small" @click="insertTextElement">
                <SvgIcon :src="icon.drawingNote.text" size="16" />
                {{ t('toolboxProject.presentation.editor.text') }}
              </BButton>
              <BActionMenu
                :items="shapeItems"
                width="196"
                :aria-label="t('toolboxProject.presentation.editor.shape')"
                @select="insertShapeElement"
              >
                <BButton size="small">
                  <SvgIcon :src="icon.drawingNote.shape" size="16" />
                  {{ t('toolboxProject.presentation.editor.shape') }}
                </BButton>
              </BActionMenu>
              <BUpload
                :multiple="false"
                accept="image/png,image/jpeg,image/webp"
                :max-total-size="1250000"
                @change="insertImageElement"
              >
                <BButton size="small">
                  <SvgIcon :src="icon.noteDetail.toolbar.image" size="16" />
                  {{ t('toolboxProject.presentation.editor.image') }}
                </BButton>
              </BUpload>
            </div>
            <div class="presentation-ribbon__group">
              <span>{{ t('toolboxProject.presentation.editor.arrange') }}</span>
              <BButton size="small" :disabled="!selectedElement" @click="duplicateSelectedElement">
                <SvgIcon :src="icon.noteDetail.imageToolbar.copy" size="16" />
                {{ t('toolboxProject.presentation.editor.duplicate') }}
              </BButton>
              <BButton
                size="small"
                :disabled="!selectedElement || selectedElementIsFront"
                @click="moveSelectedElementLayer(1)"
              >
                {{ t('toolboxProject.presentation.editor.bringForward') }}
              </BButton>
              <BButton
                size="small"
                :disabled="!selectedElement || selectedElementIsBack"
                @click="moveSelectedElementLayer(-1)"
              >
                {{ t('toolboxProject.presentation.editor.sendBackward') }}
              </BButton>
              <BButton class="is-danger" size="small" :disabled="!selectedElement" @click="deleteSelectedElement">
                <SvgIcon :src="icon.toolbox.delete" size="15" />
                {{ t('common.delete') }}
              </BButton>
            </div>
          </nav>
          <div class="presentation-stage__viewport">
            <div
              v-if="selectedSlide"
              ref="canvasRef"
              class="presentation-canvas"
              :class="`is-layout-${selectedSlide.layout}`"
              tabindex="0"
              :style="{
                aspectRatio: draftContent.canvas.aspectRatio === '4:3' ? '4 / 3' : '16 / 9',
                background: draftContent.theme.background,
                '--slide-accent': draftContent.theme.accent,
              }"
              @pointerdown.self="clearCanvasSelection"
              @keydown="handleCanvasKeydown"
            >
              <span class="presentation-canvas__accent" aria-hidden="true"></span>
              <BInput
                v-model:value="selectedSlide.title"
                class="presentation-canvas__title"
                :maxlength="180"
                :placeholder="t('toolboxProject.presentation.editor.slideTitlePlaceholder')"
              />
              <BInput
                v-model:value="selectedSlide.body.value"
                class="presentation-canvas__body"
                type="textarea"
                :rows="8"
                :maxlength="16000"
                :placeholder="t('toolboxProject.presentation.editor.slideBodyPlaceholder')"
              />
              <div
                v-for="element in selectedSlide.elements || []"
                :key="element.id"
                class="presentation-element"
                :class="[
                  `is-${element.type}`,
                  {
                    'is-selected': element.id === selectedElementId,
                    'is-editing': element.id === editingTextElementId,
                  },
                ]"
                :style="presentationElementStyle(element)"
                :data-presentation-element-id="element.id"
                role="group"
                :aria-label="elementAriaLabel(element)"
                tabindex="0"
                @pointerdown.stop="handleElementPointerDown($event, element)"
                @dblclick.stop="handleElementDoubleClick($event, element)"
                @focus="selectedElementId = element.id"
                @keydown="handleElementKeydown($event, element.id)"
              >
                <div
                  v-if="element.type === 'text' && element.id === editingTextElementId"
                  class="presentation-element__text"
                  :style="presentationTextStyle(element)"
                >
                  <div
                    class="presentation-element__text-editor"
                    contenteditable="plaintext-only"
                    role="textbox"
                    aria-multiline="true"
                    :aria-label="t('toolboxProject.presentation.editor.editTextOnCanvas')"
                    spellcheck="true"
                    @pointerdown.stop
                    @click.stop
                    @dblclick.stop
                    @input="handleCanvasTextInput($event, element)"
                    @keydown.stop="handleCanvasTextEditorKeydown"
                    @paste="handleCanvasTextPaste($event, element)"
                    @blur="handleCanvasTextBlur(element.id)"
                  ></div>
                </div>
                <span
                  v-else-if="element.type === 'text'"
                  class="presentation-element__text"
                  :style="presentationTextStyle(element)"
                  >{{ element.text }}</span
                >
                <img
                  v-else-if="element.type === 'image'"
                  class="presentation-element__image"
                  :src="element.src"
                  :alt="element.alt"
                  :style="{ objectFit: element.fit }"
                />
                <span
                  v-else
                  class="presentation-element__shape"
                  :class="`is-shape-${element.shape}`"
                  :style="presentationShapeStyle(element)"
                >
                  <span v-if="element.text && !['line', 'arrow'].includes(element.shape)">{{ element.text }}</span>
                </span>
                <BButton
                  v-if="element.id === selectedElementId"
                  class="presentation-element__resize"
                  :aria-label="t('toolboxProject.presentation.editor.resizeElement')"
                  @pointerdown.stop="startElementResize($event, element.id)"
                />
              </div>
              <span class="presentation-canvas__number">{{ selectedSlideNumber }}</span>
            </div>
          </div>
          <footer>
            <span>{{ t('toolboxProject.editor.autosaveHint') }}</span>
            <span>{{
              t('toolboxProject.presentation.editor.aspectValue', { value: draftContent.canvas.aspectRatio })
            }}</span>
          </footer>
        </section>

        <aside v-if="selectedSlide" class="presentation-inspector">
          <header>
            <div>
              <strong>{{
                selectedElement
                  ? t('toolboxProject.presentation.editor.formatElement')
                  : t('toolboxProject.presentation.editor.slideInspector')
              }}</strong>
              <small>{{
                selectedElement
                  ? t('toolboxProject.presentation.editor.formatElementHint')
                  : t('toolboxProject.presentation.editor.slideInspectorHint')
              }}</small>
            </div>
            <SvgIcon :src="selectedElement ? icon.drawingNote.style : icon.toolbox.presentationStudio" size="20" />
          </header>
          <div v-if="selectedElement" class="presentation-inspector__body">
            <section class="presentation-inspector__section">
              <strong>{{ t('toolboxProject.presentation.editor.positionAndSize') }}</strong>
              <div class="presentation-inspector__geometry">
                <label v-for="field in geometryFields" :key="field.key">
                  <span>{{ field.label }}</span>
                  <BInput
                    type="number"
                    :value="selectedElement[field.key]"
                    @input="updateSelectedElementNumber(field.key, $event)"
                  />
                </label>
              </div>
              <BButton size="small" @click="centerSelectedElement">
                {{ t('toolboxProject.presentation.editor.centerOnCanvas') }}
              </BButton>
            </section>
            <section v-if="selectedTextElement" class="presentation-inspector__section">
              <strong>{{ t('toolboxProject.presentation.editor.textStyle') }}</strong>
              <BInput
                v-model:value="selectedTextElement.text"
                type="textarea"
                :rows="5"
                :maxlength="4000"
                :placeholder="t('toolboxProject.presentation.editor.textPlaceholder')"
              />
              <div class="presentation-inspector__field-grid">
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.fontSize') }}</span>
                  <BInput v-model:value="selectedTextElement.fontSize" type="number" />
                </label>
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.fontWeight') }}</span>
                  <BSelect v-model:value="selectedTextElement.fontWeight" :options="fontWeightOptions" />
                </label>
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.alignment') }}</span>
                  <BSelect v-model:value="selectedTextElement.align" :options="textAlignOptions" />
                </label>
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.textColor') }}</span>
                  <BSelect v-model:value="selectedTextElement.color" :options="colorOptions" />
                </label>
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.fillColor') }}</span>
                  <BSelect v-model:value="selectedTextElement.fill" :options="fillColorOptions" />
                </label>
              </div>
            </section>
            <section v-else-if="selectedShapeElement" class="presentation-inspector__section">
              <strong>{{ t('toolboxProject.presentation.editor.shapeStyle') }}</strong>
              <BInput
                v-if="!['line', 'arrow'].includes(selectedShapeElement.shape)"
                v-model:value="selectedShapeElement.text"
                :maxlength="500"
                :placeholder="t('toolboxProject.presentation.editor.shapeTextPlaceholder')"
              />
              <div class="presentation-inspector__field-grid">
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.shape') }}</span>
                  <BSelect v-model:value="selectedShapeElement.shape" :options="shapeOptions" />
                </label>
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.fillColor') }}</span>
                  <BSelect v-model:value="selectedShapeElement.fill" :options="fillColorOptions" />
                </label>
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.strokeColor') }}</span>
                  <BSelect v-model:value="selectedShapeElement.stroke" :options="colorOptions" />
                </label>
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.strokeWidth') }}</span>
                  <BInput v-model:value="selectedShapeElement.strokeWidth" type="number" />
                </label>
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.textColor') }}</span>
                  <BSelect v-model:value="selectedShapeElement.color" :options="colorOptions" />
                </label>
                <label>
                  <span>{{ t('toolboxProject.presentation.editor.fontSize') }}</span>
                  <BInput v-model:value="selectedShapeElement.fontSize" type="number" />
                </label>
              </div>
            </section>
            <section v-else-if="selectedImageElement" class="presentation-inspector__section">
              <strong>{{ t('toolboxProject.presentation.editor.imageStyle') }}</strong>
              <label>
                <span>{{ t('toolboxProject.presentation.editor.imageFit') }}</span>
                <BSelect v-model:value="selectedImageElement.fit" :options="imageFitOptions" />
              </label>
              <label>
                <span>{{ t('toolboxProject.presentation.editor.imageAlt') }}</span>
                <BInput v-model:value="selectedImageElement.alt" :maxlength="500" />
              </label>
            </section>
          </div>
          <section class="presentation-inspector__notes presentation-notes">
            <header>
              <strong>{{ t('toolboxProject.presentation.editor.notes') }}</strong>
              <small>{{ t('toolboxProject.presentation.editor.notesHint') }}</small>
            </header>
            <BInput
              v-model:value="selectedSlide.notes"
              type="textarea"
              :rows="selectedElement ? 5 : 12"
              :maxlength="16000"
              :placeholder="t('toolboxProject.presentation.editor.notesPlaceholder')"
            />
          </section>
        </aside>
      </div>

      <BDrawer
        :open="versionsOpen"
        :title="t('toolboxProject.versions.title')"
        width="420px"
        mobile-full-screen
        mobile-centered-header
        body-padding="16px"
        @close="versionsOpen = false"
      >
        <ToolboxProjectVersions
          :items="revisions"
          :loading="versionsLoading"
          :has-more="Boolean(versionsCursor)"
          :loading-more="versionsLoadingMore"
          :error="versionsError"
          :naming="namingVersion"
          :current-revision="project.currentRevision"
          :restoring-revision="restoringRevision"
          @retry="loadVersions()"
          @load-more="loadMoreVersions"
          @name="createNamedVersion"
          @restore="confirmRestore"
        />
      </BDrawer>
    </template>
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
  import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import type {
    ProductionPresentationContentV1,
    ProductionPresentationElementV1,
    ProductionPresentationImageElementV1,
    ProductionPresentationShapeElementV1,
    ProductionPresentationTextElementV1,
  } from '@lightnote/shared/production-project-protocol';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BMessage from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';
  import {
    readProductionProjectDraft,
    removeProductionProjectDraft,
    replaceProductionProjectWithLatest,
    shouldOfferProductionProjectDraftRecovery,
    writeProductionProjectDraft,
    type ProductionProjectLocalDraft,
  } from '@/utils/productionProjectDraftRecovery';
  import {
    exportProductionPresentationPdf,
    exportProductionPresentationPngZip,
    exportProductionPresentationPptx,
    isProductionPresentationExportOverflowError,
  } from '@/utils/productionProjectPresentationExport';
  import ToolboxProjectVersions from './components/ToolboxProjectVersions.vue';
  import {
    createPresentationContent,
    createPresentationImageElement,
    createPresentationShapeElement,
    createPresentationSlide,
    createPresentationTextElement,
    clonePresentationContent,
    clonePresentationElement,
    movePresentationSlide,
    presentationContentForSave,
    presentationContentSnapshot,
  } from './presentationProjectState';
  import {
    createToolboxProjectClientRequestId,
    fetchToolboxProject,
    fetchToolboxProjectRevisionsPage,
    isToolboxProjectConflict,
    openToolboxProject,
    restoreToolboxProjectRevision,
    saveToolboxProjectRevision,
    updateToolboxProject,
    type ToolboxProjectDetail,
    type ToolboxProjectRevisionSummary,
    type ToolboxProjectSummary,
  } from '@/api/toolboxProjects';

  type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';
  type ExportKind = 'pptx' | 'pdf' | 'png';
  type PresentationGeometryField = 'x' | 'y' | 'width' | 'height' | 'rotation';
  type TextEditingOptions = { selectAll?: boolean; clientX?: number; clientY?: number };
  type CaretDocument = Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  type ElementInteraction = {
    mode: 'move' | 'resize';
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  };

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const loading = ref(true);
  const loadError = ref(false);
  const project = ref<ToolboxProjectSummary | null>(null);
  const draftTitle = ref('');
  const draftContent = ref<ProductionPresentationContentV1>(createPresentationContent());
  const selectedSlideId = ref('');
  const selectedElementId = ref('');
  const editingTextElementId = ref('');
  const canvasRef = ref<HTMLElement | null>(null);
  const canvasScale = ref(1);
  const elementInteraction = ref<ElementInteraction | null>(null);
  const savedTitle = ref('');
  const savedContent = ref('');
  const hydrated = ref(false);
  const saveState = ref<SaveState>('idle');
  const exporting = ref(false);
  const versionsOpen = ref(false);
  const revisions = ref<ToolboxProjectRevisionSummary[]>([]);
  const versionsLoading = ref(false);
  const versionsLoadingMore = ref(false);
  const versionsCursor = ref<string | null>(null);
  const versionsError = ref(false);
  const namingVersion = ref(false);
  const restoringRevision = ref<number | null>(null);
  const draftRecoveryPending = ref(false);
  const localDraftProtected = ref(true);
  const localDraftBaseVersion = ref<number | null>(null);
  let autosaveTimer: number | null = null;
  let activeSave: Promise<boolean> | null = null;
  let canvasResizeObserver: ResizeObserver | null = null;
  const presentationElementTextMaxChars = 4000;

  const themes = {
    lightnote: { name: 'Light Note', accent: '#615ced', background: '#ffffff' },
    midnight: { name: 'Midnight', accent: '#8b82ff', background: '#171927' },
    paper: { name: 'Paper', accent: '#b15b32', background: '#fff8ec' },
  } as const;

  const projectId = computed(() => String(route.params.projectId || ''));
  const draftOwnerId = computed(() => String(user.id || '').trim());
  const selectedSlide = computed(() => draftContent.value.slides.find((slide) => slide.id === selectedSlideId.value));
  const selectedElement = computed(() =>
    (selectedSlide.value?.elements || []).find((element) => element.id === selectedElementId.value),
  );
  const selectedElementIndex = computed(() =>
    (selectedSlide.value?.elements || []).findIndex((element) => element.id === selectedElementId.value),
  );
  const selectedTextElement = computed(() => (selectedElement.value?.type === 'text' ? selectedElement.value : null));
  const selectedShapeElement = computed(() => (selectedElement.value?.type === 'shape' ? selectedElement.value : null));
  const selectedImageElement = computed(() => (selectedElement.value?.type === 'image' ? selectedElement.value : null));
  const selectedElementIsFront = computed(
    () =>
      Boolean(selectedElement.value) && selectedElementIndex.value === (selectedSlide.value?.elements?.length || 0) - 1,
  );
  const selectedElementIsBack = computed(() => Boolean(selectedElement.value) && selectedElementIndex.value === 0);
  const selectedSlideNumber = computed(() =>
    Math.max(1, draftContent.value.slides.findIndex((slide) => slide.id === selectedSlideId.value) + 1),
  );
  const selectedLayout = computed({
    get: () => selectedSlide.value?.layout || 'content',
    set: (value: string) => {
      if (selectedSlide.value)
        selectedSlide.value.layout = value as ProductionPresentationContentV1['slides'][number]['layout'];
    },
  });
  const selectedTheme = computed({
    get: () =>
      Object.entries(themes).find(([, theme]) => theme.name === draftContent.value.theme.name)?.[0] || 'lightnote',
    set: (value: string) => {
      const theme = themes[value as keyof typeof themes];
      if (theme) draftContent.value.theme = { ...theme };
    },
  });
  const dirty = computed(
    () =>
      draftTitle.value.trim() !== savedTitle.value ||
      presentationContentSnapshot(draftContent.value) !== savedContent.value,
  );
  const hasUnsavedDraft = computed(() => dirty.value || saveState.value === 'failed' || saveState.value === 'conflict');
  const saveTone = computed(() => {
    if (saveState.value === 'failed' || saveState.value === 'conflict') return 'danger' as const;
    if (saveState.value === 'saved') return 'success' as const;
    if (saveState.value === 'saving' || saveState.value === 'dirty') return 'pending' as const;
    return 'neutral' as const;
  });
  const saveLabel = computed(() => t(`toolboxProject.editor.state.${saveState.value}`));
  const layoutOptions = computed(() =>
    ['title', 'section', 'content', 'two_column', 'blank'].map((value) => ({
      value,
      label: t(`toolboxProject.presentation.layouts.${value}`),
    })),
  );
  const aspectOptions = computed(() => [
    { value: '16:9', label: '16:9' },
    { value: '4:3', label: '4:3' },
  ]);
  const themeOptions = computed(() =>
    Object.keys(themes).map((value) => ({ value, label: t(`toolboxProject.presentation.themes.${value}`) })),
  );
  const shapeOptions = computed(() =>
    ['rectangle', 'rounded_rectangle', 'ellipse', 'triangle', 'diamond', 'line', 'arrow'].map((value) => ({
      value,
      label: t(`toolboxProject.presentation.shapes.${value}`),
    })),
  );
  const shapeItems = computed<BActionMenuItem[]>(() =>
    shapeOptions.value.map((item) => ({
      key: item.value,
      label: item.label,
      icon:
        item.value === 'rounded_rectangle'
          ? icon.drawingNote.shapeTypes.roundedRectangle
          : icon.drawingNote.shapeTypes[
              item.value as Exclude<ProductionPresentationShapeElementV1['shape'], 'rounded_rectangle'>
            ],
    })),
  );
  const colorOptions = computed(() => [
    { value: '#20232d', label: t('toolboxProject.presentation.colors.ink') },
    { value: '#615ced', label: t('toolboxProject.presentation.colors.purple') },
    { value: '#3175cc', label: t('toolboxProject.presentation.colors.blue') },
    { value: '#0f8f68', label: t('toolboxProject.presentation.colors.green') },
    { value: '#c74a54', label: t('toolboxProject.presentation.colors.red') },
    { value: '#ffffff', label: t('toolboxProject.presentation.colors.white') },
  ]);
  const fillColorOptions = computed(() => [
    { value: null, label: t('toolboxProject.presentation.colors.transparent') },
    { value: '#ffffff', label: t('toolboxProject.presentation.colors.white') },
    { value: '#e9e7ff', label: t('toolboxProject.presentation.colors.lightPurple') },
    { value: '#e8f3ff', label: t('toolboxProject.presentation.colors.lightBlue') },
    { value: '#e7f7f1', label: t('toolboxProject.presentation.colors.lightGreen') },
    { value: '#fff0f1', label: t('toolboxProject.presentation.colors.lightRed') },
  ]);
  const fontWeightOptions = computed(() => [
    { value: 400, label: t('toolboxProject.presentation.editor.fontWeightRegular') },
    { value: 600, label: t('toolboxProject.presentation.editor.fontWeightSemibold') },
    { value: 700, label: t('toolboxProject.presentation.editor.fontWeightBold') },
  ]);
  const textAlignOptions = computed(() =>
    ['left', 'center', 'right'].map((value) => ({
      value,
      label: t(`toolboxProject.presentation.editor.align.${value}`),
    })),
  );
  const imageFitOptions = computed(() => [
    { value: 'contain', label: t('toolboxProject.presentation.editor.imageContain') },
    { value: 'cover', label: t('toolboxProject.presentation.editor.imageCover') },
  ]);
  const geometryFields = computed<Array<{ key: PresentationGeometryField; label: string }>>(() => [
    { key: 'x', label: 'X' },
    { key: 'y', label: 'Y' },
    { key: 'width', label: t('toolboxProject.presentation.editor.width') },
    { key: 'height', label: t('toolboxProject.presentation.editor.height') },
    { key: 'rotation', label: t('toolboxProject.presentation.editor.rotation') },
  ]);
  const exportItems = computed<BActionMenuItem[]>(() => [
    { key: 'pptx', label: t('toolboxProject.presentation.editor.exportPptx'), icon: icon.toolbox.presentationStudio },
    { key: 'pdf', label: t('toolboxProject.presentation.editor.exportPdf'), icon: icon.toolbox.pdf },
    { key: 'png', label: t('toolboxProject.presentation.editor.exportPng'), icon: icon.toolbox.image },
  ]);

  function selectedSlideElements() {
    if (!selectedSlide.value) return [];
    if (!selectedSlide.value.elements) selectedSlide.value.elements = [];
    return selectedSlide.value.elements;
  }

  function selectInsertedElement(element: ProductionPresentationElementV1) {
    finishTextEditing();
    selectedSlideElements().push(element);
    selectedElementId.value = element.id;
  }

  function insertTextElement() {
    const element = createPresentationTextElement(t('toolboxProject.presentation.editor.defaultText'));
    selectInsertedElement(element);
    void beginTextEditing(element.id, { selectAll: true });
  }

  function insertShapeElement(key: string) {
    const shape = shapeOptions.value.find((item) => item.value === key)?.value as
      ProductionPresentationShapeElementV1['shape'] | undefined;
    if (!shape) return;
    selectInsertedElement(createPresentationShapeElement(shape));
  }

  function insertImageElement(
    files: Array<File | { isImg: true; fileName: string; file: string | ArrayBuffer | null; size: number }>,
  ) {
    const image = files.find(
      (item): item is { isImg: true; fileName: string; file: string; size: number } =>
        !(item instanceof File) && item.isImg && typeof item.file === 'string',
    );
    if (!image) {
      BMessage.error(t('toolboxProject.presentation.editor.imageReadFailed'));
      return;
    }
    selectInsertedElement(createPresentationImageElement(image.file, image.fileName));
  }

  function duplicateSelectedElement() {
    if (!selectedElement.value) return;
    selectInsertedElement(clonePresentationElement(selectedElement.value));
  }

  function deleteSelectedElement() {
    const elements = selectedSlideElements();
    const index = elements.findIndex((element) => element.id === selectedElementId.value);
    if (index < 0) return;
    if (editingTextElementId.value === selectedElementId.value) finishTextEditing();
    elements.splice(index, 1);
    selectedElementId.value = elements[Math.min(index, elements.length - 1)]?.id || '';
  }

  function moveSelectedElementLayer(delta: -1 | 1) {
    const elements = selectedSlideElements();
    const from = elements.findIndex((element) => element.id === selectedElementId.value);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= elements.length) return;
    const [element] = elements.splice(from, 1);
    if (element) elements.splice(to, 0, element);
  }

  function centerSelectedElement() {
    if (!selectedElement.value) return;
    selectedElement.value.x = Math.max(0, (100 - Number(selectedElement.value.width)) / 2);
    selectedElement.value.y = Math.max(0, (100 - Number(selectedElement.value.height)) / 2);
  }

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function roundedGeometry(value: number) {
    return Math.round(value * 10) / 10;
  }

  function updateSelectedElementNumber(field: PresentationGeometryField, rawValue: string | number) {
    const element = selectedElement.value;
    const value = Number(rawValue);
    if (!element || !Number.isFinite(value)) return;
    if (field === 'rotation') {
      element.rotation = clamp(value, -180, 180);
      return;
    }
    if (field === 'width') {
      element.width = clamp(value, 3, 100 - Number(element.x));
      return;
    }
    if (field === 'height') {
      element.height = clamp(value, 3, 100 - Number(element.y));
      return;
    }
    if (field === 'x') element.x = clamp(value, 0, 100 - Number(element.width));
    else element.y = clamp(value, 0, 100 - Number(element.height));
  }

  function presentationElementStyle(element: ProductionPresentationElementV1): CSSProperties {
    return {
      left: `${element.x}%`,
      top: `${element.y}%`,
      width: `${element.width}%`,
      height: `${element.height}%`,
      transform: `rotate(${element.rotation}deg)`,
      zIndex: (selectedSlide.value?.elements || []).findIndex((item) => item.id === element.id) + 3,
    };
  }

  function presentationTextStyle(element: ProductionPresentationTextElementV1): CSSProperties {
    return {
      color: element.color,
      background: element.fill || 'transparent',
      fontSize: `${Math.max(8, Number(element.fontSize) * canvasScale.value)}px`,
      fontWeight: element.fontWeight,
      textAlign: element.align,
      justifyContent: element.align === 'center' ? 'center' : element.align === 'right' ? 'flex-end' : 'flex-start',
      alignItems:
        element.verticalAlign === 'middle' ? 'center' : element.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
    };
  }

  function presentationShapeStyle(element: ProductionPresentationShapeElementV1): CSSProperties {
    const connector = element.shape === 'line' || element.shape === 'arrow';
    const strokeWidth = Math.max(1, Number(element.strokeWidth) * canvasScale.value);
    return {
      color: element.color,
      background: connector ? element.stroke : element.fill || 'transparent',
      border: connector ? '0' : `${strokeWidth}px solid ${element.stroke}`,
      fontSize: `${Math.max(8, Number(element.fontSize) * canvasScale.value)}px`,
      '--shape-stroke': element.stroke,
      '--shape-stroke-width': `${strokeWidth}px`,
    } as CSSProperties;
  }

  function elementAriaLabel(element: ProductionPresentationElementV1) {
    return t(`toolboxProject.presentation.editor.elementType.${element.type}`);
  }

  function activeCanvasTextEditor() {
    return canvasRef.value?.querySelector<HTMLElement>('.presentation-element__text-editor') || null;
  }

  function setCanvasTextEditorSelection(editor: HTMLElement, options: TextEditingOptions = {}) {
    const selection = window.getSelection();
    if (!selection) return;
    let range: Range | null = null;
    if (!options.selectAll && Number.isFinite(options.clientX) && Number.isFinite(options.clientY)) {
      const caretDocument = document as CaretDocument;
      const x = Number(options.clientX);
      const y = Number(options.clientY);
      const position = caretDocument.caretPositionFromPoint?.(x, y);
      if (position && (position.offsetNode === editor || editor.contains(position.offsetNode))) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      } else {
        const candidate = caretDocument.caretRangeFromPoint?.(x, y) || null;
        if (candidate && (candidate.startContainer === editor || editor.contains(candidate.startContainer))) {
          range = candidate;
        }
      }
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(!options.selectAll);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function beginTextEditing(id: string, options: TextEditingOptions = {}) {
    const element = selectedSlideElements().find(
      (item): item is ProductionPresentationTextElementV1 => item.id === id && item.type === 'text',
    );
    if (!element) return;
    finishElementInteraction();
    selectedElementId.value = id;
    editingTextElementId.value = id;
    await nextTick();
    if (editingTextElementId.value !== id) return;
    const editor = activeCanvasTextEditor();
    if (!editor) return;
    editor.textContent = element.text;
    editor.focus({ preventScroll: true });
    setCanvasTextEditorSelection(editor, options);
  }

  function finishTextEditing(restoreElementFocus = false) {
    const id = editingTextElementId.value;
    if (!id) return;
    editingTextElementId.value = '';
    if (!restoreElementFocus) return;
    void nextTick(() => {
      const element = [
        ...(canvasRef.value?.querySelectorAll<HTMLElement>('[data-presentation-element-id]') || []),
      ].find((item) => item.dataset.presentationElementId === id);
      element?.focus({ preventScroll: true });
    });
  }

  function clearCanvasSelection() {
    finishTextEditing();
    finishElementInteraction();
    selectedElementId.value = '';
  }

  function canvasTextValue(editor: HTMLElement) {
    return editor.innerText.replace(/\r\n?/gu, '\n').slice(0, presentationElementTextMaxChars);
  }

  function syncCanvasTextElement(editor: HTMLElement, element: ProductionPresentationTextElementV1) {
    const rawValue = editor.innerText.replace(/\r\n?/gu, '\n');
    const value = rawValue.slice(0, presentationElementTextMaxChars);
    element.text = value;
    if (rawValue === value) return;
    editor.textContent = value;
    setCanvasTextEditorSelection(editor);
  }

  function handleCanvasTextInput(event: Event, element: ProductionPresentationTextElementV1) {
    syncCanvasTextElement(event.currentTarget as HTMLElement, element);
  }

  function handleCanvasTextPaste(event: ClipboardEvent, element: ProductionPresentationTextElementV1) {
    event.preventDefault();
    const editor = event.currentTarget as HTMLElement;
    const text = event.clipboardData?.getData('text/plain') || '';
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !(range.startContainer === editor || editor.contains(range.startContainer))) {
      editor.textContent = `${canvasTextValue(editor)}${text}`;
      syncCanvasTextElement(editor, element);
      setCanvasTextEditorSelection(editor);
      return;
    }
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    syncCanvasTextElement(editor, element);
  }

  function handleCanvasTextEditorKeydown(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key === 'Enter')) {
      event.preventDefault();
      finishTextEditing(true);
    }
  }

  function handleCanvasTextBlur(id: string) {
    if (editingTextElementId.value === id) finishTextEditing();
  }

  function pointerHitsElementFrame(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const frameWidth = Math.min(10, Math.max(5, Math.min(rect.width, rect.height) * 0.12));
    return (
      event.clientX - rect.left <= frameWidth ||
      rect.right - event.clientX <= frameWidth ||
      event.clientY - rect.top <= frameWidth ||
      rect.bottom - event.clientY <= frameWidth
    );
  }

  function handleElementPointerDown(event: PointerEvent, element: ProductionPresentationElementV1) {
    if (event.button !== 0) return;
    const isSelected = selectedElementId.value === element.id;
    const isFramePointer = pointerHitsElementFrame(event);
    if (element.type === 'text' && editingTextElementId.value === element.id) {
      if (isFramePointer) {
        finishTextEditing();
        startElementMove(event, element.id);
      }
      return;
    }
    if (element.type === 'text' && isSelected && !isFramePointer) {
      event.preventDefault();
      void beginTextEditing(element.id, { clientX: event.clientX, clientY: event.clientY });
      return;
    }
    finishTextEditing();
    startElementMove(event, element.id);
  }

  function handleElementDoubleClick(event: MouseEvent, element: ProductionPresentationElementV1) {
    if (element.type !== 'text') return;
    event.preventDefault();
    void beginTextEditing(element.id, { clientX: event.clientX, clientY: event.clientY });
  }

  function beginElementInteraction(event: PointerEvent, id: string, mode: ElementInteraction['mode']) {
    if (event.button !== 0) return;
    const element = selectedSlideElements().find((item) => item.id === id);
    if (!element) return;
    event.preventDefault();
    selectedElementId.value = id;
    elementInteraction.value = {
      mode,
      id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(element.x),
      startY: Number(element.y),
      startWidth: Number(element.width),
      startHeight: Number(element.height),
    };
    window.addEventListener('pointermove', handleElementPointerMove);
    window.addEventListener('pointerup', finishElementInteraction, { once: true });
  }

  function startElementMove(event: PointerEvent, id: string) {
    beginElementInteraction(event, id, 'move');
  }

  function startElementResize(event: PointerEvent, id: string) {
    finishTextEditing();
    beginElementInteraction(event, id, 'resize');
  }

  function handleElementPointerMove(event: PointerEvent) {
    const interaction = elementInteraction.value;
    const rect = canvasRef.value?.getBoundingClientRect();
    const element = interaction && selectedSlideElements().find((item) => item.id === interaction.id);
    if (!interaction || !rect || !element || rect.width <= 0 || rect.height <= 0) return;
    const deltaX = ((event.clientX - interaction.startClientX) / rect.width) * 100;
    const deltaY = ((event.clientY - interaction.startClientY) / rect.height) * 100;
    if (interaction.mode === 'move') {
      element.x = roundedGeometry(clamp(interaction.startX + deltaX, 0, 100 - interaction.startWidth));
      element.y = roundedGeometry(clamp(interaction.startY + deltaY, 0, 100 - interaction.startHeight));
    } else {
      element.width = roundedGeometry(clamp(interaction.startWidth + deltaX, 3, 100 - interaction.startX));
      element.height = roundedGeometry(clamp(interaction.startHeight + deltaY, 3, 100 - interaction.startY));
    }
  }

  function finishElementInteraction() {
    elementInteraction.value = null;
    window.removeEventListener('pointermove', handleElementPointerMove);
    window.removeEventListener('pointerup', finishElementInteraction);
  }

  function nudgeSelectedElement(key: string, amount = 1) {
    const element = selectedElement.value;
    if (!element) return false;
    if (key === 'ArrowLeft') element.x = clamp(Number(element.x) - amount, 0, 100 - Number(element.width));
    else if (key === 'ArrowRight') element.x = clamp(Number(element.x) + amount, 0, 100 - Number(element.width));
    else if (key === 'ArrowUp') element.y = clamp(Number(element.y) - amount, 0, 100 - Number(element.height));
    else if (key === 'ArrowDown') element.y = clamp(Number(element.y) + amount, 0, 100 - Number(element.height));
    else return false;
    return true;
  }

  function handleCanvasKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedElement.value) {
      event.preventDefault();
      duplicateSelectedElement();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedElement.value) {
      event.preventDefault();
      deleteSelectedElement();
      return;
    }
    if (nudgeSelectedElement(event.key, event.shiftKey ? 5 : 1)) event.preventDefault();
  }

  function handleElementKeydown(event: KeyboardEvent, id: string) {
    selectedElementId.value = id;
    handleCanvasKeydown(event);
  }

  function clearAutosave() {
    if (autosaveTimer === null) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  function readLocalDraft() {
    return readProductionProjectDraft<ProductionPresentationContentV1>(
      window.localStorage,
      draftOwnerId.value,
      'presentation',
      projectId.value,
    );
  }

  function persistLocalDraft() {
    if (!hydrated.value || draftRecoveryPending.value || !project.value) return localDraftProtected.value;
    const protectedSuccessfully = writeProductionProjectDraft(window.localStorage, draftOwnerId.value, {
      projectType: 'presentation',
      projectId: projectId.value,
      title: draftTitle.value,
      content: presentationContentForSave(draftContent.value),
      baseVersion: localDraftBaseVersion.value ?? project.value.version,
      serverUpdatedAt: project.value.updatedAt,
      updatedAt: Date.now(),
    });
    localDraftProtected.value = protectedSuccessfully;
    return protectedSuccessfully;
  }

  function clearLocalDraft() {
    removeProductionProjectDraft(window.localStorage, draftOwnerId.value, 'presentation', projectId.value);
    localDraftProtected.value = true;
    localDraftBaseVersion.value = null;
  }

  function offerLocalDraftRecovery(localDraft: ProductionProjectLocalDraft<ProductionPresentationContentV1>) {
    draftRecoveryPending.value = true;
    Alert.alert({
      title: t('toolboxProject.editor.recoveryTitle'),
      content: t('toolboxProject.editor.recoveryDescription'),
      okText: t('toolboxProject.editor.recoverDraft'),
      cancelText: t('toolboxProject.editor.ignoreDraft'),
      onOk: () => {
        localDraftBaseVersion.value = localDraft.baseVersion;
        saveState.value = localDraft.baseVersion === project.value?.version ? 'dirty' : 'conflict';
        draftTitle.value = localDraft.title;
        draftContent.value = clonePresentationContent(localDraft.content);
        selectedSlideId.value = draftContent.value.slides[0]?.id || '';
        draftRecoveryPending.value = false;
        persistLocalDraft();
        if (saveState.value !== 'conflict') scheduleAutosave();
      },
      onCancel: () => {
        clearLocalDraft();
        draftRecoveryPending.value = false;
      },
    });
  }

  function scheduleAutosave() {
    clearAutosave();
    if (!hydrated.value || draftRecoveryPending.value || !dirty.value || saveState.value === 'conflict') return;
    saveState.value = 'dirty';
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void persistRevision('autosave');
    }, 1500);
  }

  function applyProject(detail: ToolboxProjectDetail, replaceDraft: boolean) {
    if (detail.project.projectType !== 'presentation' || detail.revision.projectType !== 'presentation') {
      throw new Error('PROJECT_TYPE_MISMATCH');
    }
    const content = clonePresentationContent(detail.revision.content);
    project.value = detail.project;
    savedTitle.value = detail.project.title || t('toolboxProject.presentation.untitled');
    savedContent.value = presentationContentSnapshot(content);
    if (replaceDraft) {
      draftTitle.value = savedTitle.value;
      draftContent.value = content;
      selectedSlideId.value = content.slides[0]?.id || '';
    }
  }

  async function loadProject() {
    clearAutosave();
    loading.value = true;
    loadError.value = false;
    hydrated.value = false;
    try {
      const detail = await fetchToolboxProject(projectId.value);
      applyProject(detail, true);
      saveState.value = 'saved';
      hydrated.value = true;
      const localDraft = readLocalDraft();
      if (
        shouldOfferProductionProjectDraftRecovery(localDraft, {
          projectType: 'presentation',
          title: savedTitle.value,
          content: clonePresentationContent(detail.revision.content),
          version: detail.project.version,
          updatedAt: detail.project.updatedAt,
        })
      ) {
        offerLocalDraftRecovery(localDraft!);
      } else if (localDraft) {
        clearLocalDraft();
      }
      void openToolboxProject(projectId.value).catch(() => undefined);
      void loadVersions();
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function persistRevision(changeKind: 'autosave' | 'named', label?: string): Promise<boolean> {
    clearAutosave();
    if (!project.value) return false;
    if (activeSave) {
      await activeSave;
      if (saveState.value === 'conflict') return false;
    }
    const titleSnapshot = draftTitle.value.trim() || t('toolboxProject.presentation.untitled');
    const contentSnapshot = clonePresentationContent(draftContent.value);
    const serializedSnapshot = presentationContentSnapshot(contentSnapshot);
    const titleChanged = titleSnapshot !== savedTitle.value;
    const contentChanged = serializedSnapshot !== savedContent.value;
    if (!titleChanged && !contentChanged && changeKind !== 'named') {
      saveState.value = 'saved';
      return true;
    }
    let baseProject = project.value;
    saveState.value = 'saving';
    const request = (async () => {
      if (titleChanged) {
        baseProject = await updateToolboxProject(projectId.value, {
          expectedVersion: baseProject.version,
          title: titleSnapshot,
        });
        project.value = baseProject;
        savedTitle.value = titleSnapshot;
      }
      if (!contentChanged && changeKind !== 'named') return null;
      return saveToolboxProjectRevision(projectId.value, {
        clientRequestId: createToolboxProjectClientRequestId(
          changeKind === 'named' ? 'presentation-version' : 'presentation-save',
        ),
        expectedVersion: baseProject.version,
        expectedRevision: baseProject.currentRevision,
        changeKind,
        label,
        content: presentationContentForSave(contentSnapshot),
      });
    })();
    activeSave = request
      .then((detail) => {
        if (detail) {
          applyProject(detail, false);
          void loadVersions();
        }
        if (
          draftTitle.value.trim() === titleSnapshot &&
          presentationContentSnapshot(draftContent.value) === serializedSnapshot
        ) {
          clearLocalDraft();
        } else {
          localDraftBaseVersion.value = null;
          persistLocalDraft();
        }
        saveState.value = 'saved';
        return true;
      })
      .catch((error: unknown) => {
        localDraftBaseVersion.value = baseProject.version;
        saveState.value = isToolboxProjectConflict(error) ? 'conflict' : 'failed';
        persistLocalDraft();
        return false;
      })
      .finally(() => {
        activeSave = null;
      });
    const succeeded = await activeSave;
    if (succeeded && dirty.value) scheduleAutosave();
    return succeeded;
  }

  async function saveNow() {
    await persistRevision('autosave');
  }

  function addSlide() {
    const slide = createPresentationSlide(draftContent.value.slides.length);
    draftContent.value.slides.push(slide);
    selectedSlideId.value = slide.id;
  }

  function deleteSlide(index: number) {
    const deleting = draftContent.value.slides[index];
    if (!deleting) return;
    draftContent.value.slides.splice(index, 1);
    if (!draftContent.value.slides.length) draftContent.value.slides.push(createPresentationSlide());
    if (selectedSlideId.value === deleting.id) {
      selectedSlideId.value =
        draftContent.value.slides[Math.min(index, draftContent.value.slides.length - 1)]?.id || '';
    }
  }

  function moveSlide(fromIndex: number, toIndex: number) {
    movePresentationSlide(draftContent.value, fromIndex, toIndex);
  }

  async function handleExport(key: string) {
    if (exporting.value || !['pptx', 'pdf', 'png'].includes(key)) return;
    exporting.value = true;
    try {
      const snapshot = clonePresentationContent(draftContent.value);
      const title = draftTitle.value || t('toolboxProject.presentation.untitled');
      const file =
        key === 'pptx'
          ? await exportProductionPresentationPptx(snapshot, title)
          : key === 'pdf'
            ? await exportProductionPresentationPdf(snapshot, title)
            : await exportProductionPresentationPngZip(snapshot, title);
      downloadToolboxBlob(file.blob, file.fileName);
      BMessage.success(t('toolboxProject.presentation.editor.exportSuccess'));
    } catch (error) {
      if (isProductionPresentationExportOverflowError(error)) {
        const affectedSlides = [...new Set(error.issues.map((issue) => issue.slideNumber))];
        const messageKey = error.issues.some((issue) => issue.field === 'blank')
          ? 'toolboxProject.presentation.editor.exportBlankContent'
          : 'toolboxProject.presentation.editor.exportOverflow';
        BMessage.error(
          t(messageKey, {
            slides: affectedSlides.slice(0, 3).join('、'),
            count: affectedSlides.length,
          }),
        );
      } else {
        BMessage.error(t('toolboxProject.presentation.editor.exportFailed'));
      }
    } finally {
      exporting.value = false;
    }
  }

  async function copyLocalDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ title: draftTitle.value, content: presentationContentForSave(draftContent.value) }, null, 2),
      );
      BMessage.success(t('toolboxProject.presentation.conflict.copied'));
    } catch {
      BMessage.error(t('toolboxProject.presentation.conflict.copyFailed'));
    }
  }

  function confirmReloadLatest() {
    Alert.alert({
      title: t('toolboxProject.editor.reloadTitle'),
      content: t('toolboxProject.presentation.conflict.reloadDescription'),
      okText: t('toolboxProject.editor.reloadLatest'),
      cancelText: t('common.cancel'),
      onOk: () => void reloadLatest(),
    });
  }

  async function reloadLatest() {
    const previousSaveState = saveState.value;
    clearAutosave();
    try {
      await replaceProductionProjectWithLatest(
        () => fetchToolboxProject(projectId.value),
        (detail) => applyProject(detail, true),
        clearLocalDraft,
      );
      hydrated.value = true;
      saveState.value = 'saved';
      await loadVersions();
    } catch {
      saveState.value = previousSaveState === 'conflict' ? 'conflict' : 'failed';
      persistLocalDraft();
      BMessage.error(t('toolboxProject.editor.reloadFailed'));
    }
  }

  async function loadVersions({ append = false }: { append?: boolean } = {}) {
    if (append) {
      if (!versionsCursor.value || versionsLoadingMore.value) return;
      versionsLoadingMore.value = true;
    } else {
      versionsLoading.value = true;
      versionsError.value = false;
    }
    try {
      const page = await fetchToolboxProjectRevisionsPage(projectId.value, {
        limit: 30,
        cursor: append ? versionsCursor.value : null,
      });
      if (append) {
        const merged = new Map(revisions.value.map((revision) => [revision.id, revision]));
        page.items.forEach((revision) => merged.set(revision.id, revision));
        revisions.value = [...merged.values()];
      } else {
        revisions.value = page.items;
      }
      versionsCursor.value = page.nextCursor;
    } catch {
      if (append) BMessage.error(t('toolboxProject.versions.loadMoreFailed'));
      else versionsError.value = true;
    } finally {
      if (append) versionsLoadingMore.value = false;
      else versionsLoading.value = false;
    }
  }

  function loadMoreVersions() {
    void loadVersions({ append: true });
  }

  async function createNamedVersion(name: string) {
    namingVersion.value = true;
    const succeeded = await persistRevision('named', name);
    if (succeeded) await loadVersions();
    namingVersion.value = false;
  }

  function confirmRestore(revision: ToolboxProjectRevisionSummary) {
    const createCheckpoint = hasUnsavedDraft.value;
    Alert.alert({
      title: t('toolboxProject.versions.restoreTitle'),
      content: t(
        createCheckpoint
          ? 'toolboxProject.presentation.editor.restoreDirtyDescription'
          : 'toolboxProject.presentation.editor.restoreDescription',
        { number: revision.revision },
      ),
      okText: t('toolboxProject.versions.restore'),
      cancelText: t('common.cancel'),
      onOk: () => void restoreRevision(revision, createCheckpoint),
    });
  }

  async function restoreRevision(revision: ToolboxProjectRevisionSummary, createCheckpoint = false) {
    if (!project.value) return;
    restoringRevision.value = revision.revision;
    clearAutosave();
    try {
      if (createCheckpoint) {
        const checkpointSaved = await persistRevision(
          'named',
          t('toolboxProject.presentation.editor.restoreCheckpointLabel'),
        );
        if (!checkpointSaved) {
          BMessage.error(t('toolboxProject.presentation.editor.restoreCheckpointFailed'));
          return;
        }
      }
      const detail = await restoreToolboxProjectRevision(projectId.value, revision.revision, {
        clientRequestId: createToolboxProjectClientRequestId('presentation-restore'),
        expectedVersion: project.value.version,
        expectedRevision: project.value.currentRevision,
        sourceRevisionId: revision.id,
      });
      applyProject(detail, true);
      saveState.value = 'saved';
      clearLocalDraft();
      await loadVersions();
      versionsOpen.value = false;
    } catch (error) {
      saveState.value = isToolboxProjectConflict(error) ? 'conflict' : 'failed';
      persistLocalDraft();
    } finally {
      restoringRevision.value = null;
    }
  }

  async function goBack() {
    await router.push({ name: 'toolboxPresentationProjects' });
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!dirty.value && saveState.value !== 'failed' && saveState.value !== 'conflict') return;
    event.preventDefault();
    event.returnValue = '';
  }

  function confirmUnsafeLeave() {
    const draftIsProtected = localDraftProtected.value;
    return new Promise<boolean>((resolve) => {
      Alert.alert({
        title: t('toolboxProject.editor.leaveTitle'),
        content: t(
          draftIsProtected
            ? 'toolboxProject.editor.leaveDescription'
            : 'toolboxProject.editor.leaveUnprotectedDescription',
        ),
        okText: t(
          draftIsProtected ? 'toolboxProject.editor.leaveAnyway' : 'toolboxProject.editor.leaveUnprotectedAnyway',
        ),
        cancelText: t('toolboxProject.editor.keepEditing'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  watch(
    [draftTitle, draftContent],
    () => {
      persistLocalDraft();
      scheduleAutosave();
    },
    { deep: true, flush: 'sync' },
  );
  watch(selectedElementId, (id) => {
    if (editingTextElementId.value && editingTextElementId.value !== id) finishTextEditing();
  });
  watch(selectedSlideId, () => {
    finishTextEditing();
    selectedElementId.value = '';
    finishElementInteraction();
  });
  watch(
    canvasRef,
    (canvas) => {
      canvasResizeObserver?.disconnect();
      canvasResizeObserver = null;
      if (!canvas || typeof ResizeObserver === 'undefined') {
        canvasScale.value = 1;
        return;
      }
      const updateScale = (width: number) => {
        canvasScale.value = clamp(width / 920, 0.34, 1);
      };
      updateScale(canvas.clientWidth);
      canvasResizeObserver = new ResizeObserver(([entry]) =>
        updateScale(entry?.contentRect.width || canvas.clientWidth),
      );
      canvasResizeObserver.observe(canvas);
    },
    { flush: 'post' },
  );
  onMounted(loadProject);
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
  onBeforeUnmount(() => {
    clearAutosave();
    finishElementInteraction();
    canvasResizeObserver?.disconnect();
    window.removeEventListener('beforeunload', onBeforeUnload);
  });
  onBeforeRouteLeave(async () => {
    clearAutosave();
    if (dirty.value && saveState.value !== 'conflict') await persistRevision('autosave');
    if (dirty.value || saveState.value === 'failed' || saveState.value === 'conflict') {
      persistLocalDraft();
      return confirmUnsafeLeave();
    }
    return true;
  });
</script>

<style scoped lang="less">
  .presentation-editor {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    color: var(--text-color);
    background: var(--background-color);
  }
  .presentation-editor__center {
    grid-row: 1 / -1;
    align-self: center;
    justify-self: center;
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--desc-color);
    text-align: center;
  }
  .presentation-editor__center strong {
    color: var(--text-color);
    font-size: 18px;
  }
  .presentation-editor__center.is-error > svg {
    color: var(--error-color, #d9363e);
  }
  .presentation-editor__error-actions,
  .presentation-conflict__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .presentation-toolbar {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(180px, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--surface-panel-bg, var(--background-color));
  }
  .presentation-toolbar__back {
    width: 34px;
    padding: 0;
  }
  .presentation-toolbar__title {
    min-width: 0;
    max-width: 620px;
  }
  .presentation-toolbar__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .presentation-toolbar__actions :deep(.b_btn) {
    gap: 6px;
  }
  .presentation-conflict,
  .presentation-save-error,
  .presentation-draft-warning {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--error-color, #d9363e);
    background: var(--surface-panel-bg, var(--background-color));
  }
  .presentation-status-stack {
    min-height: 0;
    overflow-y: auto;
  }
  .presentation-conflict > div:first-child {
    display: grid;
    gap: 3px;
  }
  .presentation-conflict strong,
  .presentation-save-error span {
    color: var(--error-color, #d9363e);
  }
  .presentation-conflict span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .presentation-draft-warning {
    border-bottom-color: var(--warning-color, #d98600);
    background: var(--warning-background-color, #fff8e8);
  }
  .presentation-draft-warning > div:first-child {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .presentation-draft-warning strong {
    color: var(--warning-color, #b86f00);
    font-size: 12px;
  }
  .presentation-draft-warning span {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
  }
  .presentation-draft-warning__actions {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
  }
  .presentation-workspace {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: 228px minmax(420px, 1fr) minmax(280px, 320px);
    gap: 12px;
    padding: 12px;
    overflow: hidden;
  }
  .presentation-slides,
  .presentation-stage,
  .presentation-inspector {
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--surface-panel-bg, var(--background-color));
  }
  .presentation-slides {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    padding: 12px;
    overflow: hidden;
  }
  .presentation-slides > header,
  .presentation-inspector > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 10px;
  }
  .presentation-slides > header > div,
  .presentation-inspector > header > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .presentation-slides small,
  .presentation-inspector small {
    color: var(--desc-color);
    font-size: 10px;
  }
  .presentation-slides__list {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 3px;
  }
  .presentation-slide-item {
    padding: 8px 5px;
    border: 1px solid transparent;
    border-radius: 12px;
  }
  .presentation-slide-item.is-selected {
    border-color: var(--primary-color);
    background: var(--surface-selected-bg, #f1f0ff);
  }
  .presentation-slide-item__select {
    width: 100%;
    height: auto;
    min-width: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 5px;
    color: var(--text-color);
    border: 0 !important;
    background: transparent !important;
  }
  .presentation-slide-item__number {
    align-self: start;
    padding-top: 3px;
    color: var(--desc-color);
    font-size: 10px;
  }
  .presentation-slide-item__canvas {
    aspect-ratio: 16 / 9;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    padding: 10px;
    overflow: hidden;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.25);
    text-align: left;
  }
  .presentation-slide-item__canvas strong,
  .presentation-slide-item__canvas small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .presentation-slide-item__canvas.is-layout-title {
    align-items: center;
    text-align: center;
  }
  .presentation-slide-item__canvas.is-layout-section {
    border-left: 8px solid currentColor;
  }
  .presentation-slide-item__canvas.is-layout-two_column {
    background-image: linear-gradient(90deg, transparent 49%, currentColor 49.5%, transparent 50%);
  }
  .presentation-slide-item__canvas.is-layout-blank strong,
  .presentation-slide-item__canvas.is-layout-blank small {
    visibility: hidden;
  }
  .presentation-slide-item__canvas small {
    color: currentColor;
    opacity: 0.62;
  }
  .presentation-slide-item__actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    padding: 6px 0 0 25px;
  }
  .presentation-slide-item__actions :deep(.b_btn) {
    width: 28px;
    min-width: 28px;
    padding: 0;
  }
  .presentation-slide-item__actions .is-danger {
    color: var(--error-color, #d9363e);
  }
  .presentation-slide-item__actions .is-up {
    transform: rotate(180deg);
  }
  .presentation-slides__add {
    width: 100%;
    margin-top: 8px;
    gap: 6px;
  }
  .presentation-stage {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    overflow: hidden;
  }
  .presentation-stage__settings {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .presentation-stage__settings label {
    min-width: 0;
    display: grid;
    gap: 5px;
    color: var(--desc-color);
    font-size: 10px;
  }
  .presentation-ribbon {
    display: flex;
    align-items: stretch;
    gap: 12px;
    padding: 7px 12px;
    overflow-x: auto;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--surface-panel-bg, var(--background-color));
    overscroll-behavior-inline: contain;
  }
  .presentation-ribbon__group {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 12px;
    border-right: 1px solid var(--surface-border-color);
  }
  .presentation-ribbon__group:last-child {
    padding-right: 0;
    border-right: 0;
  }
  .presentation-ribbon__group > span {
    align-self: center;
    margin-right: 2px;
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 600;
  }
  .presentation-ribbon :deep(.b_btn) {
    gap: 5px;
  }
  .presentation-ribbon .is-danger {
    color: var(--error-color, #d9363e);
  }
  .presentation-stage__viewport {
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(12px, 2vw, 28px);
    overflow: auto;
    background: var(--surface-soft-bg, var(--active-background-color));
  }
  .presentation-canvas {
    position: relative;
    width: min(100%, 920px);
    max-height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: clamp(12px, 2vw, 26px);
    padding: clamp(34px, 5vw, 72px);
    box-sizing: border-box;
    overflow: hidden;
    box-shadow: 0 16px 44px rgba(17, 19, 32, 0.16);
  }
  .presentation-canvas:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 3px;
  }
  .presentation-canvas__accent {
    position: absolute;
    inset: 0 auto 0 0;
    width: 10px;
    background: var(--slide-accent);
  }
  .presentation-canvas__title :deep(.b-input),
  .presentation-canvas__body :deep(.b-textarea) {
    color: var(--slide-accent);
    border-color: transparent;
    background: transparent;
  }
  .presentation-canvas__title :deep(.b-input) {
    height: auto !important;
    padding: 6px 0 !important;
    font-size: clamp(22px, 3vw, 44px);
    font-weight: 700;
    line-height: 1.18;
  }
  .presentation-canvas__body {
    min-height: 0;
  }
  .presentation-canvas__body :deep(.b-textarea) {
    height: 100%;
    min-height: 100px;
    resize: none;
    color: color-mix(in srgb, var(--slide-accent) 72%, #20232d);
    font-size: clamp(13px, 1.5vw, 22px);
    line-height: 1.55;
  }
  .presentation-element {
    position: absolute;
    min-width: 3%;
    min-height: 3%;
    box-sizing: border-box;
    cursor: move;
    touch-action: none;
    user-select: none;
  }
  .presentation-element.is-text.is-selected:not(.is-editing),
  .presentation-element.is-text.is-selected:not(.is-editing) .presentation-element__text {
    cursor: text;
  }
  .presentation-element::before {
    content: '';
    position: absolute;
    inset: -4px;
    border: 2px solid transparent;
    border-radius: 5px;
    pointer-events: none;
  }
  .presentation-element.is-selected::before,
  .presentation-element:focus-visible::before {
    border-color: var(--primary-color);
    background: transparent;
  }
  .presentation-element.is-editing::before {
    border-style: dashed;
  }
  .presentation-element:focus-visible {
    outline: 0;
  }
  .presentation-element__text,
  .presentation-element__shape,
  .presentation-element__image {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }
  .presentation-element__text {
    display: flex;
    overflow: hidden;
    padding: 5px 7px;
    line-height: 1.25;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .presentation-element.is-editing {
    cursor: text;
    touch-action: auto;
    user-select: text;
  }
  .presentation-element__text-editor {
    width: 100%;
    min-width: 0;
    min-height: 1.25em;
    max-height: 100%;
    overflow: auto;
    outline: 0;
    cursor: text;
    user-select: text;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    caret-color: currentColor;
  }
  .presentation-element__image {
    display: block;
    pointer-events: none;
  }
  .presentation-element__shape {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 7px;
    text-align: center;
    line-height: 1.2;
  }
  .presentation-element__shape.is-shape-rounded_rectangle {
    border-radius: 16px;
  }
  .presentation-element__shape.is-shape-ellipse {
    border-radius: 50%;
  }
  .presentation-element__shape.is-shape-triangle {
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
  }
  .presentation-element__shape.is-shape-diamond {
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }
  .presentation-element__shape.is-shape-line,
  .presentation-element__shape.is-shape-arrow {
    position: absolute;
    top: 50%;
    left: 0;
    width: calc(100% - 8px);
    height: var(--shape-stroke-width, 2px);
    min-height: 2px;
    padding: 0;
    overflow: visible;
    transform: translateY(-50%);
  }
  .presentation-element__shape.is-shape-arrow::after {
    content: '';
    position: absolute;
    top: 50%;
    right: -8px;
    width: 0;
    height: 0;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-left: 9px solid var(--shape-stroke, currentColor);
    transform: translateY(-50%);
  }
  .presentation-element__resize {
    position: absolute !important;
    right: -9px;
    bottom: -9px;
    width: 18px !important;
    min-width: 18px !important;
    height: 18px !important;
    min-height: 18px !important;
    padding: 0 !important;
    border: 2px solid #ffffff !important;
    border-radius: 50% !important;
    background: var(--primary-color) !important;
    box-shadow: 0 0 0 1px var(--primary-color);
    cursor: nwse-resize;
    z-index: 2;
  }
  .presentation-canvas.is-layout-title {
    align-content: center;
    grid-template-rows: auto auto;
    text-align: center;
  }
  .presentation-canvas.is-layout-title .presentation-canvas__accent {
    inset: auto 16% 14%;
    width: 68%;
    height: 7px;
  }
  .presentation-canvas.is-layout-title .presentation-canvas__title :deep(.b-input),
  .presentation-canvas.is-layout-title .presentation-canvas__body :deep(.b-textarea) {
    text-align: center;
  }
  .presentation-canvas.is-layout-title .presentation-canvas__body {
    max-height: 34%;
  }
  .presentation-canvas.is-layout-section {
    align-content: center;
    grid-template-rows: auto auto;
    padding-left: 36%;
  }
  .presentation-canvas.is-layout-section .presentation-canvas__accent {
    width: 28%;
  }
  .presentation-canvas.is-layout-section .presentation-canvas__title :deep(.b-input) {
    font-size: clamp(28px, 4vw, 58px);
  }
  .presentation-canvas.is-layout-section .presentation-canvas__body {
    max-height: 42%;
  }
  .presentation-canvas.is-layout-two_column .presentation-canvas__accent {
    inset: 0 0 auto;
    width: 100%;
    height: 10px;
  }
  .presentation-canvas.is-layout-two_column .presentation-canvas__body {
    border: 1px solid rgba(127, 127, 127, 0.2);
    border-radius: 8px;
  }
  .presentation-canvas.is-layout-two_column .presentation-canvas__body :deep(.b-textarea) {
    padding-inline: 18px;
    background-image: linear-gradient(90deg, transparent 49.7%, rgba(127, 127, 127, 0.28) 50%, transparent 50.3%);
  }
  .presentation-canvas.is-layout-blank .presentation-canvas__accent,
  .presentation-canvas.is-layout-blank .presentation-canvas__title,
  .presentation-canvas.is-layout-blank .presentation-canvas__body {
    display: none;
  }
  .presentation-canvas__number {
    position: absolute;
    right: 18px;
    bottom: 12px;
    color: var(--slide-accent);
    font-size: 10px;
    opacity: 0.6;
  }
  .presentation-stage > footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    border-top: 1px solid var(--surface-border-color);
    color: var(--desc-color);
    font-size: 10px;
  }
  .presentation-inspector {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    padding: 14px;
    overflow: hidden;
  }
  .presentation-inspector > header > svg {
    color: #3175cc;
  }
  .presentation-inspector__body {
    min-height: 0;
    display: grid;
    align-content: start;
    gap: 14px;
    padding-right: 3px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .presentation-inspector__section,
  .presentation-inspector__notes {
    display: grid;
    gap: 9px;
  }
  .presentation-inspector__section {
    padding-bottom: 13px;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .presentation-inspector__section > strong,
  .presentation-inspector__notes > header strong {
    font-size: 12px;
  }
  .presentation-inspector__section label,
  .presentation-inspector__notes label {
    min-width: 0;
    display: grid;
    gap: 5px;
    color: var(--desc-color);
    font-size: 10px;
  }
  .presentation-inspector__geometry,
  .presentation-inspector__field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .presentation-inspector__notes {
    min-height: 0;
    margin-top: 14px;
  }
  .presentation-inspector__notes > header {
    display: grid;
    gap: 3px;
  }
  .presentation-inspector__notes :deep(.b-textarea) {
    resize: none;
    line-height: 1.65;
  }
  @media (max-width: 1120px) {
    .presentation-workspace {
      grid-template-columns: 220px minmax(0, 1fr);
      overflow-y: auto;
    }
    .presentation-inspector {
      grid-column: 1 / -1;
      min-height: 180px;
    }
  }
  @media (max-width: 767px) {
    .presentation-editor :deep(.b_btn.small_btn) {
      height: 44px;
      min-height: 44px;
      line-height: 44px;
    }
    .presentation-editor {
      display: block;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .presentation-toolbar {
      position: sticky;
      top: 0;
      z-index: 4;
      grid-template-columns: auto minmax(0, 1fr) auto;
      padding: 8px 10px;
    }
    .presentation-toolbar__actions {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .presentation-toolbar__actions :deep(.b_btn) {
      width: 100%;
      padding-inline: 7px;
    }
    .presentation-conflict,
    .presentation-save-error,
    .presentation-draft-warning {
      align-items: stretch;
      flex-direction: column;
    }
    .presentation-draft-warning__actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .presentation-draft-warning__actions :deep(.b_btn) {
      width: 100%;
    }
    .presentation-conflict__actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .presentation-conflict__actions :deep(.b_btn:last-child) {
      grid-column: 1 / -1;
    }
    .presentation-workspace {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      padding: 8px;
      overflow: visible;
    }
    .presentation-slides {
      grid-template-rows: auto auto;
      padding: 10px;
    }
    .presentation-slides__list {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      overflow-y: hidden;
      padding-bottom: 4px;
    }
    .presentation-slide-item {
      flex: 0 0 172px;
    }
    .presentation-slides__add {
      display: none;
    }
    .presentation-stage {
      min-height: 520px;
    }
    .presentation-stage__settings {
      grid-template-columns: 1fr 1fr;
    }
    .presentation-stage__settings label:first-child {
      grid-column: 1 / -1;
    }
    .presentation-stage__viewport {
      min-height: 330px;
      padding: 10px;
    }
    .presentation-canvas {
      padding: 28px;
    }
    .presentation-inspector {
      min-height: 220px;
    }
  }
  :global(html.light-note-mobile-rendering .presentation-editor),
  :global(html.light-note-mobile-rendering .presentation-canvas) {
    background-color: var(--background-color);
  }
  :global(html.light-note-mobile-rendering .presentation-canvas__body .b-textarea) {
    color: var(--slide-accent);
  }
  :global(html.light-note-mobile-rendering .presentation-element.is-editing::before) {
    border-color: var(--primary-color);
    border-style: dashed;
  }
</style>
