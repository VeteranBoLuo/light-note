<template>
  <section class="note-readonly-preview" aria-live="polite">
    <header class="note-readonly-preview__header">
      <div class="note-readonly-preview__heading">
        <nav class="note-readonly-preview__breadcrumb" :aria-label="t('note.currentDirectory')">
          <BButton size="small" @click="emit('close')">{{ t('note.knowledgeRoot') }}</BButton>
          <template v-for="item in parentBreadcrumb" :key="item.id">
            <span aria-hidden="true">/</span>
            <span>{{ item.title || t('note.untitled') }}</span>
          </template>
        </nav>
        <div class="note-readonly-preview__title-row">
          <h2>{{ displayNote.title || t('note.untitled') }}</h2>
          <span v-if="childCount > 0" class="note-readonly-preview__child-count">
            {{ t('note.childPagesCount', { count: childCount }) }}
          </span>
          <div class="note-readonly-preview__meta">
            <span class="note-readonly-preview__mode">
              <SvgIcon :src="icon.cloudSpace.preview.sidebar" size="14" aria-hidden="true" />
              {{ t('common.preview') }}
            </span>
            <span v-if="displayTime">{{ displayTime }}</span>
          </div>
        </div>
      </div>

      <div class="note-readonly-preview__actions">
        <BButton type="primary" class="note-readonly-preview__edit" @click="emit('edit')">
          <SvgIcon :src="icon.card_edit" size="16" aria-hidden="true" />
          {{ t('common.edit') }}
        </BButton>
        <BDropdown v-if="menuOptions.length" trigger="click" align="right" :menu-options="menuOptions">
          <BButton class="note-readonly-preview__more" :aria-label="t('common.more')">
            <SvgIcon :src="icon.common.more" size="17" aria-hidden="true" />
          </BButton>
        </BDropdown>
      </div>
    </header>

    <div v-auto-scrollbar class="note-readonly-preview__scroll">
      <BLoading v-if="loading" inline loading :title="t('common.loading')" />
      <template v-else-if="error">
        <div class="note-readonly-preview__error">
          <strong>{{ t('common.requestFailed') }}</strong>
          <BButton size="small" @click="loadPreview">{{ t('common.retry') }}</BButton>
        </div>
      </template>
      <article v-else class="note-readonly-preview__article">
        <div class="note-readonly-preview__notice">
          <SvgIcon :src="icon.growth.lock" size="15" aria-hidden="true" />
          <span>{{ t('common.preview') }}</span>
        </div>
        <div v-if="previewHtml" class="note-readonly-preview__content" v-html="previewHtml"></div>
        <p v-else class="note-readonly-preview__empty">{{ t('common.none') }}</p>
      </article>
    </div>
  </section>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import { normalizeNoteContentResourceUrls, noteContentToHtml } from '@/utils/common';

  interface PreviewBreadcrumbItem {
    id: string;
    title?: string;
  }

  interface PreviewMenuOption {
    key?: string;
    label?: string;
    icon?: string;
    danger?: boolean;
    divider?: boolean;
    function?: () => void;
  }

  const props = withDefaults(
    defineProps<{
      noteId: string;
      seed?: Record<string, any> | null;
      childCount?: number;
      menuOptions?: PreviewMenuOption[];
    }>(),
    {
      seed: null,
      childCount: 0,
      menuOptions: () => [],
    },
  );
  const emit = defineEmits<{ close: []; edit: [] }>();
  const { t } = useI18n();
  const detail = ref<Record<string, any>>({});
  const breadcrumb = ref<PreviewBreadcrumbItem[]>([]);
  const previewHtml = ref('');
  const loading = ref(false);
  const error = ref(false);
  let requestSeq = 0;

  const displayNote = computed(() => ({ ...(props.seed || {}), ...detail.value }));
  const parentBreadcrumb = computed(() => breadcrumb.value.filter((item) => item.id !== props.noteId));
  const displayTime = computed(() => String(displayNote.value.updateTime || displayNote.value.createTime || '').trim());

  async function loadPreview() {
    const noteId = String(props.noteId || '').trim();
    if (!noteId) return;
    const seq = ++requestSeq;
    loading.value = true;
    error.value = false;
    detail.value = {};
    breadcrumb.value = [];
    previewHtml.value = '';
    try {
      const [detailResult, breadcrumbResult] = await Promise.all([
        apiBasePost('/api/note/getNoteDetail', { id: noteId }, { silent: true }),
        apiBasePost('/api/note/queryNoteBreadcrumb', { noteId }, { silent: true }).catch(() => null),
      ]);
      if (seq !== requestSeq) return;
      if (detailResult.status !== 200 || !detailResult.data) {
        error.value = true;
        return;
      }
      detail.value = detailResult.data;
      breadcrumb.value = Array.isArray(breadcrumbResult?.data?.items) ? breadcrumbResult.data.items : [];
      const normalizedContent = normalizeNoteContentResourceUrls(String(detailResult.data.content || ''));
      previewHtml.value = await noteContentToHtml(normalizedContent, detailResult.data.type);
    } catch {
      if (seq === requestSeq) error.value = true;
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  watch(() => props.noteId, loadPreview, { immediate: true });
</script>

<style lang="less" scoped>
  .note-readonly-preview {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--card-background);
  }

  .note-readonly-preview__header {
    flex: 0 0 auto;
    min-height: 78px;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid var(--surface-border-color);
  }

  .note-readonly-preview__heading {
    min-width: 0;
  }

  .note-readonly-preview__breadcrumb,
  .note-readonly-preview__meta,
  .note-readonly-preview__title-row,
  .note-readonly-preview__actions {
    display: flex;
    align-items: center;
  }

  .note-readonly-preview__breadcrumb {
    min-width: 0;
    gap: 7px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;

    > button {
      min-height: 26px;
      padding: 0;
      border: 0;
      color: var(--desc-color);
      background: transparent;
    }

    > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .note-readonly-preview__title-row {
    min-width: 0;
    gap: 10px;
    margin-top: 3px;

    h2 {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      color: var(--text-color);
      font-size: 20px;
      line-height: 28px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .note-readonly-preview__child-count {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 12px;
  }

  .note-readonly-preview__meta {
    flex: 0 0 auto;
    gap: 10px;
    margin-left: 2px;
    color: var(--muted-text-color, var(--desc-color));
    font-size: 11px;
  }

  .note-readonly-preview__mode {
    min-height: 22px;
    padding: 1px 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--resource-note-color, #00a884);
    border-radius: 999px;
    color: var(--resource-note-color, #00a884);
    background: var(--resource-note-soft-bg, #e9f8f4);
    font-weight: 650;
  }

  .note-readonly-preview__actions {
    flex: 0 0 auto;
    gap: 8px;
  }

  .note-readonly-preview__edit {
    min-height: 36px;
    padding: 0 14px;
  }

  .note-readonly-preview__more {
    width: 36px;
    min-width: 36px;
    min-height: 36px;
    padding: 0;
  }

  .note-readonly-preview__scroll {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
    padding: 22px clamp(24px, 5vw, 68px) 40px;
  }

  .note-readonly-preview__article {
    width: min(100%, 780px);
    margin: 0 auto;
    color: var(--text-color);
  }

  .note-readonly-preview__notice {
    min-height: 38px;
    margin-bottom: 22px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-left: 3px solid var(--resource-note-color, #00a884);
    border-radius: 0 9px 9px 0;
    color: var(--resource-note-color, #00a884);
    background: var(--resource-note-soft-bg, #e9f8f4);
    font-size: 12px;
    font-weight: 650;
  }

  .note-readonly-preview__content {
    color: var(--text-color);
    font-size: 15px;
    line-height: 1.85;
    overflow-wrap: anywhere;

    :deep(> :first-child) {
      margin-top: 0;
    }

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
      margin: 1.35em 0 0.55em;
      line-height: 1.42;
    }

    :deep(p),
    :deep(ul),
    :deep(ol),
    :deep(blockquote),
    :deep(pre) {
      margin: 0.8em 0;
    }

    :deep(img) {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }

    :deep(blockquote) {
      padding: 10px 14px;
      border-left: 3px solid var(--primary-color);
      color: var(--desc-color);
      background: var(--menu-body-bg-color);
    }

    :deep(pre) {
      overflow: auto;
      padding: 14px;
      border-radius: 9px;
      background: var(--menu-body-bg-color);
    }
  }

  .note-readonly-preview__error,
  .note-readonly-preview__empty {
    min-height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--desc-color);
  }
</style>
