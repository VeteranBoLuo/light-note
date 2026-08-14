<template>
  <BModal
    v-model:visible="visible"
    :title="$t('noteDetail.history.title')"
    :show-footer="false"
    :mask-closable="true"
    width="min(94vw, 1440px)"
    height="min(86dvh, 720px)"
    content-class="note-version-history__content"
  >
    <div class="note-history" :class="{ mobile: bookmark.isMobile }">
      <!-- 左:版本列表 -->
      <div class="version-list">
        <div class="version-list-inner">
          <div v-if="versions.length" class="list-scroll">
            <div
              v-for="v in versions"
              :key="v.id"
              class="version-item"
              :class="{ active: activeId === v.id }"
              @click="selectVersion(v)"
            >
              <div class="version-time">{{ v.createTime }}</div>
              <div class="version-sub">
                <span class="version-title-line">
                  <span>{{ v.title || $t('noteDetail.unnamedDoc') }}</span>
                  <span v-if="v.reason" class="version-reason">{{ versionReasonLabel(v.reason) }}</span>
                </span>
                <span class="version-chars">
                  {{
                    v.type === 'drawing' && v.elementCount != null
                      ? $t('note.drawingElements', { count: v.elementCount })
                      : v.contentLength != null
                        ? $t('noteDetail.history.chars', { count: v.contentLength })
                        : '·'
                  }}
                </span>
              </div>
            </div>
          </div>
          <div v-else-if="!listLoading" class="empty">
            <div class="empty-title">{{ $t('noteDetail.history.empty') }}</div>
            <div class="empty-hint">{{ $t('noteDetail.history.emptyHint') }}</div>
          </div>
          <BLoading :loading="listLoading" style="position: absolute; inset: 0" />
        </div>
      </div>

      <!-- 右:预览 + 恢复 -->
      <div class="version-preview">
        <div class="preview-header">
          <span class="preview-title">{{ $t('noteDetail.history.preview') }}</span>
          <BTabs v-model:active-tab="previewMode" variant="pill" :options="previewModeOptions" />
          <BButton v-if="activeId" type="primary" size="small" :disabled="restoring" @click="confirmRestore">
            {{ $t('noteDetail.history.restore') }}
          </BButton>
        </div>
        <div class="preview-body">
          <DrawingNoteEditor
            v-if="activeId && previewMode === 'preview' && activeVersion?.type === 'drawing' && activeVersion.content"
            class="version-drawing-preview"
            :content="activeVersion.content"
            :title="activeVersion.title"
            readonly
          />
          <div
            v-else-if="activeId && previewMode === 'preview'"
            class="preview-html"
            v-html="activePreviewHtml"
            v-mermaid
          ></div>
          <div
            v-else-if="activeId && isDrawingComparison"
            class="version-drawing-diff"
            :aria-label="$t('noteDetail.history.diff')"
          >
            <div class="version-drawing-diff__summary">
              <span>{{ $t('noteDetail.history.comparisonBasis') }}</span>
              <BChip tone="success">
                {{ $t('noteDetail.history.drawingDiffAdded', { count: drawingDiffSummary.added }) }}
              </BChip>
              <BChip tone="danger">
                {{ $t('noteDetail.history.drawingDiffRemoved', { count: drawingDiffSummary.removed }) }}
              </BChip>
              <BChip tone="neutral">
                {{ $t('noteDetail.history.drawingDiffChanged', { count: drawingDiffSummary.changed }) }}
              </BChip>
            </div>
            <p class="version-drawing-diff__hint">{{ $t('noteDetail.history.drawingDiffHint') }}</p>
            <div class="version-drawing-diff__grid">
              <section class="version-drawing-diff__panel">
                <h3>{{ $t('noteDetail.history.currentContent') }}</h3>
                <DrawingNoteEditor
                  class="version-drawing-diff__canvas"
                  :content="String(props.currentNote?.content || '')"
                  :title="String(props.currentNote?.title || '')"
                  readonly
                />
              </section>
              <section class="version-drawing-diff__panel">
                <h3>{{ $t('noteDetail.history.selectedVersion') }}</h3>
                <DrawingNoteEditor
                  class="version-drawing-diff__canvas"
                  :content="activeVersion.content"
                  :title="activeVersion.title"
                  readonly
                />
              </section>
            </div>
          </div>
          <div v-else-if="activeId" class="version-diff" :aria-label="$t('noteDetail.history.diff')">
            <div class="version-diff-summary">
              <span class="version-diff-summary__label">{{ $t('noteDetail.history.comparisonBasis') }}</span>
              <span class="is-added">+{{ diffSummary.added }}</span>
              <span class="is-removed">−{{ diffSummary.removed }}</span>
            </div>
            <div v-if="!bookmark.isMobile" class="version-diff-side-by-side">
              <div class="version-diff-column-title">
                <span>{{ $t('noteDetail.history.currentContent') }}</span>
                <span>{{ $t('noteDetail.history.selectedVersion') }}</span>
              </div>
              <div
                v-for="(row, index) in diffRows"
                :key="`${index}-${row.type}`"
                class="version-diff-row"
                :class="`is-${row.type}`"
              >
                <div class="version-diff-cell version-diff-cell--current">
                  <span class="version-diff-line-number">{{ row.currentLine || '' }}</span>
                  <code>{{ row.currentText || ' ' }}</code>
                </div>
                <div class="version-diff-cell version-diff-cell--historical">
                  <span class="version-diff-line-number">{{ row.historicalLine || '' }}</span>
                  <code>{{ row.historicalText || ' ' }}</code>
                </div>
              </div>
            </div>
            <div v-else class="version-diff-unified">
              <div
                v-for="(line, index) in diffLines"
                :key="`${index}-${line.type}`"
                class="version-diff-line"
                :class="`is-${line.type}`"
              >
                <span aria-hidden="true">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' ' }}</span>
                <code>{{ line.text || ' ' }}</code>
              </div>
            </div>
          </div>
          <div v-else-if="!detailLoading" class="preview-empty">{{ $t('noteDetail.history.selectHint') }}</div>
          <BLoading :loading="detailLoading" style="position: absolute; inset: 0" />
        </div>
      </div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { noteContentToHtml, noteDisplayText } from '@/utils/common.ts';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import {
    buildNoteLineDiff,
    buildNoteSideBySideRows,
    compareNoteReferenceChanges,
    noteHtmlToDiffText,
    type NoteDiffLine,
  } from '@/utils/noteVersionDiff';
  import { compareDrawingVersions } from '@/utils/drawingVersionDiff';
  import AsyncFeatureLoadingOverlay from '@/components/base/AsyncFeatureLoadingOverlay.vue';
  import { DRAWING_SCENE_VERSION } from '@lightnote/shared/drawing-note';

  const DrawingNoteEditor = defineAsyncComponent({
    loader: () => import('@/components/noteLibrary/drawing/DrawingNoteEditor.vue'),
    loadingComponent: AsyncFeatureLoadingOverlay,
    delay: 0,
    suspensible: false,
  });

  interface VersionItem {
    id: string;
    title: string;
    createTime: string;
    content: string;
    type?: string;
    reason?: string;
    sourceRevision?: number;
    contentLength?: number; // 前端按"渲染后展示文本"算,异步填充
    elementCount?: number;
  }

  const props = defineProps<{
    noteId: string;
    noteType?: string;
    currentNote?: { title?: string; content?: string; type?: string; revision?: number };
  }>();
  const visible = defineModel('visible');
  const emit = defineEmits(['restored']);

  const { t } = useI18n();
  const bookmark = bookmarkStore();

  const versions = ref<VersionItem[]>([]);
  const listLoading = ref(false);
  const detailLoading = ref(false);
  const restoring = ref(false);
  const activeId = ref('');
  const activePreviewHtml = ref('');
  const activeVersion = ref<VersionItem | null>(null);
  const previewMode = ref<'preview' | 'diff'>('preview');
  const diffLines = ref<NoteDiffLine[]>([]);
  const previewModeOptions = computed(() => [
    { key: 'preview', label: t('noteDetail.history.preview') },
    { key: 'diff', label: t('noteDetail.history.diff') },
  ]);
  const diffSummary = computed(() => ({
    added: diffLines.value.filter((line) => line.type === 'added').length,
    removed: diffLines.value.filter((line) => line.type === 'removed').length,
  }));
  const diffRows = computed(() => buildNoteSideBySideRows(diffLines.value));
  const isDrawingComparison = computed(
    () =>
      activeVersion.value?.type === 'drawing' &&
      props.currentNote?.type === 'drawing' &&
      Boolean(activeVersion.value.content),
  );
  const drawingDiffSummary = computed(() =>
    compareDrawingVersions(props.currentNote?.content || '', activeVersion.value?.content || ''),
  );

  function drawingSummary(content: string, elementCount?: number) {
    try {
      const scene = JSON.parse(String(content || ''));
      const elements = Array.isArray(scene?.elements) ? scene.elements : [];
      return {
        count: elements.length,
        text: t('note.drawingConflictSummary', {
          strokes: elements.filter((element) => element?.kind === 'stroke').length,
          texts: elements.filter((element) => element?.kind === 'text').length,
        }),
      };
    } catch {
      const count = Number(elementCount);
      return Number.isFinite(count) && count >= 0
        ? { count, text: t('note.drawingElements', { count }) }
        : { count: 0, text: t('note.drawingInvalid') };
    }
  }

  function versionReasonLabel(reason: string) {
    const normalized = String(reason || 'autosave');
    const knownReasons = new Set([
      'autosave',
      'drawing_autosave',
      'format_conversion',
      'ai_change',
      'ai_undo',
      'restore',
    ]);
    if (normalized === 'drawing_autosave') return t('noteDetail.history.reasons.autosave');
    return t(`noteDetail.history.reasons.${knownReasons.has(normalized) ? normalized : 'autosave'}`);
  }

  onMounted(fetchVersions);

  async function fetchVersions() {
    if (!props.noteId) return;
    listLoading.value = true;
    try {
      const res = await apiBasePost('/api/note/getNoteVersions', { id: props.noteId });
      if (res.status === 200 && Array.isArray(res.data)) {
        versions.value = res.data.map((v: any) => ({
          id: v.id,
          title: v.title,
          createTime: v.createTime,
          content: v.content || '',
          type: v.type,
          reason: v.reason,
          sourceRevision: v.sourceRevision,
          contentLength: undefined,
          elementCount:
            v.type === 'drawing' && Number.isFinite(Number(v.elementCount)) ? Number(v.elementCount) : undefined,
        }));
        // 逐条按"渲染后展示文本"异步算字数(不阻塞列表渲染;html/md 各自渲染后取文本)
        versions.value
          .filter((v) => v.type !== 'drawing')
          .forEach(async (v) => {
            v.contentLength = (await noteDisplayText(v.content, v.type)).length;
          });
        // 默认选中最近一条(改动前快照),省一次点击
        if (versions.value.length) {
          selectVersion(versions.value[0]);
        }
      }
    } finally {
      listLoading.value = false;
    }
  }

  async function selectVersion(v: VersionItem) {
    if (activeId.value === v.id && (v.type !== 'drawing' || v.content)) return;
    activeId.value = v.id;
    activeVersion.value = v;
    activePreviewHtml.value = '';
    detailLoading.value = true;
    try {
      // 历史列表为控制总量不返回 drawing scene；仅在用户选中版本后读取一份，并在列表对象上缓存。
      if (v.type === 'drawing' && !v.content) {
        const detailRes = await apiBasePost('/api/note/getNoteVersionDetail', {
          id: v.id,
          drawingSceneVersion: DRAWING_SCENE_VERSION,
        });
        if (activeId.value !== v.id) return;
        if (detailRes.status === 200 && detailRes.data?.type === 'drawing') {
          v.content = String(detailRes.data.content || '');
          v.title = detailRes.data.title || v.title;
          v.sourceRevision = detailRes.data.sourceRevision ?? v.sourceRevision;
          activeVersion.value = v;
        }
      }

      if (activeId.value !== v.id) return;
      const currentType = props.currentNote?.type || props.noteType;
      const [previewHtml, currentHtml] = await Promise.all([
        v.type === 'drawing'
          ? Promise.resolve(`<p>${drawingSummary(v.content, v.elementCount).text}</p>`)
          : noteContentToHtml(v.content, v.type),
        currentType === 'drawing'
          ? Promise.resolve(`<p>${drawingSummary(props.currentNote?.content || '').text}</p>`)
          : noteContentToHtml(props.currentNote?.content || '', currentType),
      ]);
      activePreviewHtml.value = previewHtml;
      diffLines.value = buildNoteLineDiff(noteHtmlToDiffText(currentHtml), noteHtmlToDiffText(previewHtml));
    } finally {
      if (activeId.value === v.id) detailLoading.value = false;
    }
  }

  function confirmRestore() {
    if (!activeId.value || restoring.value) return;
    if (blockGuestWrite('restore-note-version')) return;
    const drawingVersion = activeVersion.value?.type === 'drawing' || props.currentNote?.type === 'drawing';
    const references = drawingVersion
      ? { added: 0, removed: 0 }
      : compareNoteReferenceChanges(props.currentNote?.content || '', activeVersion.value?.content || '');
    const titleChanged = String(props.currentNote?.title || '') !== String(activeVersion.value?.title || '');
    Alert.alert({
      title: t('noteDetail.history.restoreConfirmTitle'),
      content: t('noteDetail.history.restoreScope', {
        title: titleChanged ? t('common.yes') : t('common.no'),
        // 差异视图按“当前相对历史”展示；恢复操作的方向相反。
        added: diffSummary.value.removed,
        removed: diffSummary.value.added,
        refsAdded: references.added,
        refsRemoved: references.removed,
      }),
      async onOk() {
        restoring.value = true;
        try {
          const res = await apiBasePost('/api/note/restoreNoteVersion', {
            id: activeId.value,
            revision: Math.max(1, Number(props.currentNote?.revision || 1)),
          });
          if (res.status === 409 && res.data?.code === 'NOTE_VERSION_CONFLICT') {
            message.warning(res.msg || t('noteDetail.conflict.notice'));
            return;
          }
          if (res.status === 200) {
            message.success(t('noteDetail.history.restoreSuccess'));
            recordOperation({ module: '笔记', operation: `恢复历史版本【${res.data?.title || ''}】` });
            emit('restored', res.data);
            visible.value = false;
          }
        } finally {
          restoring.value = false;
        }
      },
    });
  }
</script>

<style lang="less" scoped>
  .note-history {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
    gap: 16px;
    color: var(--text-color);

    &.mobile {
      width: 100%;
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }

  .version-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--background-color);
    overflow: hidden;
  }

  /* 跟随右侧预览列(header + body)整体等高,列表底部不再留一截空白 */
  .version-list-inner {
    position: relative;
    min-height: 0;
    flex: 1;
  }

  .mobile .version-list-inner {
    flex: none;
    height: 200px;
  }

  .list-scroll {
    height: 100%;
    overflow: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .version-item {
    padding: 10px 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--background-color);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;

    &:hover {
      border-color: rgba(96, 92, 229, 0.4);
    }

    &.active {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--noteType-hover-color) 8%, var(--background-color));
    }
  }

  .version-time {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
  }

  .version-sub {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }

  .version-title-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;

    > span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .version-reason {
    flex: 0 0 auto;
    padding: 1px 5px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.4;
  }

  .version-chars {
    font-size: 11px;
    color: var(--desc-color);
    flex-shrink: 0;
  }

  .version-preview {
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--background-color);
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--card-border-color);
    flex-shrink: 0;
  }

  .preview-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
  }

  .preview-body {
    position: relative;
    padding: 14px;
    min-height: 0;
    flex: 1;
    overflow: auto;
  }
  .version-drawing-preview {
    width: 100%;
  }
  .version-drawing-diff__summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .version-drawing-diff__summary > span:first-child {
    margin-right: 2px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .version-drawing-diff__hint {
    margin: 8px 0 12px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .version-drawing-diff__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }
  .version-drawing-diff__panel {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }
  .version-drawing-diff__panel h3 {
    position: sticky;
    top: -14px;
    z-index: 1;
    margin: 0;
    padding: 9px 12px;
    color: var(--text-color);
    background: var(--background-color);
    border-bottom: 1px solid var(--card-border-color);
    font-size: 12px;
    font-weight: 650;
  }
  .version-drawing-diff__canvas {
    width: 100%;
  }
  .version-diff {
    font-size: 12px;
  }
  .version-diff-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    color: var(--desc-color);
  }
  .version-diff-summary__label {
    margin-right: 2px;
  }
  .version-diff-summary .is-added {
    color: #238759;
    font-weight: 650;
  }
  .version-diff-summary .is-removed {
    color: var(--danger-color, #d14343);
    font-weight: 650;
  }
  .version-diff-line {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--text-color);
    code {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    &.is-added {
      background: color-mix(in srgb, #2fa36b 14%, transparent);
    }
    &.is-removed {
      background: color-mix(in srgb, var(--danger-color, #d14343) 12%, transparent);
      text-decoration: line-through;
    }
  }
  .version-diff-side-by-side {
    min-width: 720px;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    overflow: hidden;
  }
  .version-diff-column-title,
  .version-diff-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .version-diff-column-title {
    position: sticky;
    top: -14px;
    z-index: 1;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
    border-bottom: 1px solid var(--card-border-color);
    font-weight: 650;
  }
  .version-diff-column-title span {
    padding: 9px 12px;
  }
  .version-diff-column-title span + span,
  .version-diff-cell + .version-diff-cell {
    border-left: 1px solid var(--card-border-color);
  }
  .version-diff-row + .version-diff-row {
    border-top: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
  }
  .version-diff-cell {
    min-width: 0;
    min-height: 28px;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: start;
    background: var(--card-background);
  }
  .version-diff-cell code {
    padding: 5px 8px;
    color: var(--text-color);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .version-diff-line-number {
    align-self: stretch;
    padding: 5px 7px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--workspace-panel-bg-color) 76%, transparent);
    text-align: right;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }
  .version-diff-row.is-changed .version-diff-cell--current,
  .version-diff-row.is-added .version-diff-cell--current {
    background: color-mix(in srgb, #2fa36b 11%, var(--card-background));
  }
  .version-diff-row.is-changed .version-diff-cell--historical,
  .version-diff-row.is-removed .version-diff-cell--historical {
    background: color-mix(in srgb, var(--danger-color, #d14343) 10%, var(--card-background));
  }

  .mobile .preview-body {
    height: 260px;
  }

  .mobile .version-drawing-diff__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .preview-empty {
    color: var(--desc-color);
    font-size: 13px;
    text-align: center;
    padding-top: 40px;
  }

  .preview-html {
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-color);
    word-break: break-word;

    :deep(img),
    :deep(video),
    :deep(table) {
      max-width: 100%;
    }

    :deep(img[data-ln-size]) {
      display: block;
      height: auto;
      margin-inline: auto;
    }

    :deep(img[data-ln-size='original']) {
      width: auto;
    }

    :deep(img[data-ln-size='small']) {
      width: 40%;
    }

    :deep(img[data-ln-size='medium']) {
      width: 64%;
    }

    :deep(img[data-ln-size='large']) {
      width: 82%;
    }

    :deep(img[data-ln-size='full']) {
      width: 100%;
    }

    :deep(pre) {
      overflow-x: auto;
    }
  }

  .empty {
    padding: 40px 16px;
    text-align: center;
  }

  .empty-title {
    font-size: 14px;
    color: var(--text-color);
    font-weight: 600;
  }

  .empty-hint {
    margin-top: 6px;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.6;
  }
</style>

<style lang="less">
  /* 非 scoped:.modal-content 属于 BModal 内部结构。
     弹框外层不滚动,滚动交给左侧版本列表与右侧预览各自承担,避免三层嵌套滚动。 */
  .note-version-history__content {
    min-height: 0;
    display: flex;
    overflow: hidden;
  }
</style>
