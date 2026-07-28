<template>
  <CommonContainer :title="t('changelog.title')">
    <div v-if="user.role === 'root'" class="page-actions">
      <BButton
        type="primary"
        size="small"
        :loading="creating"
        v-click-log="{ module: '更新日志', operation: '新建更新日志' }"
        @click="createLog"
      >
        {{ t('changelog.newLog') }}
      </BButton>
    </div>

    <div class="logs-container">
      <header class="logs-intro">
        <h1 class="intro-title">{{ t('changelog.pageTitle') }}</h1>
        <p class="intro-desc">{{ t('changelog.pageDesc') }}</p>
      </header>

      <div v-if="loading" class="logs-state">
        <BLoading :loading="true" inline :title="t('common.loading')" />
      </div>
      <div v-else-if="!logs.length" class="logs-state">{{ t('changelog.empty') }}</div>

      <div v-else class="timeline" role="list">
        <article v-for="item in logs" :key="item.id" class="timeline-item" role="listitem">
          <div class="timeline-marker" aria-hidden="true">
            <span></span>
          </div>

          <section class="log-card" :class="{ 'is-latest': item.id === latestPublishedId }">
            <div class="log-card-head">
              <div class="log-heading">
                <div class="log-title-row">
                  <h2>{{ item.title }}</h2>
                  <span v-if="item.id === latestPublishedId" class="latest-badge">{{ t('changelog.latest') }}</span>
                  <span v-if="item.status === 'draft'" class="draft-badge">{{ t('changelog.status.draft') }}</span>
                </div>
                <time :datetime="item.publishDate">{{ item.publishDate }}</time>
              </div>

              <BButton
                v-if="user.role === 'root'"
                size="small"
                v-click-log="{ module: '更新日志', operation: '编辑更新日志' }"
                @click="editLog(item.id)"
              >
                {{ t('common.edit') }}
              </BButton>
            </div>

            <div v-if="item.tags.length" class="log-tags" :aria-label="t('changelog.fields.tags')">
              <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
            </div>

            <p v-if="item.summary" class="log-summary">{{ item.summary }}</p>

            <ol v-if="!item.contentMarkdown && item.highlights.length" class="log-highlights">
              <li v-for="(highlight, highlightIndex) in visibleHighlights(item)" :key="highlightIndex">
                {{ highlight }}
              </li>
            </ol>

            <div
              v-if="isExpanded(item.id) && renderedContent[item.id]"
              class="log-markdown markdown-body"
              v-html="renderedContent[item.id]"
            ></div>

            <div v-if="canToggle(item)" class="log-card-footer">
              <BButton class="expand-button" size="small" @click="toggleExpanded(item.id)">
                {{ isExpanded(item.id) ? t('changelog.collapse') : t('changelog.expand') }}
              </BButton>
            </div>
          </section>
        </article>
      </div>
    </div>

    <UpdateLogEditor
      v-if="editorVisible"
      v-model:visible="editorVisible"
      :log-id="editingId"
      :discard-on-close="discardNewDraft"
      @saved="handleEditorSaved"
      @deleted="handleEditorDeleted"
    />
  </CommonContainer>
</template>

<script setup lang="ts">
  import { computed, ref, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import UpdateLogEditor from '@/components/personCenter/UpdateLogEditor.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { useUserStore } from '@/store';
  import { noteContentToHtml } from '@/utils/common';
  import { createUpdateLogDraft, listManagedUpdateLogs, listUpdateLogs, type UpdateLogItem } from '@/api/updateLogApi';

  const { t } = useI18n();
  const user = useUserStore();
  const logs = ref<UpdateLogItem[]>([]);
  const renderedContent = ref<Record<string, string>>({});
  const expandedIds = ref(new Set<string>());
  const loading = ref(false);
  const creating = ref(false);
  const editorVisible = ref(false);
  const editingId = ref('');
  const discardNewDraft = ref(false);
  const latestPublishedId = computed(() => logs.value.find((item) => item.status === 'published')?.id || '');
  let loadSequence = 0;

  async function getLogs() {
    const sequence = ++loadSequence;
    loading.value = true;
    try {
      let res = user.role === 'root' ? await listManagedUpdateLogs() : await listUpdateLogs();
      if (user.role === 'root' && res.status !== 200) {
        res = await listUpdateLogs();
      }
      if (res.status !== 200) throw new Error(res.msg || 'CHANGELOG_LIST_FAILED');
      const items = Array.isArray(res.data?.items) ? (res.data.items as UpdateLogItem[]) : [];
      const renderedPairs = await Promise.all(
        items.map(
          async (item) =>
            [item.id, item.contentMarkdown ? await noteContentToHtml(item.contentMarkdown, 'markdown') : ''] as const,
        ),
      );
      if (sequence !== loadSequence) return;
      logs.value = items;
      renderedContent.value = Object.fromEntries(renderedPairs);
      const firstId = items[0]?.id;
      expandedIds.value = firstId ? new Set([firstId]) : new Set();
    } catch (error) {
      console.error(error);
      message.error(t('changelog.errorInfo'));
    } finally {
      if (sequence === loadSequence) loading.value = false;
    }
  }

  function isExpanded(id: string) {
    return expandedIds.value.has(id);
  }

  function toggleExpanded(id: string) {
    const next = new Set(expandedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedIds.value = next;
  }

  function visibleHighlights(item: UpdateLogItem) {
    return isExpanded(item.id) ? item.highlights : item.highlights.slice(0, 3);
  }

  function canToggle(item: UpdateLogItem) {
    return Boolean(item.contentMarkdown || item.highlights.length > 3);
  }

  async function createLog() {
    if (creating.value) return;
    creating.value = true;
    try {
      const res = await createUpdateLogDraft();
      const item = res.data?.item as UpdateLogItem | undefined;
      if (res.status !== 200 || !item?.id) {
        message.error(res.msg || t('changelog.createFailed'));
        return;
      }
      editingId.value = item.id;
      discardNewDraft.value = true;
      editorVisible.value = true;
    } catch {
      message.error(t('changelog.createFailed'));
    } finally {
      creating.value = false;
    }
  }

  function editLog(id: string) {
    editingId.value = id;
    discardNewDraft.value = false;
    editorVisible.value = true;
  }

  function handleEditorSaved() {
    discardNewDraft.value = false;
    void getLogs();
  }

  function handleEditorDeleted() {
    discardNewDraft.value = false;
    void getLogs();
  }

  onMounted(getLogs);
</script>

<style scoped lang="less">
  .page-actions {
    position: absolute;
    top: 5px;
    right: 20px;
    z-index: 10;
  }

  .logs-container {
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 28px 16px 48px;
  }

  .logs-container::-webkit-scrollbar {
    width: 6px;
  }

  .logs-container::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: color-mix(in srgb, var(--desc-color) 25%, transparent);
  }

  .logs-intro {
    margin-bottom: 34px;
    text-align: center;
  }

  .intro-title {
    margin: 0 0 8px;
    font-size: 30px;
    font-weight: 750;
    background: linear-gradient(135deg, var(--primary-color) 0%, #3d37c9 100%);
    background-clip: text;
    color: transparent;
  }

  .intro-desc {
    margin: 0;
    color: var(--desc-color);
    font-size: 14px;
  }

  .logs-state {
    min-height: 260px;
    display: grid;
    place-items: center;
    color: var(--desc-color);
  }

  .timeline {
    position: relative;
    max-width: 960px;
    margin: 0 auto;
  }

  .timeline::before {
    content: '';
    position: absolute;
    top: 10px;
    bottom: 12px;
    left: 7px;
    width: 2px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--primary-color) 18%, var(--card-border-color));
  }

  .timeline-item {
    position: relative;
    padding: 0 0 26px 38px;
  }

  .timeline-marker {
    position: absolute;
    left: 0;
    top: 22px;
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--background-color);
  }

  .timeline-marker span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--primary-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 18%, transparent);
  }

  .log-card {
    padding: 22px 24px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 16px;
    background: var(--card-background, var(--background-color));
    box-shadow: var(--surface-card-shadow);
  }

  .log-card.is-latest {
    border-color: color-mix(in srgb, var(--primary-color) 28%, var(--card-border-color));
    box-shadow: var(--surface-raised-shadow);
  }

  .log-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 60%, transparent);
  }

  .log-heading {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .log-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .log-title-row h2 {
    margin: 0;
    color: var(--text-color);
    font-size: 18px;
    line-height: 1.45;
  }

  .latest-badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 650;
  }

  .draft-badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--desc-color) 12%, transparent);
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 650;
  }

  .log-heading time {
    color: var(--desc-color);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .log-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 14px;
  }

  .log-tags span {
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--workspace-panel-bg-color);
    color: var(--desc-color);
    font-size: 11px;
  }

  .log-summary {
    margin: 16px 0 0;
    color: var(--text-color);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.65;
  }

  .log-highlights {
    margin: 16px 0 0;
    padding-left: 1.5em;
    color: var(--text-color);
  }

  .log-highlights li {
    margin: 8px 0;
    padding-left: 5px;
    color: color-mix(in srgb, var(--text-color) 90%, transparent);
    font-size: 14px;
    line-height: 1.75;
  }

  .log-highlights li::marker {
    color: var(--primary-color);
    font-weight: 700;
  }

  .log-markdown {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px dashed color-mix(in srgb, var(--card-border-color) 75%, transparent);
  }

  .markdown-body {
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.8;
    overflow-wrap: anywhere;
  }

  .markdown-body :deep(h1),
  .markdown-body :deep(h2),
  .markdown-body :deep(h3) {
    margin: 1.25em 0 0.55em;
    line-height: 1.35;
  }

  .markdown-body :deep(p),
  .markdown-body :deep(ul),
  .markdown-body :deep(ol),
  .markdown-body :deep(blockquote) {
    margin: 0.75em 0;
  }

  .markdown-body :deep(a) {
    color: var(--primary-color);
  }

  .markdown-body :deep(img) {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 16px auto;
    border-radius: 12px;
    box-shadow: var(--surface-card-shadow);
  }

  .markdown-body :deep(img[data-ln-size='small']) {
    width: min(100%, 360px);
  }

  .markdown-body :deep(img[data-ln-size='medium']) {
    width: min(100%, 640px);
  }

  .markdown-body :deep(img[data-ln-size='large']) {
    width: min(100%, 900px);
  }

  .markdown-body :deep(img[data-ln-size='full']) {
    width: 100%;
  }

  .markdown-body :deep(img[data-ln-size='original']) {
    width: auto;
  }

  .markdown-body :deep(pre) {
    max-width: 100%;
    overflow-x: auto;
    padding: 14px;
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .markdown-body :deep(code) {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  }

  .log-card-footer {
    display: flex;
    justify-content: center;
    margin-top: 14px;
  }

  .expand-button {
    color: var(--primary-color);
    background: transparent;
  }

  @media (min-width: 768px) {
    .logs-container {
      padding-right: 10%;
      padding-left: 10%;
    }
  }

  @media (min-width: 1200px) {
    .logs-container {
      padding-right: 15%;
      padding-left: 15%;
    }
  }

  @media (max-width: 767px) {
    .page-actions {
      right: 12px;
    }

    .logs-container {
      padding: 20px 0 36px;
    }

    .logs-intro {
      margin-bottom: 26px;
      padding: 0 12px;
    }

    .intro-title {
      font-size: 27px;
    }

    .timeline::before {
      left: 6px;
    }

    .timeline-item {
      padding-left: 28px;
      padding-bottom: 18px;
    }

    .timeline-marker {
      width: 14px;
      height: 14px;
      top: 18px;
    }

    .timeline-marker span {
      width: 9px;
      height: 9px;
    }

    .log-card {
      padding: 17px 16px;
      border-radius: 14px;
    }

    .log-card-head {
      gap: 10px;
      padding-bottom: 12px;
    }

    .log-title-row h2 {
      font-size: 16px;
    }

    .log-highlights li,
    .markdown-body {
      font-size: 13.5px;
      line-height: 1.72;
    }
  }
</style>
