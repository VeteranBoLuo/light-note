<template>
  <ResourcePageShell
    class="tag-space-shell"
    :title="t('tagSpace.title')"
    :subtitle="t('tagSpace.subtitle')"
    title-actionable
    @title-click="resetTagView"
    accent="tag"
    layout="workspace"
    compact-mobile-heading
    :show-header="!bookmark.isMobile"
  >
    <template #meta>
      <BChip v-if="sidebarTotal > 0" tone="tag">{{ t('tagSpace.resultCount', { count: sidebarTotal }) }}</BChip>
    </template>

    <template #actions>
      <BButton
        v-if="!isReadOnly"
        type="primary"
        class="tag-header-action"
        :disabled="detailLoading || detailRefreshing"
        @click="createTag"
      >
        <SvgIcon :src="icon.common.add" size="16" aria-hidden="true" />
        {{ t('tagSpace.createTag') }}
      </BButton>
      <BButton v-if="!isReadOnly" class="tag-header-action" :disabled="!tag || detailRefreshing" @click="editTag()">
        <SvgIcon :src="icon.table_edit" size="16" aria-hidden="true" />
        {{ t('tagSpace.editDescription') }}
      </BButton>
      <BButton v-if="!bookmark.isDesktop" type="primary" :disabled="!tag || detailRefreshing" @click="openTagInAi">
        <SvgIcon :src="icon.ai.ask" size="15" aria-hidden="true" />
        {{ t('tagSpace.askAi') }}
      </BButton>
    </template>

    <div class="tag-space-detail" :class="{ 'is-graph': viewMode === 'graph' }">
      <div
        v-if="detailLoading"
        class="tag-space-workspace tag-space-workspace--skeleton"
        :class="{ 'has-ai': bookmark.isDesktop }"
        aria-busy="true"
        :aria-label="t('common.loading')"
      >
        <aside class="tag-directory-rail tag-directory-rail--skeleton" aria-hidden="true">
          <span class="skeleton-block skeleton-block--directory-search"></span>
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

        <aside v-if="bookmark.isDesktop" class="tag-ai-rail tag-ai-rail--skeleton" aria-hidden="true">
          <BCard variant="card" padding="13px" class="skeleton-ai-panel">
            <div class="skeleton-ai-heading">
              <span class="skeleton-block skeleton-block--ai-icon"></span>
              <div>
                <span class="skeleton-block skeleton-block--ai-title"></span>
                <span class="skeleton-block skeleton-block--ai-description"></span>
              </div>
            </div>
            <span class="skeleton-block skeleton-block--ai-scope"></span>
            <div class="skeleton-ai-actions">
              <span v-for="index in 3" :key="index" class="skeleton-block skeleton-block--ai-action"></span>
            </div>
            <span class="skeleton-block skeleton-block--ai-result"></span>
            <span class="skeleton-block skeleton-block--ai-composer"></span>
          </BCard>
        </aside>
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
        :class="{
          'has-ai': bookmark.isDesktop,
        }"
      >
        <aside class="tag-directory-rail" :aria-label="t('tagSpace.sidebarTitle')">
          <BInput
            v-model:value="directoryKeyword"
            class="rail-search"
            clearable
            :placeholder="t('tagSpace.searchPlaceholder')"
          >
            <template #prefix><SvgIcon :src="icon.navigation.search" size="16" aria-hidden="true" /></template>
          </BInput>
          <div v-if="directorySidebarTags.length" v-auto-scrollbar class="rail-section rail-section--directory">
            <span class="rail-section__label">{{ t('tagSpace.directoryTopics') }}</span>
            <div v-if="sidebarError" class="rail-directory-state" role="alert">
              <span>{{ t('tagSpace.staleError') }}</span>
              <BButton size="small" @click="loadSidebarTags()">{{ t('common.retry') }}</BButton>
            </div>
            <p v-else-if="sidebarLoading" class="rail-directory-state" role="status">{{ t('common.loading') }}</p>
            <p v-else-if="!filteredDirectoryTags.length" class="rail-directory-state" role="status">
              {{ t('tagSpace.noMatchTitle') }}
            </p>
            <BActionMenu
              v-for="sidebarTag in filteredDirectoryTags"
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
                :todo-count="sidebarTag.todoCounts?.total"
                :todo-pending="sidebarTag.todoCounts?.pending"
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

        <main class="tag-space-main" :aria-busy="detailRefreshing">
          <BCard as="section" variant="card" padding="18px" class="tag-profile-card">
            <div class="tag-profile-main">
              <BButton class="workspace-back" :aria-label="t('common.back')" @click="leaveTagView()">
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
                  <h2>
                    <BButton
                      v-if="bookmark.isMobile"
                      class="tag-title-reset mobile-tag-switcher"
                      :aria-label="`${tag.name} · ${t('tagSpace.switchTag')}`"
                      :disabled="detailRefreshing"
                      @click="openMobileTagDirectory"
                    >
                      <span class="mobile-tag-name">{{ tag.name }}</span>
                      <SvgIcon class="mobile-tag-chevron" :src="icon.noteTree.chevron" size="13" aria-hidden="true" />
                    </BButton>
                    <BButton v-else class="tag-title-reset" @click="resetTagView">{{ tag.name }}</BButton>
                  </h2>
                </div>
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
                  <BButton
                    class="mobile-tag-ai"
                    :aria-label="t('tagSpace.askAi')"
                    :title="t('tagSpace.askAi')"
                    :disabled="detailRefreshing"
                    @click="openTagInAi"
                  >
                    <SvgIcon :src="icon.ai.ask" size="16" aria-hidden="true" />
                  </BButton>
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
              <BButton v-if="tag.formCount" @click="router.push({ path: '/toolbox/forms', query: { tagId: tag.id } })">{{ t('collectionForms.tagEntry', { count: tag.formCount }) }}</BButton>
              <div class="tag-profile-stats" :aria-label="t('tagSpace.spaceOverview')">
                <div class="profile-stat profile-stat--total">
                  <span>{{ t('tagSpace.totalResources') }}</span>
                  <strong>{{ tag.counts.total }}</strong>
                </div>
                <div class="profile-stat"
                  ><span>{{ t('todoWorkspace.tagTodos') }}</span
                  ><strong>{{ tag.todoCounts?.total || 0 }}</strong
                  ><small>{{ t('todoWorkspace.pendingHint', { count: tag.todoCounts?.pending || 0 }) }}</small></div
                >
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
              :disabled="detailRefreshing"
              @click="setViewMode(tabOption.value)"
            >
              {{ tabOption.label }}
              <span v-if="tabOption.count !== undefined">{{ tabOption.count }}</span>
            </BButton>
          </div>

          <TagTodoPanel v-if="viewMode === 'todos' && tag" :key="tag.id" :tag-id="tag.id" />
          <BCard v-else-if="viewMode === 'resources'" as="section" variant="card" padding="0" class="resources-panel">
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
              :inert="detailRefreshing"
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

          <BCard
            v-else-if="viewMode === 'related'"
            as="section"
            variant="card"
            padding="18px"
            class="related-panel"
            :inert="detailRefreshing"
          >
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

          <BCard v-else as="section" variant="card" padding="0" class="graph-panel" :inert="detailRefreshing">
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

          <div v-if="detailRefreshing" class="tag-switching-status" role="status" aria-live="polite">
            <BLoading inline loading :title="t('common.loading')" />
          </div>
        </main>

        <aside v-if="bookmark.isDesktop" class="tag-ai-rail" :aria-label="t('tagManage.aiSkillTitle')">
          <AiSkillPanel
            :key="`tag-ai:${requestedTagId}`"
            class="tag-ai-panel"
            :title="t('tagManage.aiSkillTitle')"
            :description="t('tagManage.aiSkillDescription')"
            skill-id="tag.ask"
            prompt-key="question"
            surface="tag_detail"
            :resource-refs="tagAiResourceRefs"
            :scope-resource-count="tag?.counts.total || 0"
            :scope-label="t('tagManage.aiSkillScope', { count: tag?.counts.total || 0 })"
            :actions="tagAiActions"
            :disabled="detailRefreshing || !tagAiResourceRefs.length"
            :prompt-disabled="tagAskOverLimit"
            :empty-text="
              !tagAiResourceRefs.length
                ? t('tagManage.aiNoResources')
                : tagAskOverLimit
                  ? t('tagManage.aiAskLimit', { count: TAG_ASK_MAX_RESOURCES })
                  : ''
            "
            show-prompt
            :prompt-rows="1"
            presentation="sidebar"
            composer-variant="chat"
            clear-prompt-on-success
            :show-grounding="false"
          >
            <template #result="{ response, result }">
              <div class="tag-ai-result">
                <div class="tag-ai-result__tools">
                  <BButton size="small" @click="openExpandedTagAnswer(response)">
                    <SvgIcon :src="icon.ai.maximize" size="14" aria-hidden="true" />
                    {{ t('ai.maximize') }}
                  </BButton>
                  <BButton size="small" @click="copyTagAiAnswer(response)">
                    <SvgIcon :src="icon.toolbox.copy" size="14" aria-hidden="true" />
                    {{ t('ai.copy') }}
                  </BButton>
                  <BButton
                    v-if="canSaveTagAiResponse(response) && !isReadOnly"
                    size="small"
                    type="primary"
                    :loading="creatingTagNote"
                    :disabled="creatingTagNote"
                    @click="createNoteFromTagAnalysis(response)"
                  >
                    <SvgIcon :src="icon.resource.note" size="14" aria-hidden="true" />
                    {{ t('aiSkills.saveAsNote') }}
                  </BButton>
                </div>
                <AiSkillResultContent :result="result" :show-grounding="false" />
              </div>
            </template>
          </AiSkillPanel>
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
    <MobilePageActionsDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobilePageActionsOpen"
      :title="t('common.more')"
      :actions="mobilePageActions"
      @action="handleMobilePageAction"
    />
    <AiSkillDialog
      v-if="!bookmark.isDesktop"
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
        <BButton size="small" @click="copyTagAiAnswer(response)">
          <SvgIcon :src="icon.toolbox.copy" size="14" aria-hidden="true" />
          {{ t('ai.copy') }}
        </BButton>
        <BButton
          v-if="result?.kind === 'grounded_markdown' && response.sources.length && !isReadOnly"
          type="primary"
          :loading="creatingTagNote"
          :disabled="creatingTagNote"
          @click="createNoteFromTagAnalysis(response)"
        >
          <SvgIcon :src="icon.resource.note" size="14" aria-hidden="true" />
          {{ t('aiSkills.saveAsNote') }}
        </BButton>
      </template>
    </AiSkillDialog>

    <BModal
      v-model:visible="tagAiExpandedVisible"
      :title="t('tagManage.aiSkillTitle')"
      :show-footer="false"
      width="min(var(--ui-layout-920, 920px), calc(100vw - 32px))"
      height="min(var(--ui-layout-760, 760px), calc(100vh - 48px))"
      content-class="tag-ai-preview-modal__content"
    >
      <div v-if="expandedTagAiResponse?.result" class="tag-ai-preview">
        <div class="tag-ai-preview__tools">
          <BButton size="small" @click="copyTagAiAnswer(expandedTagAiResponse)">
            <SvgIcon :src="icon.toolbox.copy" size="14" aria-hidden="true" />
            {{ t('ai.copy') }}
          </BButton>
          <BButton
            v-if="canSaveTagAiResponse(expandedTagAiResponse) && !isReadOnly"
            size="small"
            type="primary"
            :loading="creatingTagNote"
            :disabled="creatingTagNote"
            @click="createNoteFromTagAnalysis(expandedTagAiResponse)"
          >
            <SvgIcon :src="icon.resource.note" size="14" aria-hidden="true" />
            {{ t('aiSkills.saveAsNote') }}
          </BButton>
        </div>
        <div class="tag-ai-preview__body">
          <AiSkillResultContent :result="expandedTagAiResponse.result" :show-grounding="false" />
        </div>
      </div>
    </BModal>
  </ResourcePageShell>
</template>

<script setup lang="ts">
  import TagTodoPanel from '@/components/todo/TagTodoPanel.vue';
  import useTodoStore from '@/store/todo';
  import { computed, onActivated, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type {
    BActionMenuItem,
    BActionMenuSource,
    BActionMenuTrigger,
  } from '@/components/base/BasicComponents/actionMenu';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import TagGraphPanel from '@/components/tagGraph/TagGraphPanel.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import TagDirectoryRow from '@/components/tagSpace/TagDirectoryRow.vue';
  import MobileTagDirectoryDrawer from '@/components/tagSpace/MobileTagDirectoryDrawer.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import TagSpaceResourceRow from '@/components/tagSpace/TagSpaceResourceRow.vue';
  import TagEditorDialog from '@/components/manage/tagEditMg/TagEditorDialog.vue';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import AiSkillPanel from '@/components/aiSkills/AiSkillPanel.vue';
  import AiSkillResultContent from '@/components/aiSkills/AiSkillResultContent.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import {
    AI_SCOPED_CONVERSATION_MAX_RESOURCES,
    type AiSkillResourceRef,
    type AiSkillResponse,
  } from '@lightnote/shared/ai-skill-protocol';
  import type { BaseOptions } from '@/config/bookmarkCfg.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { recordOperation } from '@/api/commonApi';
  import { clearGlobalSearchCache } from '@/api/search';
  import { persistAiMarkdownResultAsNote } from '@/utils/aiNoteDraft';
  import { stripAiAnalysisCitations } from '@/utils/aiAnalysisContent';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { createMobileResourceHubActions, mobileResourceHubPath } from '@/utils/mobileResourceHubActions';

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
  type TagSpaceViewMode = 'resources' | 'related' | 'graph' | 'todos';
  const viewMode = ref<TagSpaceViewMode>('resources');
  const sidebarTags = ref<TagSpaceSummary[]>([]);
  const directoryKeyword = ref('');
  const sidebarTotal = ref(0);
  const sidebarLoading = ref(false);
  const sidebarError = ref(false);
  const mobileTagDirectoryVisible = ref(false);
  const mobilePageActionsOpen = ref(false);
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
  const tagAiExpandedVisible = ref(false);
  const expandedTagAiResponse = ref<AiSkillResponse | null>(null);
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
  const TAG_ASK_MAX_RESOURCES = AI_SCOPED_CONVERSATION_MAX_RESOURCES;

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
  // 路由一旦切换就立即重建问答面板，中止旧标签仍在执行的请求；
  // displayedTagId 会等新详情返回后才更新，不能作为取消边界。
  const requestedTagId = computed(() => currentTagId());
  const sidebarTagTotal = computed(() => sidebarTotal.value || Math.max(sidebarTags.value.length, tag.value ? 1 : 0));
  const directorySidebarTags = computed(() => {
    const tags = new Map(sidebarTags.value.map((item) => [String(item.id), item]));
    if (tag.value && !tags.has(displayedTagId.value)) tags.set(displayedTagId.value, tag.value);
    return [...tags.values()];
  });
  const filteredDirectoryTags = computed(() => {
    const keyword = directoryKeyword.value.trim().toLocaleLowerCase();
    return keyword
      ? directorySidebarTags.value.filter((item) => String(item.name || '').toLocaleLowerCase().includes(keyword))
      : directorySidebarTags.value;
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
    { value: 'todos', label: t('todoWorkspace.tagTodos'), count: tag.value?.todoCounts?.total || 0 },
    { value: 'related', label: t('tagSpace.relatedTagsTab'), count: relatedTags.value.length },
    { value: 'graph', label: t('tagSpace.graphTab') },
  ]);
  const resourceSortOptions = computed<BaseOptions[]>(() => [
    { value: 'updated', label: t('tagSpace.sortByUpdated') },
    { value: 'added', label: t('tagSpace.sortByAdded') },
  ]);
  const isReadOnly = computed(() => user.adminContext?.mode === 'readonly');
  const mobilePageActions = computed<MobilePageActionItem[]>(() => createMobileResourceHubActions(t));
  useMobileTopBar(['tagDetail'], {
    onBack: leaveTagView,
    onTitleClick: resetTagView,
    onAuxiliaryAction: () => (mobilePageActionsOpen.value = true),
    auxiliaryActionLabel: () => t('common.more'),
    auxiliaryActionIcon: () => icon.common.more,
    onAdd: createTag,
    addLabel: () => t('tagSpace.createTag'),
    showAdd: () => !isReadOnly.value,
  });
  function leaveTagView() {
    if (window.history.state?.back) router.back();
    else void router.replace('/home');
  }
  async function resetTagView() {
    activeType.value = 'all';
    resourceSort.value = 'updated';
    resourceKeyword.value = '';
    viewMode.value = 'resources';
    activeGraphNode.value = null;
    await nextTick();
    resourceScrollRef.value?.scrollTo({ top: 0 });
    document.querySelector<HTMLElement>('.tag-space-main')?.scrollTo({ top: 0 });
  }
  function handleMobilePageAction(action: MobilePageActionItem) {
    const path = mobileResourceHubPath(action.key);
    if (path) void router.push(path);
  }
  const tagAiResourceRefs = computed<AiSkillResourceRef[]>(() =>
    displayedTagId.value && Number(tag.value?.counts.total || 0) > 0 ? [{ type: 'tag', id: displayedTagId.value }] : [],
  );
  const tagAskOverLimit = computed(() => Number(tag.value?.counts.total || 0) > TAG_ASK_MAX_RESOURCES);
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
          {
            id: 'next-actions',
            label: t('tagManage.aiNextActions'),
            skillId: 'tag.ask',
            disabled: tagAskOverLimit.value,
            reason: tagAskOverLimit.value ? t('tagManage.aiAskLimit', { count: TAG_ASK_MAX_RESOURCES }) : '',
            promptKey: 'question',
            promptValue: t('tagManage.aiNextActionsPrompt', { tag: String(tag.value?.name || '') }),
          },
          {
            id: 'gaps',
            label: t('tagManage.aiFindGaps'),
            skillId: 'tag.ask',
            disabled: tagAskOverLimit.value,
            reason: tagAskOverLimit.value ? t('tagManage.aiAskLimit', { count: TAG_ASK_MAX_RESOURCES }) : '',
            promptKey: 'question',
            promptValue: t('tagManage.aiFindGapsPrompt', { tag: String(tag.value?.name || '') }),
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
    tagAiExpandedVisible.value = false;
    expandedTagAiResponse.value = null;
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

  function tagAiAnswerText(response: AiSkillResponse) {
    const result = response.result;
    if (!result) return '';
    if (result.kind === 'grounded_markdown' || result.kind === 'artifact_preview' || result.kind === 'text') {
      return stripAiAnalysisCitations(String(result.content || '')).trim();
    }
    return JSON.stringify(result, null, 2);
  }

  function canSaveTagAiResponse(response: AiSkillResponse) {
    return response.result?.kind === 'grounded_markdown' && response.sources.length > 0;
  }

  function openExpandedTagAnswer(response: AiSkillResponse) {
    expandedTagAiResponse.value = response;
    tagAiExpandedVisible.value = true;
    recordOperation({ module: '标签', operation: '放大查看标签问答结果' });
  }

  async function copyTagAiAnswer(response: AiSkillResponse) {
    const copied = await copyTextToClipboard(tagAiAnswerText(response));
    if (copied) {
      message.success(t('ai.copied'));
      recordOperation({ module: '标签', operation: '复制标签问答结果' });
      return;
    }
    message.warning(t('ai.copyFailed'));
  }

  async function createNoteFromTagAnalysis(response: AiSkillResponse) {
    if (creatingTagNote.value || isReadOnly.value || blockGuestWrite('tag-ai-save-note')) return;
    creatingTagNote.value = true;
    try {
      const handoff = await persistAiMarkdownResultAsNote(
        response,
        t('tagManage.aiGeneratedNoteTitle', { tag: tag.value?.name || t('tagManage.unnamedTag') }),
      );
      if (!handoff) return;
      message.success(t('aiSkills.noteCreated'));
      tagAiVisible.value = false;
      tagAiExpandedVisible.value = false;
      recordOperation({ module: '标签', operation: '标签问答结果存为笔记' });
      await router.push({
        path: handoff.route.path,
        query: { from: route.fullPath },
      });
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
      openBookmarkUrl(item.url, { resourceId: item.id });
      return;
    }
    if (item.type === 'note') {
      router.push({
        path: `/noteLibrary/${item.id}`,
        query: { from: route.fullPath },
      });
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
      openBookmarkUrl(node.meta.url, { resourceId: node.rawId });
      return;
    }
    if (node.type === 'note') {
      router.push({
        path: `/noteLibrary/${node.rawId}`,
        query: { from: route.fullPath },
      });
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
  const todoOrganization = useTodoStore();
  watch(
    () => todoOrganization.organizationEpoch,
    () => loadDetail({ force: true }),
  );
  onActivated(() => {
    if (!detailLoading.value) void loadDetail({ force: true });
  });
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
  .tag-title-reset.b_btn {
    height: auto;
    padding: 0;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .tag-title-reset.b_btn:hover {
    color: var(--workspace-tag-text);
  }

  @import (reference) "@/assets/css/workspace-surfaces.less";
  .tag-space-detail {
    height: 100%;
    min-height: 0;
    padding-bottom: var(--ui-space-6, 6px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    overflow: auto;
    scrollbar-gutter: stable;
  }
  .tag-space-detail.is-graph {
    overflow: hidden;
  }
  .detail-tag-icon {
    width: var(--ui-layout-30, 30px);
    height: var(--ui-layout-30, 30px);
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
    gap: var(--ui-space-6, 6px);
  }
  :deep(.resource-page-actions .tag-header-action) {
    height: var(--ui-layout-36, 36px);
    min-width: var(--ui-layout-112, 112px);
    padding: 0 var(--ui-space-14, 14px);
    gap: var(--ui-space-7, 7px);
    border-radius: 10px;
  }
  .detail-state,
  .resource-state {
    min-height: var(--ui-layout-300, 300px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-10, 10px);
    text-align: center;
  }
  .detail-state p,
  .resource-state p {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.55;
  }
  .state-actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .state-symbol {
    width: var(--ui-layout-42, 42px);
    height: var(--ui-layout-42, 42px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-tag-color, #ec4899);
    border-radius: 12px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    font-size: var(--ui-font-21, 21px);
    font-weight: 750;
  }
  .resource-icon {
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
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
    min-height: var(--ui-layout-38, 38px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    flex: 0 0 auto;
  }
  .content-heading {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-1, 1px);
  }
  .content-heading strong {
    color: var(--text-color);
    font-size: var(--ui-font-15, 15px);
  }
  .content-heading span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .view-switch {
    display: flex;
    align-items: center;
    gap: var(--ui-space-3, 3px);
    padding: var(--ui-space-3, 3px);
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
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-11, 11px) var(--ui-space-13, 13px);
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .resource-tabs {
    min-width: 0;
    display: flex;
    gap: var(--ui-space-6, 6px);
    overflow-x: auto;
  }
  .resource-tab {
    flex: 0 0 auto;
    gap: var(--ui-space-6, 6px);
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
    width: min(var(--ui-layout-330, 330px), 32vw);
    flex: 0 0 auto;
  }
  .resource-sort {
    width: var(--ui-layout-142, 142px);
    flex: 0 0 auto;
  }
  .inline-error,
  .graph-error {
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    border: 1px solid var(--danger-color, #fe2c55);
    border-radius: 9px;
    color: var(--danger-color, #fe2c55);
    background: var(--workspace-panel-bg-color);
  }
  .inline-error {
    margin: var(--ui-space-10, 10px) var(--ui-space-12, 12px) 0;
  }
  .resource-list {
    display: grid;
    gap: var(--ui-space-8, 8px);
  }
  .resources-panel > .resource-list {
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px) var(--ui-space-12, 12px);
  }
  .resource-tags {
    display: flex;
    gap: var(--ui-space-5, 5px);
    overflow: hidden;
  }
  .resource-tags span {
    color: var(--resource-tag-color, #ec4899);
    font-size: var(--ui-font-10, 10px);
    white-space: nowrap;
  }
  .resource-open {
    color: var(--desc-color);
    font-size: var(--ui-font-16, 16px);
  }
  .graph-panel {
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }
  .graph-error {
    margin: var(--ui-space-12, 12px);
  }
  .graph-layout {
    height: 100%;
    min-height: var(--ui-layout-520, 520px);
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-300, 300px);
  }
  .skeleton-line {
    height: var(--ui-layout-12, 12px);
    margin: var(--ui-space-10, 10px) 0;
    display: block;
    border-radius: 999px;
    background: var(--skeleton-bg-color, var(--surface-divider-color));
    animation: tag-space-detail-pulse 1.15s ease-in-out infinite alternate;
  }
  .skeleton-line--title {
    width: 58%;
    height: var(--ui-layout-16, 16px);
  }
  .skeleton-line--short {
    width: 38%;
  }
  .resource-skeleton {
    min-height: var(--ui-layout-76, 76px);
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
    min-height: var(--ui-layout-72, 72px);
    padding: var(--ui-space-13, 13px) var(--ui-space-16, 16px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    border-left: 1px solid var(--surface-divider-color);
  }

  .space-stat:first-child {
    border-left: 0;
  }

  .space-stat > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-1, 1px);
  }

  .space-stat strong {
    color: var(--text-color);
    font-size: var(--ui-font-18, 18px);
    line-height: 1.2;
  }

  .space-stat span:last-child {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .resource-icon--tag,
  .related-topic-icon {
    color: var(--resource-tag-color, #ec4899);
  }

  .related-section,
  .resource-group {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
  }

  .space-section-heading {
    min-width: 0;
    min-height: var(--ui-layout-30, 30px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
  }

  .space-section-heading > div {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-7, 7px);
  }

  .space-section-heading strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }

  .space-section-heading > span {
    min-width: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
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
    grid-template-columns: repeat(auto-fill, minmax(var(--ui-layout-220, 220px), 1fr));
    gap: var(--ui-space-9, 9px);
  }

  .related-topic-card {
    min-height: var(--ui-layout-68, 68px);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    cursor: pointer;
  }

  .related-topic-card:hover,
  .related-topic-card:focus-visible {
    border-color: var(--resource-tag-color, #ec4899);
  }

  .related-topic-icon {
    width: var(--ui-layout-36, 36px);
    height: var(--ui-layout-36, 36px);
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
    gap: var(--ui-space-3, 3px);
  }

  .related-topic-card strong,
  .related-topic-card span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .related-topic-card strong {
    font-size: var(--ui-font-14, 14px);
  }

  .related-topic-card > div > span,
  .related-topic-open {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .resources-panel {
    overflow: visible;
  }

  .resource-toolbar {
    margin-bottom: var(--ui-space-18, 18px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background, var(--background-color));
  }

  .grouped-content {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-22, 22px);
  }

  .resource-group__heading {
    position: relative;
    padding-inline: var(--ui-space-2, 2px);
  }

  .resource-group__all {
    margin-left: auto;
    flex: 0 0 auto;
    color: var(--resource-tag-color, #ec4899);
  }

  .resource-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--ui-layout-270, 270px), 1fr));
    gap: var(--ui-space-10, 10px);
  }

  .resource-card-grid--results {
    padding-bottom: var(--ui-space-6, 6px);
  }

  .space-resource-card {
    --space-resource-accent: var(--resource-bookmark-color, #615ced);
    min-height: var(--ui-layout-164, 164px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
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
    gap: var(--ui-space-9, 9px);
  }

  .space-resource-card__top > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
  }

  .space-resource-card__top > div > span {
    color: var(--space-resource-accent);
    font-size: var(--ui-font-10, 10px);
    font-weight: 650;
  }

  .space-resource-card__top strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .space-resource-card > p {
    min-height: var(--ui-layout-38, 38px);
    margin: 0;
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .space-resource-card footer {
    min-width: 0;
    margin-top: auto;
    padding-top: var(--ui-space-9, 9px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
    border-top: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
  }

  .space-resource-card footer span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .grouped-error {
    margin: 0 0 var(--ui-space-14, 14px);
  }

  .resource-group__empty {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .skeleton-line--group-title {
    width: var(--ui-layout-160, 160px);
    height: var(--ui-layout-16, 16px);
    margin: 0;
  }

  .resource-sentinel {
    min-height: var(--ui-layout-46, 46px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: var(--ui-space-8, 8px);
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
      gap: var(--ui-space-9, 9px);
      overflow-x: hidden;
      scrollbar-gutter: auto;
    }
    .content-section-header {
      padding-inline: var(--ui-space-2, 2px);
    }
    .space-stat {
      min-height: var(--ui-layout-62, 62px);
      padding: var(--ui-space-10, 10px) var(--ui-space-11, 11px);
      gap: var(--ui-space-7, 7px);
    }
    .space-stat .resource-icon {
      width: var(--ui-layout-30, 30px);
      height: var(--ui-layout-30, 30px);
    }
    .space-stat strong {
      font-size: var(--ui-font-16, 16px);
    }
    .space-section-heading {
      align-items: flex-start;
      flex-wrap: wrap;
      gap: var(--ui-space-3, 3px) var(--ui-space-8, 8px);
    }
    .space-section-heading > span {
      width: 100%;
      padding-left: var(--ui-space-14, 14px);
    }
    .related-topic-grid,
    .resource-card-grid {
      grid-template-columns: 1fr;
    }
    .related-topic-card {
      min-height: var(--ui-layout-64, 64px);
    }
    .grouped-content {
      gap: var(--ui-space-18, 18px);
    }
    .resource-group__all {
      margin-left: auto;
    }
    .resource-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: var(--ui-space-9, 9px);
      padding: var(--ui-space-11, 11px) 0;
    }
    .resource-tabs {
      padding-inline: var(--ui-space-12, 12px);
    }
    .resource-search {
      width: auto;
      margin-inline: var(--ui-space-12, 12px);
    }
    .resource-sort {
      width: auto;
      margin-inline: var(--ui-space-12, 12px);
    }
    .inline-error {
      margin: var(--ui-space-9, 9px) var(--ui-space-12, 12px) 0;
    }
    .grouped-error {
      margin: 0 0 var(--ui-space-12, 12px);
    }
    .resources-panel > .resource-list {
      padding-inline: var(--ui-space-9, 9px);
    }
    .resource-state {
      min-height: var(--ui-layout-260, 260px);
      margin-inline: var(--ui-space-9, 9px);
    }
    .graph-layout {
      min-height: var(--ui-layout-460, 460px);
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

  @media (min-width: 1200px) {
    .tag-space-shell {
      background: var(--background-color);
    }
  }

  .tag-space-workspace {
    --tag-workspace-heading-offset: 0px;
    --tag-profile-height: var(--ui-layout-120, 120px);

    height: 100%;
    min-height: 0;
    display: grid;
    position: relative;
    grid-template-columns: var(--ui-layout-220, 220px) minmax(0, 1fr);
    align-items: stretch;
    gap: var(--ui-space-18, 18px);
  }

  .tag-space-workspace.has-ai {
    grid-template-columns: var(--ui-layout-220, 220px) minmax(0, 1fr) var(--ui-layout-360, 360px);
  }

  .tag-directory-rail,
  .tag-ai-rail {
    position: relative;
    min-width: 0;
    min-height: 0;
    max-height: none;
  }

  .tag-directory-rail {
    height: 100%;
    padding: var(--ui-space-12, 12px) var(--ui-space-11, 11px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
  }

  .rail-footer {
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
    border: 1px solid transparent;
    background: transparent;
  }

  .rail-search {
    flex: 0 0 auto;
    margin-bottom: var(--ui-space-8, 8px);
  }

  .rail-directory-state {
    margin: 0;
    padding: var(--ui-space-8, 8px) var(--ui-space-7, 7px);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-8, 8px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    overflow-wrap: anywhere;
  }

  .rail-section {
    margin-top: var(--ui-space-10, 10px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-3, 3px);
  }

  .rail-section :deep(.b-action-menu-anchor) {
    width: 100%;
  }

  .rail-section--directory {
    min-height: 0;
    flex: 1;
    padding-right: var(--ui-space-2, 2px);
    overflow: auto;
  }

  .rail-section--directory .rail-section__label {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .rail-section__label {
    padding: 0 var(--ui-space-7, 7px) var(--ui-space-5, 5px);
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
    font-weight: 650;
  }

  .rail-footer {
    min-height: var(--ui-layout-36, 36px);
    margin-top: auto;
    padding: var(--ui-space-8, 8px);
    gap: var(--ui-space-7, 7px);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .tag-space-main {
    position: relative;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-9, 9px);
    overflow: hidden;
  }

  .workspace-back {
    display: none;
    width: var(--ui-layout-38, 38px);
    min-width: var(--ui-layout-38, 38px);
    height: var(--ui-layout-38, 38px);
    padding: 0;
    color: var(--text-color);
    background: transparent;
  }

  .tag-profile-card {
    min-height: var(--tag-profile-height);
    padding: var(--ui-space-15, 15px) !important;
    display: grid;
    grid-template-columns: minmax(var(--ui-layout-300, 300px), 1.2fr) minmax(var(--ui-layout-410, 410px), 1fr);
    align-items: center;
    gap: var(--ui-space-12, 12px) var(--ui-space-20, 20px);
    overflow: hidden;
  }

  .tag-profile-main {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-14, 14px);
  }

  .tag-profile-icon {
    width: var(--ui-layout-62, 62px);
    height: var(--ui-layout-62, 62px);
    padding: var(--ui-space-10, 10px);
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
    padding: var(--ui-space-8, 8px);
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
    gap: var(--ui-space-8, 8px);
  }

  .tag-profile-title-row h2 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    flex: 1 1 auto;
    color: var(--text-color);
    font-size: var(--ui-font-21, 21px);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-tag-profile-actions,
  .mobile-tag-edit,
  .mobile-tag-ai,
  .mobile-tag-switcher {
    display: none;
  }

  .tag-profile-identity p {
    max-width: var(--ui-layout-560, 560px);
    margin: var(--ui-space-5, 5px) 0 0;
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
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
    grid-template-columns: 1.25fr repeat(4, 1fr);
  }

  .profile-stat {
    min-width: 0;
    padding: var(--ui-space-2, 2px) var(--ui-space-13, 13px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    border-left: 1px solid var(--surface-divider-color);
  }

  .profile-stat span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-stat strong {
    color: var(--text-color);
    font-size: var(--ui-font-18, 18px);
    line-height: 1.1;
  }

  .profile-stat--total {
    border-left: 0;
  }

  .profile-stat--total strong {
    font-size: var(--ui-font-22, 22px);
  }

  .tag-profile-meta {
    min-width: 0;
    margin-top: var(--ui-space-7, 7px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
  }

  .space-primary-tabs {
    min-height: var(--ui-layout-39, 39px);
    display: flex;
    align-items: flex-end;
    gap: var(--ui-space-4, 4px);
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .space-primary-tab {
    position: relative;
    min-height: var(--ui-layout-38, 38px);
    padding: var(--ui-space-6, 6px) var(--ui-space-13, 13px);
    gap: var(--ui-space-6, 6px);
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
    min-width: var(--ui-layout-20, 20px);
    height: var(--ui-layout-19, 19px);
    padding: 0 var(--ui-space-6, 6px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: inherit;
    background: var(--workspace-panel-bg-color);
    font-size: var(--ui-font-10, 10px);
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
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
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
    min-height: var(--ui-layout-30, 30px);
    padding: var(--ui-space-4, 4px) var(--ui-space-11, 11px);
    gap: var(--ui-space-5, 5px);
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
    font-size: var(--ui-font-10, 10px);
  }

  .resource-search {
    width: min(var(--ui-layout-280, 280px), 28vw);
  }

  .resource-sort {
    width: var(--ui-layout-126, 126px);
  }

  .grouped-resource-stream {
    padding: var(--ui-space-14, 14px) var(--ui-space-2, 2px) var(--ui-space-4, 4px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-18, 18px);
  }

  .grouped-content--loading,
  .filtered-loading {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
  }

  .filtered-loading {
    padding: var(--ui-space-12, 12px);
  }

  .resource-group {
    gap: var(--ui-space-8, 8px);
  }

  .resource-group-heading {
    min-height: var(--ui-layout-28, 28px);
    padding-inline: var(--ui-space-3, 3px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }

  .resource-group-heading strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }

  .resource-group-heading > span:last-child {
    min-width: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
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
    min-height: var(--ui-layout-28, 28px);
  }

  .space-section-heading > span {
    margin-right: auto;
  }

  .resource-group__all {
    margin-left: 0;
    color: var(--primary-color);
  }

  .resource-stream {
    --tag-resource-hover-bg: color-mix(
      in srgb,
      var(--surface-panel-bg, var(--workspace-panel-bg-color)) 88%,
      var(--card-background)
    );

    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    border: 1px solid var(--surface-divider-color, var(--card-border-color));
    border-radius: 11px;
  }

  .resource-stream :deep(.tag-space-resource-row) {
    min-height: var(--ui-layout-62, 62px);
    border: 0;
    border-bottom: 1px solid var(--surface-divider-color, var(--card-border-color));
    border-radius: 0;
    box-shadow: none;
  }

  .resource-stream :deep(.tag-space-resource-row:last-child) {
    border-bottom: 0;
  }

  .resource-stream :deep(.tag-space-resource-row:hover),
  .resource-stream :deep(.tag-space-resource-row:focus-visible) {
    background: var(--tag-resource-hover-bg);
    box-shadow: none;
  }

  .filtered-resource-stream {
    padding: var(--ui-space-12, 12px);
  }

  .inline-error {
    margin: var(--ui-space-10, 10px) var(--ui-space-12, 12px) 0;
  }

  .resource-state {
    min-height: var(--ui-layout-250, 250px);
    border: 0;
    background: transparent;
  }

  .resource-state--compact {
    min-height: var(--ui-layout-260, 260px);
  }

  .resource-group__empty {
    padding: var(--ui-space-14, 14px);
    border: 1px dashed var(--surface-border-color);
    border-radius: 10px;
  }

  .resource-sentinel {
    min-height: var(--ui-layout-46, 46px);
  }

  .panel-heading {
    min-height: var(--ui-layout-48, 48px);
    display: flex;
    align-items: center;
  }

  .panel-heading > div {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
  }

  .panel-heading strong {
    color: var(--text-color);
    font-size: var(--ui-font-15, 15px);
  }

  .panel-heading span {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .related-topic-grid--panel {
    margin-top: var(--ui-space-12, 12px);
    grid-template-columns: repeat(auto-fill, minmax(var(--ui-layout-230, 230px), 1fr));
  }

  .related-topic-card {
    min-height: var(--ui-layout-76, 76px);
  }

  .graph-panel {
    min-height: 0;
    flex: 1 1 auto;
  }

  .graph-layout {
    min-height: 0;
  }

  .tag-ai-rail {
    height: 100%;
    min-height: 0;
  }

  .tag-ai-panel {
    --ai-skill-panel-gap: var(--ui-space-9, 9px);
    --ai-skill-panel-padding: var(--ui-space-13, 13px);
    --ai-skill-action-section-gap: 0;
    --ai-skill-actions-wrap: nowrap;
    --ai-skill-actions-gap: var(--ui-space-6, 6px);
    --ai-skill-actions-overflow-x: auto;
    --ai-skill-actions-scrollbar-width: none;
    --ai-skill-actions-scrollbar-height: 0;
    --ai-skill-action-min-height: var(--ui-layout-30, 30px);
    --ai-skill-action-padding: var(--ui-space-4, 4px);
    --ai-skill-action-font-size: var(--ui-font-12, 12px);
    --ai-skill-action-white-space: nowrap;
    --ai-skill-chat-composer-min-height: var(--ui-layout-64, 64px);
    --ai-skill-chat-composer-max-height: var(--ui-layout-104, 104px);
    --ai-skill-chat-composer-padding: var(--ui-space-10, 10px) var(--ui-space-66, 66px) var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    --ai-skill-chat-composer-action-right: var(--ui-space-8, 8px);
    --ai-skill-chat-composer-action-bottom: var(--ui-space-8, 8px);

    height: 100%;
    box-sizing: border-box;
  }

  .tag-ai-result {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-10, 10px);
  }

  .tag-ai-result__tools,
  .tag-ai-preview__tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--ui-space-6, 6px);
  }

  .tag-ai-result__tools {
    position: sticky;
    z-index: 2;
    top: 0;
    padding-bottom: var(--ui-space-8, 8px);
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--workspace-panel-bg-color);
  }

  .tag-ai-result__tools :deep(.b_btn),
  .tag-ai-preview__tools :deep(.b_btn) {
    min-height: var(--ui-layout-30, 30px);
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    padding-inline: var(--ui-space-8, 8px);
  }

  .tag-ai-preview {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .tag-ai-preview__tools {
    flex: 0 0 auto;
    padding: var(--ui-space-10, 10px) var(--ui-space-16, 16px);
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--card-background);
  }

  .tag-ai-preview__body {
    min-height: 0;
    padding: var(--ui-space-22, 22px) clamp(var(--ui-space-18, 18px), 5vw, var(--ui-space-56, 56px)) var(--ui-space-32, 32px);
    overflow: auto;
  }

  :global(.tag-ai-preview-modal__content) {
    padding: 0;
    overflow: hidden;
  }

  .tag-switching-status {
    position: absolute;
    z-index: 8;
    right: 12px;
    bottom: 12px;
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    pointer-events: none;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
  }

  .related-panel {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
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

  .skeleton-ai-panel {
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-9, 9px);
  }

  .skeleton-ai-heading {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-10, 10px);
  }

  .skeleton-ai-heading > div {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
  }

  .skeleton-block--ai-icon {
    width: var(--ui-layout-36, 36px);
    height: var(--ui-layout-36, 36px);
    flex: 0 0 var(--ui-layout-36, 36px);
    border-radius: 11px;
  }

  .skeleton-block--ai-title {
    width: var(--ui-layout-78, 78px);
    height: var(--ui-layout-12, 12px);
  }

  .skeleton-block--ai-description {
    width: 92%;
    height: var(--ui-layout-9, 9px);
  }

  .skeleton-block--ai-scope {
    width: var(--ui-layout-136, 136px);
    height: var(--ui-layout-27, 27px);
  }

  .skeleton-ai-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-6, 6px);
  }

  .skeleton-block--ai-action {
    height: var(--ui-layout-30, 30px);
    border-radius: 9px;
  }

  .skeleton-block--ai-result {
    min-height: var(--ui-layout-120, 120px);
    flex: 1 1 auto;
    border-radius: 10px;
  }

  .skeleton-block--ai-composer {
    height: var(--ui-layout-64, 64px);
    flex: 0 0 var(--ui-layout-64, 64px);
    border-radius: 15px;
  }

  .tag-directory-rail--skeleton {
    gap: var(--ui-space-10, 10px);
  }

  .skeleton-directory-row {
    min-width: 0;
    min-height: var(--ui-layout-38, 38px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }

  .skeleton-directory-list {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-3, 3px);
  }

  .skeleton-block--directory-icon {
    width: var(--ui-layout-24, 24px);
    height: var(--ui-layout-24, 24px);
    flex: 0 0 auto;
    border-radius: 7px;
  }

  .skeleton-block--directory-search {
    width: 100%;
    height: var(--ui-layout-32, 32px);
    flex: 0 0 auto;
    margin-bottom: var(--ui-space-8, 8px);
    border-radius: 8px;
  }

  .skeleton-block--directory-name {
    width: min(var(--ui-layout-96, 96px), 64%);
    height: var(--ui-layout-10, 10px);
  }

  .skeleton-block--directory-count {
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-9, 9px);
    margin-left: auto;
  }

  .skeleton-block--directory-label {
    width: var(--ui-layout-52, 52px);
    height: var(--ui-layout-8, 8px);
    margin: var(--ui-space-2, 2px) var(--ui-space-7, 7px) 0;
  }

  .skeleton-profile-card {
    min-height: var(--tag-profile-height);
    padding: var(--ui-space-15, 15px) !important;
    display: grid;
    grid-template-columns: minmax(var(--ui-layout-280, 280px), 1.2fr) minmax(var(--ui-layout-340, 340px), 1fr);
    align-items: center;
    gap: var(--ui-space-18, 18px);
  }

  .skeleton-profile-identity {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-14, 14px);
  }

  .skeleton-block--profile-icon {
    width: var(--ui-layout-58, 58px);
    height: var(--ui-layout-58, 58px);
    flex: 0 0 auto;
    border-radius: 14px;
  }

  .skeleton-profile-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-9, 9px);
  }

  .skeleton-block--profile-title {
    width: 34%;
    height: var(--ui-layout-17, 17px);
  }

  .skeleton-block--profile-description {
    width: 86%;
    height: var(--ui-layout-11, 11px);
  }

  .skeleton-block--profile-meta {
    width: 48%;
    height: var(--ui-layout-8, 8px);
  }

  .skeleton-profile-stats {
    display: grid;
    grid-template-columns: 1.25fr repeat(4, 1fr);
  }

  .skeleton-profile-stat {
    min-width: 0;
    padding: var(--ui-space-3, 3px) var(--ui-space-12, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    border-left: 1px solid var(--surface-divider-color);
  }

  .skeleton-profile-stat:first-child {
    border-left: 0;
  }

  .skeleton-block--stat-label {
    width: 72%;
    height: var(--ui-layout-8, 8px);
  }

  .skeleton-block--stat-value {
    width: var(--ui-layout-30, 30px);
    height: var(--ui-layout-18, 18px);
  }

  .skeleton-primary-tabs {
    min-height: var(--ui-layout-39, 39px);
    padding: 0 var(--ui-space-8, 8px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-24, 24px);
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .skeleton-block--tab {
    width: var(--ui-layout-72, 72px);
    height: var(--ui-layout-11, 11px);
  }

  .skeleton-resources-panel {
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .skeleton-resource-toolbar {
    min-height: var(--ui-layout-50, 50px);
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .skeleton-resource-filters {
    min-width: 0;
    display: flex;
    gap: var(--ui-space-7, 7px);
  }

  .skeleton-block--filter {
    width: var(--ui-layout-64, 64px);
    height: var(--ui-layout-30, 30px);
    border-radius: 8px;
  }

  .skeleton-block--search {
    width: min(var(--ui-layout-300, 300px), 28%);
    height: var(--ui-layout-32, 32px);
    margin-left: auto;
    border-radius: 8px;
  }

  .skeleton-block--sort {
    width: var(--ui-layout-110, 110px);
    height: var(--ui-layout-32, 32px);
    border-radius: 8px;
  }

  .skeleton-resource-group {
    padding: var(--ui-space-12, 12px) var(--ui-space-12, 12px) 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
  }

  .skeleton-resource-group:last-child {
    padding-bottom: var(--ui-space-14, 14px);
  }

  .skeleton-resource-heading {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }

  .skeleton-block--group-dot {
    width: 8px;
    height: 8px;
  }

  .skeleton-block--group-title {
    width: var(--ui-layout-88, 88px);
    height: var(--ui-layout-11, 11px);
  }

  .skeleton-block--group-hint {
    width: var(--ui-layout-150, 150px);
    height: var(--ui-layout-9, 9px);
  }

  .skeleton-row {
    min-height: var(--ui-layout-66, 66px);
    display: block;
    border-radius: 11px;
    background: var(--skeleton-bg-color, var(--surface-divider-color));
    animation: tag-space-detail-pulse 1.15s ease-in-out infinite alternate;
  }

  @media (max-width: 1500px) {
    .tag-space-workspace {
      --tag-workspace-heading-offset: 0px;
      --tag-profile-height: var(--ui-layout-112, 112px);

      grid-template-columns: var(--ui-layout-196, 196px) minmax(0, 1fr);
      gap: var(--ui-space-13, 13px);
    }

    .tag-space-workspace.has-ai {
      grid-template-columns: var(--ui-layout-196, 196px) minmax(0, 1fr) var(--ui-layout-324, 324px);
    }

    .workspace-heading {
      min-height: var(--ui-layout-34, 34px);
    }

    .workspace-heading h1 {
      font-size: var(--ui-font-19, 19px);
    }

    .workspace-heading p {
      font-size: var(--ui-font-11, 11px);
    }

    .tag-profile-card {
      padding: var(--ui-space-13, 13px) !important;
      grid-template-columns: minmax(var(--ui-layout-260, 260px), 1fr) minmax(var(--ui-layout-360, 360px), 0.95fr);
      gap: var(--ui-space-12, 12px);
    }

    .skeleton-profile-card {
      padding: var(--ui-space-13, 13px) !important;
      grid-template-columns: minmax(var(--ui-layout-260, 260px), 1fr) minmax(var(--ui-layout-320, 320px), 0.95fr);
      gap: var(--ui-space-12, 12px);
    }

    .tag-profile-icon {
      width: var(--ui-layout-56, 56px);
      height: var(--ui-layout-56, 56px);
    }

    .profile-stat {
      padding-inline: var(--ui-space-9, 9px);
    }
  }

  @media (max-height: 800px) and (min-width: 768px) {
    .tag-space-workspace {
      --tag-workspace-heading-offset: 0px;
      --tag-profile-height: var(--ui-layout-104, 104px);
    }

    .tag-space-main {
      gap: var(--ui-space-7, 7px);
    }

    .workspace-heading {
      min-height: var(--ui-layout-27, 27px);
    }

    .workspace-heading p {
      display: none;
    }

    .tag-profile-card {
      padding: var(--ui-space-11, 11px) !important;
    }

    .tag-profile-icon {
      width: var(--ui-layout-50, 50px);
      height: var(--ui-layout-50, 50px);
      padding: var(--ui-space-8, 8px);
      border-radius: 12px;
    }

    .tag-profile-identity h2 {
      font-size: var(--ui-font-19, 19px);
    }

    .tag-profile-identity p {
      margin-top: var(--ui-space-3, 3px);
      line-height: 1.4;
      -webkit-line-clamp: 1;
    }

    .tag-profile-side {
      gap: var(--ui-space-7, 7px);
    }

    .profile-stat {
      padding-inline: var(--ui-space-8, 8px);
      gap: var(--ui-space-3, 3px);
    }

    .profile-stat strong {
      font-size: var(--ui-font-17, 17px);
    }

    .profile-stat--total strong {
      font-size: var(--ui-font-20, 20px);
    }

    .tag-profile-meta {
      margin-top: var(--ui-space-4, 4px);
    }

    .space-primary-tabs {
      min-height: var(--ui-layout-35, 35px);
    }

    .space-primary-tab {
      min-height: var(--ui-layout-34, 34px);
      padding-block: var(--ui-space-5, 5px);
    }

    .resource-toolbar {
      padding: var(--ui-space-6, 6px) var(--ui-space-9, 9px);
    }

    .grouped-content {
      padding-top: var(--ui-space-10, 10px);
      gap: var(--ui-space-14, 14px);
    }
  }

  @media (max-width: 1260px) {
    .tag-space-workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .tag-space-workspace.has-ai {
      grid-template-columns: minmax(0, 1fr) var(--ui-layout-310, 310px);
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
    .tag-space-workspace.has-ai {
      grid-template-columns: minmax(0, 1fr);
    }

    .tag-ai-rail {
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
      min-height: var(--ui-layout-44, 44px);
    }

    .workspace-heading h1 {
      font-size: var(--ui-font-19, 19px);
    }

    .workspace-heading p {
      display: none;
    }

    .tag-profile-card {
      min-height: 0;
      padding: var(--ui-space-14, 14px) !important;
      grid-template-columns: 1fr;
      gap: var(--ui-space-14, 14px);
    }

    .skeleton-profile-card {
      min-height: 0;
      padding: var(--ui-space-14, 14px) !important;
      grid-template-columns: 1fr;
      gap: var(--ui-space-14, 14px);
    }

    .skeleton-profile-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border: 1px solid var(--surface-border-color);
      border-radius: 10px;
      overflow: hidden;
    }

    .skeleton-profile-stat {
      min-height: var(--ui-layout-54, 54px);
      padding: var(--ui-space-9, 9px) var(--ui-space-11, 11px);
      box-sizing: border-box;
    }

    .skeleton-profile-stat:nth-child(odd) {
      border-left: 0;
    }

    .skeleton-profile-stat:nth-child(n + 3) {
      border-top: 1px solid var(--surface-divider-color);
    }

    .skeleton-resource-toolbar {
      padding: var(--ui-space-10, 10px);
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
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--ui-space-4, 4px);
    }

    .workspace-back {
      width: var(--ui-layout-44, 44px);
      min-width: var(--ui-layout-44, 44px);
      height: var(--ui-layout-44, 44px);
    }

    .tag-profile-identity {
      display: contents;
    }

    .tag-profile-title-row {
      display: block;
      flex: 1 1 auto;
      width: max-content;
      max-width: calc(100% - var(--ui-layout-80, 80px));
    }

    .tag-profile-title-row h2 {
      overflow: visible;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .tag-title-reset.b_btn {
      width: 100%;
      min-width: 0;
      justify-content: flex-start;
      text-align: left;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .tag-profile-identity p,
    .tag-profile-meta {
      flex-basis: 100%;
    }

    .mobile-tag-profile-actions {
      margin-left: auto;
      justify-content: flex-end;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      gap: var(--ui-space-2, 2px);
    }

    .mobile-tag-edit,
    .mobile-tag-ai {
      width: var(--ui-layout-44, 44px);
      min-width: var(--ui-layout-44, 44px);
      height: var(--ui-layout-44, 44px);
      padding: 0;
      display: inline-flex;
      color: var(--desc-color);
      border-color: transparent;
      background: transparent;
    }

    .mobile-tag-ai {
      color: var(--primary-color);
      border-color: var(--primary-color);
      background: var(--primary-light-1);
    }

    .tag-title-reset.mobile-tag-switcher {
      min-height: var(--ui-layout-44, 44px);
      height: auto;
      display: flex;
      gap: var(--ui-space-4, 4px);
    }

    .mobile-tag-name {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .mobile-tag-chevron {
      flex-shrink: 0;
    }

    .mobile-tag-edit:focus-visible,
    .mobile-tag-ai:focus-visible,
    .mobile-tag-switcher:focus-visible {
      border-color: currentColor;
    }

    .tag-profile-icon {
      margin-top: var(--ui-space-8, 8px);
      width: var(--ui-layout-28, 28px);
      height: var(--ui-layout-28, 28px);
      padding: var(--ui-space-3, 3px);
      border-radius: 6px;
      box-shadow: none;
    }

    .tag-profile-icon.has-custom-icon {
      padding: var(--ui-space-3, 3px);
    }

    .tag-profile-identity h2 {
      font-size: var(--ui-font-18, 18px);
    }

    .tag-profile-identity p {
      margin-top: var(--ui-space-5, 5px);
      -webkit-line-clamp: 3;
    }

    .tag-profile-stats {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: var(--ui-space-10, 10px) 0;
      padding-top: var(--ui-space-10, 10px);
      border-top: 1px solid var(--surface-divider-color);
    }

    .profile-stat {
      grid-column: span 2;
      min-height: 0;
      padding: 0 var(--ui-space-10, 10px);
      gap: var(--ui-space-3, 3px);
    }

    .profile-stat:nth-child(-n + 2) {
      grid-column: span 3;
    }

    .profile-stat:nth-child(3) {
      border-left: 0;
    }

    .profile-stat--total strong,
    .profile-stat strong {
      font-size: var(--ui-font-17, 17px);
    }

    .tag-profile-meta {
      margin-top: var(--ui-space-2, 2px);
      padding-top: 0;
      flex-wrap: wrap;
    }

    .space-primary-tabs {
      min-width: 0;
      overflow-x: auto;
    }

    .space-primary-tab {
      flex: 0 0 auto;
      padding-inline: var(--ui-space-11, 11px);
    }

    .resource-toolbar {
      margin: 0;
      padding: var(--ui-space-10, 10px);
      align-items: stretch;
      flex-direction: column;
      gap: var(--ui-space-8, 8px);
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
      padding: var(--ui-space-11, 11px) var(--ui-space-9, 9px) var(--ui-space-14, 14px);
    }

    .resource-group-heading {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .resource-group-heading > span:last-child {
      width: calc(100% - 15px);
      margin-left: var(--ui-space-15, 15px);
      white-space: normal;
    }

    .space-section-heading {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .space-section-heading > span {
      width: 100%;
      padding-left: var(--ui-space-14, 14px);
    }

    .resource-group__all {
      position: absolute;
      right: 2px;
    }

    .related-panel {
      padding: var(--ui-space-13, 13px) !important;
    }

    .related-topic-grid--panel {
      grid-template-columns: 1fr;
    }

    .graph-panel,
    .graph-layout {
      min-height: var(--ui-layout-470, 470px);
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
  .profile-stat small {
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
    line-height: 1.4;
  }

  // 共享工作区表面：仅改变颜色，布局与滚动由原组件负责。
  .tag-directory-rail, .tag-space-main, .rail-section--directory .rail-section__label {
    .workspace-open-surface();
  }
  .tag-profile-card, .tag-ai-panel, .resource-stream, .resource-stream :deep(.tag-space-resource-row), .skeleton-profile-card, .skeleton-ai-panel {
    .workspace-content-surface();
  }
</style>
