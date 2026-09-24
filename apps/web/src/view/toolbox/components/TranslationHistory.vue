<template>
  <section class="translation-history">
    <header class="history-header">
      <h2>{{ t('translation.history') }}</h2>
      <BButton class="history-manage" type="text" :disabled="deleting" @click="toggleManage">{{
        t(managing ? 'translation.finishManaging' : 'translation.manageHistory')
      }}</BButton>
    </header>
    <BInput v-model:value="keyword" :placeholder="t('translation.searchHistory')" />
    <div ref="listRef" class="history-list" :aria-busy="loading" @scroll.passive="loadNearBottom">
      <div v-for="item in items" :key="item.id" class="history-entry">
        <BCheckbox
          v-if="managing"
          :model-value="checked.includes(item.id)"
          :disabled="deleting || !canDelete(item)"
          :aria-label="item.preview || item.artifact?.title || t('translation.title')"
          @update:model-value="toggleChecked(item.id)"
        />
        <BButton
          class="history-row"
          :class="{ selected: item.id === selected }"
          :disabled="disabled || deleting || (managing && !canDelete(item))"
          :aria-pressed="managing ? checked.includes(item.id) : item.id === selected"
          @click="managing ? toggleChecked(item.id) : emit('select', item.id)"
        >
          <strong :title="item.preview || item.artifact?.title">{{
            item.preview || item.artifact?.title || t('translation.title')
          }}</strong>
          <small class="history-meta">
            <span>{{ languageName(item.targetLanguage) }}</span>
            <time>{{ formatDate(item.createdAt) }}</time>
          </small>
          <small v-if="item.status !== 'succeeded'" class="history-status">{{
            t('translation.historyStatus.' + item.status)
          }}</small>
        </BButton>
      </div>
      <p v-if="failed" role="alert"
        >{{ t('translation.historyFailed') }} <BButton @click="load(failedAppend)">{{ t('common.retry') }}</BButton></p
      >
      <p v-else-if="loading" class="history-feedback" role="status">{{ t('common.loading') }}</p>
      <p v-else-if="!items.length">{{ t('translation.historyEmpty') }}</p>
    </div>
    <p v-if="deleteFailed" role="alert">{{ t('translation.deleteHistoryFailed') }}</p>
    <BButton
      v-if="managing"
      type="danger"
      block
      :loading="deleting"
      :disabled="!checked.length || disabled"
      @click="confirmDelete()"
      >{{ t('translation.deleteSelected', { count: checked.length }) }}</BButton
    >
    <BButton v-if="managing" class="history-clear" :disabled="deleting || disabled" @click="confirmDelete(true)">{{
      t('translation.clearHistory')
    }}</BButton>
    <p class="history-retention">{{ t('translation.historyRetention') }}</p>
  </section>
</template>
<script setup lang="ts">
  import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { fetchTranslationHistory, deleteTranslationHistory, type ToolboxJob } from '@/api/toolbox';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useUserStore } from '@/store';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  const managing = ref(false),
    checked = ref<string[]>([]),
    deleting = ref(false),
    deleteFailed = ref(false);
  const canDelete = (item: ToolboxJob) =>
    !['queued', 'processing'].includes(item.status) && item.save?.status !== 'saving';
  function toggleManage() {
    managing.value = !managing.value;
    checked.value = [];
    deleteFailed.value = false;
  }
  function toggleChecked(id: string) {
    checked.value = checked.value.includes(id)
      ? checked.value.filter((value) => value !== id)
      : [...checked.value, id].slice(0, 100);
  }
  function confirmDelete(all = false) {
    const ids = [...checked.value];
    if ((!all && !ids.length) || deleting.value) return;
    Alert.alert({
      title: t(all ? 'translation.clearHistory' : 'translation.deleteHistoryTitle'),
      content: t(all ? 'translation.clearHistoryConfirm' : 'translation.deleteHistoryConfirm', { count: ids.length }),
      okText: t(all ? 'translation.clearHistory' : 'translation.deleteHistoryTitle'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (!alive || owner !== buildNoteDetailRequestScope(user)) return;
        deleting.value = true;
        deleteFailed.value = false;
        ++generation;
        clearTimeout(timer);
        try {
          const result = all ? await deleteTranslationHistory([], true) : await deleteTranslationHistory(ids);
          if (!alive || owner !== buildNoteDetailRequestScope(user)) return;
          if (result.cleared) {
            items.value = items.value.filter((item) => !canDelete(item));
            checked.value = [];
            nextCursor.value = null;
            emit('deleted', props.selected ? [props.selected] : []);
            return;
          }
          items.value = items.value.filter((item) => !result.deletedIds.includes(item.id));
          checked.value = checked.value.filter((id) => !result.deletedIds.includes(id));
          emit('deleted', result.deletedIds);
        } catch {
          deleteFailed.value = true;
        } finally {
          deleting.value = false;
          loading.value = false;
          await nextTick();
          loadNearBottom();
        }
      },
    });
  }
  const listRef = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(listRef);
  const props = defineProps<{ selected: string; disabled: boolean; revision: number }>();
  const emit = defineEmits<{ select: [id: string]; deleted: [ids: string[]] }>();
  const { t, locale } = useI18n();
  const user = useUserStore(),
    owner = buildNoteDetailRequestScope(user);
  const keyword = ref(''),
    items = ref<Array<ToolboxJob & { preview?: string; targetLanguage?: string }>>([]),
    nextCursor = ref<string | null>(null),
    loading = ref(false),
    failed = ref(false);
  let alive = true;
  let failedAppend = false;
  let resizeObserver: ResizeObserver | undefined;
  let generation = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  const languageName = (code?: string) => {
    if (code === 'zh-CN') return locale.value.startsWith('zh') ? '简体中文' : 'Simplified Chinese';
    if (code === 'zh-TW') return locale.value.startsWith('zh') ? '繁體中文' : 'Traditional Chinese';
    if (!code) return t('translation.title');
    try {
      return new Intl.DisplayNames([locale.value], { type: 'language' }).of(code) || code;
    } catch {
      return code;
    }
  };
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(locale.value, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
  };
  function loadNearBottom() {
    const list = listRef.value;
    if (!alive || owner !== buildNoteDetailRequestScope(user)) return;
    if (deleting.value) return;
    if (!list || list.clientHeight <= 0 || loading.value || failed.value || !nextCursor.value) return;
    if (list.scrollHeight - list.scrollTop - list.clientHeight <= list.clientHeight / 3) void load(true);
  }
  async function load(append = false) {
    if (append && (loading.value || !nextCursor.value)) return;
    failedAppend = append;
    const version = ++generation;
    loading.value = true;
    failed.value = false;
    try {
      const result = await fetchTranslationHistory(append ? nextCursor.value || '' : '', keyword.value);
      if (version !== generation || owner !== buildNoteDetailRequestScope(user)) return;
      items.value = append
        ? [...items.value, ...result.items.filter((item) => !items.value.some((old) => old.id === item.id))]
        : result.items;
      nextCursor.value = result.nextCursor;
    } catch {
      if (version === generation) failed.value = true;
    } finally {
      if (version === generation) {
        loading.value = false;
        await nextTick();
        if (version === generation) loadNearBottom();
      }
    }
  }
  watch(keyword, () => {
    ++generation;
    checked.value = [];
    clearTimeout(timer);
    nextCursor.value = null;
    if (listRef.value) listRef.value.scrollTop = 0;
    timer = setTimeout(() => void load(), 250);
  });
  watch(
    () => props.revision,
    () => void load(),
  );
  onMounted(() => {
    void load();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(loadNearBottom);
      if (listRef.value) resizeObserver.observe(listRef.value);
    }
  });
  onBeforeUnmount(() => {
    alive = false;
    ++generation;
    clearTimeout(timer);
    resizeObserver?.disconnect();
  });
</script>
<style scoped lang="less">
  .translation-history {
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
    min-height: 0;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-20, 20px) var(--ui-space-12, 12px);
  }
  .history-clear.b_btn {
    width: 100%;
    color: var(--danger-color, #dc4446);
  }
  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
  }
  .history-manage.b_btn {
    margin-inline-start: auto;
    font-size: var(--ui-font-12, 12px);
    height: auto;
    line-height: 1.5;
  }
  .history-entry {
    display: flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    flex-shrink: 0;
  }
  .history-entry .history-row {
    flex: 1;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: var(--ui-font-14, 14px);
  }
  .history-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    overscroll-behavior: contain;
  }
  .history-row.b_btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-shrink: 0;
    width: 100%;
    height: auto;
    min-height: 0;
    line-height: 1.5;
    gap: var(--ui-space-4, 4px);
    position: relative;
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    background: transparent;
    border: 1px solid transparent;
    text-align: start;
    color: var(--text-color);
  }
  .history-row.selected {
    border-color: var(--surface-border-color);
    background: var(--background-color);
  }
  .history-row.selected::before {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    top: 25%;
    bottom: 25%;
    /* ui-density-fixed: 选中态细线，保持与描边一致 */
    width: 2px;
    background: var(--primary-color);
    border-radius: 2px;
  }
  .history-row.selected strong {
    color: var(--primary-color);
  }
  .history-meta {
    display: flex;
    gap: var(--ui-space-8, 8px);
    width: 100%;
    min-width: 0;
    justify-content: space-between;
  }
  .history-meta span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .history-meta time {
    flex-shrink: 0;
  }
  .history-feedback {
    text-align: center;
    margin: var(--ui-space-8, 8px) 0;
  }
  .history-row strong {
    font-size: var(--ui-font-13, 13px);
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .history-row small,
  p {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .history-retention {
    border-top: 1px solid var(--surface-border-color);
    padding-top: var(--ui-space-12, 12px);
    margin: 0;
  }
</style>
