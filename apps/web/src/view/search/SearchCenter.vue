<template>
  <div class="search-center-route">
    <!-- 资源中心一级导航：全部资源 / 整理中心 / 知识地图。 -->
    <ResourceCenterTopBar
      v-if="bookmark.isMobile && !isKnowledgeMapView"
      :keyword="queryState.keyword"
      input-id="mobile-search-page-input"
      show-menu
      :selection-mode="batchMode"
      selection-variant="basic"
      :selected-count="selectedCount"
      :allow-sort="false"
      :create-label="t('inbox.quickCapture')"
      @update:keyword="onMobileSearchKeyword"
      @submit="submitSearch"
      @back="leaveSearchPage"
      @create="inbox.openQuickCapture()"
      @batch="toggleBatchMode"
      @filter="mobileFilterVisible = true"
      @cancel-selection="exitBatchMode"
    />

    <ResourcePageShell
      class="search-center-shell"
      :title="t('resourceCenter.title')"
      :subtitle="t('resourceCenter.subtitle')"
      accent="neutral"
      layout="workspace"
      :class="{ 'search-center-shell--mobile': bookmark.isMobile }"
    >
      <template v-if="!bookmark.isMobile" #actions>
        <ResourceCenterSectionNav class="section-switcher" />
      </template>

      <div
        class="search-page"
        :class="{
          'search-page--night': user.currentTheme === 'night',
          'search-page--mobile': bookmark.isMobile,
        }"
      >
        <div v-if="bookmark.isMobile" class="search-page-topbar">
          <ResourceCenterSectionNav class="section-switcher" />
        </div>

        <template v-if="!isKnowledgeMapView">
          <section class="search-layout">
            <aside v-if="!bookmark.isMobile" class="resource-scope-pane" :aria-label="t('resourceCenter.scopeTitle')">
              <section class="resource-scope-section">
                <BButton
                  class="resource-scope-title"
                  :aria-expanded="scopeTypesExpanded"
                  :title="t(scopeTypesExpanded ? 'common.collapse' : 'common.expand')"
                  @click="scopeTypesExpanded = !scopeTypesExpanded"
                >
                  <span>{{ t('resourceCenter.scopeTitle') }}</span>
                  <SvgIcon
                    class="resource-scope-chevron"
                    :class="{ 'is-expanded': scopeTypesExpanded }"
                    :src="icon.noteTree.chevron"
                    size="13"
                    aria-hidden="true"
                  />
                </BButton>
                <div v-show="scopeTypesExpanded" class="resource-scope-list">
                  <BButton
                    v-for="item in typeFilters"
                    :key="item.value"
                    class="resource-scope-item"
                    :class="{ active: isTypeFilterActive(item.value) }"
                    :aria-pressed="isTypeFilterActive(item.value)"
                    @click="selectDesktopType(item.value)"
                  >
                    <span class="filter-dot" :class="`filter-dot--${item.value}`" aria-hidden="true"></span>
                    <span class="resource-scope-item__label">{{ item.label }}</span>
                    <span class="filter-count">{{ item.count }}</span>
                  </BButton>
                </div>
              </section>
              <div class="resource-scope-divider"></div>
              <section class="resource-scope-section">
                <BButton
                  class="resource-scope-title"
                  :aria-expanded="scopeStateExpanded"
                  :title="t(scopeStateExpanded ? 'common.collapse' : 'common.expand')"
                  @click="scopeStateExpanded = !scopeStateExpanded"
                >
                  <span>{{ t('resourceCenter.resourceState') }}</span>
                  <SvgIcon
                    class="resource-scope-chevron"
                    :class="{ 'is-expanded': scopeStateExpanded }"
                    :src="icon.noteTree.chevron"
                    size="13"
                    aria-hidden="true"
                  />
                </BButton>
                <div v-show="scopeStateExpanded" class="resource-scope-list">
                  <BButton
                    class="resource-scope-item"
                    :class="{ active: queryState.untagged }"
                    :aria-pressed="queryState.untagged"
                    @click="toggleUntagged"
                  >
                    <span class="filter-dot" aria-hidden="true"></span>
                    <span class="resource-scope-item__label">{{ t('resourceCenter.untagged') }}</span>
                  </BButton>
                </div>
              </section>
            </aside>

            <BCard v-if="!bookmark.isMobile" as="section" variant="raised" padding="16px 20px" class="search-header">
              <div class="search-header-input">
                <b-input
                  id="search-center-input"
                  v-model:value="queryState.keyword"
                  :placeholder="t('resourceCenter.searchPlaceholder')"
                  height="42px"
                  @input="syncQueryDebounced"
                  @enter="submitSearch"
                >
                  <template #prefix>
                    <svg-icon :src="icon.navigation.search" size="18" />
                  </template>
                </b-input>

                <div class="desktop-result-controls">
                  <label class="select-wrap select-wrap--compact">
                    <span>{{ t('resourceCenter.sort.label') }}</span>
                    <BSelect
                      class="filter-select"
                      :options="sortOptions"
                      v-model:value="queryState.sort"
                      @change="applyQueryState('切换排序')"
                    />
                  </label>
                  <label class="select-wrap select-wrap--compact">
                    <span>{{ t('resourceCenter.date.label') }}</span>
                    <BSelect
                      class="filter-select"
                      :options="dateOptions"
                      v-model:value="queryState.date"
                      @change="applyQueryState('筛选时间范围')"
                    />
                  </label>
                  <div class="view-switch">
                    <BButton class="view-btn" :class="{ active: queryState.view === 'card' }" @click="setView('card')">
                      {{ t('resourceCenter.view.cardShort') }}
                    </BButton>
                    <BButton class="view-btn" :class="{ active: queryState.view === 'list' }" @click="setView('list')">
                      {{ t('resourceCenter.view.listShort') }}
                    </BButton>
                  </div>
                  <BButton class="tagless-btn" :class="{ active: queryState.untagged }" @click="toggleUntagged">
                    {{ t('resourceCenter.untagged') }}
                  </BButton>
                </div>

                <BTooltip :title="t('resourceCenter.refresh')">
                  <BButton
                    class="search-header-icon-btn refresh-btn"
                    :disabled="viewState.loading"
                    :aria-label="t('resourceCenter.refresh')"
                    @click="refreshData()"
                    v-click-log="{ module: '资源中心', operation: '刷新搜索结果' }"
                  >
                    <span
                      class="refresh-icon"
                      :class="{ 'refresh-icon--spinning': viewState.loading }"
                      aria-hidden="true"
                    >
                      <SvgIcon :src="icon.cloudSpace.preview.retry" size="17" />
                    </span>
                  </BButton>
                </BTooltip>
              </div>
            </BCard>

            <!-- 移动端不放一排类型 Tab：用户搜索时先看最佳匹配，而不是先决定类型。
               类型收进底部筛选抽屉，这里只保留一行类型数量作为结果概览。 -->
            <BCard as="main" variant="card" padding="16px" class="result-panel">
              <div class="result-toolbar result-toolbar--summary">
                <div class="result-heading">
                  <template v-if="bookmark.isMobile">
                    <div class="result-title">{{ t('resourceCenter.results') }}</div>
                    <div class="result-subtitle">{{ mobileResultSubtitle }}</div>
                  </template>
                  <div v-else class="desktop-result-heading">
                    <strong>{{ desktopTypeSummary.label }}</strong>
                    <span>{{ t('resourceCenter.count', { count: desktopTypeSummary.count }) }}</span>
                  </div>
                </div>
                <div v-if="bookmark.isMobile" class="toolbar-actions toolbar-actions--mobile">
                  <BButton
                    class="mobile-toolbar-btn mobile-toolbar-btn--icon"
                    :disabled="viewState.loading"
                    :aria-label="t('resourceCenter.refresh')"
                    :title="t('resourceCenter.refresh')"
                    @click="refreshData()"
                    v-click-log="{ module: '资源中心', operation: '刷新搜索结果' }"
                  >
                    <span
                      class="refresh-icon"
                      :class="{ 'refresh-icon--spinning': viewState.loading }"
                      aria-hidden="true"
                    >
                      <SvgIcon :src="icon.cloudSpace.preview.retry" size="16" />
                    </span>
                  </BButton>
                  <BButton
                    class="mobile-toolbar-btn mobile-filter-btn"
                    :class="{ active: mobileActiveFilterCount > 0 }"
                    @click="mobileFilterVisible = true"
                    v-click-log="{ module: '资源中心', operation: '打开移动端筛选' }"
                  >
                    <SvgIcon :src="icon.cloudSpace.filter" size="15" aria-hidden="true" />
                    <span>{{ t('common.filter') }}</span>
                    <span v-if="mobileActiveFilterCount" class="mobile-filter-count">{{
                      mobileActiveFilterCount
                    }}</span>
                  </BButton>
                </div>
                <div v-else class="toolbar-actions">
                  <BButton
                    size="small"
                    class="select-visible-btn"
                    :disabled="!selectableVisibleItems.length"
                    @click="toggleBatchMode"
                  >
                    {{ batchMode ? t('resourceCenter.batch.exit') : t('resourceCenter.batch.enter') }}
                  </BButton>
                  <BButton
                    size="small"
                    class="clear-btn"
                    :disabled="!queryState.keyword"
                    @click="clearKeyword"
                    v-click-log="{ module: '资源中心', operation: '清空搜索关键词' }"
                  >
                    {{ t('resourceCenter.clear') }}
                  </BButton>
                  <BButton
                    size="small"
                    class="clear-btn"
                    :disabled="!hasActiveAdvancedFilters"
                    @click="clearAdvancedFilters"
                    v-click-log="{ module: '资源中心', operation: '清空筛选条件' }"
                  >
                    {{ t('resourceCenter.clearFilters') }}
                  </BButton>
                </div>
              </div>

              <section v-if="!bookmark.isMobile" class="advanced-filters">
                <div class="tag-filter-wrap" v-if="tagOptions.length">
                  <div class="tag-filter-label">
                    <span>{{ t('resourceCenter.tagFilter') }}</span>
                    <small>{{ t('resourceCenter.tagFilterAnyHint') }}</small>
                  </div>
                  <div class="tag-filter-main">
                    <div class="tag-filter-list">
                      <ResourceTagChip
                        v-for="tag in inlineTagOptions"
                        :key="tag"
                        :tag="{ name: tag }"
                        class="tag-chip"
                        size="medium"
                        interactive
                        :selected="queryState.tags.includes(tag)"
                        show-selected-indicator
                        max-width="108px"
                        @click="toggleTagFilter(tag)"
                      />
                    </div>
                    <BPopover
                      v-if="tagOptions.length > inlineTagOptions.length"
                      v-model:open="showAllTags"
                      trigger="click"
                      placement="bottom-right"
                    >
                      <BButton class="tag-toggle-btn">
                        {{
                          showAllTags
                            ? t('resourceCenter.tagCollapse')
                            : t('resourceCenter.tagExpand', { count: tagOptions.length })
                        }}
                      </BButton>
                      <template #content>
                        <div class="tag-filter-popover">
                          <BInput
                            v-model:value="tagSearch"
                            :placeholder="t('resourceCenter.tagSearchPlaceholder')"
                            clearable
                          />
                          <ResourceTagChip
                            v-for="tag in filteredTagOptions"
                            :key="tag"
                            :tag="{ name: tag }"
                            class="tag-chip"
                            size="medium"
                            interactive
                            :selected="queryState.tags.includes(tag)"
                            show-selected-indicator
                            max-width="min(180px, 100%)"
                            @click="toggleTagFilter(tag)"
                          />
                        </div>
                      </template>
                    </BPopover>
                  </div>
                </div>
              </section>

              <section v-if="batchMode" class="batch-toolbar">
                <div class="batch-left">
                  <span>
                    {{
                      allMatchingActive
                        ? t('resourceCenter.batch.allMatchingSelected', { count: selectedCount })
                        : t('resourceCenter.batch.selectedCount', { count: selectedCount })
                    }}
                  </span>
                  <BButton
                    size="small"
                    class="batch-select-all"
                    :loading="selectionPreviewLoading"
                    :disabled="!filteredResultTotal"
                    @click="toggleSelectAllMatching"
                  >
                    {{
                      allMatchingActive
                        ? t('resourceCenter.batch.unselectAll')
                        : t('resourceCenter.batch.selectAll', { count: filteredResultTotal })
                    }}
                  </BButton>
                </div>
                <div class="batch-actions">
                  <BButton
                    v-if="bookmark.isMobile"
                    class="mobile-batch-actions-button"
                    :disabled="!selectedCount"
                    @click="mobileBatchActionsOpen = true"
                  >
                    <SvgIcon :src="icon.common.more" size="16" />
                    {{ t('common.more') }}
                  </BButton>
                  <template v-else>
                    <BButton :disabled="allMatchingActive || !selectedCount" @click="toggleSearchAi">
                      <SvgIcon :src="icon.ai.materials" size="15" />
                      {{ t('ai.entry.summarizeSelected') }}
                    </BButton>
                    <BButton @click="batchAddToInbox">{{ t('inbox.addExisting') }}</BButton>
                    <BButton type="primary" @click="batchAddTag">{{ t('resourceCenter.batch.addTag') }}</BButton>
                    <BButton type="primary" @click="batchRemoveTag">{{ t('resourceCenter.batch.removeTag') }}</BButton>
                    <BButton type="danger" @click="batchDelete">{{ t('resourceCenter.batch.delete') }}</BButton>
                  </template>
                </div>
              </section>

              <AiSkillPanel
                v-if="bookmark.isMobile && searchAiVisible"
                class="search-ai-panel search-ai-panel--mobile"
                :title="t('ai.entry.searchSkillTitle')"
                :description="t('ai.entry.searchSkillDescription')"
                skill-id="search.summarize_selected"
                surface="search"
                :resource-refs="searchAiResourceRefs"
                :scope-label="searchAiScopeLabel"
                :initial-input="searchAiInitialInput"
                :actions="searchAiActions"
                :show-prompt="false"
                :show-grounding="false"
                :auto-run-action-id="searchAiAutoRunActionId"
                :icon-src="icon.ai.organize"
              />

              <div
                ref="resultScrollRef"
                class="result-scroll-area"
                @touchstart.passive="pullRefresh.onTouchStart"
                @touchmove="pullRefresh.onTouchMove"
                @touchend.passive="pullRefresh.onTouchEnd"
                @touchcancel.passive="pullRefresh.onTouchCancel"
              >
                <div
                  v-if="shouldShowLoadingSkeleton"
                  class="result-skeleton"
                  :class="{ 'result-skeleton--list': effectiveView === 'list' }"
                >
                  <div v-for="n in 24" :key="n" class="result-sk-card">
                    <div class="result-sk-top">
                      <div class="result-sk-dot"></div>
                      <div class="result-sk-line result-sk-line--short"></div>
                    </div>
                    <div class="result-sk-line result-sk-line--title"></div>
                    <div class="result-sk-line result-sk-line--desc"></div>
                    <div class="result-sk-line result-sk-line--desc result-sk-line--desc2"></div>
                    <div class="result-sk-meta">
                      <div class="result-sk-line result-sk-line--meta1"></div>
                      <div class="result-sk-line result-sk-line--meta2"></div>
                    </div>
                  </div>
                </div>

                <template v-else-if="visibleGroups.length">
                  <section v-for="group in visibleGroups" :key="group.type" class="result-group">
                    <div class="group-header">
                      <span>{{ getSearchTypeLabel(t, group.type) }}</span>
                      <span>{{ t('resourceCenter.count', { count: summaryTotals[group.type] }) }}</span>
                    </div>
                    <div class="result-grid" :class="{ 'result-grid--list': effectiveView === 'list' }">
                      <RightMenu
                        :menu="menuForSearchItem(item)"
                        @select="handleItemMenu($event, item)"
                        v-for="item in group.items"
                        :key="`${item.type}-${item.id}`"
                        class="resource-result-entry"
                        :class="{
                          'is-inspected':
                            !bookmark.isMobile && activeInspectedResourceKey === getItemSelectionKey(item),
                        }"
                      >
                        <SearchResultItem
                          :item="item"
                          :type-label="getSearchTypeLabel(t, item.type)"
                          :keyword="queryState.keyword"
                          :selected="isItemSelected(item)"
                          :selectable="batchMode"
                          :view="effectiveView"
                          :compact="bookmark.isMobile"
                          @open="handleResultOpen(item)"
                          @toggle-select="toggleSelect(item)"
                        />
                      </RightMenu>
                    </div>
                  </section>
                </template>

                <div v-else-if="viewState.error" class="result-error-state" role="alert">
                  <h3>{{ t('resourceCenter.loadErrorTitle') }}</h3>
                  <p>{{ viewState.error.message || t('common.requestFailedDescription') }}</p>
                  <p v-if="viewState.error.requestId" class="result-error-request-id">
                    {{ t('common.requestIdLabel') }}：{{ viewState.error.requestId }}
                  </p>
                  <BButton type="primary" @click="refreshData()">{{ t('common.retry') }}</BButton>
                </div>

                <div v-else class="empty-state">
                  <div class="empty-orbit"></div>
                  <h3>{{ t('resourceCenter.emptyTitle') }}</h3>
                  <p>{{ t('resourceCenter.emptyDesc') }}</p>
                  <div class="empty-actions">
                    <BButton
                      class="empty-action-btn"
                      @click="router.push('/manage/editBookmark/add')"
                      v-click-log="{ module: '资源中心', operation: '空状态创建书签' }"
                    >
                      {{ t('resourceCenter.emptyActionBookmark') }}
                    </BButton>
                    <BButton
                      class="empty-action-btn"
                      @click="router.push('/noteLibrary/add')"
                      v-click-log="{ module: '资源中心', operation: '空状态创建笔记' }"
                    >
                      {{ t('resourceCenter.emptyActionNote') }}
                    </BButton>
                    <BButton
                      class="empty-action-btn"
                      @click="router.push('/cloudSpace')"
                      v-click-log="{ module: '资源中心', operation: '空状态上传文件' }"
                    >
                      {{ t('resourceCenter.emptyActionFile') }}
                    </BButton>
                    <BButton
                      class="empty-action-btn"
                      @click="router.push('/manage/tagMg')"
                      v-click-log="{ module: '资源中心', operation: '空状态进入标签管理' }"
                    >
                      {{ t('resourceCenter.emptyActionTag') }}
                    </BButton>
                  </div>
                </div>
                <div
                  v-show="allVisibleItems.length && (viewState.hasMore || viewState.loadingMore)"
                  ref="resultLoadSentinel"
                  class="result-load-sentinel"
                >
                  <BLoading v-if="viewState.loadingMore" inline loading :title="t('common.loading')" />
                  <BButton v-else size="small" @click="loadMoreResults">{{ t('common.loadMore') }}</BButton>
                </div>
              </div>
            </BCard>

            <aside v-if="!bookmark.isMobile" class="resource-inspector-pane">
              <AiSkillPanel
                v-if="searchAiVisible"
                class="search-ai-panel"
                :title="t('ai.entry.searchSkillTitle')"
                :description="t('ai.entry.searchSkillDescription')"
                skill-id="search.summarize_selected"
                surface="search"
                :resource-refs="searchAiResourceRefs"
                :scope-label="searchAiScopeLabel"
                :initial-input="searchAiInitialInput"
                :actions="searchAiActions"
                :show-prompt="false"
                :show-grounding="false"
                :auto-run-action-id="searchAiAutoRunActionId"
                :icon-src="icon.ai.organize"
                presentation="sidebar"
              />
              <template v-else-if="inspectedResource">
                <div
                  class="resource-inspector-hero"
                  :class="[
                    'is-' + inspectedResource.type,
                    { 'resource-inspector-hero--expanded': inspectedResource.type === 'note' },
                  ]"
                >
                  <div class="resource-inspector-identity">
                    <span class="resource-inspector-icon" aria-hidden="true">
                      <SvgIcon :src="inspectedResourceIcon" size="23" />
                    </span>
                    <div class="resource-inspector-identity__copy">
                      <span>{{ t('resourceCenter.currentResource') }}</span>
                      <strong>{{ getSearchTypeLabel(t, inspectedResource.type) }}</strong>
                    </div>
                  </div>
                  <h2>{{ inspectedResource.title || '-' }}</h2>
                  <p v-auto-scrollbar class="resource-inspector-description">{{ inspectedResourcePreview }}</p>
                </div>
                <dl class="resource-inspector-meta">
                  <div v-if="inspectedResource.type === 'note'">
                    <dt>{{ t('resourceCenter.noteType') }}</dt>
                    <dd>{{ inspectedNoteTypeLabel }}</dd>
                  </div>
                  <div>
                    <dt>{{
                      t(inspectedResource.type === 'note' ? 'resourceCenter.location' : 'resourceCenter.source')
                    }}</dt>
                    <dd>{{
                      inspectedResource.type === 'note'
                        ? inspectedResource.path || t('resourceCenter.rootLocation')
                        : inspectedResource.domain || inspectedResource.category || '-'
                    }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('resourceCenter.updatedAt') }}</dt>
                    <dd>{{ inspectedResource.updatedAtText || inspectedResource.extra || '-' }}</dd>
                  </div>
                </dl>
                <div v-if="inspectedResource.tagNames.length" class="resource-inspector-tags">
                  <span>{{ t('resourceCenter.tags') }}</span>
                  <ResourceTagChip
                    v-for="tag in inspectedResource.tagNames.slice(0, 6)"
                    :key="tag"
                    :tag="{ name: tag }"
                    size="small"
                  />
                </div>
                <div class="resource-inspector-actions">
                  <BButton
                    v-if="inspectedResource.type !== 'tag'"
                    block
                    size="large"
                    type="function"
                    class="resource-inspector-action--ai"
                    @click="openResourceAi(inspectedResource)"
                  >
                    <SvgIcon :src="icon.ai.organize" size="17" aria-hidden="true" />
                    {{ t('resourceCenter.analyzeResource') }}
                  </BButton>
                  <BButton block size="large" type="primary" @click="openItem(inspectedResource)">
                    <SvgIcon :src="icon.noteTree.openPage" size="17" aria-hidden="true" />
                    {{ t('resourceCenter.openResource') }}
                  </BButton>
                  <BButton
                    v-if="inspectedResource.type !== 'tag'"
                    block
                    size="large"
                    class="resource-inspector-action--inbox"
                    @click="handleItemMenu('addInbox', inspectedResource)"
                  >
                    {{ t('inbox.addExisting') }}
                  </BButton>
                  <BButton
                    block
                    size="large"
                    class="resource-inspector-action--delete"
                    @click="handleItemMenu('delete', inspectedResource)"
                  >
                    {{ t('inbox.deleteResource') }}
                  </BButton>
                </div>
              </template>
              <div v-else class="resource-inspector-empty">
                <strong>{{ t('resourceCenter.inspectorEmptyTitle') }}</strong>
                <p>{{ t('resourceCenter.inspectorEmptyDesc') }}</p>
              </div>
            </aside>
          </section>
        </template>
        <div v-else class="resource-center-map">
          <Suspense>
            <GlobalGraph />
            <template #fallback>
              <BLoading loading :title="t('common.loading')" />
            </template>
          </Suspense>
        </div>
      </div>
    </ResourcePageShell>

    <BDrawer
      v-if="bookmark.isMobile && !isKnowledgeMapView"
      :open="mobileFilterVisible"
      :title="t('resourceCenter.mobileFiltersTitle')"
      placement="bottom"
      height="min(76dvh, 640px)"
      body-padding="14px 16px max(18px, env(safe-area-inset-bottom))"
      @close="mobileFilterVisible = false"
    >
      <div class="mobile-filter-drawer">
        <div class="mobile-filter-field mobile-filter-search">
          <label class="mobile-filter-label" for="mobile-filter-search-input">
            {{ t('resourceCenter.searchFieldLabel') }}
          </label>
          <BInput
            id="mobile-filter-search-input"
            v-model:value="queryState.keyword"
            :placeholder="t('resourceCenter.searchPlaceholder')"
            height="40px"
            clearable
            @input="syncQueryDebounced"
            @enter="submitSearch"
          >
            <template #prefix>
              <SvgIcon :src="icon.navigation.search" size="15" aria-hidden="true" />
            </template>
          </BInput>
        </div>

        <div class="mobile-filter-section">
          <span class="mobile-filter-label">{{ t('resourceCenter.typeFilter') }}</span>
          <div class="mobile-filter-types">
            <BButton
              v-for="type in SEARCH_CENTER_TYPE_LIST"
              :key="type"
              class="mobile-filter-type"
              :class="{ active: isTypeSelected(type) }"
              :aria-pressed="isTypeSelected(type)"
              @click="toggleTypeFilter(type)"
            >
              <span class="filter-dot" :class="`filter-dot--${type}`" aria-hidden="true"></span>
              <span>{{ getSearchTypeLabel(t, type) }}</span>
              <span class="filter-count">{{ summaryTotals[type] || 0 }}</span>
            </BButton>
          </div>
        </div>

        <div class="mobile-filter-field">
          <span class="mobile-filter-label">{{ t('resourceCenter.sort.label') }}</span>
          <BSelect
            class="mobile-filter-select"
            :options="sortOptions"
            v-model:value="queryState.sort"
            @change="applyQueryState('切换排序')"
          />
        </div>

        <div class="mobile-filter-field">
          <span class="mobile-filter-label">{{ t('resourceCenter.date.label') }}</span>
          <BSelect
            class="mobile-filter-select"
            :options="dateOptions"
            v-model:value="queryState.date"
            @change="applyQueryState('筛选时间范围')"
          />
        </div>

        <div class="mobile-filter-section">
          <span class="mobile-filter-label">{{ t('resourceCenter.resourceState') }}</span>
          <BButton
            class="tagless-btn mobile-filter-toggle"
            :class="{ active: queryState.untagged }"
            @click="toggleUntagged"
          >
            {{ t('resourceCenter.untagged') }}
          </BButton>
        </div>

        <div v-if="tagOptions.length" class="mobile-filter-section">
          <span class="mobile-filter-label">{{ t('resourceCenter.tagFilter') }}</span>
          <BInput v-model:value="tagSearch" :placeholder="t('resourceCenter.tagSearchPlaceholder')" clearable />
          <div class="mobile-filter-tags">
            <ResourceTagChip
              v-for="tag in filteredTagOptions"
              :key="tag"
              :tag="{ name: tag }"
              class="tag-chip"
              size="medium"
              interactive
              :selected="queryState.tags.includes(tag)"
              show-selected-indicator
              @click="toggleTagFilter(tag)"
            />
          </div>
        </div>

        <div class="mobile-filter-footer">
          <BButton :disabled="!hasActiveAdvancedFilters" @click="clearAdvancedFilters">
            {{ t('resourceCenter.clearFilters') }}
          </BButton>
          <BButton type="primary" @click="mobileFilterVisible = false">{{ t('common.confirm') }}</BButton>
        </div>
      </div>
    </BDrawer>
    <MobilePageActionsDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobileBatchActionsOpen"
      :title="t('resourceCenter.batch.selectedCount', { count: selectedCount })"
      :actions="mobileBatchActions"
      @action="handleMobileBatchAction"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useAndroidPullRefresh } from '@/composables/useAndroidPullRefresh';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import RightMenu from '@/components/base/RightMenu.vue';
  import icon from '@/config/icon.ts';
  import {
    batchAddSearchResourcesToInbox,
    batchDeleteSearchResources,
    clearGlobalSearchCache,
    fetchGlobalSearch,
    previewSearchBatchSelection,
    type BatchResourceItem,
    type BatchSelection,
    type BatchSelectionSummary,
    type SearchCursor,
    type SearchResultItem,
    type SearchType,
  } from '@/api/search.ts';
  import { bookmarkStore, inboxStore, useUserStore } from '@/store';
  import { updatePreference } from '@/utils/savePreference';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import SearchResultItemComp from '@/components/searchCenter/SearchResultItem.vue';
  import {
    buildVisibleGroups,
    collectTagOptions,
    mapDisplayItems,
    type DisplaySearchItem,
    type ResourceDate,
    type ResourceSort,
    type ResourceView,
  } from '@/components/searchCenter/searchUtils.ts';
  import { getSearchTypeLabel, SEARCH_CENTER_TYPE_LIST } from '@/components/searchCenter/searchMeta.ts';
  import { isResourceSearchType, type GlobalSearchType } from '@/utils/globalSearchTypes';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import ResourceCenterSectionNav from '@/components/searchCenter/ResourceCenterSectionNav.vue';
  import ResourceCenterTopBar from '@/components/searchCenter/ResourceCenterTopBar.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import AiSkillPanel from '@/components/aiSkills/AiSkillPanel.vue';
  import type { AiSkillResourceRef } from '@lightnote/shared/ai-skill-protocol';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { SEARCH_PAGE_SIZE, mergeResourcePage } from '@/utils/resourcePagination';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';

  const SearchResultItem = SearchResultItemComp;
  const GlobalGraph = defineAsyncComponent(() => import('@/view/graph/GlobalGraph.vue'));
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const { addResourcesToInbox } = useInboxEnqueue();
  const { t } = useI18n();
  const isKnowledgeMapView = computed(() => route.path === '/search' && route.query.section === 'map');

  const SEARCH_VIEW_STORAGE_KEY = 'resource-center-view-mode';
  const SEARCH_BATCH_STORAGE_KEY = 'resource-center-batch-items';
  const SEARCH_QUERY_KEYS = ['q', 'type', 'sort', 'view', 'tags', 'date', 'untagged'] as const;
  const SKELETON_DELAY_MS = 140;
  const syncTimer = ref<number | null>(null);
  const isRouteApplying = ref(false);
  const mobileFilterVisible = ref(false);
  const mobileBatchActionsOpen = ref(false);
  const batchMode = ref(false);
  const tagSearch = ref('');
  const showLoadingSkeleton = ref(false);
  const scopeTypesExpanded = ref(true);
  const scopeStateExpanded = ref(true);
  let skeletonTimer: number | null = null;
  const resultScrollRef = ref<HTMLElement | null>(null);

  /*
   * 下拉刷新。走 refreshData({ silent: true }):保留旧结果、不进骨架屏。
   * 刷新保留搜索关键词、类型/标签/时间筛选、排序与 URL 查询参数 ——
   * 它们都在 queryState 里,refreshData 只重取数据,不碰查询条件。
   */
  const pullRefresh = useAndroidPullRefresh({
    enabled: computed(() => !batchMode.value),
    externalBusy: computed(() => viewState.loading || viewState.loadingMore),
    getScrollContainer: () => resultScrollRef.value,
    onRefresh: () => refreshData({ silent: true }),
  });
  /*
   * 从后台切回来时补一次数据。提示走顶部那条全局进度条(App.vue),
   * 不让刷新按钮跟着转 —— 静默刷新不是用户点的,转圈会让人以为自己碰到了按钮。
   *
   * 与手动刷新并发是安全的:loadData 用 requestSeq 作废先发请求。
   */
  useForegroundRefresh({
    refresh: () => refreshData({ silent: true }),
    // 批量选择中刷新会让已勾选的项消失,等用户退出批量模式再说。
    canRefresh: () => !batchMode.value && !viewState.loading && !viewState.loadingMore,
  });
  const resultLoadSentinel = ref<HTMLElement | null>(null);
  let resultLoadObserver: IntersectionObserver | null = null;
  let requestSeq = 0;
  const summaryTotals = ref<Record<GlobalSearchType, number>>({
    bookmark: 0,
    note: 0,
    file: 0,
    tag: 0,
    todo: 0,
  });

  const queryState = reactive<{
    keyword: string;
    type: GlobalSearchType | 'all';
    types: GlobalSearchType[];
    sort: ResourceSort;
    view: ResourceView;
    tags: string[];
    date: ResourceDate;
    untagged: boolean;
  }>({
    keyword: '',
    type: 'all',
    types: [],
    sort: (user.preferences.resourceSort as ResourceSort) || 'relevance',
    view:
      (user.preferences.resourceView as ResourceView) ||
      (localStorage.getItem(SEARCH_VIEW_STORAGE_KEY) as ResourceView) ||
      'card',
    tags: [],
    date: 'all',
    untagged: false,
  });

  const viewState = reactive<{
    loading: boolean;
    loadingMore: boolean;
    rawItems: SearchResultItem[];
    nextCursor: SearchCursor | null;
    hasMore: boolean;
    tagOptions: string[];
    error: { message: string; requestId: string } | null;
  }>({
    loading: false,
    loadingMore: false,
    rawItems: [],
    nextCursor: null,
    hasMore: false,
    tagOptions: [],
    error: null,
  });

  const selectedIds = ref<string[]>([]);
  const searchAiVisible = ref(false);
  const explicitSearchAiResourceContext = ref<{
    ref: AiSkillResourceRef;
    type: GlobalSearchType;
    title: string;
  } | null>(null);
  const allMatchingSummary = ref<BatchSelectionSummary | null>(null);
  const excludedSelectionIds = ref<string[]>([]);
  const selectionPreviewLoading = ref(false);

  // 移动端强制卡片视图:列表视图会把卡片撑得很宽导致横向滚动,且移动端列表/卡片无实质差异
  const effectiveView = computed<ResourceView>(() => (bookmark.isMobile ? 'card' : queryState.view));

  const sortOptions = computed(() => [
    { value: 'relevance', label: t('resourceCenter.sort.relevance') },
    { value: 'updated', label: t('resourceCenter.sort.updated') },
    { value: 'name', label: t('resourceCenter.sort.name') },
  ]);
  const dateOptions = computed(() => [
    { value: 'all', label: t('resourceCenter.date.all') },
    { value: '7d', label: t('resourceCenter.date.day7') },
    { value: '30d', label: t('resourceCenter.date.day30') },
    { value: '365d', label: t('resourceCenter.date.day365') },
  ]);

  const mappedItems = computed(() => mapDisplayItems(viewState.rawItems, queryState.keyword));
  // 当前没有可复用结果时立即展示骨架屏，避免请求完成前短暂落入“没有匹配内容”空状态。
  // 已经存在结果时仍保留延迟骨架，减少快速刷新造成的整块闪烁。
  const shouldShowLoadingSkeleton = computed(
    () => viewState.loading && (!viewState.rawItems.length || showLoadingSkeleton.value),
  );

  // 搜索结果始终按资源类型分组；每组内部沿用服务端返回的相关度/排序顺序，避免搜索后丢失分组标题。
  const visibleGroups = computed(() => buildVisibleGroups(mappedItems.value, selectedTypes.value));

  const allVisibleItems = computed(() => visibleGroups.value.flatMap((group) => group.items));
  const inspectedResourceKey = ref('');
  const inspectedResource = computed(
    () =>
      allVisibleItems.value.find((item) => getItemSelectionKey(item) === inspectedResourceKey.value) ||
      allVisibleItems.value[0] ||
      null,
  );
  const activeInspectedResourceKey = computed(() =>
    inspectedResource.value ? getItemSelectionKey(inspectedResource.value) : '',
  );
  const RESOURCE_INSPECTOR_ICONS: Record<GlobalSearchType, string> = {
    bookmark: icon.resource.bookmark,
    note: icon.resource.note,
    file: icon.resource.file,
    tag: icon.resource.tag,
    todo: icon.growth.action,
  };
  const inspectedResourceIcon = computed(
    () => RESOURCE_INSPECTOR_ICONS[inspectedResource.value?.type || 'tag'] || icon.resource.tag,
  );
  function compactInspectorText(value: unknown, format = '') {
    const source = String(value || '');
    if (!source) return '';
    let text = source;
    if (format === 'html') {
      try {
        text = new DOMParser().parseFromString(source, 'text/html').body.textContent || '';
      } catch {
        text = source.replace(/<[^>]+>/g, ' ');
      }
    } else if (format === 'markdown') {
      text = source
        .replace(/\x60{3}[\s\S]*?\x60{3}/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^[#>*+\-]\s+/gm, ' ');
    }
    return text.replace(/\s+/g, ' ').trim().slice(0, 1800);
  }
  const inspectedResourcePreview = computed(() => {
    const item = inspectedResource.value;
    if (!item) return '-';
    const noteFormat = String(item.raw?.type || '').toLowerCase();
    const source = item.type === 'note' && noteFormat !== 'drawing' ? item.raw?.content : '';
    return (
      compactInspectorText(source, noteFormat) ||
      compactInspectorText(item.description || item.snippet || item.matchReason) ||
      '-'
    );
  });
  const inspectedNoteTypeLabel = computed(() => {
    const format = String(inspectedResource.value?.raw?.type || 'html').toLowerCase();
    const key = format === 'drawing' ? 'drawing' : format === 'markdown' || format === 'md' ? 'markdown' : 'html';
    return t('resourceCenter.noteTypes.' + key);
  });
  // 资源中心数据域固定为书签、笔记、文件和标签。
  const selectableVisibleItems = computed(() =>
    allVisibleItems.value.filter((item) => isResourceSearchType(item.type)),
  );
  const allMatchingActive = computed(() => allMatchingSummary.value?.mode === 'allMatching');
  const selectedCount = computed(() =>
    allMatchingActive.value
      ? Math.max(0, Number(allMatchingSummary.value?.total || 0) - excludedSelectionIds.value.length)
      : selectedIds.value.length,
  );
  const mobileBatchActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'ai',
      label: t('ai.entry.summarizeSelected'),
      icon: icon.ai.materials,
      disabled: allMatchingActive.value || selectedCount.value < 1,
    },
    {
      key: 'inbox',
      label: t('inbox.addExisting'),
      icon: icon.contextMenu.inbox,
      disabled: selectedCount.value < 1,
    },
    {
      key: 'addTag',
      label: t('resourceCenter.batch.addTag'),
      icon: icon.manage_categoryBtn_tag,
      disabled: selectedCount.value < 1,
    },
    {
      key: 'removeTag',
      label: t('resourceCenter.batch.removeTag'),
      icon: icon.manage_categoryBtn_tag,
      disabled: selectedCount.value < 1,
    },
    {
      key: 'delete',
      label: t('resourceCenter.batch.delete'),
      icon: icon.table_delete,
      danger: true,
      disabled: selectedCount.value < 1,
    },
  ]);
  const tagOptions = computed(() => {
    const options = viewState.tagOptions.length ? viewState.tagOptions : collectTagOptions(mappedItems.value);
    const selected = new Set(queryState.tags);
    // 从知识地图等入口携带标签筛选时，将已选项固定在折叠区最前面，确保过滤状态一眼可见。
    return [...queryState.tags, ...options.filter((tag) => !selected.has(tag))];
  });
  const inlineTagLimit = computed(() => {
    if (bookmark.screenWidth <= 980) return 3;
    if (bookmark.isCompactLayout) return 4;
    if (bookmark.screenWidth <= 1440) return 6;
    return 7;
  });
  const inlineTagOptions = computed(() => tagOptions.value.slice(0, inlineTagLimit.value));
  const filteredTagOptions = computed(() => {
    const keyword = tagSearch.value.trim().toLocaleLowerCase();
    return keyword ? tagOptions.value.filter((tag) => tag.toLocaleLowerCase().includes(keyword)) : tagOptions.value;
  });
  const selectedTypes = computed<GlobalSearchType[]>(() =>
    queryState.types.length ? queryState.types : [...SEARCH_CENTER_TYPE_LIST],
  );
  const selectedSearchAiResourceRefs = computed<AiSkillResourceRef[]>(() =>
    mappedItems.value
      .filter((item) => selectedIds.value.includes(getItemSelectionKey(item)))
      .filter((item) => ['note', 'bookmark', 'file', 'todo'].includes(item.type))
      .slice(0, 10)
      .map((item) => ({ type: item.type as AiSkillResourceRef['type'], id: String(item.id) })),
  );
  const searchAiResourceRefs = computed<AiSkillResourceRef[]>(() =>
    explicitSearchAiResourceContext.value
      ? [explicitSearchAiResourceContext.value.ref]
      : selectedSearchAiResourceRefs.value,
  );
  const searchAiInitialInput = computed<Record<string, unknown>>(() => ({}));
  const searchAiScopeLabel = computed(() => {
    const resource = explicitSearchAiResourceContext.value;
    if (resource) {
      return t('ai.entry.resourceScope', {
        type: getSearchTypeLabel(t, resource.type),
        title: resource.title || t('inbox.untitled'),
      });
    }
    return searchAiResourceRefs.value.length
      ? t('ai.entry.selectedScope', { count: searchAiResourceRefs.value.length })
      : '';
  });
  const searchAiInitialPrompt = computed(() => {
    const resource = explicitSearchAiResourceContext.value;
    if (!resource) return '';
    return t('ai.entry.analyzeResourcePrompt', {
      type: getSearchTypeLabel(t, resource.type),
      title: resource.title || t('inbox.untitled'),
    });
  });
  const searchAiAutoRunActionId = computed(() => {
    if (explicitSearchAiResourceContext.value) return 'analyze';
    return searchAiResourceRefs.value.length === 1 ? 'summarize' : '';
  });
  const searchAiActions = computed(() => {
    const actions: Array<{
      id: string;
      label: string;
      skillId: string;
      input: Record<string, unknown>;
    }> = [];
    if (explicitSearchAiResourceContext.value) {
      actions.push({
        id: 'analyze',
        label: t('ai.entry.analyzeAgain'),
        skillId: 'search.summarize_selected',
        input: { instruction: searchAiInitialPrompt.value },
      });
    } else if (searchAiResourceRefs.value.length) {
      actions.push({
        id: 'summarize',
        label: t('ai.entry.summarizeSelected'),
        skillId: 'search.summarize_selected',
        input: { instruction: t('ai.entry.summarizeSelectedInstruction') },
      });
    }
    if (!explicitSearchAiResourceContext.value && searchAiResourceRefs.value.length >= 2) {
      actions.push({
        id: 'compare',
        label: t('ai.entry.compareSelected'),
        skillId: 'search.compare_selected',
        input: { instruction: t('ai.entry.compareSelectedInstruction') },
      });
    }
    return actions;
  });
  const hasActiveAdvancedFilters = computed(
    () =>
      queryState.tags.length > 0 ||
      queryState.date !== 'all' ||
      queryState.untagged ||
      queryState.types.length > 0 ||
      queryState.sort !== ((user.preferences.resourceSort as ResourceSort) || 'relevance'),
  );
  const mobileActiveFilterCount = computed(
    () =>
      queryState.tags.length +
      Number(queryState.date !== 'all') +
      Number(queryState.untagged) +
      // 类型 Tab 已收进抽屉，类型条件计入「筛选 N」角标
      Number(queryState.types.length > 0) +
      Number(queryState.sort !== ((user.preferences.resourceSort as ResourceSort) || 'relevance')),
  );

  // PC 端标签保持单行，完整列表通过「更多」浮层查看。
  const showAllTags = ref(false);

  const typeFilters = computed(() => [
    {
      value: 'all' as const,
      label: t('resourceCenter.types.allResults'),
      count: SEARCH_CENTER_TYPE_LIST.reduce((sum, type) => sum + Number(summaryTotals.value[type] || 0), 0),
    },
    ...SEARCH_CENTER_TYPE_LIST.map((type) => ({
      value: type,
      label: getSearchTypeLabel(t, type),
      count: summaryTotals.value[type],
    })),
  ]);

  const filteredResultTotal = computed(() =>
    selectedTypes.value.reduce((sum, type) => sum + Number(summaryTotals.value[type] || 0), 0),
  );
  const desktopTypeSummary = computed(() => {
    if (!queryState.types.length) return typeFilters.value[0];
    if (queryState.types.length === 1) {
      return typeFilters.value.find((item) => item.value === queryState.types[0]) || typeFilters.value[0];
    }
    return {
      value: 'all' as const,
      label: t('resourceCenter.types.selectedCount', { count: queryState.types.length }),
      count: filteredResultTotal.value,
    };
  });
  // 类型 Tab 移入抽屉后，这里承担「结果总数 + 各类型数量」的概览职责
  const mobileResultSubtitle = computed(() => {
    const total = t('resourceCenter.totalCount', { count: filteredResultTotal.value });
    const breakdown = selectedTypes.value
      .filter((type) => Number(summaryTotals.value[type] || 0) > 0)
      .map((type) => `${getSearchTypeLabel(t, type)} ${summaryTotals.value[type]}`)
      .join(' · ');
    return breakdown ? `${total} · ${breakdown}` : total;
  });
  function menuForSearchItem(item: DisplaySearchItem) {
    const openItem = {
      key: 'open',
      label: t('resourceCenter.openResource'),
      icon: icon.noteTree.openPage,
    };
    const deleteItem = {
      key: 'delete',
      label: t('common.delete'),
      icon: icon.table_delete,
      danger: true,
    };
    if (item.type === 'tag') {
      return [openItem, { key: 'resource-open-divider', divider: true }, deleteItem];
    }
    return [
      openItem,
      { key: 'resource-open-divider', divider: true },
      { key: 'ai', label: t('resourceCenter.analyzeResourceMenu'), icon: icon.ai.organize },
      { key: 'addInbox', label: t('inbox.addExisting'), icon: icon.contextMenu.inbox },
      { key: 'resource-actions-divider', divider: true },
      deleteItem,
    ];
  }

  function isTypeFilterActive(type: GlobalSearchType | 'all') {
    return type === 'all' ? queryState.types.length === 0 : queryState.types.includes(type);
  }

  // 抽屉里的类型是多选：空数组表示全选（与 URL 协议一致），
  // 取消最后一个会让结果永远为空，因此忽略这次点击而不是清空。
  function isTypeSelected(type: GlobalSearchType) {
    return queryState.types.length === 0 || queryState.types.includes(type);
  }

  function toggleTypeFilter(type: GlobalSearchType) {
    const selected = new Set(queryState.types.length ? queryState.types : SEARCH_CENTER_TYPE_LIST);
    if (selected.has(type)) selected.delete(type);
    else selected.add(type);
    const next = SEARCH_CENTER_TYPE_LIST.filter((item) => selected.has(item));
    if (!next.length) return;
    queryState.types = next.length === SEARCH_CENTER_TYPE_LIST.length ? [] : next;
    applyQueryState('筛选资源类型');
  }

  function parseTypes(value: unknown): GlobalSearchType[] {
    const raw = Array.isArray(value) ? String(value[0] || '') : String(value || '');
    const types = [...new Set(raw.split(',').map((item) => item.trim()))].filter((item) =>
      SEARCH_CENTER_TYPE_LIST.includes(item as GlobalSearchType),
    ) as GlobalSearchType[];
    return types.length === SEARCH_CENTER_TYPE_LIST.length
      ? []
      : SEARCH_CENTER_TYPE_LIST.filter((type) => types.includes(type));
  }

  function parseSort(value: unknown): ResourceSort {
    // URL 未带 sort 时回退到用户偏好的默认排序(设置页「资源中心排序」),而非写死相关度
    const fallback = (user.preferences.resourceSort as ResourceSort) || 'relevance';
    const raw = String(value || fallback);
    return ['relevance', 'updated', 'name'].includes(raw) ? (raw as ResourceSort) : fallback;
  }

  function parseView(value: unknown): ResourceView {
    // URL 未带 view 时回退到用户偏好(设置页「资源中心视图」),再回退独立缓存,最后卡片——与 parseSort 对齐。
    // 此前漏了 user.preferences.resourceView:route 同步(line ~490 用 parseView 覆盖 queryState.view)时读不到设置值,
    // 刷新便退回陈旧的独立缓存 SEARCH_VIEW_STORAGE_KEY,表现为「设置改列表、刷新资源中心仍是卡片」。
    const fallback =
      (user.preferences.resourceView as ResourceView) ||
      (localStorage.getItem(SEARCH_VIEW_STORAGE_KEY) as ResourceView) ||
      'card';
    const raw = String(value || fallback);
    return raw === 'list' ? 'list' : 'card';
  }

  function parseDate(value: unknown): ResourceDate {
    const raw = String(value || 'all');
    return ['all', '7d', '30d', '365d'].includes(raw) ? (raw as ResourceDate) : 'all';
  }

  function parseTags(value: unknown): string[] {
    const raw = Array.isArray(value) ? String(value[0] || '') : String(value || '');
    if (!raw) return [];
    return raw
      .split(',')
      .map((tag) => {
        try {
          return decodeURIComponent(tag).trim();
        } catch (error) {
          return tag.trim();
        }
      })
      .filter(Boolean)
      .slice(0, 24);
  }

  function normalizeItemType(input: unknown): SearchType | null {
    const raw = String(input || '').trim();
    if (SEARCH_CENTER_TYPE_LIST.includes(raw as GlobalSearchType)) return raw as GlobalSearchType;
    return null;
  }

  function normalizeSearchItem(rawItem: any): SearchResultItem | null {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const type = normalizeItemType(rawItem.type || rawItem.resourceType || rawItem.itemType);
    const id = String(rawItem.id || rawItem.resourceId || '').trim();
    if (!type || !id) return null;
    return {
      id,
      type,
      title: String(rawItem.title || rawItem.name || rawItem.fileName || rawItem.label || '').trim(),
      description: String(rawItem.description || rawItem.desc || '').trim(),
      extra: rawItem.extra ? String(rawItem.extra) : '',
      category: rawItem.category,
      url: rawItem.url,
      route: rawItem.route,
      iconUrl: rawItem.iconUrl,
      tags: Array.isArray(rawItem.tags) ? rawItem.tags : [],
      matchReason: rawItem.matchReason ? String(rawItem.matchReason) : undefined,
      snippet: rawItem.snippet ? String(rawItem.snippet) : undefined,
      raw: rawItem.raw || rawItem,
    };
  }

  function getItemSelectionKey(item: { id: string; type: SearchType }) {
    return `${item.type}:${item.id}`;
  }

  function applyRouteState() {
    isRouteApplying.value = true;
    try {
      queryState.keyword = Array.isArray(route.query.q) ? String(route.query.q[0] || '') : String(route.query.q || '');
      queryState.types = parseTypes(route.query.type);
      queryState.type = queryState.types.length === 1 ? queryState.types[0] : 'all';
      queryState.sort = parseSort(Array.isArray(route.query.sort) ? route.query.sort[0] : route.query.sort);
      queryState.view = parseView(Array.isArray(route.query.view) ? route.query.view[0] : route.query.view);
      queryState.tags = parseTags(route.query.tags);
      queryState.date = parseDate(Array.isArray(route.query.date) ? route.query.date[0] : route.query.date);
      const untaggedRaw = Array.isArray(route.query.untagged) ? route.query.untagged[0] : route.query.untagged;
      queryState.untagged = String(untaggedRaw || '0') === '1';
    } finally {
      isRouteApplying.value = false;
    }
  }

  function buildQueryPayload() {
    const q = queryState.keyword.trim();
    return {
      ...(q ? { q } : {}),
      ...(queryState.types.length ? { type: queryState.types.join(',') } : {}),
      ...(queryState.sort !== 'relevance' ? { sort: queryState.sort } : {}),
      ...(queryState.view !== 'card' ? { view: queryState.view } : {}),
      ...(queryState.tags.length ? { tags: queryState.tags.map((tag) => encodeURIComponent(tag)).join(',') } : {}),
      ...(queryState.date !== 'all' ? { date: queryState.date } : {}),
      ...(queryState.untagged ? { untagged: '1' } : {}),
    };
  }

  function normalizeQueryValue(value: unknown): string {
    if (Array.isArray(value)) return String(value[0] || '');
    if (value === undefined || value === null) return '';
    return String(value);
  }

  function readCurrentSearchQuery() {
    const current: Record<string, string> = {};
    SEARCH_QUERY_KEYS.forEach((key) => {
      const value = normalizeQueryValue(route.query[key]);
      if (value) current[key] = value;
    });
    return current;
  }

  function isSameSearchQuery(nextQuery: Record<string, string>) {
    const current = readCurrentSearchQuery();
    const nextKeys = Object.keys(nextQuery).sort();
    const currentKeys = Object.keys(current).sort();
    if (nextKeys.length !== currentKeys.length) return false;
    return nextKeys.every((key, index) => key === currentKeys[index] && nextQuery[key] === current[key]);
  }

  function normalizeSearchResultItems(res: { items?: unknown[]; groups?: unknown[] }) {
    const directItems = Array.isArray(res.items) ? res.items : [];
    const groupItems = Array.isArray(res.groups) ? res.groups.flatMap((group: any) => group?.items || []) : [];
    const rawMergedItems = (directItems.length ? directItems : groupItems).map((item) => normalizeSearchItem(item));
    return (rawMergedItems.filter(Boolean) as SearchResultItem[]).filter((item) =>
      SEARCH_CENTER_TYPE_LIST.includes(item.type),
    );
  }

  /**
   * @param silent 下拉刷新用：不进 loading、不排骨架屏定时器，旧结果留在屏幕上，
   *   顶部指示器负责表达进度。游标仍要重置（刷新等于回到第一页），
   *   但 rawItems 不清空，请求失败时结果原样保留。
   */
  async function loadData(force = false, skeletonDelayMs = SKELETON_DELAY_MS, append = false, silent = false) {
    if (append && (viewState.loading || viewState.loadingMore || !viewState.hasMore)) return false;
    const seq = append ? requestSeq : ++requestSeq;
    let loadSucceeded = false;
    if (append) {
      viewState.loadingMore = true;
    } else if (silent) {
      viewState.loadingMore = false;
      viewState.nextCursor = null;
      viewState.hasMore = false;
    } else {
      viewState.loading = true;
      viewState.loadingMore = false;
      viewState.error = null;
      viewState.nextCursor = null;
      viewState.hasMore = false;
      showLoadingSkeleton.value = false;
      if (skeletonTimer !== null) window.clearTimeout(skeletonTimer);
      skeletonTimer = window.setTimeout(() => {
        if (seq === requestSeq && viewState.loading) showLoadingSkeleton.value = true;
      }, skeletonDelayMs);
    }
    try {
      const res = await fetchGlobalSearch(queryState.keyword, SEARCH_PAGE_SIZE, force, {
        type: queryState.types.length === 1 ? queryState.types[0] : 'all',
        types: selectedTypes.value,
        sort: queryState.sort,
        date: queryState.date,
        tags: queryState.tags,
        untagged: queryState.untagged,
        paginationMode: 'ordered',
        cursor: append ? viewState.nextCursor : null,
        includeMetadata: !append,
      });
      if (seq !== requestSeq) return false;
      const normalizedItems = normalizeSearchResultItems(res);
      viewState.rawItems = append
        ? mergeResourcePage(viewState.rawItems, normalizedItems, (item) => getItemSelectionKey(item))
        : normalizedItems;
      viewState.nextCursor = res.nextCursor || null;
      viewState.hasMore = Boolean(res.hasMore);
      if (Array.isArray(res.tagOptions)) viewState.tagOptions = res.tagOptions;
      if (res.typeTotals) {
        summaryTotals.value = {
          bookmark: Number(res.typeTotals.bookmark || 0),
          note: Number(res.typeTotals.note || 0),
          file: Number(res.typeTotals.file || 0),
          tag: Number(res.typeTotals.tag || 0),
          todo: 0,
        };
      }
      const validSelection = new Set(viewState.rawItems.map((item) => getItemSelectionKey(item)));
      selectedIds.value = selectedIds.value.filter((id) => validSelection.has(id));
      loadSucceeded = true;
      return true;
    } catch (error) {
      const requestError = error as Error & { requestId?: string };
      // 静默刷新失败必须保留旧结果:下拉一下就把列表清成错误态,比不刷新更糟
      if (!append && !silent) {
        viewState.rawItems = [];
        viewState.error = {
          message: requestError.message || t('common.requestFailedDescription'),
          requestId: String(requestError.requestId || ''),
        };
        message.error(t('resourceCenter.refreshFailed'));
      }
      // 抛回给下拉刷新的调用方，由它统一提示；按钮刷新路径已在上面提示过
      if (silent) throw error;
      return false;
    } finally {
      if (seq === requestSeq) {
        if (skeletonTimer !== null) window.clearTimeout(skeletonTimer);
        skeletonTimer = null;
        showLoadingSkeleton.value = false;
        viewState.loading = false;
        viewState.loadingMore = false;
        if (loadSucceeded) void setupResultLoadObserver();
      }
    }
  }

  function loadMoreResults() {
    return loadData(false, 0, true);
  }

  async function setupResultLoadObserver() {
    resultLoadObserver?.disconnect();
    await nextTick();
    const sentinel = resultLoadSentinel.value;
    const root = bookmark.isMobile ? resultScrollRef.value : sentinel?.closest<HTMLElement>('.search-page') || null;
    if (!sentinel || !root) return;
    resultLoadObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMoreResults();
      },
      { root, rootMargin: '0px 0px 420px', threshold: 0 },
    );
    resultLoadObserver.observe(sentinel);
  }

  function syncQueryNow() {
    const query = buildQueryPayload();
    if (isSameSearchQuery(query)) {
      viewState.loading = false;
      return;
    }
    viewState.loading = true;
    router.replace({ path: '/search', query });
  }

  function syncQueryDebounced() {
    if (syncTimer.value) clearTimeout(syncTimer.value);
    clearBatchSelection();
    viewState.loading = true;
    syncTimer.value = window.setTimeout(syncQueryNow, 250);
  }

  function applyQueryState(operation: string) {
    clearBatchSelection();
    recordOperation({ module: '资源中心', operation });
    syncQueryNow();
  }

  function clearBatchSelection() {
    selectedIds.value = [];
    allMatchingSummary.value = null;
    excludedSelectionIds.value = [];
  }

  function submitSearch() {
    clearBatchSelection();
    const q = queryState.keyword.trim();
    if (q) {
      recordOperation({ module: '资源中心', operation: `搜索资源【${q}】` });
    }
    syncQueryNow();
  }

  function selectDesktopType(type: GlobalSearchType | 'all') {
    if (isTypeFilterActive(type) && (type === 'all' || queryState.types.length === 1)) return;
    queryState.types = type === 'all' ? [] : [type];
    queryState.type = type;
    applyQueryState(`切换资源类型【${getSearchTypeLabel(t, type)}】`);
  }

  function inspectResource(item: DisplaySearchItem) {
    inspectedResourceKey.value = getItemSelectionKey(item);
  }

  function handleResultOpen(item: DisplaySearchItem) {
    if (bookmark.isMobile) {
      openItem(item);
      return;
    }
    inspectResource(item);
    closeSearchAi();
  }

  function setView(view: ResourceView) {
    if (queryState.view === view) return;
    queryState.view = view;
    localStorage.setItem(SEARCH_VIEW_STORAGE_KEY, view);
    updatePreference({ resourceView: view }).catch(() => {}); // 记忆到偏好:跨设备 + 设置页可改
    applyQueryState('切换视图');
  }

  function clearKeyword() {
    queryState.keyword = '';
    applyQueryState('清空搜索关键词');
  }

  function toggleUntagged() {
    queryState.untagged = !queryState.untagged;
    applyQueryState('筛选无标签资源');
  }

  function toggleTagFilter(tag: string) {
    if (queryState.tags.includes(tag)) {
      queryState.tags = queryState.tags.filter((item) => item !== tag);
    } else {
      queryState.tags = [...queryState.tags, tag];
    }
    applyQueryState('应用筛选');
  }

  function clearAdvancedFilters() {
    queryState.tags = [];
    queryState.date = 'all';
    queryState.untagged = false;
    queryState.types = [];
    queryState.sort = (user.preferences.resourceSort as ResourceSort) || 'relevance';
    applyQueryState('清空筛选');
  }

  /**
   * @param options.silent 下拉刷新用：保留旧结果、不进骨架屏。
   *   批量模式下手势本就被禁用，所以这里照旧清空选择不会影响下拉场景。
   *   失败时向上抛出，交给下拉刷新的统一失败提示，避免弹两条消息。
   */
  async function refreshData(options: { silent?: boolean } = {}) {
    const silent = Boolean(options.silent);
    clearBatchSelection();
    clearGlobalSearchCache();
    if (!silent) viewState.loading = true;
    try {
      await nextTick();
      await loadData(true, SKELETON_DELAY_MS, false, silent);
    } catch (error) {
      if (silent) throw error;
      message.error(t('resourceCenter.refreshFailed'));
    }
  }

  function openItem(item: DisplaySearchItem) {
    if (item.type === 'bookmark' && item.url) {
      openBookmarkUrl(item.url);
      return;
    }
    // 文件先于 route 判断：云空间需要带上 fileName 搜索过滤
    if (item.type === 'file') {
      router.push({ path: '/cloudSpace', query: { fileName: item.title } });
      return;
    }
    if (item.route) {
      router.push(item.route);
      return;
    }
  }

  function toggleSelect(item: DisplaySearchItem) {
    if (!batchMode.value) return;
    const key = getItemSelectionKey(item);
    if (allMatchingActive.value) {
      if (excludedSelectionIds.value.includes(key)) {
        excludedSelectionIds.value = excludedSelectionIds.value.filter((entry) => entry !== key);
      } else {
        excludedSelectionIds.value = [...excludedSelectionIds.value, key];
      }
      return;
    }
    if (selectedIds.value.includes(key)) {
      selectedIds.value = selectedIds.value.filter((entry) => entry !== key);
    } else {
      selectedIds.value = [...selectedIds.value, key];
    }
  }

  function toggleBatchMode() {
    batchMode.value = !batchMode.value;
    if (!batchMode.value) clearBatchSelection();
  }

  function exitBatchMode() {
    if (!batchMode.value) return;
    batchMode.value = false;
    mobileBatchActionsOpen.value = false;
    clearBatchSelection();
  }

  function handleMobileBatchAction(action: MobilePageActionItem) {
    if (action.key === 'ai') toggleSearchAi();
    else if (action.key === 'inbox') void batchAddToInbox();
    else if (action.key === 'addTag') batchAddTag();
    else if (action.key === 'removeTag') batchRemoveTag();
    else if (action.key === 'delete') void batchDelete();
  }

  function selectionItemFromKey(key: string): BatchResourceItem | null {
    const separator = key.indexOf(':');
    if (separator <= 0) return null;
    const type = key.slice(0, separator) as SearchType;
    const id = key.slice(separator + 1);
    return isResourceSearchType(type) && id ? { type, id } : null;
  }

  function buildAllMatchingSelection(): BatchSelection {
    return {
      mode: 'allMatching',
      query: {
        keyword: queryState.keyword.trim(),
        types: selectedTypes.value.filter(isResourceSearchType),
        sort: queryState.sort,
        date: queryState.date,
        tags: [...queryState.tags],
        untagged: queryState.untagged,
      },
      excludedItems: excludedSelectionIds.value
        .map(selectionItemFromKey)
        .filter((item): item is BatchResourceItem => Boolean(item)),
    };
  }

  function getCurrentBatchSelection(): BatchSelection {
    if (allMatchingActive.value) return buildAllMatchingSelection();
    return {
      mode: 'explicit',
      items: selectedIds.value.map(selectionItemFromKey).filter((item): item is BatchResourceItem => Boolean(item)),
    };
  }

  function isItemSelected(item: DisplaySearchItem) {
    const key = getItemSelectionKey(item);
    return allMatchingActive.value ? !excludedSelectionIds.value.includes(key) : selectedIds.value.includes(key);
  }

  async function toggleSelectAllMatching() {
    if (allMatchingActive.value) {
      clearBatchSelection();
      return;
    }
    selectionPreviewLoading.value = true;
    try {
      const selection = buildAllMatchingSelection();
      const selectionQueryKey = JSON.stringify(selection.query);
      const res = await previewSearchBatchSelection(selection);
      if (selectionQueryKey !== JSON.stringify(buildAllMatchingSelection().query)) return;
      if (Number(res?.status) !== 200 || !res?.data) {
        message.error(res?.msg || t('resourceCenter.batch.selectionPrepareFailed'));
        return;
      }
      allMatchingSummary.value = res.data as BatchSelectionSummary;
      selectedIds.value = [];
      excludedSelectionIds.value = [];
    } catch {
      message.error(t('resourceCenter.batch.selectionPrepareFailed'));
    } finally {
      selectionPreviewLoading.value = false;
    }
  }

  function closeSearchAi() {
    searchAiVisible.value = false;
    explicitSearchAiResourceContext.value = null;
  }

  function toggleSearchAi() {
    if (allMatchingActive.value) {
      message.warning(t('resourceCenter.batch.aiExplicitOnly'));
      return;
    }
    const selected = mappedItems.value.filter((item) => selectedIds.value.includes(getItemSelectionKey(item)));
    if (selected.length > 10) message.info(t('ai.materialLimit', { count: 10 }));
    if (searchAiVisible.value) {
      closeSearchAi();
      return;
    }
    explicitSearchAiResourceContext.value = null;
    searchAiVisible.value = true;
    if (bookmark.isMobile) mobileBatchActionsOpen.value = false;
  }

  function openResourceAi(item: DisplaySearchItem) {
    if (!['note', 'bookmark', 'file', 'todo'].includes(item.type)) return;
    inspectResource(item);
    explicitSearchAiResourceContext.value = {
      ref: { type: item.type as AiSkillResourceRef['type'], id: String(item.id) },
      type: item.type as GlobalSearchType,
      title: String(item.title || '').trim(),
    };
    searchAiVisible.value = true;
  }

  function getSelectedItemsByTypes(types: SearchType[]) {
    return allVisibleItems.value
      .filter((item) => selectedIds.value.includes(getItemSelectionKey(item)))
      .filter((item) => types.includes(item.type))
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
      }));
  }

  function openBatchTagWorkspace(mode: 'add' | 'remove') {
    const selectedItems = getSelectedItemsByTypes(['bookmark', 'note', 'file']);
    const excludedTagCount = excludedSelectionIds.value.filter((id) => id.startsWith('tag:')).length;
    const selectedTagCount = allMatchingActive.value
      ? Math.max(0, Number(allMatchingSummary.value?.typeCounts?.tag || 0) - excludedTagCount)
      : selectedIds.value.filter((id) => id.startsWith('tag:')).length;
    const editableCount = allMatchingActive.value ? selectedCount.value - selectedTagCount : selectedItems.length;
    if (!editableCount) {
      message.warning(t('resourceCenter.batch.onlyResourceSupported'));
      return;
    }
    if (selectedTagCount > 0) {
      message.info(t('resourceCenter.batch.tagIgnoredForTagOps', { count: selectedTagCount }));
    }
    sessionStorage.setItem(
      SEARCH_BATCH_STORAGE_KEY,
      JSON.stringify({
        selection: getCurrentBatchSelection(),
        items: selectedItems,
        selectedCount: editableCount,
      }),
    );
    router.push({
      path: '/search/batch-tags',
      query: { mode, from: route.fullPath },
    });
  }

  function batchAddTag() {
    if (!selectedCount.value) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    recordOperation({ module: '资源中心', operation: '进入批量加标签工作页' });
    openBatchTagWorkspace('add');
  }

  function batchRemoveTag() {
    if (!selectedCount.value) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    recordOperation({ module: '资源中心', operation: '进入批量移除标签工作页' });
    openBatchTagWorkspace('remove');
  }

  function getSingleDeleteApi(type: SearchType) {
    if (type === 'bookmark') return '/api/bookmark/delBookmark';
    if (type === 'note') return '/api/note/delNote';
    if (type === 'file') return '/api/file/deleteFileById';
    return '/api/bookmark/delTag';
  }

  function handleItemMenu(action: string, item: DisplaySearchItem) {
    if (action === 'open') {
      openItem(item);
      return;
    }
    if (action === 'addInbox' && item.type !== 'tag') {
      addItemsToInbox([item]);
      return;
    }
    if (action === 'ai' && item.type !== 'tag') {
      openResourceAi(item);
      return;
    }
    if (action !== 'delete') return;
    const typeLabel = getSearchTypeLabel(t, item.type);
    const name = item.title || '-';
    Alert.alert({
      title: t('resourceCenter.batch.deleteConfirmTitle'),
      content:
        item.type === 'tag'
          ? t('resourceCenter.deleteConfirmUnbind', { type: typeLabel, name })
          : t('resourceCenter.deleteConfirmTrash', { type: typeLabel, name }),
      okText: t('resourceCenter.batch.deleteConfirmOk'),
      cancelText: t('resourceCenter.batch.deleteConfirmCancel'),
      async onOk() {
        try {
          const api = getSingleDeleteApi(item.type);
          const res = await apiBasePost(api, { id: item.id });
          if (Number(res?.status) !== 200) {
            message.error(res?.msg || t('resourceCenter.batch.deleteFailed'));
            return;
          }
          recordOperation({ module: '资源中心', operation: `右键删除${typeLabel}成功【${name}】` });
          message.success(t('resourceCenter.batch.deleteSuccess', { count: 1 }));
          selectedIds.value = selectedIds.value.filter((id) => id !== getItemSelectionKey(item));
          clearGlobalSearchCache();
          await refreshData();
        } catch (error) {
          message.error(t('resourceCenter.batch.deleteFailed'));
        }
      },
    });
  }

  async function addItemsToInbox(items: DisplaySearchItem[]) {
    const resources = items
      .filter((item) => item.type !== 'tag')
      .map((item) => ({ resourceType: item.type as 'bookmark' | 'note' | 'file', resourceId: String(item.id) }));
    await addResourcesToInbox(resources, '资源中心');
  }

  async function batchAddToInbox() {
    if (!selectedCount.value) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    try {
      const res = await batchAddSearchResourcesToInbox(getCurrentBatchSelection());
      if (Number(res?.status) !== 200) {
        message.error(res?.msg || t('inbox.addFailed'));
        return;
      }
      const changed = Number(res?.data?.added || 0) + Number(res?.data?.reopened || 0);
      message.success(changed > 0 ? t('inbox.addedCount', { count: changed }) : t('inbox.alreadyPending'));
      if (changed > 0) recordOperation({ module: '资源中心', operation: `批量加入待整理【${changed}项】` });
      await inbox.refreshCount();
    } catch {
      message.error(t('inbox.addFailed'));
    }
  }

  async function batchDelete() {
    if (!selectedCount.value) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    const selection = getCurrentBatchSelection();
    const requestedCount = selectedCount.value;
    Alert.alert({
      title: t('resourceCenter.batch.deleteConfirmTitle'),
      content: t('resourceCenter.batch.deleteConfirmContent', { count: requestedCount }),
      okText: t('resourceCenter.batch.deleteConfirmOk'),
      cancelText: t('resourceCenter.batch.deleteConfirmCancel'),
      async onOk() {
        try {
          const res = await batchDeleteSearchResources(selection);
          if (Number(res?.status) !== 200) {
            message.error(res?.msg || t('resourceCenter.batch.deleteFailed'));
            return;
          }
          const affected = Number(res?.data?.affectedItemCount || 0);
          recordOperation({
            module: '资源中心',
            operation: `批量删除资源成功【选中${requestedCount}条，删除${affected}条】`,
          });
          message.success(t('resourceCenter.batch.deleteSuccess', { count: affected }));
          clearBatchSelection();
          clearGlobalSearchCache();
          await refreshData();
        } catch (error) {
          message.error(t('resourceCenter.batch.deleteFailed'));
        }
      },
    });
  }

  let isInitialRouteLoad = true;
  watch(
    () => route.query,
    () => {
      clearBatchSelection();
      applyRouteState();
      nextTick(() => {
        const scrollRoot = bookmark.isMobile
          ? resultScrollRef.value
          : document.querySelector<HTMLElement>('.search-center-route .search-page');
        scrollRoot?.scrollTo({ top: 0 });
      });
      if (isKnowledgeMapView.value) {
        requestSeq += 1;
        viewState.loading = false;
        viewState.loadingMore = false;
        resultLoadObserver?.disconnect();
        return;
      }
      // 模块级搜索缓存用于同页筛选/视图切换，不能跨页面进入继续充当资源事实源。
      // 每次 SearchCenter 重新挂载时强制请求一次，确保新增、编辑或删除后的资源立即可见。
      const force = isInitialRouteLoad;
      isInitialRouteLoad = false;
      void loadData(force);
    },
    { immediate: true },
  );

  watch(
    () => queryState.view,
    (val) => {
      localStorage.setItem(SEARCH_VIEW_STORAGE_KEY, val);
    },
  );

  watch(
    () => bookmark.isMobile,
    () => {
      void setupResultLoadObserver();
    },
  );

  function focusSearchInput() {
    nextTick(() => {
      const host = document.getElementById('search-center-input');
      const input = host && (host.tagName === 'INPUT' ? host : host.querySelector('input'));
      (input as HTMLInputElement | null)?.focus();
    });
  }

  function onMobileSearchKeyword(value: string | number | undefined) {
    queryState.keyword = String(value ?? '');
    syncQueryDebounced();
  }

  // 资源列表自带搜索顶栏；知识地图切为标准二级页顶栏，避免全局宽搜索与本地搜索重复。
  useMobileTopBar(['searchCenter'], {
    ownTopBar: () => !isKnowledgeMapView.value,
    title: () => (isKnowledgeMapView.value ? t('knowledgeMap.title') : ''),
    onBack: () => {
      if (isKnowledgeMapView.value) void router.replace('/search');
      else leaveSearchPage();
    },
    showNotification: false,
    onAuxiliaryAction: () => {
      const host = document.getElementById('knowledge-map-mobile-search');
      const input = host?.tagName === 'INPUT' ? host : host?.querySelector('input');
      (input as HTMLInputElement | null)?.focus();
    },
    auxiliaryActionLabel: () => (isKnowledgeMapView.value ? t('knowledgeMap.searchPlaceholder') : ''),
    auxiliaryActionIcon: () => (isKnowledgeMapView.value ? icon.navigation.search : ''),
  });

  // 完整搜索页是二级页面：返回发起搜索的来源页，没有历史时回落资料首页
  function leaveSearchPage() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    void router.push('/home');
  }

  // 打开资源中心自动聚焦搜索框(移动端不主动聚焦,避免一进页面就弹出软键盘)。
  onMounted(() => {
    void setupResultLoadObserver();
    // 移动端类型 Tab 已移入筛选抽屉，不再需要横向滚动定位；也不主动聚焦，避免一进页面就弹软键盘
    if (!bookmark.isMobile) focusSearchInput();
  });

  onBeforeUnmount(() => {
    if (syncTimer.value) clearTimeout(syncTimer.value);
    if (skeletonTimer !== null) window.clearTimeout(skeletonTimer);
    requestSeq += 1;
    resultLoadObserver?.disconnect();
  });
</script>

<style scoped lang="less">
  .search-center-route {
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }

  /* 完整搜索页专用顶栏：占位与共享 MobileTopBar 一致（56px），
     其下的 ResourcePageShell 需要相应让出高度。 */

  .search-page {
    --search-hero-bg: var(--surface-raised-background);
    --search-panel-bg: var(--workspace-panel-bg-color);
    --search-card-bg: var(--card-background);
    --search-border-color: var(--surface-border-color);
    --search-muted-bg: color-mix(in srgb, var(--surface-panel-bg) 88%, var(--card-background));

    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding: 0;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .section-switcher {
    margin-bottom: 12px;
  }

  .resource-center-map {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .search-page--night {
    --search-hero-bg: var(--surface-raised-background);
    --search-panel-bg: var(--workspace-panel-bg-color);
    --search-card-bg: var(--card-background);
    --search-border-color: var(--surface-border-color);
    --search-muted-bg: color-mix(in srgb, var(--surface-panel-bg) 88%, var(--card-background));
  }

  .search-header {
    --b-card-background: var(--search-hero-bg);
    --b-card-border-color: var(--search-border-color);
    --b-card-shadow: var(--surface-raised-shadow);

    position: relative;
    overflow: hidden;
    border-radius: 18px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background:
      radial-gradient(
        circle at 97% -10%,
        color-mix(in srgb, var(--resource-bookmark-color) 7%, transparent),
        transparent 42%
      ),
      var(--search-hero-bg);
    border-color: var(--search-border-color);
    box-shadow: var(--surface-raised-shadow);
  }

  .search-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .search-header-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .search-header-sub {
    color: var(--desc-color);
    font-size: 13px;
  }

  .eyebrow {
    color: var(--resource-bookmark-color);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
    font-weight: 800;
  }

  p {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.7;
  }

  :deep(.b-input) {
    border-radius: 18px;
  }

  .refresh-btn,
  .clear-btn,
  .filter-item,
  .batch-btn,
  .tagless-btn,
  .view-btn,
  .empty-action-btn {
    border: 0;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }

  .refresh-btn {
    height: 46px;
    border-radius: 16px;
    color: #fff;
    background: linear-gradient(
      135deg,
      var(--resource-bookmark-color),
      color-mix(in srgb, var(--resource-bookmark-color) 70%, #ffffff)
    );
    font-weight: 700;
  }

  .refresh-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    transform-origin: center;
  }

  .refresh-icon--spinning {
    animation: search-refresh-spin 0.7s linear infinite;
  }

  @keyframes search-refresh-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .search-header-input {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 110px;
    gap: 10px;
    align-items: center;
  }

  .result-subtitle,
  .filter-count {
    color: var(--desc-color);
  }

  .desktop-result-heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
    white-space: nowrap;
  }

  .desktop-result-heading span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .resource-scope-pane,
  .resource-inspector-pane {
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--search-border-color);
    border-radius: 16px;
    background: var(--search-card-bg);
  }

  .resource-scope-pane {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 12px 10px;
  }

  .resource-scope-section,
  .resource-scope-list {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .resource-scope-title {
    width: 100%;
    height: auto;
    min-height: 30px;
    padding: 3px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--desc-color);
    background: transparent;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    text-align: left;
  }

  .resource-scope-title:hover {
    color: var(--text-color);
    background: var(--search-muted-bg);
  }

  .resource-scope-chevron {
    flex: 0 0 auto;
    transform: rotate(-90deg);
    transition: transform 0.18s ease;
  }

  .resource-scope-chevron.is-expanded {
    transform: rotate(0deg);
  }

  .resource-scope-item {
    width: 100%;
    min-height: 40px;
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 11px;
    background: transparent;
    color: var(--text-color);
    text-align: left;
  }

  .resource-scope-item:hover,
  .resource-scope-item.active {
    border-color: color-mix(in srgb, var(--primary-color) 30%, var(--search-border-color));
    background: color-mix(in srgb, var(--primary-color) 8%, var(--search-card-bg));
    color: var(--primary-color);
  }

  .resource-scope-item__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-scope-divider {
    height: 1px;
    margin: 8px 6px;
    background: var(--search-border-color);
  }

  .resource-inspector-pane {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    overflow: hidden;
  }

  .search-ai-panel {
    width: 100%;
    min-height: 0;
    flex: 1 1 auto;
    box-sizing: border-box;
    border-color: var(--search-border-color);
    background: var(--search-card-bg);
  }

  .search-ai-panel--mobile {
    flex: 0 0 auto;
    margin: 0 0 12px;
  }

  .resource-inspector-hero {
    --inspector-accent: var(--primary-color);
    display: flex;
    flex-direction: column;
    gap: 11px;
    padding: 14px;
    border: 1px solid var(--search-border-color);
    border-radius: 14px;
    background:
      linear-gradient(145deg, color-mix(in srgb, var(--inspector-accent) 10%, transparent), transparent 62%),
      var(--search-card-bg);
  }

  .resource-inspector-hero.is-bookmark {
    --inspector-accent: var(--resource-bookmark-color, #7166ff);
  }

  .resource-inspector-hero.is-note {
    --inspector-accent: var(--resource-note-color, #10a77a);
  }

  .resource-inspector-hero--expanded {
    min-height: 0;
    flex: 1 1 0;
    overflow: hidden;
  }

  .resource-inspector-hero.is-file {
    --inspector-accent: var(--resource-file-color, #f58b22);
  }

  .resource-inspector-hero.is-tag {
    --inspector-accent: var(--resource-tag-color, #e5488f);
  }

  .resource-inspector-identity {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .resource-inspector-icon {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--inspector-accent) 28%, var(--search-border-color));
    border-radius: 13px;
    color: var(--inspector-accent);
    background: color-mix(in srgb, var(--inspector-accent) 11%, var(--search-card-bg));
  }

  .resource-inspector-identity__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .resource-inspector-identity__copy > span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .resource-inspector-identity__copy > strong {
    color: var(--inspector-accent);
    font-size: 12px;
    font-weight: 700;
  }

  .resource-inspector-hero h2 {
    margin: 0;
    display: -webkit-box;
    overflow: hidden;
    font-size: 17px;
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .resource-inspector-description,
  .resource-inspector-empty p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.55;
  }

  .resource-inspector-description {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  .resource-inspector-hero--expanded .resource-inspector-description {
    min-height: 0;
    display: block;
    flex: 1 1 auto;
    overflow: hidden auto;
    -webkit-line-clamp: unset;
  }

  .resource-inspector-meta {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 10px;
    border: 1px solid var(--search-border-color);
    border-radius: 12px;
    background: var(--search-muted-bg);
  }

  .resource-inspector-meta > div {
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr);
    gap: 8px;
  }

  .resource-inspector-meta dt,
  .resource-inspector-meta dd {
    margin: 0;
    font-size: 12px;
  }

  .resource-inspector-meta dt {
    color: var(--desc-color);
  }

  .resource-inspector-meta dd {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-inspector-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .resource-inspector-tags > span {
    width: 100%;
    color: var(--desc-color);
    font-size: 12px;
  }

  .resource-inspector-tags :deep(.resource-tag-chip) {
    width: auto;
    max-width: 100%;
  }

  .resource-inspector-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--search-border-color);
  }

  .resource-inspector-actions :deep(.b_btn) {
    width: 100%;
    min-width: 0;
    padding-inline: 12px;
    font-size: 14px;
    gap: 6px;
  }

  .resource-inspector-action--inbox {
    border-color: color-mix(in srgb, var(--primary-color) 28%, var(--search-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--search-card-bg));
  }

  .resource-inspector-action--delete {
    border-color: color-mix(in srgb, var(--danger-color, #e5484d) 32%, var(--search-border-color));
    color: var(--danger-color, #e5484d);
    background: color-mix(in srgb, var(--danger-color, #e5484d) 6%, var(--search-card-bg));
  }

  .resource-inspector-empty {
    min-height: 220px;
    display: grid;
    align-content: center;
    gap: 8px;
    text-align: center;
  }

  .resource-result-entry {
    border-radius: 14px;
  }

  .resource-result-entry.is-inspected :deep(.result-item) {
    border-color: var(--primary-color);
    box-shadow: none;
  }

  .search-layout {
    margin-top: 20px;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }

  .result-panel {
    --b-card-border-color: var(--search-border-color);

    border-radius: 20px;
  }

  .filter-item {
    width: 100%;
    display: grid;
    grid-template-columns: 10px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-radius: 12px;
    background: transparent;
    text-align: left;
  }

  .filter-item.active,
  .filter-item:hover {
    background: var(--search-muted-bg);
  }

  .desktop-type-trigger {
    width: 168px;
    min-width: 0;
    height: 34px;
    padding: 0 10px;
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--search-border-color);
    border-radius: 10px;
    background: var(--search-muted-bg);
    text-align: left;
  }

  .desktop-type-trigger__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 650;
  }

  .desktop-type-trigger__arrow {
    color: var(--desc-color);
    font-size: 11px;
  }

  .desktop-type-menu {
    width: 210px;
    padding: 6px;
    display: grid;
    gap: 2px;
  }

  .desktop-type-menu .filter-item {
    min-height: 36px;
    padding: 7px 9px;
  }

  .filter-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #94a3b8;
  }

  .filter-dot--bookmark {
    background: var(--resource-bookmark-color);
  }

  .filter-dot--note {
    background: var(--resource-note-color);
  }

  .filter-dot--file {
    background: var(--resource-file-color);
  }

  .filter-dot--tag {
    background: var(--resource-tag-color);
  }

  .filter-dot--todo {
    background: var(--primary-color);
  }

  .result-panel {
    --b-card-background: var(--search-card-bg);
    --b-card-shadow: var(--surface-card-shadow);

    min-height: 420px;
  }

  .result-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--search-border-color);
  }

  .result-title {
    font-size: 20px;
    font-weight: 800;
  }

  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  .clear-btn {
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--search-muted-bg);
  }

  .clear-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .advanced-filters {
    margin-top: 12px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid var(--search-border-color);
    background: var(--search-panel-bg);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .filter-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }

  .refresh-btn--inline {
    height: 48px;
    border-radius: 12px;
    font-weight: 700;
  }

  .select-wrap {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    color: var(--desc-color);
  }

  .select-wrap select {
    height: 32px;
    border-radius: 10px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    color: var(--text-color);
    padding: 0 10px;
    min-width: 120px;
  }

  .filter-select {
    min-width: 140px;
  }

  .view-switch {
    display: inline-flex;
    border: 1px solid var(--search-border-color);
    border-radius: 10px;
    overflow: hidden;
  }

  .view-btn {
    padding: 6px 12px;
    background: transparent;
  }

  .view-btn.active {
    background: var(--primary-color);
    color: #fff;
  }

  .tagless-btn {
    padding: 6px 12px;
    border-radius: 10px;
    background: var(--search-muted-bg);
  }

  .tagless-btn.active {
    background: color-mix(in srgb, var(--resource-file-color) 16%, transparent);
    color: var(--resource-file-color);
  }

  .tag-filter-wrap {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .tag-filter-label {
    color: var(--desc-color);
    font-size: 13px;
    line-height: 30px;
  }

  .tag-filter-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .tag-filter-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-right: 2px;
  }

  .tag-toggle-btn {
    align-self: flex-start;
    border: 0;
    cursor: pointer;
    background: transparent;
    color: var(--resource-bookmark-color);
    font-size: 12px;
    font-weight: 600;
    padding: 2px 0;
  }

  .tag-filter-popover {
    width: min(560px, calc(100vw - 32px));
    max-height: min(320px, calc(100dvh - 32px));
    padding: 12px;
    box-sizing: border-box;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    overflow-y: auto;
  }

  .tag-filter-popover :deep(.input-container) {
    flex: 0 0 100%;
    width: 100%;
    margin-bottom: 4px;
  }

  .tag-chip {
    min-height: 28px;
  }

  .batch-toolbar {
    margin-top: 12px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .batch-left,
  .batch-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--desc-color);
    font-size: 13px;
  }

  .batch-btn {
    min-height: 30px;
    border-radius: 10px;
    padding: 0 10px;
    background: var(--search-muted-bg);
  }

  .batch-select-all {
    min-height: 28px;
    padding-inline: 10px;
    border-radius: 9px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--search-muted-bg));
  }

  .result-scroll-area {
    position: relative;
    margin-top: 12px;
    box-sizing: border-box;
    border-radius: 14px;
  }

  .result-load-sentinel {
    min-height: 32px;
    padding: 10px 0 2px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
  }

  .result-group {
    margin-top: 16px;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    color: var(--desc-color);
    font-weight: 700;
    font-size: 13px;
    margin-bottom: 10px;
  }

  .result-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
  }

  .result-grid--list {
    /* minmax(0,1fr):裸 1fr 的最小值是 min-content,会被超长描述撑破 → 横向溢出、标签/时间被推出视口;
       minmax(0,1fr) 让单列最小可收缩到 0,列表行内 row-desc 的 flex-shrink 才生效,行宽收敛到容器内 */
    grid-template-columns: minmax(0, 1fr);
  }

  .result-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .result-skeleton--list {
    grid-template-columns: 1fr;
  }

  .result-sk-card {
    min-height: 168px;
    border-radius: 16px;
    border: 1px solid var(--search-border-color);
    background: var(--search-card-bg);
    box-shadow: var(--surface-card-shadow);
    padding: 14px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* 列表骨架:紧凑横向行,与重构后的列表行一致(避免加载完从大卡跳变) */
  .result-skeleton--list .result-sk-card {
    min-height: 0;
    flex-direction: row;
    align-items: center;
    padding: 10px 14px;
    gap: 12px;
  }
  .result-skeleton--list .result-sk-top {
    margin-bottom: 0;
  }
  .result-skeleton--list .result-sk-line--title {
    width: 160px;
  }
  .result-skeleton--list .result-sk-line--desc {
    flex: 1;
    width: auto;
  }
  .result-skeleton--list .result-sk-line--desc2,
  .result-skeleton--list .result-sk-meta {
    display: none;
  }

  .result-sk-top {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    margin-bottom: 4px;
  }

  .result-sk-dot {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 76%, var(--background-color));
    animation: sk-breathe 1.55s ease-in-out infinite alternate;
  }

  .result-sk-line {
    height: 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 76%, var(--background-color));
    animation: sk-breathe 1.55s ease-in-out infinite alternate;
  }

  .result-sk-line--short {
    width: 120px;
  }

  .result-sk-line--title {
    height: 10px;
    width: 100%;
  }

  .result-sk-line--desc {
    width: 92%;
  }

  .result-sk-line--desc2 {
    width: 86%;
  }

  .result-sk-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: auto;
  }

  .result-sk-line--meta1 {
    width: 46%;
    height: 11px;
    border-radius: 999px;
  }

  .result-sk-line--meta2 {
    width: 58%;
    height: 11px;
    border-radius: 999px;
  }

  @keyframes sk-breathe {
    0% {
      opacity: 0.78;
    }
    100% {
      opacity: 1;
    }
  }

  .empty-state {
    min-height: 300px;
    display: grid;
    place-items: center;
    align-content: center;
    text-align: center;
    color: var(--desc-color);
  }

  .result-error-state {
    min-height: 260px;
    padding: 28px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 1px dashed color-mix(in srgb, var(--danger-color, #dc2626) 30%, var(--card-border-color));
    border-radius: 14px;
    text-align: center;
    background: color-mix(in srgb, var(--danger-color, #dc2626) 4%, var(--card-background));
  }

  .result-error-state h3,
  .result-error-state p {
    margin: 0;
  }

  .result-error-state p,
  .result-error-request-id {
    color: var(--desc-color);
    font-size: 13px;
  }

  .empty-state h3 {
    margin: 16px 0 8px;
    color: var(--text-color);
  }

  .empty-orbit {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    border: 12px solid color-mix(in srgb, var(--resource-bookmark-color) 14%, transparent);
    border-top-color: var(--resource-bookmark-color);
  }

  .empty-actions {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .empty-action-btn {
    min-height: 32px;
    border-radius: 12px;
    padding: 0 12px;
    background: var(--search-muted-bg);
  }

  /* 桌面端工作区：顶部承担定位与搜索，筛选保持可见，仅让结果列表滚动。 */
  @media (min-width: 768px) {
    .search-center-shell :deep(.resource-page-body) {
      min-height: 0;
      overflow: hidden;
    }

    .search-page {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
      overflow: hidden;
      padding: 0;
    }

    .search-page-topbar {
      flex: 0 0 auto;
      min-height: 34px;
      display: flex;
      align-items: center;
    }

    .section-switcher {
      margin-bottom: 0;
    }

    .search-header {
      grid-column: 2;
      grid-row: 1;
      min-height: 58px;
      box-sizing: border-box;
      padding: 8px 12px;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      border-radius: 14px;
      box-shadow: var(--surface-raised-shadow);
    }

    .search-header-copy {
      flex: 0 1 460px;
      min-width: 280px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .search-header-title {
      flex-wrap: nowrap;
      align-items: center;
    }

    .search-header-sub {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search-header-input {
      width: 100%;
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    :deep(.search-header-input .b-input) {
      min-width: 220px;
      flex: 1 1 320px;
      border-radius: 12px;
    }

    .search-header-icon-btn {
      height: 42px;
      border-radius: 11px;
      font-weight: 600;
    }

    .search-header-icon-btn {
      width: 42px;
      min-width: 42px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-color);
      background: var(--search-muted-bg);
    }

    .search-layout {
      flex: 1 1 auto;
      min-height: 0;
      margin-top: 0;
      grid-template-columns: clamp(220px, 14vw, 280px) minmax(0, 1fr) clamp(350px, 20vw, 410px);
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px 14px;
      align-items: stretch;
      overflow: hidden;
    }

    .resource-scope-pane,
    .resource-inspector-pane {
      min-height: 0;
      height: 100%;
      grid-row: 1 / 3;
    }

    .resource-scope-pane {
      grid-column: 1;
    }

    .resource-inspector-pane {
      grid-column: 3;
    }

    .result-panel {
      grid-column: 2;
      grid-row: 2;
    }

    .filter-item {
      height: auto;
      min-height: 38px;
      line-height: 1.2;
      padding: 8px 10px;
      border-radius: 10px;
      justify-content: initial;
      background: transparent;
    }

    .filter-item.active {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 9%, var(--search-muted-bg));
    }

    .result-panel {
      min-height: 0;
      padding: 14px;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .result-toolbar--summary {
      flex: 0 0 auto;
      min-height: 38px;
      padding: 0 2px 7px;
      gap: 8px;
    }

    .result-heading {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .result-title {
      flex: 0 0 auto;
      font-size: 17px;
    }

    .result-subtitle {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }

    .clear-btn {
      height: 28px;
      min-height: 28px;
      padding: 0 10px;
      border-radius: 9px;
      background: transparent;
    }

    .desktop-result-controls {
      min-width: max-content;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 7px;
      overflow: visible;
    }

    .search-header .select-wrap > span,
    .search-header .tagless-btn {
      display: none;
    }

    .result-toolbar--summary > .toolbar-actions {
      flex: 0 0 auto;
      margin-left: auto;
      white-space: nowrap;
    }

    .advanced-filters {
      flex: 0 0 auto;
      margin-top: 6px;
      padding: 6px 8px;
      border: 0;
      border-radius: 10px;
      background: color-mix(in srgb, var(--search-muted-bg) 78%, transparent);
    }

    .filter-row {
      flex-wrap: nowrap;
      gap: 8px;
    }

    .select-wrap {
      flex: 0 0 auto;
    }

    .filter-select {
      width: 112px;
      min-width: 112px;
    }

    .view-switch {
      flex: 0 0 auto;
      height: 32px;
      border-radius: 9px;
    }

    .view-btn,
    .tagless-btn,
    .select-visible-btn {
      height: 30px;
      min-height: 30px;
      line-height: 1;
      padding: 0 10px;
      border-radius: 8px;
      background: transparent;
      font-size: 12px;
    }

    .view-btn.active {
      border-radius: 8px;
    }

    .tagless-btn {
      background: color-mix(in srgb, var(--background-color) 70%, transparent);
    }

    .select-visible-btn {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 9%, var(--background-color));
    }

    .tag-filter-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .tag-filter-label {
      flex: 0 0 auto;
      display: grid;
      gap: 1px;
      line-height: 1.2;
    }

    .tag-filter-label small {
      color: var(--desc-color);
      font-size: 10px;
      font-weight: 400;
    }

    .tag-filter-main {
      min-width: 0;
      flex: 1 1 auto;
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }

    .tag-filter-list {
      min-width: 0;
      flex: 1 1 auto;
      flex-wrap: nowrap;
      gap: 6px;
      overflow: hidden;
    }

    .tag-filter-list .tag-chip {
      flex: 0 0 auto;
      max-width: 100%;
    }

    .tag-chip {
      min-height: 26px;
      height: 26px;
      line-height: 1;
    }

    .tag-toggle-btn {
      flex: 0 0 auto;
      align-self: center;
      height: 22px;
      min-height: 22px;
      padding: 0 4px;
      margin-top: 2px;
      background: transparent;
    }

    .batch-toolbar {
      flex: 0 0 auto;
      min-height: 40px;
      margin-top: 8px;
      padding: 5px 8px 5px 12px;
      border-radius: 11px;
      background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
      box-shadow: inset 3px 0 0 var(--primary-color);
    }

    .batch-actions :deep(.b_btn) {
      height: 28px;
      padding: 0 10px;
      font-size: 12px;
    }

    .result-scroll-area {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden auto;
      margin-top: 6px;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      mask-image: linear-gradient(to bottom, transparent 0, #000 8px, #000 calc(100% - 8px), transparent 100%);
    }

    .result-group:first-child,
    .result-skeleton {
      margin-top: 4px;
    }

    .result-group:last-child {
      margin-bottom: 0;
    }

    .result-grid {
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }

    .result-grid--list {
      grid-template-columns: minmax(0, 1fr);
    }

    .empty-state {
      min-height: 100%;
    }
  }

  @media (min-width: 768px) and (max-width: 1180px) {
    .search-header-copy {
      flex-basis: 300px;
      min-width: 220px;
    }

    .search-header-sub {
      display: none;
    }

    .filter-row {
      flex-wrap: wrap;
    }

    .select-visible-btn {
      margin-left: 0;
    }

    .result-toolbar--summary {
      flex-wrap: wrap;
    }

    .desktop-result-controls {
      width: 100%;
      min-width: 0;
      order: 3;
      flex-basis: 100%;
      flex-wrap: wrap;
    }

    .search-header-input {
      flex-wrap: wrap;
    }

    :deep(.search-header-input > .input-container) {
      flex: 1 1 calc(100% - 100px);
      min-width: 220px;
    }

    :deep(.search-header-input > .b-tooltip-wrap) {
      flex: 0 0 auto;
    }
  }

  @media (min-width: 768px) and (max-width: 1380px) {
    .search-layout {
      grid-template-columns: minmax(176px, 200px) minmax(0, 1fr) minmax(270px, 300px);
      gap: 10px;
    }

    .result-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (min-width: 768px) and (max-width: 980px) {
    .search-layout {
      grid-template-columns: minmax(96px, 120px) minmax(240px, 1fr) minmax(210px, 28vw);
      gap: 8px;
    }

    .resource-scope-pane {
      padding: 9px 6px;
    }

    .resource-scope-item {
      grid-template-columns: 8px minmax(0, 1fr);
      gap: 7px;
      padding-inline: 7px;
    }

    .resource-scope-item .filter-count {
      display: none;
    }

    .resource-scope-title {
      padding-inline: 6px;
    }

    .resource-inspector-pane {
      padding: 10px;
    }

    .resource-inspector-hero {
      padding: 11px;
    }

    .resource-inspector-hero h2 {
      font-size: 15px;
    }

    .resource-inspector-meta > div {
      grid-template-columns: minmax(58px, auto) minmax(0, 1fr);
    }

    .resource-inspector-actions :deep(.b_btn) {
      padding-inline: 8px;
      font-size: 12px;
    }
  }

  @media (min-width: 768px) and (max-width: 900px) {
    .desktop-result-controls {
      gap: 5px;
    }

    .desktop-result-controls .select-wrap > span {
      display: none;
    }

    .desktop-result-controls .filter-select {
      width: 104px;
      min-width: 104px;
    }

    .desktop-result-controls .view-btn,
    .desktop-result-controls .tagless-btn,
    .desktop-result-controls .select-visible-btn {
      padding-inline: 8px;
    }
  }

  @media (max-width: 767px) {
    .search-page {
      padding: 0;
      display: block;
      overflow-y: auto;
    }

    .search-header {
      padding: 14px 16px;
      border-radius: 16px;
    }

    .search-header-copy {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    h1 {
      font-size: 18px;
    }

    .search-layout {
      grid-template-columns: 1fr;
    }

    .search-header-input {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .tag-filter-wrap {
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .result-panel {
      overflow: visible;
    }

    .result-scroll-area {
      overflow: visible;
    }

    .filter-item {
      padding: 6px;
    }
  }

  @media (max-width: 767px) {
    .search-center-shell :deep(.resource-page-header) {
      display: none;
    }

    .search-page-topbar {
      margin-bottom: 8px;
    }

    /* 页面自带 56px 顶栏后，正文容器不能再按整屏高度撑开 */
    .search-center-route {
      display: flex;
      flex-direction: column;
    }

    .search-center-route .search-center-shell {
      min-height: 0;
      flex: 1 1 auto;
    }

    .section-switcher {
      margin-bottom: 0;
    }

    .search-header {
      padding: 10px 12px;
    }

    .search-header-input {
      grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
      gap: 8px;
    }

    .refresh-btn {
      width: 100%;
      min-width: 0;
      height: 38px;
      padding-inline: 10px;
      border-radius: 11px;
    }

    .search-layout {
      margin-top: 12px;
      gap: 12px;
    }

    .result-panel {
      min-height: 0;
      padding: 10px;
      border-radius: 14px;
    }

    .result-toolbar--summary {
      min-height: 0;
      padding-bottom: 8px;
      align-items: center;
      flex-direction: row;
      gap: 8px;
    }

    .result-heading {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .result-title {
      white-space: nowrap;
      font-size: 16px;
      line-height: 1.2;
    }

    .result-subtitle {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      line-height: 1.35;
    }

    .toolbar-actions {
      flex: 0 0 auto;
      width: auto;
      gap: 4px;
    }

    .toolbar-actions :deep(.b_btn) {
      flex: 0 0 auto;
      min-width: 0;
      height: 28px;
      min-height: 28px;
      padding: 0 8px;
      border-radius: 8px;
      font-size: 12px;
    }

    .advanced-filters {
      margin-top: 8px;
      padding: 8px;
      gap: 8px;
      border-radius: 12px;
    }

    .filter-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      align-items: center;
    }

    .result-panel,
    .result-scroll-area,
    .advanced-filters,
    .filter-row,
    .batch-toolbar,
    .batch-actions,
    .result-group,
    .result-grid {
      min-width: 0;
      max-width: 100%;
    }

    .select-wrap {
      min-width: 0;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px;
      font-size: 11px;
    }

    .filter-select {
      width: 100%;
      min-width: 0;
    }

    :deep(.filter-select .select-trigger) {
      height: 32px;
      min-height: 32px;
      padding: 0 8px;
      border-radius: 8px;
      font-size: 12px;
    }

    .tagless-btn,
    .select-visible-btn {
      width: 100%;
      height: 32px;
      min-height: 32px;
      padding: 0 8px;
      border-radius: 8px;
      font-size: 12px;
      white-space: nowrap;
    }

    .tag-filter-wrap {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      align-items: center;
    }

    .tag-filter-label {
      font-size: 11px;
      line-height: 26px;
    }

    .tag-filter-main {
      min-width: 0;
      flex-direction: row;
      align-items: center;
      gap: 6px;
    }

    .tag-filter-list {
      min-width: 0;
      flex: 1 1 auto;
      flex-wrap: nowrap;
      gap: 6px;
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      touch-action: pan-x;
      -webkit-overflow-scrolling: touch;
    }

    .tag-filter-list::-webkit-scrollbar {
      display: none;
    }

    .tag-chip {
      flex: 0 0 auto;
      height: 40px;
      min-height: 40px;
      padding: 0 12px;
      line-height: 1;
    }

    .tag-toggle-btn {
      display: none;
    }

    .result-scroll-area {
      margin-top: 8px;
    }

    .batch-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .batch-left {
      min-width: 0;
    }

    .batch-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .batch-actions :deep(.b_btn) {
      width: 100%;
      padding-inline: 8px;
    }

    .result-grid,
    .result-grid--list {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* 移动端使用独立的紧凑工作区：顶部仅保留视图与类型切换，筛选进入底部抽屉，结果占满余下高度。 */
  .search-center-shell--mobile :deep(.resource-page-header) {
    display: none;
  }

  .search-center-shell--mobile :deep(.resource-page-body) {
    overflow: hidden;
  }

  .search-page--mobile {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .search-page--mobile .search-page-topbar {
    flex: 0 0 auto;
    margin-bottom: 6px;
  }

  .search-page--mobile .section-switcher {
    margin-bottom: 0;
  }

  .search-page--mobile .resource-center-map {
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }

  .search-page--mobile .search-layout {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
  }

  .search-page--mobile .filter-item {
    width: auto;
    min-width: max-content;
    height: 40px;
    flex: 0 0 auto;
    padding: 0 11px;
    display: inline-flex;
    grid-template-columns: none;
    gap: 6px;
    border: 1px solid var(--search-border-color);
    border-radius: 999px;
    background: var(--search-card-bg);
    box-shadow: none;
    font-size: 12px;
    line-height: 1;
  }

  .search-page--mobile .filter-item.active {
    border-color: color-mix(in srgb, var(--primary-color) 34%, var(--search-border-color));
    background: color-mix(in srgb, var(--primary-color) 10%, var(--search-card-bg));
    color: var(--primary-color);
  }

  .search-page--mobile .filter-dot {
    width: 6px;
    height: 6px;
  }

  .search-page--mobile .filter-count {
    font-size: 11px;
  }

  .search-page--mobile .result-panel {
    --b-card-background: transparent;
    --b-card-shadow: none;

    flex: 1 1 auto;
    min-height: 0;
    padding: 0 !important;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  /* 类型 Tab 移入抽屉后，这一行要承载「总数 + 各类型数量」；
     与工具按钮挤在同一行会把统计截断，因此让统计独占一行。 */
  .search-page--mobile .result-toolbar--summary {
    flex: 0 0 auto;
    padding: 4px 0 7px;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
  }

  .search-page--mobile .result-heading {
    width: 100%;
    min-width: 0;
    flex: 1 1 100%;
    display: flex;
    align-items: baseline;
    flex-direction: row;
    gap: 7px;
  }

  .search-page--mobile .result-title {
    flex: 0 0 auto;
    font-size: 16px;
  }

  .search-page--mobile .result-subtitle {
    min-width: 0;
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-page--mobile .toolbar-actions--mobile {
    flex: 0 0 auto;
    gap: 4px;
  }

  .search-page--mobile .mobile-toolbar-btn {
    min-width: 40px;
    height: 40px;
    min-height: 40px;
    padding: 0 9px;
    gap: 4px;
    border: 1px solid var(--search-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--search-card-bg);
    font-size: 12px;
    line-height: 1;
  }

  .search-page--mobile .mobile-toolbar-btn--icon {
    width: 40px;
    padding: 0;
  }

  .search-page--mobile .mobile-toolbar-btn.active {
    border-color: color-mix(in srgb, var(--primary-color) 35%, var(--search-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, var(--search-card-bg));
  }

  .search-page--mobile .mobile-toolbar-btn:disabled {
    opacity: 0.48;
  }

  .mobile-filter-count {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--primary-color);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
  }

  .search-page--mobile .batch-toolbar {
    flex: 0 0 auto;
    min-width: 0;
    margin-top: 6px;
    padding: 6px 8px;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--search-card-bg));
  }

  .search-page--mobile .batch-left {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .search-page--mobile .batch-select-all {
    min-height: 30px;
    padding-inline: 8px;
    font-size: 11px;
  }

  .search-page--mobile .batch-actions {
    min-width: 0;
    width: auto;
    flex: 1 1 auto;
    display: flex;
    justify-content: flex-end;
  }

  .search-page--mobile .batch-actions :deep(.b_btn) {
    min-width: 88px;
    height: 32px;
    padding: 0 9px;
    font-size: 12px;
  }

  .search-page--mobile .result-scroll-area {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 0;
    padding: 0 2px 12px;
    overflow: hidden auto;
    border: 0;
    border-radius: 0;
    background: transparent;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }

  .search-page--mobile .result-group {
    margin-top: 9px;
  }

  .search-page--mobile .result-group:first-child,
  .search-page--mobile .result-skeleton {
    margin-top: 7px;
  }

  .search-page--mobile .group-header {
    margin-bottom: 6px;
    padding: 0 2px;
    font-size: 12px;
  }

  .search-page--mobile .result-grid,
  .search-page--mobile .result-grid--list {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .search-page--mobile .result-skeleton {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .search-page--mobile .result-sk-card {
    min-height: 106px;
    padding: 10px 12px;
    gap: 7px;
    border-radius: 14px;
  }

  .search-page--mobile .result-sk-line--desc2,
  .search-page--mobile .result-sk-line--meta2 {
    display: none;
  }

  .search-page--mobile .result-sk-meta {
    min-height: 11px;
    margin-top: 0;
  }

  .search-page--mobile .empty-state {
    min-height: 100%;
  }

  .mobile-filter-drawer {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .mobile-filter-field,
  .mobile-filter-section {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mobile-filter-label {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 650;
  }

  .mobile-filter-select {
    width: 100%;
  }

  .mobile-filter-search {
    padding-bottom: 2px;
  }

  .mobile-filter-search :deep(.b-input) {
    border-radius: 10px;
    font-size: 13px;
  }

  .mobile-filter-toggle {
    width: max-content;
    min-height: 34px;
  }

  .mobile-filter-tags {
    max-height: 30dvh;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    overflow-y: auto;
  }

  /* 类型筛选：两列多选，取代原来占一整行的类型 Tab */
  .mobile-filter-types {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .mobile-filter-type {
    width: 100%;
    min-width: 0;
    height: 38px;
    padding: 0 10px;
    gap: 7px;
    justify-content: flex-start;
    border: 1px solid var(--search-border-color);
    border-radius: 10px;
    color: var(--text-color);
    background: var(--card-background) !important;
    font-size: 13px;
  }

  .mobile-filter-type.active {
    border-color: color-mix(in srgb, var(--primary-color) 55%, transparent);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background)) !important;
  }

  .mobile-filter-type .filter-count {
    margin-left: auto;
    color: var(--desc-color);
    font-size: 11px;
  }

  .mobile-filter-footer {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding-top: 10px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    background: var(--background-color);
  }

  .mobile-filter-footer :deep(.b_btn) {
    width: 100%;
    min-height: 40px;
  }
</style>
