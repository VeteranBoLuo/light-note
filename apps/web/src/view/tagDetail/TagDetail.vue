<template>
  <ResourcePageShell
    class="tag-space-shell"
    :title="t('tagSpace.title')"
    :subtitle="t('tagSpace.subtitle')"
    accent="tag"
    layout="workspace"
    compact-mobile-heading
    :show-header="!bookmark.isMobile"
  >
    <template #actions>
      <BButton v-if="!isReadOnly" :disabled="detailLoading || detailRefreshing" @click="createTag">
        <SvgIcon :src="icon.common.add" size="15" aria-hidden="true" />
        {{ t('tagSpace.createTag') }}
      </BButton>
      <BButton v-if="!isReadOnly" :disabled="!tag || detailRefreshing" @click="editTag()">
        <SvgIcon :src="icon.table_edit" size="14" aria-hidden="true" />
        {{ t('common.edit') }}
      </BButton>
      <BButton type="primary" :disabled="!tag || detailRefreshing" @click="openTagInAi">
        <SvgIcon :src="icon.ai.ask" size="15" aria-hidden="true" />
        {{ t('tagSpace.askAi') }}
      </BButton>
    </template>

    <div class="tag-space-detail" :class="{ 'is-graph': viewMode === 'graph' }">
      <div
        v-if="detailLoading"
        class="tag-space-workspace tag-space-workspace--skeleton"
        aria-busy="true"
        :aria-label="t('common.loading')"
      >
        <aside class="tag-directory-rail tag-directory-rail--skeleton" aria-hidden="true">
          <div class="skeleton-directory-overview">
            <span class="skeleton-block skeleton-block--directory-icon"></span>
            <span class="skeleton-block skeleton-block--directory-title"></span>
            <span class="skeleton-block skeleton-block--directory-count"></span>
          </div>
          <span class="skeleton-block skeleton-block--directory-label"></span>
          <div class="skeleton-directory-list">
            <div v-for="index in 9" :key="index" class="skeleton-directory-row">
              <span class="skeleton-block skeleton-block--directory-icon"></span>
              <span class="skeleton-block skeleton-block--directory-name"></span>
              <span class="skeleton-block skeleton-block--directory-count"></span>
            </div>
          </div>
        </aside>

        <main class="tag-space-main tag-space-main--skeleton" aria-hidden="true">
          <BCard variant="card" class="skeleton-profile-card">
            <div class="skeleton-profile-identity">
              <span class="skeleton-block skeleton-block--profile-icon"></span>
              <div class="skeleton-profile-copy">
                <span class="skeleton-block skeleton-block--profile-title"></span>
                <span class="skeleton-block skeleton-block--profile-description"></span>
                <span class="skeleton-block skeleton-block--profile-meta"></span>
              </div>
            </div>
            <div class="skeleton-profile-stats">
              <div v-for="index in 4" :key="index" class="skeleton-profile-stat">
                <span class="skeleton-block skeleton-block--stat-label"></span>
                <span class="skeleton-block skeleton-block--stat-value"></span>
              </div>
            </div>
          </BCard>

          <div class="skeleton-primary-tabs">
            <span v-for="index in 3" :key="index" class="skeleton-block skeleton-block--tab"></span>
          </div>

          <BCard variant="card" padding="0" class="skeleton-resources-panel">
            <div class="skeleton-resource-toolbar">
              <div class="skeleton-resource-filters">
                <span v-for="index in 4" :key="index" class="skeleton-block skeleton-block--filter"></span>
              </div>
              <span class="skeleton-block skeleton-block--search"></span>
              <span class="skeleton-block skeleton-block--sort"></span>
            </div>
            <div v-for="groupIndex in 2" :key="groupIndex" class="skeleton-resource-group">
              <div class="skeleton-resource-heading">
                <span class="skeleton-block skeleton-block--group-dot"></span>
                <span class="skeleton-block skeleton-block--group-title"></span>
                <span class="skeleton-block skeleton-block--group-hint"></span>
              </div>
              <span v-for="rowIndex in 2" :key="rowIndex" class="skeleton-row"></span>
            </div>
          </BCard>
        </main>
      </div>

      <BCard v-else-if="detailError || !tag" variant="card" class="detail-state" role="alert">
        <span class="state-symbol">!</span>
        <strong>{{ t('tagSpace.detailLoadFailedTitle') }}</strong>
        <p>{{ t('tagSpace.detailLoadFailedDesc') }}</p>
        <div class="state-actions">
          <BButton @click="router.push('/manage/tagMg')">{{ t('tagSpace.backToSpaces') }}</BButton>
          <BButton type="primary" @click="loadDetail()">{{ t('common.retry') }}</BButton>
        </div>
      </BCard>

      <div
        v-else
        class="tag-space-workspace"
        :class="{ 'is-switching': detailRefreshing, 'has-insights': relatedTags.length > 0 }"
        :aria-busy="detailRefreshing"
      >
        <aside class="tag-directory-rail" :aria-label="t('tagSpace.sidebarTitle')">
          <div class="rail-overview" :aria-label="t('tagSpace.allTags')">
            <span class="rail-icon rail-icon--tag"><SvgIcon :src="icon.resource.tag" size="16" /></span>
            <span>{{ t('tagSpace.allTags') }}</span>
            <strong>{{ sidebarTagTotal }}</strong>
          </div>

          <div v-if="directorySidebarTags.length" v-auto-scrollbar class="rail-section rail-section--directory">
            <span class="rail-section__label">{{ t('tagSpace.directoryTopics') }}</span>
            <BActionMenu
              v-for="sidebarTag in directorySidebarTags"
              :key="sidebarTag.id"
              :items="tagDirectoryActionItems(sidebarTag)"
              :triggers="tagMenuTriggers"
              placement="right-start"
              :disabled="!bookmark.isDesktop || isReadOnly || detailRefreshing"
              :aria-label="t('tagSpace.tagActions', { name: sidebarTag.name })"
              @select="(action, source) => handleDirectoryTagAction(action, sidebarTag, source)"
            >
              <TagDirectoryRow
                :label="sidebarTag.name"
                :count="sidebarTag.counts.total"
                :icon-src="sidebarTag.iconUrl || icon.resource.tag"
                :icon-size="15"
                :active="
                  switchingTagId ? switchingTagId === String(sidebarTag.id) : displayedTagId === String(sidebarTag.id)
                "
                @activate="openRelatedTag(sidebarTag.id)"
              />
            </BActionMenu>
          </div>
        </aside>

        <main class="tag-space-main">
          <BCard as="section" variant="card" padding="18px" class="tag-profile-card">
            <div class="tag-profile-main">
              <BButton class="workspace-back" :aria-label="t('common.back')" @click="router.back()">
                <SvgIcon :src="icon.noteDetail.back" size="19" />
              </BButton>
              <span class="tag-profile-icon" :class="{ 'has-custom-icon': tag.iconUrl && !tagIconLoadError }">
                <img
                  v-if="tag.iconUrl && !tagIconLoadError"
                  :src="tag.iconUrl"
                  alt=""
                  @error="tagIconLoadError = true"
                />
                <SvgIcon v-else :src="icon.resource.tag" size="34" />
              </span>
              <div class="tag-profile-identity">
                <div class="tag-profile-title-row">
                  <h2>{{ tag.name }}</h2>
                  <div v-if="bookmark.isMobile" class="mobile-tag-profile-actions">
                    <BButton
                      v-if="!isReadOnly"
                      class="mobile-tag-edit"
                      :aria-label="t('tagSpace.editDescription')"
                      :title="t('tagSpace.editDescription')"
                      :disabled="detailRefreshing"
                      @click="editTag()"
                    >
                      <SvgIcon :src="icon.table_edit" size="16" aria-hidden="true" />
                    </BButton>
                    <BButton class="mobile-tag-switcher" :disabled="detailRefreshing" @click="openMobileTagDirectory">
                      <span>{{ t('tagSpace.switchTag') }}</span>
                      <SvgIcon :src="icon.noteTree.chevron" size="15" aria-hidden="true" />
                    </BButton>
                  </div>
                </div>
                <p>{{ spaceDescription }}</p>
                <footer class="tag-profile-meta">
                  <span>{{ t('tagSpace.autoSynced') }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ profileActivityLabel }}</span>
                </footer>
              </div>
            </div>

            <div class="tag-profile-side">
              <div class="tag-profile-stats" :aria-label="t('tagSpace.spaceOverview')">
                <div class="profile-stat profile-stat--total">
                  <span>{{ t('tagSpace.totalResources') }}</span>
                  <strong>{{ tag.counts.total }}</strong>
                </div>
                <div v-for="metric in overviewMetrics" :key="metric.key" class="profile-stat">
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.value }}</strong>
                </div>
              </div>
            </div>
          </BCard>

          <div class="space-primary-tabs" role="tablist" :aria-label="t('tagSpace.viewMode')">
            <BButton
              v-for="tabOption in viewTabs"
              :key="tabOption.value"
              role="tab"
              class="space-primary-tab"
              :class="{ 'is-active': viewMode === tabOption.value }"
              :aria-selected="viewMode === tabOption.value"
              @click="setViewMode(tabOption.value)"
            >
              {{ tabOption.label }}
              <span v-if="tabOption.count !== undefined">{{ tabOption.count }}</span>
            </BButton>
          </div>

          <BCard v-if="viewMode === 'resources'" as="section" variant="card" padding="0" class="resources-panel">
            <div class="resource-toolbar">
              <div class="resource-tabs no-scrollbar" :aria-label="t('tagSpace.resourceFilters')">
                <BButton
                  v-for="typeOption in typeOptions"
                  :key="typeOption.value"
                  size="small"
                  class="resource-tab"
                  :class="[`resource-tab--${typeOption.value}`, { 'is-active': activeType === typeOption.value }]"
                  :aria-pressed="activeType === typeOption.value"
                  :disabled="detailRefreshing"
                  @click="activeType = typeOption.value"
                >
                  <span>{{ typeOption.label }}</span>
                  <strong>{{ typeOption.count }}</strong>
                </BButton>
              </div>
              <BInput
                v-if="!bookmark.isMobile"
                v-model:value="resourceKeyword"
                clearable
                height="32px"
                class="resource-search"
                :disabled="detailRefreshing"
                :placeholder="t('tagSpace.searchInSpace')"
              >
                <template #prefix><SvgIcon :src="icon.navigation.search" size="16" /></template>
              </BInput>
              <BSelect
                v-model:value="resourceSort"
                class="resource-sort"
                :options="resourceSortOptions"
                :disabled="detailRefreshing"
              />
            </div>

            <div
              ref="resourceScrollRef"
              v-auto-scrollbar
              class="resource-scroll-region"
              @scroll.passive="scheduleResourceAutoLoad"
            >
              <div v-if="resourceError && resourceItems.length" class="inline-error" role="alert">
                <span>{{ t('tagSpace.staleResourceError') }}</span>
                <BButton size="small" @click="loadResources(true)">{{ t('common.retry') }}</BButton>
              </div>

              <div v-if="resourceLoading" class="filtered-loading" aria-busy="true">
                <span v-for="index in 6" :key="index" class="skeleton-row"></span>
              </div>

              <div v-else-if="resourceError && !resourceItems.length" class="resource-state" role="alert">
                <span class="state-symbol">!</span>
                <strong>{{ t('tagSpace.resourcesLoadFailed') }}</strong>
                <BButton type="primary" @click="loadResources(true)">{{ t('common.retry') }}</BButton>
              </div>

              <div v-else-if="!resourceItems.length" class="resource-state">
                <span class="state-symbol">#</span>
                <strong>{{
                  resourceKeyword.trim() ? t('tagSpace.noResourceMatch') : t('tagSpace.noResources')
                }}</strong>
                <p>{{ resourceKeyword.trim() ? t('tagSpace.noResourceMatchHint') : t('tagSpace.noResourcesHint') }}</p>
                <BButton v-if="resourceKeyword.trim()" @click="resourceKeyword = ''">{{
                  t('tagSpace.clearSearch')
                }}</BButton>
                <BButton v-else @click="router.push('/search')">{{ t('tagSpace.organizeResources') }}</BButton>
              </div>

              <div v-else class="grouped-resource-stream">
                <section v-for="group in resourceGroups" :key="group.type" class="resource-group">
                  <header class="resource-group-heading">
                    <span class="resource-group-dot" :class="`resource-group-dot--${group.type}`"></span>
                    <strong>{{ t('tagSpace.resourceSectionTitle', { type: group.label, count: group.count }) }}</strong>
                    <span>{{ group.hint }}</span>
                  </header>
                  <div class="resource-stream">
                    <TagSpaceResourceRow
                      v-for="item in group.items"
                      :key="`${item.type}:${item.id}`"
                      :item="item"
                      :current-tag-id="displayedTagId"
                      :sort="resourceSort"
                      @open="openResource"
                    />
                  </div>
                </section>
              </div>

              <div
                v-if="resourceItems.length && (resourceHasMore || resourceLoadingMore)"
                ref="resourceSentinelRef"
                class="resource-sentinel"
                aria-live="polite"
              >
                <BLoading v-if="resourceLoadingMore" inline loading :title="t('tagSpace.loadingMore')" />
              </div>
            </div>
          </BCard>

          <BCard v-else-if="viewMode === 'related'" as="section" variant="card" padding="18px" class="related-panel">
            <div class="panel-heading">
              <div>
                <strong>{{ t('tagSpace.relatedSpaceTitle', { name: tag.name }) }}</strong>
                <span>{{ t('tagSpace.relatedSpaceHint') }}</span>
              </div>
            </div>
            <div v-if="relatedTags.length" class="related-topic-grid related-topic-grid--panel">
              <BCard
                v-for="related in relatedTags"
                :key="related.id"
                as="article"
                variant="card"
                interactive
                padding="14px"
                class="related-topic-card"
                role="button"
                tabindex="0"
                @click="openRelatedTag(related.id)"
                @keydown.enter="openRelatedTag(related.id)"
                @keydown.space.prevent="openRelatedTag(related.id)"
              >
                <span class="related-topic-icon">
                  <SvgIcon :src="related.iconUrl || icon.resource.tag" size="20" />
                </span>
                <div>
                  <strong>{{ related.name }}</strong>
                  <span>{{ t('tagSpace.sharedResources', { count: related.sharedCount || 0 }) }}</span>
                </div>
                <span class="related-topic-open" aria-hidden="true">→</span>
              </BCard>
            </div>
            <div v-else class="resource-state resource-state--compact">
              <span class="state-symbol">#</span>
              <strong>{{ t('tagSpace.relatedEmptyTitle') }}</strong>
              <p>{{ t('tagSpace.relatedEmptyHint') }}</p>
            </div>
          </BCard>

          <BCard v-else as="section" variant="card" padding="0" class="graph-panel">
            <div v-if="graphError" class="graph-error" role="alert">
              <span>{{ t('tagSpace.graphLoadFailed') }}</span>
              <BButton size="small" @click="loadGraph">{{ t('common.retry') }}</BButton>
            </div>
            <div class="graph-layout">
              <TagGraphCanvas
                ref="graphCanvasRef"
                :nodes="graphData?.nodes || []"
                :edges="graphData?.edges || []"
                :loading="graphLoading"
                :compact="false"
                :full-height="true"
                :active-node-id="activeGraphNode?.id"
                @node-click="activeGraphNode = $event"
                @node-dblclick="openGraphNode"
                @canvas-click="activeGraphNode = null"
              >
                <template #actions>
                  <BButton size="small" type="primary" @click="graphCanvasRef?.resetView()">
                    {{ t('tagGraph.reset') }}
                  </BButton>
                </template>
              </TagGraphCanvas>
              <TagGraphPanel
                :node="activeGraphNode"
                :connected-resources="graphConnectedResources"
                @explore-tag="exploreGraphTag"
                @open-resource="openGraphNode"
              />
            </div>
          </BCard>
        </main>

        <aside v-if="relatedTags.length" class="tag-insight-rail">
          <BCard as="section" variant="card" padding="15px" class="insight-card">
            <div class="insight-heading">
              <span class="insight-icon"><SvgIcon :src="icon.resource.tag" size="16" /></span>
              <strong>{{ t('tagSpace.coUsedTitle') }}</strong>
            </div>
            <div class="co-used-tag-list">
              <BButton v-for="related in relatedTags.slice(0, 5)" :key="related.id" @click="openRelatedTag(related.id)">
                <span>{{ related.name }}</span>
                <small>{{ t('tagSpace.sharedResources', { count: related.sharedCount || 0 }) }}</small>
                <span aria-hidden="true">→</span>
              </BButton>
            </div>
          </BCard>
        </aside>
      </div>
    </div>

    <FilePreview
      v-model:visible="filePreviewVisible"
      :file-info="previewFileInfo"
      @close="filePreviewVisible = false"
    />
    <TagEditorDialog
      v-if="tagEditorVisible"
      :key="editingTagId"
      v-model:visible="tagEditorVisible"
      :tag-id="editingTagId"
      @saved="handleTagEditorSaved"
      @deleted="handleTagEditorDeleted"
    />
    <MobileTagDirectoryDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobileTagDirectoryVisible"
      :tags="directorySidebarTags"
      :total="sidebarTagTotal"
      :current-tag-id="displayedTagId"
      :switching-tag-id="switchingTagId"
      :loading="sidebarLoading"
      :error="sidebarError"
      :read-only="isReadOnly"
      @select="openRelatedTag"
      @create="createTag"
      @retry="loadSidebarTags"
    />
    <AiSkillDialog
      v-model:visible="tagAiVisible"
      :title="t('tagManage.aiSkillTitle')"
      :description="t('tagManage.aiSkillDescription')"
      skill-id="tag.analyze"
      prompt-key="instruction"
      surface="tag_detail"
      :resource-refs="tagAiResourceRefs"
      :scope-resource-count="tag?.counts.total || 0"
      :scope-label="t('tagManage.aiSkillScope', { count: tag?.counts.total || 0 })"
      :actions="tagAiActions"
      :show-prompt="false"
      :show-grounding="false"
      reserve-result-space
      :auto-run-action-id="tagAiResourceRefs.length ? 'summarize' : ''"
    >
      <template #result-actions="{ response, result }">
        <BButton
          v-if="result?.kind === 'grounded_markdown' && response.sources.length"
          type="primary"
          :loading="creatingTagNote"
          :disabled="creatingTagNote"
          @click="createNoteFromTagAnalysis(response)"
        >
          {{ t('aiSkills.saveAsNote') }}
        </BButton>
      </template>
    </AiSkillDialog>
  </ResourcePageShell>
</template>

<script setup lang="ts">
  import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { apiBasePost } from '@/http/request.ts';
  import {
    fetchTagSpace,
    fetchTagSpaceResources,
    fetchTagSpaces,
    type RelatedTagSummary,
    type TagSpaceResourceFilter,
    type TagSpaceResourceItem,
    type TagSpaceResourceSort,
    type TagSpaceSummary,
  } from '@/api/tagSpace';
  import { fetchTagGraph, type TagGraphNode, type TagGraphResponse } from '@/api/tagGraph';
  import { openBookmarkUrl } from '@/utils/openBookmark';
  import { forgetTagSpaceId, rememberTagSpaceId } from '@/utils/tagSpaceNavigation';
  import icon from '@/config/icon';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type {
    BActionMenuItem,
    BActionMenuSource,
    BActionMenuTrigger,
  } from '@/components/base/BasicComponents/actionMenu';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import TagGraphPanel from '@/components/tagGraph/TagGraphPanel.vue';
  import TagDirectoryRow from '@/components/tagSpace/TagDirectoryRow.vue';
  import MobileTagDirectoryDrawer from '@/components/tagSpace/MobileTagDirectoryDrawer.vue';
  import TagSpaceResourceRow from '@/components/tagSpace/TagSpaceResourceRow.vue';
  import TagEditorDialog from '@/components/manage/tagEditMg/TagEditorDialog.vue';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import type { BaseOptions } from '@/config/bookmarkCfg.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { persistAiMarkdownResultAsNote } from '@/utils/aiNoteDraft';
  import { recordOperation } from '@/api/commonApi';
  import { clearGlobalSearchCache } from '@/api/search';

  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));
  const TagGraphCanvas = defineAsyncComponent(() => import('@/components/tagGraph/TagGraphCanvas.vue'));
  const route = useRoute();
  const router = useRouter();
  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();

  const tag = ref<TagSpaceSummary | null>(null);
  const relatedTags = ref<RelatedTagSummary[]>([]);
  const tagIconLoadError = ref(false);
  const detailLoading = ref(true);
  const detailRefreshing = ref(false);
  const detailError = ref(false);
  const switchingTagId = ref('');
  type TagSpaceViewMode = 'resources' | 'related' | 'graph';
  const viewMode = ref<TagSpaceViewMode>('resources');
  const sidebarTags = ref<TagSpaceSummary[]>([]);
  const sidebarTotal = ref(0);
  const sidebarLoading = ref(false);
  const sidebarError = ref(false);
  const mobileTagDirectoryVisible = ref(false);
  const activeType = ref<TagSpaceResourceFilter>('all');
  const resourceSort = ref<TagSpaceResourceSort>('updated');
  const resourceKeyword = ref('');
  const resourceItems = ref<TagSpaceResourceItem[]>([]);
  const resourcePage = ref(1);
  const resourceHasMore = ref(false);
  const resourceLoading = ref(false);
  const resourceLoadingMore = ref(false);
  const resourceError = ref(false);
  const resourceScrollRef = ref<HTMLElement | null>(null);
  const resourceSentinelRef = ref<HTMLElement | null>(null);
  const filePreviewVisible = ref(false);
  const previewFileInfo = ref<any>({});
  const tagAiVisible = ref(false);
  const creatingTagNote = ref(false);
  const tagEditorVisible = ref(false);
  const editingTagId = ref('');
  const tagMutationBusy = ref(false);
  const graphLoading = ref(false);
  const graphError = ref(false);
  const graphData = ref<TagGraphResponse | null>(null);
  const activeGraphNode = ref<TagGraphNode | null>(null);
  const graphCanvasRef = ref<InstanceType<typeof TagGraphCanvas> | null>(null);
  let detailSequence = 0;
  let sidebarSequence = 0;
  let resourceSequence = 0;
  let graphSequence = 0;
  let suppressResourceWatch = false;
  let resourceDebounce: ReturnType<typeof setTimeout> | null = null;
  let resourceObserver: IntersectionObserver | null = null;
  let resourceAutoLoadFrame = 0;

  const overviewMetrics = computed(() => [
    { key: 'bookmark' as const, label: t('tagSpace.bookmark'), value: tag.value?.counts.bookmark || 0 },
    { key: 'note' as const, label: t('tagSpace.note'), value: tag.value?.counts.note || 0 },
    { key: 'file' as const, label: t('tagSpace.file'), value: tag.value?.counts.file || 0 },
  ]);
  const typeOptions = computed(() => [
    { value: 'all' as const, label: t('tagSpace.filterAllResources'), count: tag.value?.counts.total || 0 },
    ...overviewMetrics.value.map((metric) => ({
      value: metric.key,
      label: metric.label,
      count: metric.value,
    })),
  ]);
  const displayedTagId = computed(() => String(tag.value?.id || '').trim());
  const sidebarTagTotal = computed(() => sidebarTotal.value || Math.max(sidebarTags.value.length, tag.value ? 1 : 0));
  const directorySidebarTags = computed(() => {
    const tags = new Map(sidebarTags.value.map((item) => [String(item.id), item]));
    if (tag.value && !tags.has(displayedTagId.value)) tags.set(displayedTagId.value, tag.value);
    return [...tags.values()];
  });
  const resourceGroups = computed(() => {
    const definitions = [
      {
        type: 'bookmark' as const,
        label: t('tagSpace.bookmark'),
        hint: t('tagSpace.bookmarkSectionHint'),
        count: tag.value?.counts.bookmark || 0,
      },
      {
        type: 'note' as const,
        label: t('tagSpace.note'),
        hint: t('tagSpace.noteSectionHint'),
        count: tag.value?.counts.note || 0,
      },
      {
        type: 'file' as const,
        label: t('tagSpace.file'),
        hint: t('tagSpace.fileSectionHint'),
        count: tag.value?.counts.file || 0,
      },
    ];
    return definitions
      .map((definition) => ({
        ...definition,
        items: resourceItems.value.filter((item) => item.type === definition.type),
      }))
      .filter((group) => group.items.length > 0);
  });
  const spaceDescription = computed(() => {
    const description = String(tag.value?.description || '').trim();
    return description || t('tagSpace.autoSpaceDescription', { name: tag.value?.name || t('tagSpace.unnamed') });
  });
  const tagMenuTriggers: BActionMenuTrigger[] = ['hover', 'contextmenu'];
  const profileActivityLabel = computed(() => {
    const raw = tag.value?.lastActivityTime;
    if (!raw) return t('tagSpace.noActivity');
    const date = new Date(String(raw).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return t('tagSpace.hasActivity');
    return t('tagSpace.lastUpdatedAt', {
      time: new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date),
    });
  });
  const viewTabs = computed<Array<{ value: TagSpaceViewMode; label: string; count?: number }>>(() => [
    { value: 'resources', label: t('tagSpace.relatedResourcesTab'), count: tag.value?.counts.total || 0 },
    { value: 'related', label: t('tagSpace.relatedTagsTab'), count: relatedTags.value.length },
    { value: 'graph', label: t('tagSpace.graphTab') },
  ]);
  const resourceSortOptions = computed<BaseOptions[]>(() => [
    { value: 'updated', label: t('tagSpace.sortByUpdated') },
    { value: 'added', label: t('tagSpace.sortByAdded') },
  ]);
  const isReadOnly = computed(() => user.adminContext?.mode === 'readonly');
  useMobileTopBar(['tagDetail'], {
    onAdd: createTag,
    addLabel: () => t('tagSpace.createTag'),
    showAdd: () => !isReadOnly.value,
  });
  const tagAiResourceRefs = computed<AiSkillResourceRef[]>(() =>
    displayedTagId.value && Number(tag.value?.counts.total || 0) > 0 ? [{ type: 'tag', id: displayedTagId.value }] : [],
  );
  const tagAiActions = computed(() =>
    tagAiResourceRefs.value.length
      ? [
          {
            id: 'summarize',
            label: t('tagManage.aiSummarize'),
            skillId: 'tag.analyze',
            input: {
              instruction: t('tagManage.aiSummarizeInstruction', { tag: String(tag.value?.name || '') }),
            },
          },
        ]
      : [],
  );
  const graphConnectedResources = computed(() => {
    if (!activeGraphNode.value || !graphData.value) return [];
    const linkedIds = new Set<string>();
    graphData.value.edges.forEach((edge) => {
      if (edge.source === activeGraphNode.value?.id) linkedIds.add(edge.target);
      if (edge.target === activeGraphNode.value?.id) linkedIds.add(edge.source);
    });
    return graphData.value.nodes.filter((node) => linkedIds.has(node.id) && node.type !== 'tag');
  });

  function currentTagId() {
    return String(route.params.id || '').trim();
  }

  async function loadSidebarTags() {
    const sequence = ++sidebarSequence;
    sidebarLoading.value = true;
    sidebarError.value = false;
    try {
      const collected = new Map<string, TagSpaceSummary>();
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const result = await fetchTagSpaces({
          sort: 'recent',
          includeEmpty: true,
          page,
          pageSize: 50,
        });
        if (sequence !== sidebarSequence) return;
        const previousSize = collected.size;
        result.items.forEach((item) => collected.set(String(item.id), item));
        sidebarTotal.value = result.overview.tagTotal || result.total;
        hasMore = result.hasMore;
        if (hasMore && (!result.items.length || collected.size === previousSize)) {
          console.warn('[tag-space] stopped detail directory pagination because the response made no progress');
          break;
        }
        page += 1;
      }
      sidebarTags.value = [...collected.values()];
    } catch (error) {
      if (sequence !== sidebarSequence) return;
      sidebarError.value = true;
      console.warn('[tag-space] failed to load detail directory', error);
    } finally {
      if (sequence === sidebarSequence) sidebarLoading.value = false;
    }
  }

  function openMobileTagDirectory() {
    mobileTagDirectoryVisible.value = true;
    if (!sidebarTags.value.length && !sidebarLoading.value) void loadSidebarTags();
  }

  async function loadDetail(options: { force?: boolean } = {}) {
    const tagId = currentTagId();
    if (!tagId) return;
    if (!options.force && displayedTagId.value === tagId) return;

    const previousTagId = displayedTagId.value;
    const preserveContent = Boolean(tag.value);
    const sequence = ++detailSequence;
    detailLoading.value = !preserveContent;
    detailRefreshing.value = preserveContent;
    switchingTagId.value = preserveContent && previousTagId !== tagId ? tagId : '';
    detailError.value = false;
    resourceSequence += 1;
    graphSequence += 1;
    suppressResourceWatch = true;
    disconnectResourceObserver();
    tagAiVisible.value = false;
    filePreviewVisible.value = false;
    if (!preserveContent) {
      tag.value = null;
      relatedTags.value = [];
      tagIconLoadError.value = false;
      graphData.value = null;
      activeGraphNode.value = null;
      resourceItems.value = [];
      resourceHasMore.value = false;
      resourceLoading.value = false;
      resourceLoadingMore.value = false;
      resourceError.value = false;
    }
    if (!sidebarTags.value.length) void loadSidebarTags();

    try {
      const [detailResult, resourcesResult] = await Promise.allSettled([
        fetchTagSpace(tagId),
        fetchTagSpaceResources({
          id: tagId,
          keyword: '',
          type: 'all',
          sort: 'updated',
          page: 1,
          pageSize: 20,
        }),
      ]);
      if (sequence !== detailSequence) return;

      if (detailResult.status === 'rejected') throw detailResult.reason;
      const detail = detailResult.value;
      const resources = resourcesResult.status === 'fulfilled' ? resourcesResult.value : null;

      activeType.value = 'all';
      resourceSort.value = 'updated';
      resourceKeyword.value = '';
      viewMode.value = 'resources';
      tag.value = detail.tag;
      rememberTagSpaceId(detail.tag.id);
      relatedTags.value = detail.relatedTags || [];
      tagIconLoadError.value = false;
      graphData.value = null;
      activeGraphNode.value = null;
      resourceItems.value = resources?.items || [];
      resourcePage.value = resources?.page || 1;
      resourceHasMore.value = Boolean(resources?.hasMore);
      resourceLoading.value = false;
      resourceLoadingMore.value = false;
      resourceError.value = !resources;
      if (resourcesResult.status === 'rejected') {
        console.warn('[tag-space] failed to load initial resources', resourcesResult.reason);
      }
      if (resourceScrollRef.value) resourceScrollRef.value.scrollTop = 0;
      await nextTick();
      if (sequence === detailSequence) {
        suppressResourceWatch = false;
      }
    } catch (error) {
      if (sequence !== detailSequence) return;
      console.warn('[tag-space] failed to load detail', error);
      if (preserveContent && previousTagId) {
        message.error(t('tagSpace.detailLoadFailedDesc'));
        if (currentTagId() === tagId && previousTagId !== tagId) {
          await router.replace(`/tag/${previousTagId}`);
        }
      } else {
        detailError.value = true;
      }
    } finally {
      if (sequence === detailSequence) {
        detailLoading.value = false;
        detailRefreshing.value = false;
        switchingTagId.value = '';
        suppressResourceWatch = false;
        if (tag.value) void nextTick(connectResourceObserver);
      }
    }
  }

  async function loadResources(reset: boolean) {
    const tagId = displayedTagId.value;
    if (!tagId || (!reset && (!resourceHasMore.value || resourceLoadingMore.value))) return;
    const sequence = reset ? ++resourceSequence : resourceSequence;
    if (reset) {
      resourceLoading.value = true;
      resourceError.value = false;
      resourceItems.value = [];
      resourcePage.value = 1;
      resourceHasMore.value = false;
    } else {
      resourceLoadingMore.value = true;
      resourceError.value = false;
    }
    try {
      const previousPage = resourcePage.value;
      const previousSize = resourceItems.value.length;
      const result = await fetchTagSpaceResources({
        id: tagId,
        keyword: resourceKeyword.value.trim(),
        type: activeType.value,
        sort: resourceSort.value,
        page: reset ? 1 : resourcePage.value + 1,
        pageSize: 20,
      });
      if (sequence !== resourceSequence) return;
      if (reset) resourceItems.value = result.items;
      else {
        const merged = new Map(resourceItems.value.map((item) => [`${item.type}:${item.id}`, item]));
        result.items.forEach((item) => merged.set(`${item.type}:${item.id}`, item));
        resourceItems.value = [...merged.values()];
      }
      resourcePage.value = result.page;
      resourceHasMore.value = result.hasMore;
      if (!reset && result.hasMore && (result.page <= previousPage || resourceItems.value.length <= previousSize)) {
        resourceError.value = true;
        resourceHasMore.value = false;
        console.warn('[tag-space] stopped non-progressing resource pagination');
      }
    } catch (error) {
      if (sequence === resourceSequence) {
        resourceError.value = true;
        if (!reset) resourceHasMore.value = false;
      }
      console.warn('[tag-space] failed to load resources', error);
    } finally {
      if (sequence === resourceSequence) {
        resourceLoading.value = false;
        resourceLoadingMore.value = false;
        void nextTick(connectResourceObserver);
      }
    }
  }

  function openTagInAi() {
    if (!tag.value?.counts.total) {
      message.info(t('tagManage.aiNoResources'));
      return;
    }
    tagAiVisible.value = true;
  }

  async function createNoteFromTagAnalysis(response: AiSkillResponse) {
    if (creatingTagNote.value) return;
    creatingTagNote.value = true;
    try {
      const handoff = await persistAiMarkdownResultAsNote(
        response,
        t('tagManage.aiGeneratedNoteTitle', { tag: tag.value?.name || t('tagManage.unnamedTag') }),
      );
      if (!handoff) return;
      message.success(t('aiSkills.noteCreated'));
      tagAiVisible.value = false;
      await router.push(handoff.route);
    } catch (error: any) {
      message.error(String(error?.message || t('aiSkills.noteCreateFailed')));
    } finally {
      creatingTagNote.value = false;
    }
  }

  async function loadGraph() {
    const tagId = displayedTagId.value;
    if (!tagId) return;
    const sequence = ++graphSequence;
    graphLoading.value = true;
    graphError.value = false;
    try {
      const response = await fetchTagGraph({
        tagId,
        includeResources: true,
        resourceTypes: ['bookmark', 'note', 'file'],
        limitRelatedTags: 12,
        limitPerResourceType: 40,
      });
      if (sequence !== graphSequence) return;
      if (response.status !== 200) throw new Error(response.msg || 'TAG_GRAPH_FAILED');
      graphData.value = response.data;
      activeGraphNode.value = response.data.nodes.find((node) => node.meta?.isCenter) || response.data.nodes[0] || null;
    } catch (error) {
      if (sequence === graphSequence) graphError.value = true;
      console.warn('[tag-space] failed to load graph', error);
    } finally {
      if (sequence === graphSequence) graphLoading.value = false;
    }
  }

  function setViewMode(mode: TagSpaceViewMode) {
    viewMode.value = mode;
    if (mode === 'graph' && !graphData.value && !graphLoading.value) loadGraph();
  }

  function tagDirectoryActionItems(target: TagSpaceSummary): BActionMenuItem[] {
    return [
      {
        key: 'open',
        label: t('tagSpace.openTagSpace'),
        icon: icon.resource.tag,
        disabled: String(target.id) === displayedTagId.value,
      },
      {
        key: 'addBookmark',
        label: t('tagSpace.addBookmarkToTag'),
        icon: icon.manage_categoryBtn_bookmark,
      },
      { key: 'edit', label: t('common.edit'), icon: icon.table_edit },
      { key: 'tag-directory-divider', divider: true },
      {
        key: 'delete',
        label: t('common.delete'),
        icon: icon.table_delete,
        danger: true,
        disabled: tagMutationBusy.value,
      },
    ];
  }

  function handleDirectoryTagAction(action: string, target: TagSpaceSummary, source: BActionMenuSource) {
    if (isReadOnly.value) return;
    recordOperation({
      module: '标签',
      operation: `${source === 'contextmenu' ? '右键' : '悬停'}菜单操作标签【${target.name}】：${action}`,
    });
    if (action === 'open') openRelatedTag(target.id);
    if (action === 'addBookmark') router.push(`/manage/editBookmark/add/${target.id}`);
    if (action === 'edit') editTag(target.id);
    if (action === 'delete') handleDeleteDirectoryTag(target);
  }

  function createTag() {
    if (isReadOnly.value || blockGuestWrite('create-tag')) return;
    editingTagId.value = 'add';
    tagEditorVisible.value = true;
  }

  function editTag(id?: string) {
    const targetId = typeof id === 'string' ? id : String(tag.value?.id || '');
    if (isReadOnly.value || !targetId || blockGuestWrite('edit-tag')) return;
    editingTagId.value = targetId;
    tagEditorVisible.value = true;
  }

  async function handleTagEditorSaved(id: string) {
    clearGlobalSearchCache();
    await Promise.all([bookmark.refreshTag(), loadSidebarTags()]);
    if (String(id) !== currentTagId()) {
      await router.push(`/tag/${id}`);
      return;
    }
    await loadDetail({ force: true });
  }

  function nextDirectoryTag(excludedId: string) {
    return sidebarTags.value.find((item) => String(item.id) !== String(excludedId));
  }

  async function settleDeletedTag(deletedId: string) {
    forgetTagSpaceId(deletedId);
    clearGlobalSearchCache();
    await Promise.all([bookmark.refreshTag(), loadSidebarTags()]);
    if (deletedId === currentTagId()) {
      const fallback = nextDirectoryTag(deletedId);
      await router.replace(fallback ? `/tag/${fallback.id}` : '/manage/tagMg');
      return;
    }
  }

  async function handleTagEditorDeleted() {
    await settleDeletedTag(editingTagId.value);
  }

  function handleDeleteDirectoryTag(target: TagSpaceSummary) {
    if (tagMutationBusy.value || isReadOnly.value || blockGuestWrite('delete-tag')) return;
    Alert.alert({
      title: t('tagManage.confirmDeleteTitle'),
      content: t('tagManage.confirmDeleteContent', { name: target.name }),
      async onOk() {
        tagMutationBusy.value = true;
        try {
          const response = await apiBasePost('/api/bookmark/delTag', { id: target.id });
          if (Number(response?.status) !== 200) return;
          recordOperation({ module: '标签', operation: `删除标签成功【${target.name}】` });
          message.success(t('tagManage.deleteSuccess'));
          await settleDeletedTag(String(target.id));
        } finally {
          tagMutationBusy.value = false;
        }
      },
    });
  }

  function openRelatedTag(id: string) {
    const targetId = String(id || '').trim();
    if (!targetId || targetId === currentTagId() || targetId === switchingTagId.value) return;
    router.push(`/tag/${targetId}`);
  }

  async function openResource(item: TagSpaceResourceItem) {
    if (item.type === 'bookmark' && item.url) {
      openBookmarkUrl(item.url);
      return;
    }
    if (item.type === 'note') {
      router.push(`/noteLibrary/${item.id}`);
      return;
    }
    if (item.type === 'file') {
      await openFile(item.id);
    }
  }

  async function openFile(fileId: string | number) {
    try {
      const response = await apiBasePost('/api/file/getFileInfo', { id: fileId }, { silent: true });
      if (response.status !== 200 || !response.data) throw new Error(response.msg || 'FILE_INFO_FAILED');
      previewFile(response.data);
    } catch {
      message.error(t('tagSpace.fileOpenFailed'));
    }
  }

  async function openGraphNode(node: TagGraphNode) {
    if (node.type === 'tag') {
      exploreGraphTag(node);
      return;
    }
    if (node.type === 'bookmark' && node.meta?.url) {
      openBookmarkUrl(node.meta.url);
      return;
    }
    if (node.type === 'note') {
      router.push(`/noteLibrary/${node.rawId}`);
      return;
    }
    if (node.type === 'file') {
      await openFile(node.rawId);
    }
  }

  function exploreGraphTag(node: TagGraphNode) {
    if (node.type !== 'tag') return;
    if (String(node.rawId) === displayedTagId.value) {
      graphCanvasRef.value?.resetView();
      return;
    }
    router.push(`/tag/${node.rawId}`);
  }

  function previewFile(file: any) {
    previewFileInfo.value = {
      ...file,
      id: file.id,
      fileName: file.fileName || file.file_name,
      fileType: file.fileType || file.file_type,
      fileSize: file.fileSize ?? file.file_size,
      uploadTime: file.uploadTime || file.create_time,
    };
    filePreviewVisible.value = true;
  }

  async function autoLoadMoreResources() {
    if (
      viewMode.value !== 'resources' ||
      detailRefreshing.value ||
      resourceLoading.value ||
      resourceLoadingMore.value ||
      !resourceHasMore.value
    ) {
      return;
    }
    await loadResources(false);
    await nextTick();
    scheduleResourceAutoLoad();
  }

  function resourceSentinelIsNearViewport() {
    const container = resourceScrollRef.value;
    const sentinel = resourceSentinelRef.value;
    if (!container || !sentinel) return false;
    const containerRect = container.getBoundingClientRect();
    const sentinelRect = sentinel.getBoundingClientRect();
    return sentinelRect.top <= containerRect.bottom + 280;
  }

  function scheduleResourceAutoLoad() {
    if (resourceAutoLoadFrame) window.cancelAnimationFrame(resourceAutoLoadFrame);
    resourceAutoLoadFrame = window.requestAnimationFrame(() => {
      resourceAutoLoadFrame = 0;
      if (resourceSentinelIsNearViewport()) void autoLoadMoreResources();
    });
  }

  function connectResourceObserver() {
    resourceObserver?.disconnect();
    resourceObserver = null;
    const container = resourceScrollRef.value;
    const sentinel = resourceSentinelRef.value;
    if (!container || !sentinel || typeof IntersectionObserver === 'undefined') {
      scheduleResourceAutoLoad();
      return;
    }
    resourceObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void autoLoadMoreResources();
      },
      { root: container, rootMargin: '280px 0px', threshold: 0 },
    );
    resourceObserver.observe(sentinel);
    scheduleResourceAutoLoad();
  }

  function disconnectResourceObserver() {
    resourceObserver?.disconnect();
    resourceObserver = null;
    if (resourceAutoLoadFrame) {
      window.cancelAnimationFrame(resourceAutoLoadFrame);
      resourceAutoLoadFrame = 0;
    }
  }

  watch([activeType, resourceSort, resourceKeyword], () => {
    if (!tag.value || suppressResourceWatch || detailRefreshing.value) return;
    if (resourceDebounce) clearTimeout(resourceDebounce);
    resourceDebounce = setTimeout(() => loadResources(true), resourceKeyword.value.trim() ? 260 : 0);
  });

  watch([resourceHasMore, () => resourceItems.value.length], () => {
    void nextTick(connectResourceObserver);
  });
  watch(
    () => route.params.id,
    () => loadDetail(),
  );
  watch(
    () => route.query.edit,
    (value) => {
      if (String(Array.isArray(value) ? value[0] || '' : value || '') !== '1') return;
      editTag(currentTagId());
      const query = { ...route.query };
      delete query.edit;
      void router.replace({ path: route.path, query });
    },
    { immediate: true },
  );

  onMounted(loadDetail);
  onBeforeUnmount(() => {
    detailSequence += 1;
    sidebarSequence += 1;
    resourceSequence += 1;
    graphSequence += 1;
    if (resourceDebounce) clearTimeout(resourceDebounce);
    disconnectResourceObserver();
  });
</script>

<style scoped lang="less">
  .tag-space-detail {
    height: 100%;
    min-height: 0;
    padding-bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: auto;
    scrollbar-gutter: stable;
  }
  .tag-space-detail.is-graph {
    overflow: hidden;
  }
  .detail-tag-icon {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-tag-color, #ec4899);
    border-radius: 9px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    overflow: hidden;
  }
  .detail-tag-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  :deep(.resource-page-actions .b_btn) {
    gap: 6px;
  }
  .detail-state,
  .resource-state {
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
  }
  .detail-state p,
  .resource-state p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.55;
  }
  .state-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .state-symbol {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-tag-color, #ec4899);
    border-radius: 12px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    font-size: 21px;
    font-weight: 750;
  }
  .resource-icon {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid currentColor;
    border-radius: 9px;
    color: var(--resource-bookmark-color, #615ced);
    background: var(--workspace-panel-bg-color);
  }
  .resource-icon--note {
    color: var(--resource-note-color, #00a884);
  }
  .resource-icon--file {
    color: var(--resource-file-color, #ff8a00);
  }
  .content-section-header {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: 0 0 auto;
  }
  .content-heading {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .content-heading strong {
    color: var(--text-color);
    font-size: 15px;
  }
  .content-heading span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .view-switch {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    flex: 0 0 auto;
  }
  .view-button {
    border: 1px solid transparent;
  }
  .view-button.is-active {
    border-color: var(--resource-tag-color, #ec4899);
    color: var(--resource-tag-color, #ec4899);
    background: var(--background-color) !important;
  }
  .resources-panel {
    min-height: 0;
    flex: 0 0 auto;
    overflow: hidden;
  }
  .resource-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 13px;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .resource-tabs {
    min-width: 0;
    display: flex;
    gap: 6px;
    overflow-x: auto;
  }
  .resource-tab {
    flex: 0 0 auto;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 999px;
  }
  .resource-tab.is-active {
    border-color: currentColor;
    background: transparent !important;
  }
  .resource-tab--all {
    color: var(--resource-tag-color, #ec4899);
  }
  .resource-tab--bookmark {
    color: var(--resource-bookmark-color, #615ced);
  }
  .resource-tab--note {
    color: var(--resource-note-color, #00a884);
  }
  .resource-tab--file {
    color: var(--resource-file-color, #ff8a00);
  }
  .resource-tab-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: currentColor;
  }
  .resource-search {
    width: min(330px, 32vw);
    flex: 0 0 auto;
  }
  .resource-sort {
    width: 142px;
    flex: 0 0 auto;
  }
  .inline-error,
  .graph-error {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--danger-color, #fe2c55);
    border-radius: 9px;
    color: var(--danger-color, #fe2c55);
    background: var(--workspace-panel-bg-color);
  }
  .inline-error {
    margin: 10px 12px 0;
  }
  .resource-list {
    display: grid;
    gap: 8px;
  }
  .resources-panel > .resource-list {
    padding: 10px 12px 12px;
  }
  .resource-tags {
    display: flex;
    gap: 5px;
    overflow: hidden;
  }
  .resource-tags span {
    color: var(--resource-tag-color, #ec4899);
    font-size: 10px;
    white-space: nowrap;
  }
  .resource-open {
    color: var(--desc-color);
    font-size: 16px;
  }
  .graph-panel {
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }
  .graph-error {
    margin: 12px;
  }
  .graph-layout {
    height: 100%;
    min-height: 520px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
  }
  .skeleton-line {
    height: 12px;
    margin: 10px 0;
    display: block;
    border-radius: 999px;
    background: var(--skeleton-bg-color, var(--surface-divider-color));
    animation: tag-space-detail-pulse 1.15s ease-in-out infinite alternate;
  }
  .skeleton-line--title {
    width: 58%;
    height: 16px;
  }
  .skeleton-line--short {
    width: 38%;
  }
  .resource-skeleton {
    min-height: 76px;
  }
  @keyframes tag-space-detail-pulse {
    to {
      opacity: 0.42;
    }
  }

  .space-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    overflow: hidden;
    flex: 0 0 auto;
  }

  .space-stat {
    min-width: 0;
    min-height: 72px;
    padding: 13px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-left: 1px solid var(--surface-divider-color);
  }

  .space-stat:first-child {
    border-left: 0;
  }

  .space-stat > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .space-stat strong {
    color: var(--text-color);
    font-size: 18px;
    line-height: 1.2;
  }

  .space-stat span:last-child {
    color: var(--desc-color);
    font-size: 12px;
  }

  .resource-icon--tag,
  .related-topic-icon {
    color: var(--resource-tag-color, #ec4899);
  }

  .related-section,
  .resource-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .space-section-heading {
    min-width: 0;
    min-height: 30px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .space-section-heading > div {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .space-section-heading strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .space-section-heading > span {
    min-width: 0;
    color: var(--desc-color);
    font-size: 11px;
  }

  .section-dot {
    width: 7px;
    height: 7px;
    display: inline-block;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--resource-bookmark-color, #615ced);
  }

  .section-dot--tag {
    background: var(--resource-tag-color, #ec4899);
  }

  .section-dot--note {
    background: var(--resource-note-color, #00a884);
  }

  .section-dot--file {
    background: var(--resource-file-color, #ff8a00);
  }

  .related-topic-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 9px;
  }

  .related-topic-card {
    min-height: 68px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .related-topic-card:hover,
  .related-topic-card:focus-visible {
    border-color: var(--resource-tag-color, #ec4899);
  }

  .related-topic-icon {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
    overflow: hidden;
  }

  .related-topic-card > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .related-topic-card strong,
  .related-topic-card span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .related-topic-card strong {
    font-size: 14px;
  }

  .related-topic-card > div > span,
  .related-topic-open {
    color: var(--desc-color);
    font-size: 11px;
  }

  .resources-panel {
    overflow: visible;
  }

  .resource-toolbar {
    margin-bottom: 18px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background, var(--background-color));
  }

  .grouped-content {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .resource-group__heading {
    position: relative;
    padding-inline: 2px;
  }

  .resource-group__all {
    margin-left: auto;
    flex: 0 0 auto;
    color: var(--resource-tag-color, #ec4899);
  }

  .resource-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 10px;
  }

  .resource-card-grid--results {
    padding-bottom: 6px;
  }

  .space-resource-card {
    --space-resource-accent: var(--resource-bookmark-color, #615ced);
    min-height: 164px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    cursor: pointer;
  }

  .space-resource-card--note {
    --space-resource-accent: var(--resource-note-color, #00a884);
  }

  .space-resource-card--file {
    --space-resource-accent: var(--resource-file-color, #ff8a00);
  }

  .space-resource-card:hover,
  .space-resource-card:focus-visible {
    border-color: var(--space-resource-accent);
  }

  .space-resource-card__top {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }

  .space-resource-card__top > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .space-resource-card__top > div > span {
    color: var(--space-resource-accent);
    font-size: 10px;
    font-weight: 650;
  }

  .space-resource-card__top strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .space-resource-card > p {
    min-height: 38px;
    margin: 0;
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .space-resource-card footer {
    min-width: 0;
    margin-top: auto;
    padding-top: 9px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-top: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: 10px;
  }

  .space-resource-card footer span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .grouped-error {
    margin: 0 0 14px;
  }

  .resource-group__empty {
    color: var(--desc-color);
    font-size: 12px;
  }

  .skeleton-line--group-title {
    width: 160px;
    height: 16px;
    margin: 0;
  }

  .resource-sentinel {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 8px;
  }
  @media (max-width: 900px) {
    .space-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .space-stat:nth-child(n + 3) {
      border-top: 1px solid var(--surface-divider-color);
    }
    .space-stat:nth-child(3) {
      border-left: 0;
    }
    .graph-layout {
      grid-template-columns: 1fr;
    }
    .graph-layout :deep(.tag-graph-panel) {
      display: none;
    }
  }
  @media (max-width: 767px) {
    .tag-space-detail {
      gap: 9px;
      overflow-x: hidden;
      scrollbar-gutter: auto;
    }
    .content-section-header {
      padding-inline: 2px;
    }
    .space-stat {
      min-height: 62px;
      padding: 10px 11px;
      gap: 7px;
    }
    .space-stat .resource-icon {
      width: 30px;
      height: 30px;
    }
    .space-stat strong {
      font-size: 16px;
    }
    .space-section-heading {
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 3px 8px;
    }
    .space-section-heading > span {
      width: 100%;
      padding-left: 14px;
    }
    .related-topic-grid,
    .resource-card-grid {
      grid-template-columns: 1fr;
    }
    .related-topic-card {
      min-height: 64px;
    }
    .grouped-content {
      gap: 18px;
    }
    .resource-group__all {
      margin-left: auto;
    }
    .resource-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 9px;
      padding: 11px 0;
    }
    .resource-tabs {
      padding-inline: 12px;
    }
    .resource-search {
      width: auto;
      margin-inline: 12px;
    }
    .resource-sort {
      width: auto;
      margin-inline: 12px;
    }
    .inline-error {
      margin: 9px 12px 0;
    }
    .grouped-error {
      margin: 0 0 12px;
    }
    .resources-panel > .resource-list {
      padding-inline: 9px;
    }
    .resource-state {
      min-height: 260px;
      margin-inline: 9px;
    }
    .graph-layout {
      min-height: 460px;
    }
  }
  html.light-note-mobile-rendering .view-button.is-active,
  html.light-note-mobile-rendering .resource-tab.is-active,
  html.light-note-mobile-rendering .space-resource-card:focus-visible,
  html.light-note-mobile-rendering .related-topic-card:focus-visible {
    border-color: currentColor;
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton-line {
      animation: none;
    }
    .space-resource-card,
    .related-topic-card {
      transition: none;
    }
  }

  /* 标签空间 V2：参考标签档案式布局，形成目录、主题内容与辅助信息三层结构。 */
  .tag-space-detail {
    display: block;
    padding: 0;
    overflow: hidden;
    background: transparent;
  }

  .tag-space-workspace {
    --tag-workspace-heading-offset: 0px;
    --tag-profile-height: 120px;

    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: 214px minmax(0, 1fr);
    align-items: stretch;
    gap: 18px;
  }

  .tag-space-workspace.has-insights {
    grid-template-columns: 214px minmax(0, 1fr) 262px;
  }

  .tag-directory-rail,
  .tag-insight-rail {
    position: relative;
    min-width: 0;
    min-height: 0;
    max-height: none;
  }

  .tag-directory-rail {
    height: 100%;
    padding: 12px 11px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background, var(--background-color));
  }

  .rail-footer {
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
    border: 1px solid transparent;
    background: transparent;
  }

  .rail-overview {
    min-width: 0;
    width: 100%;
    flex: 0 0 auto;
    min-height: 38px;
    padding: 7px 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    border-radius: 10px;
    color: var(--desc-color);
  }

  .rail-overview > span:nth-child(2) {
    flex: 0 0 auto;
    font-size: 12px;
    text-align: left;
    white-space: nowrap;
  }

  .rail-overview strong {
    margin-left: auto;
    margin-right: 2px;
    flex: 0 0 auto;
    color: inherit;
    font-size: 11px;
  }

  .rail-icon {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 7px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    overflow: hidden;
  }

  .rail-icon--tag {
    color: var(--primary-color);
  }

  .rail-section {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .rail-section :deep(.b-action-menu-anchor) {
    width: 100%;
  }

  .rail-section--directory {
    min-height: 0;
    flex: 1;
    padding-right: 2px;
    overflow: auto;
  }

  .rail-section--directory .rail-section__label {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--card-background, var(--background-color));
  }

  .rail-section__label {
    padding: 0 7px 5px;
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 650;
  }

  .rail-footer {
    min-height: 36px;
    margin-top: auto;
    padding: 8px;
    gap: 7px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .tag-space-main {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
    overflow: hidden;
  }

  .workspace-back {
    display: none;
    width: 38px;
    min-width: 38px;
    height: 38px;
    padding: 0;
    color: var(--text-color);
    background: transparent;
  }

  .tag-profile-card {
    min-height: var(--tag-profile-height);
    padding: 15px !important;
    display: grid;
    grid-template-columns: minmax(300px, 1.2fr) minmax(410px, 1fr);
    align-items: center;
    gap: 12px 20px;
    overflow: hidden;
  }

  .tag-profile-main {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .tag-profile-icon {
    width: 62px;
    height: 62px;
    padding: 10px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
    overflow: hidden;
  }

  .tag-profile-icon.has-custom-icon {
    padding: 8px;
    background: var(--card-background, var(--background-color));
  }

  .tag-profile-icon img {
    width: 100%;
    height: 100%;
    border-radius: 11px;
    object-fit: contain;
  }

  .tag-profile-identity {
    min-width: 0;
  }

  .tag-profile-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tag-profile-title-row h2 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    flex: 1 1 auto;
    color: var(--text-color);
    font-size: 21px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-tag-profile-actions,
  .mobile-tag-edit,
  .mobile-tag-switcher {
    display: none;
  }

  .tag-profile-identity p {
    max-width: 560px;
    margin: 5px 0 0;
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .tag-profile-side {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .tag-profile-stats {
    display: grid;
    grid-template-columns: 1.25fr repeat(3, 1fr);
  }

  .profile-stat {
    min-width: 0;
    padding: 2px 13px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-left: 1px solid var(--surface-divider-color);
  }

  .profile-stat span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-stat strong {
    color: var(--text-color);
    font-size: 18px;
    line-height: 1.1;
  }

  .profile-stat--total {
    border-left: 0;
  }

  .profile-stat--total strong {
    font-size: 22px;
  }

  .tag-profile-meta {
    min-width: 0;
    margin-top: 7px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 10px;
  }

  .space-primary-tabs {
    min-height: 39px;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .space-primary-tab {
    position: relative;
    min-height: 38px;
    padding: 6px 13px;
    gap: 6px;
    border: 0;
    border-radius: 0;
    color: var(--desc-color);
    background: transparent !important;
  }

  .space-primary-tab::after {
    content: '';
    position: absolute;
    right: 11px;
    bottom: -1px;
    left: 11px;
    height: 2px;
    border-radius: 99px;
    background: transparent;
  }

  .space-primary-tab:hover,
  .space-primary-tab:focus-visible,
  .space-primary-tab.is-active {
    color: var(--primary-color);
  }

  .space-primary-tab:focus-visible,
  .resource-tab:focus-visible {
    outline-offset: -4px;
  }

  .space-primary-tab.is-active::after {
    background: var(--primary-color);
  }

  .space-primary-tab span {
    min-width: 20px;
    height: 19px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: inherit;
    background: var(--workspace-panel-bg-color);
    font-size: 10px;
  }

  .resources-panel {
    --b-card-border-color: transparent;
    --b-card-background: transparent;
    --b-card-shadow: none;

    min-height: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    overflow: hidden;
  }

  .resource-toolbar {
    flex: 0 0 auto;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }

  .resource-scroll-region {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .resource-tabs {
    flex: 1 1 auto;
  }

  .resource-tab {
    min-height: 30px;
    padding: 4px 11px;
    gap: 5px;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    color: var(--desc-color);
    background: transparent;
  }

  .resource-tab.is-active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, transparent) !important;
  }

  .resource-tab strong {
    font-size: 10px;
  }

  .resource-search {
    width: min(280px, 28vw);
  }

  .resource-sort {
    width: 126px;
  }

  .grouped-resource-stream {
    padding: 14px 2px 4px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .grouped-content--loading,
  .filtered-loading {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filtered-loading {
    padding: 12px;
  }

  .resource-group {
    gap: 8px;
  }

  .resource-group-heading {
    min-height: 28px;
    padding-inline: 3px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .resource-group-heading strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .resource-group-heading > span:last-child {
    min-width: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-group-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--resource-bookmark-color, #615ced);
  }

  .resource-group-dot--note {
    background: var(--resource-note-color, #00a884);
  }

  .resource-group-dot--file {
    background: var(--resource-file-color, #ff8a00);
  }

  .space-section-heading {
    min-height: 28px;
  }

  .space-section-heading > span {
    margin-right: auto;
  }

  .resource-group__all {
    margin-left: 0;
    color: var(--primary-color);
  }

  .resource-stream {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .filtered-resource-stream {
    padding: 12px;
  }

  .inline-error {
    margin: 10px 12px 0;
  }

  .resource-state {
    min-height: 250px;
    border: 0;
    background: transparent;
  }

  .resource-state--compact {
    min-height: 260px;
  }

  .resource-group__empty {
    padding: 14px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 10px;
  }

  .resource-sentinel {
    min-height: 46px;
  }

  .panel-heading {
    min-height: 48px;
    display: flex;
    align-items: center;
  }

  .panel-heading > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .panel-heading strong {
    color: var(--text-color);
    font-size: 15px;
  }

  .panel-heading span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .related-topic-grid--panel {
    margin-top: 12px;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  }

  .related-topic-card {
    min-height: 76px;
  }

  .graph-panel {
    min-height: 0;
    flex: 1 1 auto;
  }

  .graph-layout {
    min-height: 0;
  }

  .tag-insight-rail {
    height: 100%;
    padding-top: var(--tag-workspace-heading-offset);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: auto;
  }

  .related-panel {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
  }

  .insight-card {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .insight-heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .insight-heading strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .insight-icon {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 8px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
    font-weight: 750;
  }

  .co-used-tag-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .co-used-tag-list :deep(.b_btn) {
    width: 100%;
    min-width: 0;
    min-height: 34px;
    padding: 6px 5px;
    justify-content: flex-start;
    gap: 6px;
    color: var(--desc-color);
    background: transparent;
  }

  .co-used-tag-list :deep(.b_btn:hover),
  .co-used-tag-list :deep(.b_btn:focus-visible) {
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .co-used-tag-list :deep(.b_btn > span:first-child) {
    min-width: 0;
    overflow: hidden;
    flex: 1;
    color: var(--text-color);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .co-used-tag-list small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .tag-space-workspace--skeleton {
    pointer-events: none;
  }

  .skeleton-block {
    display: block;
    border-radius: 999px;
    background: var(--skeleton-bg-color, var(--surface-divider-color));
    animation: tag-space-detail-pulse 1.15s ease-in-out infinite alternate;
  }

  .tag-directory-rail--skeleton {
    gap: 10px;
  }

  .skeleton-directory-overview,
  .skeleton-directory-row {
    min-width: 0;
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .skeleton-directory-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .skeleton-block--directory-icon {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    border-radius: 7px;
  }

  .skeleton-block--directory-title {
    width: 66px;
    height: 10px;
  }

  .skeleton-block--directory-name {
    width: min(96px, 64%);
    height: 10px;
  }

  .skeleton-block--directory-count {
    width: 18px;
    height: 9px;
    margin-left: auto;
  }

  .skeleton-block--directory-label {
    width: 52px;
    height: 8px;
    margin: 2px 7px 0;
  }

  .skeleton-profile-card {
    min-height: var(--tag-profile-height);
    padding: 15px !important;
    display: grid;
    grid-template-columns: minmax(280px, 1.2fr) minmax(340px, 1fr);
    align-items: center;
    gap: 18px;
  }

  .skeleton-profile-identity {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .skeleton-block--profile-icon {
    width: 58px;
    height: 58px;
    flex: 0 0 auto;
    border-radius: 14px;
  }

  .skeleton-profile-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .skeleton-block--profile-title {
    width: 34%;
    height: 17px;
  }

  .skeleton-block--profile-description {
    width: 86%;
    height: 11px;
  }

  .skeleton-block--profile-meta {
    width: 48%;
    height: 8px;
  }

  .skeleton-profile-stats {
    display: grid;
    grid-template-columns: 1.25fr repeat(3, 1fr);
  }

  .skeleton-profile-stat {
    min-width: 0;
    padding: 3px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-left: 1px solid var(--surface-divider-color);
  }

  .skeleton-profile-stat:first-child {
    border-left: 0;
  }

  .skeleton-block--stat-label {
    width: 72%;
    height: 8px;
  }

  .skeleton-block--stat-value {
    width: 30px;
    height: 18px;
  }

  .skeleton-primary-tabs {
    min-height: 39px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    gap: 24px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .skeleton-block--tab {
    width: 72px;
    height: 11px;
  }

  .skeleton-resources-panel {
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .skeleton-resource-toolbar {
    min-height: 50px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .skeleton-resource-filters {
    min-width: 0;
    display: flex;
    gap: 7px;
  }

  .skeleton-block--filter {
    width: 64px;
    height: 30px;
    border-radius: 8px;
  }

  .skeleton-block--search {
    width: min(300px, 28%);
    height: 32px;
    margin-left: auto;
    border-radius: 8px;
  }

  .skeleton-block--sort {
    width: 110px;
    height: 32px;
    border-radius: 8px;
  }

  .skeleton-resource-group {
    padding: 12px 12px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-resource-group:last-child {
    padding-bottom: 14px;
  }

  .skeleton-resource-heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .skeleton-block--group-dot {
    width: 8px;
    height: 8px;
  }

  .skeleton-block--group-title {
    width: 88px;
    height: 11px;
  }

  .skeleton-block--group-hint {
    width: 150px;
    height: 9px;
  }

  .skeleton-row {
    min-height: 66px;
    display: block;
    border-radius: 11px;
    background: var(--skeleton-bg-color, var(--surface-divider-color));
    animation: tag-space-detail-pulse 1.15s ease-in-out infinite alternate;
  }

  @media (max-width: 1500px) {
    .tag-space-workspace {
      --tag-workspace-heading-offset: 0px;
      --tag-profile-height: 112px;

      grid-template-columns: 188px minmax(0, 1fr);
      gap: 13px;
    }

    .tag-space-workspace.has-insights {
      grid-template-columns: 188px minmax(0, 1fr) 238px;
    }

    .workspace-heading {
      min-height: 34px;
    }

    .workspace-heading h1 {
      font-size: 19px;
    }

    .workspace-heading p {
      font-size: 11px;
    }

    .tag-profile-card {
      padding: 13px !important;
      grid-template-columns: minmax(260px, 1fr) minmax(360px, 0.95fr);
      gap: 12px;
    }

    .skeleton-profile-card {
      padding: 13px !important;
      grid-template-columns: minmax(260px, 1fr) minmax(320px, 0.95fr);
      gap: 12px;
    }

    .tag-profile-icon {
      width: 56px;
      height: 56px;
    }

    .profile-stat {
      padding-inline: 9px;
    }
  }

  @media (max-height: 800px) and (min-width: 768px) {
    .tag-space-workspace {
      --tag-workspace-heading-offset: 0px;
      --tag-profile-height: 104px;
    }

    .tag-space-main {
      gap: 7px;
    }

    .workspace-heading {
      min-height: 27px;
    }

    .workspace-heading p {
      display: none;
    }

    .tag-profile-card {
      padding: 11px !important;
    }

    .tag-profile-icon {
      width: 50px;
      height: 50px;
      padding: 8px;
      border-radius: 12px;
    }

    .tag-profile-identity h2 {
      font-size: 19px;
    }

    .tag-profile-identity p {
      margin-top: 3px;
      line-height: 1.4;
      -webkit-line-clamp: 1;
    }

    .tag-profile-side {
      gap: 7px;
    }

    .profile-stat {
      padding-inline: 8px;
      gap: 3px;
    }

    .profile-stat strong {
      font-size: 17px;
    }

    .profile-stat--total strong {
      font-size: 20px;
    }

    .tag-profile-meta {
      margin-top: 4px;
    }

    .space-primary-tabs {
      min-height: 35px;
    }

    .space-primary-tab {
      min-height: 34px;
      padding-block: 5px;
    }

    .resource-toolbar {
      padding: 6px 9px;
    }

    .grouped-content {
      padding-top: 10px;
      gap: 14px;
    }

    .insight-card {
      gap: 8px;
    }
  }

  @media (max-width: 1260px) {
    .tag-space-workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .tag-space-workspace.has-insights {
      grid-template-columns: minmax(0, 1fr) 246px;
    }

    .tag-directory-rail {
      display: none;
    }

    .workspace-back {
      display: inline-flex;
    }
  }

  @media (max-width: 980px) {
    .tag-space-workspace,
    .tag-space-workspace.has-insights {
      grid-template-columns: minmax(0, 1fr);
    }

    .tag-insight-rail {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .tag-space-detail {
      overflow-x: hidden;
      overflow-y: auto;
      scrollbar-gutter: auto;
    }

    .tag-space-workspace {
      height: auto;
      min-height: 100%;
      align-items: start;
    }

    .tag-space-main {
      height: auto;
      overflow: visible;
    }

    .resources-panel,
    .related-panel {
      min-height: 0;
      flex: 0 0 auto;
      overflow: visible;
    }

    .resource-scroll-region {
      overflow: visible;
      scrollbar-gutter: auto;
    }

    .workspace-heading {
      min-height: 44px;
    }

    .workspace-heading h1 {
      font-size: 19px;
    }

    .workspace-heading p {
      display: none;
    }

    .tag-profile-card {
      min-height: 0;
      padding: 14px !important;
      grid-template-columns: 1fr;
      gap: 14px;
    }

    .skeleton-profile-card {
      min-height: 0;
      padding: 14px !important;
      grid-template-columns: 1fr;
      gap: 14px;
    }

    .skeleton-profile-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border: 1px solid var(--surface-border-color);
      border-radius: 10px;
      overflow: hidden;
    }

    .skeleton-profile-stat {
      min-height: 54px;
      padding: 9px 11px;
      box-sizing: border-box;
    }

    .skeleton-profile-stat:nth-child(odd) {
      border-left: 0;
    }

    .skeleton-profile-stat:nth-child(n + 3) {
      border-top: 1px solid var(--surface-divider-color);
    }

    .skeleton-resource-toolbar {
      padding: 10px;
      align-items: stretch;
      flex-direction: column;
    }

    .skeleton-resource-filters {
      overflow: hidden;
    }

    .skeleton-block--search {
      display: none;
    }

    .skeleton-block--sort {
      width: 100%;
    }

    .tag-profile-main {
      align-items: flex-start;
      gap: 12px;
    }

    .mobile-tag-profile-actions {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      gap: 2px;
    }

    .mobile-tag-edit {
      width: 40px;
      min-width: 40px;
      height: 44px;
      padding: 0;
      display: inline-flex;
      color: var(--desc-color);
      border-color: transparent;
      background: transparent;
    }

    .mobile-tag-switcher {
      min-width: 0;
      min-height: 44px;
      height: 44px;
      padding: 0 6px 0 8px;
      display: inline-flex;
      flex: 0 0 auto;
      gap: 3px;
      border-color: transparent;
      color: var(--primary-color);
      background: transparent;
      font-size: 12px;
    }

    .mobile-tag-edit:focus-visible,
    .mobile-tag-switcher:focus-visible {
      border-color: currentColor;
    }

    .tag-profile-icon {
      width: 54px;
      height: 54px;
      border-radius: 13px;
      box-shadow: none;
    }

    .tag-profile-identity h2 {
      font-size: 20px;
    }

    .tag-profile-identity p {
      margin-top: 5px;
      -webkit-line-clamp: 3;
    }

    .tag-profile-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border: 1px solid var(--surface-border-color);
      border-radius: 10px;
      overflow: hidden;
    }

    .profile-stat {
      min-height: 56px;
      padding: 9px 11px;
    }

    .profile-stat:nth-child(odd) {
      border-left: 0;
    }

    .profile-stat:nth-child(n + 3) {
      border-top: 1px solid var(--surface-divider-color);
    }

    .profile-stat--total strong,
    .profile-stat strong {
      font-size: 17px;
    }

    .tag-profile-meta {
      margin-top: 6px;
      padding-top: 0;
      flex-wrap: wrap;
    }

    .space-primary-tabs {
      min-width: 0;
      overflow-x: auto;
    }

    .space-primary-tab {
      flex: 0 0 auto;
      padding-inline: 11px;
    }

    .resource-toolbar {
      margin: 0;
      padding: 10px;
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
    }

    .resource-tabs {
      padding-inline: 0;
    }

    .resource-sort {
      width: 100%;
      margin: 0;
    }

    .grouped-content,
    .grouped-resource-stream,
    .filtered-resource-stream,
    .filtered-loading {
      padding: 11px 9px 14px;
    }

    .resource-group-heading {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .resource-group-heading > span:last-child {
      width: calc(100% - 15px);
      margin-left: 15px;
      white-space: normal;
    }

    .space-section-heading {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .space-section-heading > span {
      width: 100%;
      padding-left: 14px;
    }

    .resource-group__all {
      position: absolute;
      right: 2px;
    }

    .related-panel {
      padding: 13px !important;
    }

    .related-topic-grid--panel {
      grid-template-columns: 1fr;
    }

    .graph-panel,
    .graph-layout {
      min-height: 470px;
    }
  }

  html.light-note-mobile-rendering .space-primary-tab.is-active,
  html.light-note-mobile-rendering .resource-tab.is-active,
  html.light-note-mobile-rendering .related-topic-card:focus-visible {
    border-color: var(--primary-color);
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-block,
    .skeleton-row {
      animation: none;
    }
  }
</style>
