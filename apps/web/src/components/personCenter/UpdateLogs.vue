<template>
  <CommonContainer :title="t('changelog.title')">
    <template #navigation>
      <BButton class="mobile-changelog-nav__back" :aria-label="t('common.back')" @click="backRouterPage">
        <SvgIcon :src="icon.arrow_left" size="20" aria-hidden="true" />
      </BButton>
      <div class="mobile-changelog-nav__heading">
        <strong class="mobile-changelog-nav__title">{{ t('changelog.title') }}</strong>
        <BButton
          class="mobile-changelog-nav__support"
          size="small"
          :aria-label="t('support.entry')"
          v-click-log="{ module: '更新日志', operation: '从更新日志标题打开支持轻笺' }"
          @click="openSupport"
        >
          <SvgIcon :src="icon.support.heart" size="17" aria-hidden="true" />
        </BButton>
      </div>
      <BButton v-if="user.role === 'root'" class="mobile-changelog-nav__create" :loading="creating" @click="createLog">
        {{ t('changelog.newLog') }}
      </BButton>
      <span v-else class="mobile-changelog-nav__placeholder" aria-hidden="true"></span>
    </template>
    <div v-if="user.role === 'root' && !bookmark.isMobile" class="page-actions">
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
      <header v-if="!bookmark.isMobile" class="logs-intro">
        <div class="logs-intro__heading">
          <h1 class="intro-title">{{ t('changelog.pageTitle') }}</h1>
          <BButton
            class="logs-intro__support"
            size="small"
            v-click-log="{ module: '更新日志', operation: '从更新日志标题打开支持轻笺' }"
            @click="openSupport"
          >
            <SvgIcon :src="icon.support.heart" size="16" aria-hidden="true" />
            <span>{{ t('support.entry') }}</span>
          </BButton>
        </div>
        <p class="intro-desc">{{ t('changelog.pageDesc') }}</p>
      </header>

      <div v-if="loading" class="logs-state">
        <BLoading :loading="true" inline :title="t('common.loading')" />
      </div>
      <div v-else-if="!logs.length" class="logs-state">{{ t('changelog.empty') }}</div>

      <div v-else-if="bookmark.isMobile" class="mobile-changelog">
        <section class="mobile-changelog__latest">
          <h2>{{ t('changelog.latestVersion') }}</h2>
          <article v-if="logs[0]" class="mobile-latest-card">
            <div class="mobile-latest-card__meta">
              <time :datetime="logs[0].publishDate">{{ logs[0].publishDate }}</time>
              <span class="latest-badge">{{ t('changelog.latest') }}</span>
              <span v-if="logs[0].status === 'draft'" class="draft-badge">{{ t('changelog.status.draft') }}</span>
            </div>
            <h3>{{ logs[0].title }}</h3>
            <div v-if="logs[0].tags.length" class="log-tags">
              <span v-for="tag in logs[0].tags" :key="tag">{{ tag }}</span>
            </div>
            <p v-if="logs[0].summary" class="log-summary">{{ logs[0].summary }}</p>
            <div
              v-if="isExpanded(logs[0].id) && renderedContent[logs[0].id]"
              class="log-markdown markdown-body"
              v-html="renderedContent[logs[0].id]"
              v-mermaid
            ></div>
            <ol v-else-if="isExpanded(logs[0].id) && logs[0].highlights.length" class="log-highlights">
              <li v-for="(highlight, index) in logs[0].highlights" :key="index">{{ highlight }}</li>
            </ol>
            <div class="mobile-latest-card__actions">
              <BButton v-if="canToggle(logs[0])" class="expand-button" @click="toggleExpanded(logs[0].id)">
                {{ isExpanded(logs[0].id) ? t('changelog.collapse') : t('changelog.expand') }}
              </BButton>
              <BButton v-if="user.role === 'root'" @click="editLog(logs[0].id)">{{ t('common.edit') }}</BButton>
            </div>
          </article>
        </section>

        <section v-if="logs.length > 1" class="mobile-changelog__history">
          <h2>{{ t('changelog.history') }}</h2>
          <MobileListSurface>
            <template v-for="item in logs.slice(1)" :key="item.id">
              <MobileListRow interactive @click="toggleExpanded(item.id)">
                <template #leading
                  ><time class="mobile-history-date">{{ item.publishDate.slice(5) }}</time></template
                >
                <template #title>{{ item.title }}</template>
                <template #subtitle>{{ item.summary || item.tags.join(' · ') }}</template>
                <template #trailing><SvgIcon :src="icon.arrow_right" size="16" aria-hidden="true" /></template>
              </MobileListRow>
              <div v-if="isExpanded(item.id)" class="mobile-history-detail">
                <div
                  v-if="renderedContent[item.id]"
                  class="log-markdown markdown-body"
                  v-html="renderedContent[item.id]"
                  v-mermaid
                ></div>
                <ol v-else-if="item.highlights.length" class="log-highlights">
                  <li v-for="(highlight, index) in item.highlights" :key="index">{{ highlight }}</li>
                </ol>
                <BButton v-if="user.role === 'root'" size="small" @click="editLog(item.id)">{{
                  t('common.edit')
                }}</BButton>
              </div>
            </template>
          </MobileListSurface>
        </section>
      </div>

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

            <ol v-if="item.highlights.length && (!item.contentMarkdown || !isExpanded(item.id))" class="log-highlights">
              <li v-for="(highlight, highlightIndex) in visibleHighlights(item)" :key="highlightIndex">
                {{ highlight }}
              </li>
            </ol>

            <div
              v-if="isExpanded(item.id) && renderedContent[item.id]"
              class="log-markdown markdown-body"
              :class="{ 'has-meta-divider': item.tags.length > 0 || Boolean(item.summary) }"
              v-html="renderedContent[item.id]"
              v-mermaid
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
  import { useRouter } from 'vue-router';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import UpdateLogEditor from '@/components/personCenter/UpdateLogEditor.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { bookmarkStore, useUserStore } from '@/store';
  import { backRouterPage, noteContentToHtml } from '@/utils/common';
  import { createUpdateLogDraft, listManagedUpdateLogs, listUpdateLogs, type UpdateLogItem } from '@/api/updateLogApi';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';

  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
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
      expandedIds.value = firstId && !bookmark.isMobile ? new Set([firstId]) : new Set();
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

  function openSupport() {
    void router.push('/support');
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

  .logs-intro__heading {
    margin-bottom: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .intro-title {
    margin: 0;
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

  .logs-intro :deep(.logs-intro__support.b_btn) {
    gap: 5px;
    border: 1px solid var(--support-entry-border-color);
    color: var(--support-entry-text-color);
    background: var(--support-entry-background);
    box-shadow: none;
  }

  .logs-intro :deep(.logs-intro__support.b_btn:hover) {
    background: var(--support-entry-hover-background);
  }

  .logs-intro :deep(.logs-intro__support.b_btn) {
    min-height: 32px;
    padding-inline: 10px;
    font-size: 12px;
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
  }

  .log-markdown.has-meta-divider {
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

  .mobile-changelog-nav__back,
  .mobile-changelog-nav__create,
  .mobile-changelog-nav__placeholder {
    position: absolute;
    top: 8px;
    min-width: 44px;
    height: 44px;
  }

  .mobile-changelog-nav__back {
    left: 0;
    padding: 0;
    background: transparent !important;
  }

  .mobile-changelog-nav__create,
  .mobile-changelog-nav__placeholder {
    right: 0;
  }

  .mobile-changelog-nav__create {
    width: auto;
    padding-inline: 8px;
    color: var(--primary-color);
    background: transparent !important;
    font-weight: 650;
  }

  .mobile-changelog-nav__heading {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .mobile-changelog-nav__heading :deep(.mobile-changelog-nav__support.b_btn) {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: 12px;
    color: var(--support-entry-text-color);
    background: transparent !important;
    box-shadow: none;
  }

  .mobile-changelog-nav__heading :deep(.mobile-changelog-nav__support.b_btn:hover) {
    background: var(--support-entry-hover-background) !important;
  }

  .mobile-changelog-nav__title {
    font-size: 18px;
    font-weight: 720;
  }

  .mobile-changelog h2 {
    margin: 0 0 8px;
    color: var(--text-color);
    font-size: 16px;
  }

  .mobile-changelog__history {
    margin-top: 18px;

    :deep(.mobile-list-row) {
      --mobile-row-min-height: 68px;

      height: auto;
    }

    :deep(.mobile-list-row__title),
    :deep(.mobile-list-row__subtitle) {
      white-space: nowrap;
    }
  }

  .mobile-latest-card {
    padding: 16px;
    border: 1px solid var(--primary-color);
    border-radius: var(--mobile-surface-radius, 16px);
    background: var(--card-background);
    box-shadow: none;
  }

  .mobile-latest-card__meta,
  .mobile-latest-card__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
  }

  .mobile-latest-card__meta time,
  .mobile-history-date {
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .mobile-latest-card h3 {
    margin: 10px 0 0;
    color: var(--text-color);
    font-size: 17px;
    line-height: 1.45;
  }

  .mobile-latest-card__actions {
    margin-top: 14px;
  }

  .mobile-latest-card__actions :deep(.b_btn) {
    min-height: 44px;
  }

  .mobile-history-date {
    width: 38px;
    text-align: center;
  }

  .mobile-history-detail {
    padding: 12px 14px 16px;
    border-left: 3px solid var(--primary-color);
    background: var(--workspace-panel-bg-color);
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
      padding: 14px 0 36px;
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

    :deep(.phone-container) {
      padding-inline: var(--mobile-page-gutter, 14px);
      background: var(--surface-page-bg);
    }

    :deep(.phone-navigation),
    :deep(.phone-body) {
      width: calc(100% - 28px);
    }

    :deep(.phone-body) {
      padding-top: 0;
    }
  }
</style>
