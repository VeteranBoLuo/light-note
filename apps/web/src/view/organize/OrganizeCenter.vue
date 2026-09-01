<template>
  <div class="organize-center-route">
    <ResourcePageShell
      class="organize-shell"
      :title="t('organize.title')"
      :subtitle="t('organize.subtitle')"
      accent="neutral"
      layout="workspace"
      :show-header="!bookmark.isMobile"
    >
      <template #actions>
        <ResourceCenterSectionNav />
      </template>

      <div class="organize-page">
        <ResourceCenterSectionNav v-if="bookmark.isMobile" class="organize-resource-tabs" />

        <div class="organize-workspace">
          <aside v-if="!bookmark.isMobile" class="organize-sidebar" :aria-label="t('organize.navigationLabel')">
            <div class="organize-sidebar__heading">
              <SvgIcon :src="icon.ai.organize" size="18" aria-hidden="true" />
              <span>{{ t('organize.navigationLabel') }}</span>
            </div>
            <BButton
              v-for="item in issueOptions"
              :key="item.key"
              class="organize-nav-item"
              :class="{ active: activeView === item.key }"
              :aria-pressed="activeView === item.key"
              @click="selectView(item.key)"
            >
              <SvgIcon :src="item.icon" size="16" aria-hidden="true" />
              <span>{{ item.label }}</span>
              <span v-if="item.count !== null" class="organize-nav-item__count">{{ item.count }}</span>
            </BButton>
          </aside>

          <component :is="bookmark.isMobile ? 'div' : 'main'" ref="organizeMainRef" class="organize-main" tabindex="-1">
            <nav v-if="bookmark.isMobile" class="organize-mobile-nav" :aria-label="t('organize.navigationLabel')">
              <BButton
                v-for="item in issueOptions"
                :key="item.key"
                class="organize-mobile-nav__item"
                :class="{ active: activeView === item.key }"
                :aria-pressed="activeView === item.key"
                @click="selectView(item.key)"
              >
                <span>{{ item.label }}</span>
                <span v-if="item.count !== null" class="organize-mobile-nav__count">{{ item.count }}</span>
              </BButton>
            </nav>

            <section v-if="activeView === 'overview'" class="organize-overview organize-scroll-view">
              <header class="organize-view-heading">
                <div>
                  <span class="organize-view-heading__eyebrow">{{ t('organize.overview.eyebrow') }}</span>
                  <h2>{{ t('organize.overview.title') }}</h2>
                  <p>{{ t('organize.overview.description') }}</p>
                </div>
                <BButton :loading="organize.summaryLoading" @click="refreshSummary">
                  {{ t('organize.refresh') }}
                </BButton>
              </header>

              <div v-if="organize.summaryError && !summary" class="organize-state organize-state--error" role="alert">
                <strong>{{ t('organize.loadFailedTitle') }}</strong>
                <span>{{ t('organize.loadFailedDescription') }}</span>
                <BButton size="small" type="primary" @click="refreshSummary">{{ t('organize.retry') }}</BButton>
              </div>

              <BLoading v-else :loading="organize.summaryLoading" :title="t('organize.loading')">
                <div class="organize-overview__content">
                  <section class="organize-overview-section organize-overview-section--pending">
                    <div class="organize-overview-section__heading">
                      <div>
                        <h3>{{ t('organize.overview.pendingTitle') }}</h3>
                        <p>{{ t('organize.overview.pendingDescription') }}</p>
                      </div>
                      <span class="organize-overview-section__rule">{{ t('organize.overview.pendingRule') }}</span>
                    </div>
                    <BButton
                      class="organize-overview-card organize-overview-card--pending"
                      @click="selectView('pending')"
                    >
                      <span class="organize-overview-card__icon is-pending">
                        <SvgIcon :src="icon.contextMenu.inbox" size="21" aria-hidden="true" />
                      </span>
                      <span class="organize-overview-card__body">
                        <strong>{{ t('organize.views.pending') }}</strong>
                        <small>{{ t('organize.overview.pendingCardDescription') }}</small>
                      </span>
                      <span class="organize-overview-card__count">{{ pendingCount }}</span>
                    </BButton>
                  </section>

                  <section class="organize-overview-section">
                    <div class="organize-overview-section__heading">
                      <div>
                        <h3>{{ t('organize.overview.governanceTitle') }}</h3>
                        <p>{{ t('organize.overview.governanceDescription') }}</p>
                      </div>
                      <span v-if="summary" class="organize-overview-section__total">
                        {{ t('organize.overview.affectedResources', { count: affectedResourceTotal }) }}
                      </span>
                    </div>
                    <div class="organize-overview-grid">
                      <BButton
                        v-for="card in governanceCards"
                        :key="card.key"
                        class="organize-overview-card"
                        :class="`is-${card.key}`"
                        @click="selectView(card.key)"
                      >
                        <span class="organize-overview-card__icon" :class="`is-${card.key}`">
                          <SvgIcon :src="card.icon" size="20" aria-hidden="true" />
                        </span>
                        <span class="organize-overview-card__body">
                          <strong>{{ card.label }}</strong>
                          <small>{{ card.description }}</small>
                          <span v-if="card.state === 'error'" class="organize-overview-card__state">
                            {{ t('organize.partialUnavailable') }}
                          </span>
                        </span>
                        <span class="organize-overview-card__count">{{ card.count }}</span>
                      </BButton>
                    </div>
                  </section>

                  <div v-if="organize.summaryError" class="organize-inline-warning" role="status">
                    {{ t('organize.staleSummaryHint') }}
                  </div>
                </div>
              </BLoading>
            </section>

            <section v-else-if="activeView === 'pending'" class="organize-issue-view organize-issue-view--pending">
              <header class="organize-view-heading organize-view-heading--compact">
                <div>
                  <span class="organize-view-heading__eyebrow">{{ t('organize.collectionEyebrow') }}</span>
                  <h2>{{ t('organize.views.pending') }}</h2>
                  <p>{{ t('organize.pendingDescription') }}</p>
                </div>
              </header>
              <div class="organize-pending-content">
                <Inbox embedded />
              </div>
            </section>

            <section v-else-if="activeView === 'untagged'" class="organize-issue-view">
              <header class="organize-view-heading organize-view-heading--compact">
                <div>
                  <span class="organize-view-heading__eyebrow">{{ t('organize.governanceEyebrow') }}</span>
                  <h2>{{ t('organize.views.untagged') }}</h2>
                  <p>{{ t('organize.untagged.description') }}</p>
                </div>
              </header>

              <div class="organize-filter-bar">
                <BInput
                  v-model:value="untaggedKeyword"
                  class="organize-filter-bar__search"
                  :placeholder="t('organize.untagged.searchPlaceholder')"
                  clearable
                  @enter="applyUntaggedFilters"
                />
                <BSelect
                  v-model:value="untaggedType"
                  class="organize-filter-bar__type"
                  :aria-label="t('organize.untagged.typeFilter')"
                  :options="resourceTypeOptions"
                  @change="applyUntaggedFilters"
                />
                <BButton @click="applyUntaggedFilters">{{ t('organize.search') }}</BButton>
              </div>

              <div v-if="selectedUntaggedItems.length" class="organize-selection-bar">
                <BCheckbox
                  :model-value="allVisibleUntaggedSelected"
                  :indeterminate="someVisibleUntaggedSelected"
                  @update:model-value="toggleAllVisibleUntagged"
                >
                  {{ t('organize.selectedCount', { count: selectedUntaggedItems.length }) }}
                </BCheckbox>
                <div class="organize-selection-bar__actions">
                  <BButton size="small" type="primary" @click="openBatchTags(selectedUntaggedItems)">
                    {{ t('organize.untagged.addTags') }}
                  </BButton>
                  <BButton size="small" :loading="ignoringUntagged" @click="ignoreSelectedUntagged">
                    {{ t('organize.untagged.ignore') }}
                  </BButton>
                  <BButton size="small" type="danger" @click="confirmDeleteUntagged">
                    {{ t('organize.moveToTrash') }}
                  </BButton>
                </div>
              </div>

              <OrganizeIssueListState
                :loading="untaggedList.loading"
                :error="untaggedList.error"
                :empty="!untaggedItems.length"
                :empty-title="t('organize.untagged.emptyTitle')"
                :empty-description="t('organize.untagged.emptyDescription')"
                @retry="loadUntagged(true)"
              >
                <div class="organize-resource-list" role="list">
                  <article
                    v-for="item in untaggedItems"
                    :key="untaggedKey(item)"
                    class="organize-resource-row"
                    role="listitem"
                  >
                    <BCheckbox
                      :model-value="selectedUntaggedKeys.includes(untaggedKey(item))"
                      :aria-label="t('organize.selectResource', { title: item.title || t('inbox.untitled') })"
                      @update:model-value="toggleUntagged(item, $event)"
                    />
                    <span class="organize-resource-row__icon" :class="`is-${item.resourceType}`">
                      <SvgIcon :src="resourceIcon(item.resourceType)" size="18" aria-hidden="true" />
                    </span>
                    <div class="organize-resource-row__body">
                      <div class="organize-resource-row__title-line">
                        <strong>{{ item.title || t('inbox.untitled') }}</strong>
                        <span class="organize-type-chip" :class="`is-${item.resourceType}`">
                          {{ resourceTypeLabel(item.resourceType) }}
                        </span>
                      </div>
                      <p>{{ item.summary || item.url || t('organize.untagged.noSummary') }}</p>
                      <small>{{ formatDate(item.updatedAt || item.createdAt) }}</small>
                    </div>
                    <div class="organize-resource-row__actions">
                      <BButton size="small" @click="openResource(item)">{{ t('organize.open') }}</BButton>
                      <BButton size="small" type="primary" @click="openBatchTags([item])">
                        {{ t('organize.untagged.addTag') }}
                      </BButton>
                    </div>
                  </article>
                </div>
                <BButton
                  v-if="untaggedList.hasMore"
                  class="organize-load-more"
                  :loading="untaggedList.loadingMore"
                  @click="loadUntagged(false)"
                >
                  {{ t('organize.loadMore') }}
                </BButton>
              </OrganizeIssueListState>
            </section>

            <section v-else-if="activeView === 'duplicate_bookmark'" class="organize-issue-view">
              <header class="organize-view-heading organize-view-heading--compact">
                <div>
                  <span class="organize-view-heading__eyebrow">{{ t('organize.governanceEyebrow') }}</span>
                  <h2>{{ t('organize.views.duplicateBookmark') }}</h2>
                  <p>{{ t('organize.duplicate.description') }}</p>
                </div>
                <BButton :loading="duplicateList.loading" @click="loadDuplicates(true)">{{
                  t('organize.refresh')
                }}</BButton>
              </header>

              <OrganizeIssueListState
                :loading="duplicateList.loading"
                :error="duplicateList.error"
                :empty="!duplicateGroups.length"
                :empty-title="t('organize.duplicate.emptyTitle')"
                :empty-description="t('organize.duplicate.emptyDescription')"
                @retry="loadDuplicates(true)"
              >
                <div class="organize-duplicate-list" role="list">
                  <article
                    v-for="group in duplicateGroups"
                    :key="group.groupKey"
                    class="organize-duplicate-card"
                    role="listitem"
                  >
                    <span class="organize-duplicate-card__icon">
                      <SvgIcon :src="icon.resource.bookmark" size="20" aria-hidden="true" />
                    </span>
                    <div class="organize-duplicate-card__body">
                      <div class="organize-duplicate-card__heading">
                        <strong>{{ t('organize.duplicate.groupTitle', { count: group.memberCount }) }}</strong>
                        <span v-if="!group.canResolve" class="organize-status-chip is-blocked">
                          {{ t('organize.duplicate.blocked') }}
                        </span>
                      </div>
                      <p>{{ group.url }}</p>
                      <div class="organize-duplicate-card__members">
                        <span v-for="member in group.members.slice(0, 3)" :key="member.id">
                          {{ member.name || t('inbox.untitled') }}
                        </span>
                      </div>
                    </div>
                    <div class="organize-duplicate-card__actions">
                      <BButton size="small" @click="ignoreDuplicate(group)">{{ t('organize.ignore') }}</BButton>
                      <BButton size="small" type="primary" @click="openDuplicatePreview(group)">
                        {{ t('organize.duplicate.review') }}
                      </BButton>
                    </div>
                  </article>
                </div>
                <BButton
                  v-if="duplicateList.hasMore"
                  class="organize-load-more"
                  :loading="duplicateList.loadingMore"
                  @click="loadDuplicates(false)"
                >
                  {{ t('organize.loadMore') }}
                </BButton>
              </OrganizeIssueListState>
            </section>

            <section v-else class="organize-issue-view">
              <header class="organize-view-heading organize-view-heading--compact">
                <div>
                  <span class="organize-view-heading__eyebrow">{{ t('organize.governanceEyebrow') }}</span>
                  <h2>{{ t('organize.views.bookmarkHealth') }}</h2>
                  <p>{{ t('organize.health.description') }}</p>
                </div>
                <BButton
                  type="primary"
                  :loading="healthScanStarting || healthScanRunning"
                  :disabled="healthActionDisabled"
                  @click="startHealthScan"
                >
                  {{ healthActionLabel }}
                </BButton>
              </header>

              <div v-if="healthSummary" class="organize-health-scan" :class="`is-${healthRunStatus}`">
                <div class="organize-health-scan__heading">
                  <div>
                    <strong>{{ healthScanTitle }}</strong>
                    <span>{{ healthScanDescription }}</span>
                  </div>
                  <BChip :tone="healthStatusTone" size="medium">{{ healthStatusLabel }}</BChip>
                </div>
                <template v-if="healthScanRunning">
                  <BProgress
                    :percent="healthProgressPercent"
                    :aria-label="
                      t('organize.health.progressAria', { processed: healthProcessed, total: healthScanTotal })
                    "
                    show-info
                  />
                  <div class="organize-health-scan__progress-copy">
                    <strong>{{
                      t('organize.health.progress', { processed: healthProcessed, total: healthScanTotal })
                    }}</strong>
                    <span>{{ t('organize.health.canLeave') }}</span>
                  </div>
                </template>
                <div v-else-if="healthRunFinished" class="organize-health-scan__results">
                  <div>
                    <strong>{{ healthNormalCount }}</strong>
                    <span>{{ t('organize.health.resultNormal') }}</span>
                  </div>
                  <div>
                    <strong>{{ healthSummary.suspectCount }}</strong>
                    <span>{{ t('organize.health.resultSuspect') }}</span>
                  </div>
                  <div>
                    <strong>{{ healthSummary.unknown }}</strong>
                    <span>{{ t('organize.health.resultUnknown') }}</span>
                  </div>
                </div>
                <p
                  v-if="
                    healthRunFinished && (Number(healthScan?.skipped || 0) > 0 || Number(healthScan?.failed || 0) > 0)
                  "
                  class="organize-health-scan__coverage"
                >
                  {{
                    t('organize.health.scanExceptions', {
                      skipped: Number(healthScan?.skipped || 0),
                      failed: Number(healthScan?.failed || 0),
                    })
                  }}
                </p>
                <p v-if="!healthScanRunning && !healthRunFinished" class="organize-health-scan__coverage">
                  {{
                    t('organize.health.currentCoverage', { checked: healthSummary.checked, total: healthSummary.total })
                  }}
                </p>
                <div v-if="healthSummaryError" class="organize-health-scan__stale" role="alert">
                  <span>{{ t('organize.health.statusStale') }}</span>
                  <BButton size="small" @click="refreshHealthScan()">{{ t('organize.retry') }}</BButton>
                </div>
              </div>
              <div v-else-if="healthSummaryLoading" class="organize-health-scan is-loading">
                <BLoading inline :loading="true" :title="t('organize.health.statusLoading')" />
              </div>
              <div v-else-if="healthSummaryError" class="organize-health-scan is-error" role="alert">
                <div class="organize-health-scan__heading">
                  <div>
                    <strong>{{ t('organize.health.statusLoadFailed') }}</strong>
                    <span>{{ t('organize.health.statusLoadFailedDescription') }}</span>
                  </div>
                  <BButton size="small" @click="refreshHealthScan()">{{ t('organize.retry') }}</BButton>
                </div>
              </div>

              <div class="organize-health-note" role="note">
                <SvgIcon :src="icon.bookmarkManage.healthCheck" size="17" aria-hidden="true" />
                <span>{{ t('organize.health.rule') }}</span>
              </div>

              <OrganizeIssueListState
                :loading="healthList.loading"
                :error="healthList.error"
                :empty="!healthItems.length"
                :empty-title="t('organize.health.emptyTitle')"
                :empty-description="t('organize.health.emptyDescription')"
                @retry="loadHealth(true)"
              >
                <div class="organize-health-list" role="list">
                  <article v-for="item in healthItems" :key="item.id" class="organize-health-row" role="listitem">
                    <span class="organize-health-row__status" aria-hidden="true">
                      <SvgIcon :src="icon.message.warning" size="19" />
                    </span>
                    <div class="organize-health-row__body">
                      <div class="organize-health-row__heading">
                        <strong>{{ item.name || t('inbox.untitled') }}</strong>
                        <span class="organize-status-chip is-suspect">
                          {{ t('organize.health.httpCode', { code: item.observedCode || '-' }) }}
                        </span>
                        <span v-if="item.hasSnapshot" class="organize-status-chip">
                          {{ t('organize.health.hasSnapshot') }}
                        </span>
                      </div>
                      <p>{{ item.url }}</p>
                      <small>{{ t('organize.health.checkedAt', { time: formatDate(item.checkedAt) }) }}</small>
                    </div>
                    <div class="organize-health-row__actions">
                      <BButton size="small" @click="openExternal(item.url)">{{ t('organize.open') }}</BButton>
                      <BButton size="small" :loading="checkingHealthIds.has(item.id)" @click="recheckHealth(item)">
                        {{ t('organize.health.recheck') }}
                      </BButton>
                      <BButton size="small" type="primary" @click="markHealthNormal(item)">
                        {{ t('organize.health.markNormal') }}
                      </BButton>
                    </div>
                  </article>
                </div>
                <BButton
                  v-if="healthList.hasMore"
                  class="organize-load-more"
                  :loading="healthList.loadingMore"
                  @click="loadHealth(false)"
                >
                  {{ t('organize.loadMore') }}
                </BButton>
              </OrganizeIssueListState>
            </section>
          </component>
        </div>
      </div>
    </ResourcePageShell>

    <BModal
      v-model:visible="duplicateModalVisible"
      :title="t('organize.duplicate.modalTitle')"
      width="760px"
      height="min(760px, 86vh)"
      modal-class="organize-duplicate-modal"
      content-class="organize-duplicate-modal__content"
      :show-footer="true"
      :mask-closable="!resolvingDuplicate"
      :close-disabled="resolvingDuplicate"
      initial-focus=".duplicate-candidate.selected"
      fullscreen-mobile
      @close="closeDuplicateModal"
    >
      <BLoading :loading="duplicatePreviewLoading" :title="t('organize.loading')">
        <div v-if="duplicatePreview" class="duplicate-review">
          <div class="duplicate-review__url">
            <span>{{ t('organize.duplicate.exactUrl') }}</span>
            <strong>{{ duplicatePreview.url }}</strong>
          </div>
          <p class="duplicate-review__hint">{{ t('organize.duplicate.chooseKeeper') }}</p>
          <div class="duplicate-review__members">
            <BButton
              v-for="member in duplicatePreview.members"
              :key="member.id"
              class="duplicate-candidate"
              :class="{
                selected: duplicateKeepId === member.id,
                recommended: duplicatePreview.recommendedKeepBookmarkId === member.id,
                blocked: !canKeepDuplicateMember(member.id),
              }"
              :aria-pressed="duplicateKeepId === member.id"
              :disabled="!canKeepDuplicateMember(member.id)"
              @click="duplicateKeepId = member.id"
            >
              <span class="duplicate-candidate__header">
                <strong>{{ member.name || t('inbox.untitled') }}</strong>
                <span
                  v-if="duplicatePreview.recommendedKeepBookmarkId === member.id"
                  class="organize-status-chip is-recommended"
                >
                  {{ t('organize.duplicate.recommended') }}
                </span>
              </span>
              <span class="duplicate-candidate__meta">
                {{ t('organize.duplicate.createdAt', { time: formatDate(member.createdAt) }) }}
              </span>
              <span class="duplicate-candidate__tags">
                <span v-for="tag in member.tags" :key="tag.id">{{ tag.name }}</span>
                <em v-if="!member.tags.length">{{ t('organize.duplicate.noTags') }}</em>
              </span>
              <span v-if="member.guard.blockers.length" class="duplicate-candidate__blockers">
                {{ member.guard.blockers.map((blocker) => blocker.label).join(' · ') }}
              </span>
            </BButton>
          </div>
          <div class="duplicate-review__recommendation">
            <strong>{{ t('organize.duplicate.recommendationTitle') }}</strong>
            <span>{{ duplicatePreview.recommendationReason }}</span>
          </div>
          <BCheckbox v-model="mergeDuplicateTags">{{ t('organize.duplicate.mergeTags') }}</BCheckbox>
          <div v-if="!selectedKeeperCanResolve" class="organize-inline-warning is-error" role="alert">
            {{ t('organize.duplicate.selectionBlocked') }}
          </div>
          <div v-else-if="duplicateTagMergeBlocked" class="organize-inline-warning is-error" role="alert">
            {{ t('organize.duplicate.tagLimitBlocked', { count: duplicateMergedTagCount }) }}
          </div>
        </div>
        <div v-else-if="duplicatePreviewError" class="organize-state organize-state--error">
          <strong>{{ t('organize.loadFailedTitle') }}</strong>
          <span>{{ t('organize.duplicate.previewFailed') }}</span>
        </div>
      </BLoading>
      <template #footer>
        <div class="duplicate-review__footer">
          <span v-if="duplicatePreview && selectedKeeperCanSubmit">
            {{ t('organize.duplicate.resolveSummary', { count: duplicateDeleteIds.length }) }}
          </span>
          <span v-else></span>
          <div>
            <BButton :disabled="resolvingDuplicate" @click="closeDuplicateModal">{{ t('common.cancel') }}</BButton>
            <BButton
              type="danger"
              :loading="resolvingDuplicate"
              :disabled="!duplicatePreview || !selectedKeeperCanSubmit"
              @click="resolveDuplicateGroup"
            >
              {{ t('organize.duplicate.confirmResolve') }}
            </BButton>
          </div>
        </div>
      </template>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import ResourceCenterSectionNav from '@/components/searchCenter/ResourceCenterSectionNav.vue';
  import OrganizeIssueListState from '@/view/organize/OrganizeIssueListState.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import Inbox from '@/view/inbox/Inbox.vue';
  import { bookmarkStore, organizeStore, useUserStore } from '@/store';
  import {
    getBookmarkHealth,
    getDuplicateBookmarkPreview,
    ignoreDuplicateBookmarks,
    ignoreUntaggedResources,
    markBookmarkHealthNormal,
    recheckBookmarkHealth,
    resolveDuplicateBookmarks,
    startBookmarkHealthScan,
    type BookmarkHealthScanStatus,
    type BookmarkHealthSummary,
    type BookmarkHealthItem,
    type DuplicateBookmarkGroup,
    type OrganizeIssueType,
    type OrganizeResourceType,
    type UntaggedResourceItem,
  } from '@/api/organizeApi';
  import { batchDeleteSearchResources, clearGlobalSearchCache } from '@/api/search';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { generateUUID } from '@/utils/common';
  import icon from '@/config/icon';

  type OrganizeView = 'overview' | 'pending' | OrganizeIssueType;

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const organize = organizeStore();
  const untaggedKeyword = ref('');
  const untaggedType = ref<'all' | OrganizeResourceType>('all');
  const selectedUntaggedKeys = ref<string[]>([]);
  const ignoringUntagged = ref(false);
  const healthSummary = ref<BookmarkHealthSummary | null>(null);
  const healthSummaryLoading = ref(false);
  const healthSummaryError = ref(false);
  const healthScanStarting = ref(false);
  const checkingHealthIds = ref(new Set<string>());
  const duplicateModalVisible = ref(false);
  const duplicatePreviewLoading = ref(false);
  const duplicatePreviewError = ref(false);
  const duplicatePreview = ref<DuplicateBookmarkGroup | null>(null);
  const duplicateKeepId = ref('');
  const mergeDuplicateTags = ref(true);
  const resolvingDuplicate = ref(false);
  const pendingDuplicateResolveRequest = ref<{ payloadKey: string; requestId: string } | null>(null);
  const organizeMainRef = ref<HTMLElement | null>(null);
  let duplicateReturnFocus: HTMLElement | null = null;
  let healthPoller: ReturnType<typeof setTimeout> | null = null;
  let healthRequestGeneration = 0;
  let mounted = false;
  let activatedOnce = false;

  const summary = computed(() => organize.summary);
  const activeView = computed<OrganizeView>(() => {
    const issue = String(route.query.issue || 'overview');
    return ['pending', 'untagged', 'duplicate_bookmark', 'bookmark_health'].includes(issue)
      ? (issue as OrganizeView)
      : 'overview';
  });
  const untaggedList = computed(() => organize.lists.untagged);
  const duplicateList = computed(() => organize.lists.duplicate_bookmark);
  const healthList = computed(() => organize.lists.bookmark_health);
  const untaggedItems = computed(() => untaggedList.value.items as UntaggedResourceItem[]);
  const duplicateGroups = computed(() => duplicateList.value.items as DuplicateBookmarkGroup[]);
  const healthItems = computed(() => healthList.value.items as BookmarkHealthItem[]);
  const healthScan = computed(() => healthSummary.value?.scan || null);
  const healthRunStatus = computed<BookmarkHealthScanStatus>(
    () => healthScan.value?.status || healthSummary.value?.runStatus || 'idle',
  );
  const healthScanRunning = computed(() => Boolean(healthScan.value?.running));
  const healthRunFinished = computed(() =>
    ['succeeded', 'completed_with_errors', 'failed'].includes(healthRunStatus.value),
  );
  const healthScanTotal = computed(() => Number(healthScan.value?.total || healthSummary.value?.total || 0));
  const healthProcessed = computed(() => Number(healthScan.value?.processed || 0));
  const healthProgressPercent = computed(() =>
    healthScanTotal.value > 0 ? (healthProcessed.value / healthScanTotal.value) * 100 : 0,
  );
  const healthNormalCount = computed(
    () => Number(healthSummary.value?.alive || 0) + Number(healthSummary.value?.userNormal || 0),
  );
  const healthActionDisabled = computed(
    () =>
      healthScanStarting.value ||
      healthScanRunning.value ||
      healthSummaryLoading.value ||
      !healthSummary.value ||
      healthSummaryError.value ||
      Number(healthSummary.value.total || 0) <= 0,
  );
  const healthActionLabel = computed(() => {
    if (healthScanRunning.value) return t('organize.health.checking');
    if (healthRunFinished.value) return t('organize.health.recheckAll');
    return t('organize.health.checkAll');
  });
  const healthStatusLabel = computed(() => t(`organize.health.status.${healthRunStatus.value}`));
  const healthStatusTone = computed<'pending' | 'bookmark' | 'success' | 'danger' | 'neutral'>(() => {
    if (healthRunStatus.value === 'queued') return 'pending';
    if (healthRunStatus.value === 'running') return 'bookmark';
    if (healthRunStatus.value === 'succeeded') return 'success';
    if (['completed_with_errors', 'failed'].includes(healthRunStatus.value)) return 'danger';
    return 'neutral';
  });
  const healthScanTitle = computed(() => {
    if (healthScanRunning.value) return t('organize.health.scanRunningTitle');
    if (healthRunFinished.value) return t('organize.health.scanResultTitle');
    return t('organize.health.scanIdleTitle');
  });
  const healthScanDescription = computed(() => {
    if (healthRunStatus.value === 'queued') return t('organize.health.scanQueuedDescription');
    if (healthRunStatus.value === 'running') return t('organize.health.scanRunningDescription');
    if (healthRunStatus.value === 'completed_with_errors')
      return t('organize.health.scanPartialDescription', { count: Number(healthScan.value?.failed || 0) });
    if (healthRunStatus.value === 'failed')
      return t('organize.health.scanFailedDescription', { count: Number(healthScan.value?.failed || 0) });
    if (healthRunStatus.value === 'succeeded') return t('organize.health.scanCompletedDescription');
    return t('organize.health.scanIdleDescription');
  });
  const organizeOwnerKey = computed(() =>
    [user.id || 'visitor', user.role || '', user.adminContext?.subjectUserId || '', user.adminContext?.mode || ''].join(
      '|',
    ),
  );

  function displayCount(value: number | null | undefined, hasMore = false) {
    if (value === null || value === undefined) return '—';
    return hasMore ? `${value}+` : String(value);
  }

  const pendingCount = computed(() => displayCount(summary.value?.pendingShortcut.count));
  const affectedResourceTotal = computed(() =>
    summary.value ? displayCount(summary.value.totals.affectedResourceTotal, summary.value.totals.hasMore) : '—',
  );
  const issueOptions = computed<Array<{ key: OrganizeView; label: string; icon: string; count: string | null }>>(() => [
    { key: 'overview', label: t('organize.views.overview'), icon: icon.ai.organize, count: null },
    { key: 'pending', label: t('organize.views.pending'), icon: icon.contextMenu.inbox, count: pendingCount.value },
    {
      key: 'untagged',
      label: t('organize.views.untagged'),
      icon: icon.resource.tag,
      count: displayCount(summary.value?.issues.untagged.findingCount, summary.value?.issues.untagged.hasMore),
    },
    {
      key: 'duplicate_bookmark',
      label: t('organize.views.duplicateBookmark'),
      icon: icon.resource.bookmark,
      count: displayCount(
        summary.value?.issues.duplicateBookmark.groupCount ?? summary.value?.issues.duplicateBookmark.findingCount,
        summary.value?.issues.duplicateBookmark.hasMore,
      ),
    },
    {
      key: 'bookmark_health',
      label: t('organize.views.bookmarkHealth'),
      icon: icon.bookmarkManage.healthCheck,
      count: displayCount(
        summary.value?.issues.bookmarkHealth.findingCount,
        summary.value?.issues.bookmarkHealth.hasMore,
      ),
    },
  ]);

  const governanceCards = computed(() => [
    {
      key: 'untagged' as const,
      label: t('organize.views.untagged'),
      description: t('organize.overview.untaggedDescription'),
      icon: icon.resource.tag,
      state: summary.value?.issues.untagged.state,
      count: displayCount(summary.value?.issues.untagged.findingCount, summary.value?.issues.untagged.hasMore),
    },
    {
      key: 'duplicate_bookmark' as const,
      label: t('organize.views.duplicateBookmark'),
      description: t('organize.overview.duplicateDescription'),
      icon: icon.resource.bookmark,
      state: summary.value?.issues.duplicateBookmark.state,
      count: displayCount(
        summary.value?.issues.duplicateBookmark.groupCount ?? summary.value?.issues.duplicateBookmark.findingCount,
        summary.value?.issues.duplicateBookmark.hasMore,
      ),
    },
    {
      key: 'bookmark_health' as const,
      label: t('organize.views.bookmarkHealth'),
      description: t('organize.overview.healthDescription'),
      icon: icon.bookmarkManage.healthCheck,
      state: summary.value?.issues.bookmarkHealth.state,
      count: displayCount(
        summary.value?.issues.bookmarkHealth.findingCount,
        summary.value?.issues.bookmarkHealth.hasMore,
      ),
    },
  ]);

  const resourceTypeOptions = computed(() => [
    { label: t('resourceCenter.types.all'), value: 'all' },
    { label: t('resourceCenter.types.bookmark'), value: 'bookmark' },
    { label: t('resourceCenter.types.note'), value: 'note' },
    { label: t('resourceCenter.types.file'), value: 'file' },
  ]);

  const selectedUntaggedItems = computed(() => {
    const selected = new Set(selectedUntaggedKeys.value);
    return untaggedItems.value.filter((item) => selected.has(untaggedKey(item)));
  });
  const allVisibleUntaggedSelected = computed(
    () => untaggedItems.value.length > 0 && selectedUntaggedItems.value.length === untaggedItems.value.length,
  );
  const someVisibleUntaggedSelected = computed(
    () => selectedUntaggedItems.value.length > 0 && !allVisibleUntaggedSelected.value,
  );
  const duplicateDeleteIds = computed(
    () =>
      duplicatePreview.value?.members
        .filter((member) => member.id !== duplicateKeepId.value)
        .map((member) => member.id) || [],
  );
  const selectedKeeperCanResolve = computed(() =>
    Boolean(duplicatePreview.value && duplicateKeepId.value && canKeepDuplicateMember(duplicateKeepId.value)),
  );
  const duplicateMergedTagCount = computed(
    () => new Set(duplicatePreview.value?.members.flatMap((member) => member.tags.map((tag) => tag.id)) || []).size,
  );
  const duplicateTagMergeBlocked = computed(() => mergeDuplicateTags.value && duplicateMergedTagCount.value > 4);
  const selectedKeeperCanSubmit = computed(() => selectedKeeperCanResolve.value && !duplicateTagMergeBlocked.value);

  function selectView(view: OrganizeView) {
    if (view === activeView.value) return;
    const query = { ...route.query };
    delete query._rt;
    delete query.resourceType;
    if (view === 'overview') delete query.issue;
    else query.issue = view;
    void router.replace({ path: '/organize', query });
  }

  async function refreshSummary() {
    await organize.loadSummary({ silent: Boolean(organize.summary) });
  }

  async function loadActiveView(reset = true) {
    if (activeView.value === 'untagged') await loadUntagged(reset);
    else if (activeView.value === 'duplicate_bookmark') await loadDuplicates(reset);
    else if (activeView.value === 'bookmark_health') {
      await Promise.all([loadHealth(reset), refreshHealthScan({ silent: Boolean(healthSummary.value) })]);
    }
  }

  async function loadUntagged(reset: boolean) {
    await organize.loadIssue('untagged', {
      reset,
      keyword: untaggedKeyword.value.trim(),
      resourceType: untaggedType.value,
    });
    if (reset) selectedUntaggedKeys.value = [];
  }

  function applyUntaggedFilters() {
    void loadUntagged(true);
  }

  function actionErrorMessage(error: any, fallback = t('organize.actionFailed')) {
    return String(error?.response?.data?.msg || error?.message || fallback);
  }

  function actionErrorStatus(error: any) {
    return Number(error?.status || error?.response?.status || 0);
  }

  async function loadDuplicates(reset: boolean) {
    await organize.loadIssue('duplicate_bookmark', { reset });
  }

  async function loadHealth(reset: boolean) {
    await organize.loadIssue('bookmark_health', { reset });
  }

  function stopHealthPolling() {
    if (!healthPoller) return;
    clearTimeout(healthPoller);
    healthPoller = null;
  }

  function scheduleHealthPolling() {
    stopHealthPolling();
    if (!healthScanRunning.value || activeView.value !== 'bookmark_health' || document.hidden) return;
    const delay = Math.min(10_000, Math.max(1500, Number(healthSummary.value?.pollAfterMs || 2500)));
    healthPoller = setTimeout(() => {
      healthPoller = null;
      void refreshHealthScan({ silent: true });
    }, delay);
  }

  async function refreshHealthScan({ silent = false } = {}) {
    const generation = ++healthRequestGeneration;
    const wasRunning = healthScanRunning.value;
    if (!silent || !healthSummary.value) healthSummaryLoading.value = true;
    healthSummaryError.value = false;
    try {
      const response = await getBookmarkHealth({ includeSuspect: false });
      if (generation !== healthRequestGeneration) return false;
      if (response.status !== 200 || !response.data) {
        healthSummaryError.value = true;
        return false;
      }
      healthSummary.value = response.data as BookmarkHealthSummary;
      if (wasRunning && !healthScanRunning.value) {
        await Promise.all([loadHealth(true), refreshSummary()]);
      }
      return true;
    } catch {
      if (generation === healthRequestGeneration) healthSummaryError.value = true;
      return false;
    } finally {
      if (generation === healthRequestGeneration) {
        healthSummaryLoading.value = false;
        scheduleHealthPolling();
      }
    }
  }

  async function startHealthScan() {
    if (healthActionDisabled.value) return;
    stopHealthPolling();
    const generation = ++healthRequestGeneration;
    healthScanStarting.value = true;
    try {
      const response = await startBookmarkHealthScan();
      if (generation !== healthRequestGeneration) return;
      if (response.status !== 200 || !response.data) {
        message.error(response.msg || t('organize.actionFailed'));
        return;
      }
      healthSummary.value = response.data as BookmarkHealthSummary;
      healthSummaryError.value = false;
      message.success(response.data?.already ? t('organize.health.scanReused') : t('organize.health.scanStarted'));
    } catch (error) {
      if (generation === healthRequestGeneration) message.error(actionErrorMessage(error));
    } finally {
      if (generation === healthRequestGeneration) {
        healthScanStarting.value = false;
        scheduleHealthPolling();
      }
    }
  }

  function handleHealthVisibilityChange() {
    if (document.hidden) stopHealthPolling();
    else if (activeView.value === 'bookmark_health') void refreshHealthScan({ silent: Boolean(healthSummary.value) });
  }

  function untaggedKey(item: UntaggedResourceItem) {
    return `${item.resourceType}:${item.resourceId}`;
  }

  function toggleUntagged(item: UntaggedResourceItem, selected: boolean) {
    const key = untaggedKey(item);
    selectedUntaggedKeys.value = selected
      ? [...new Set([...selectedUntaggedKeys.value, key])]
      : selectedUntaggedKeys.value.filter((value) => value !== key);
  }

  function toggleAllVisibleUntagged(selected: boolean) {
    selectedUntaggedKeys.value = selected ? untaggedItems.value.map(untaggedKey) : [];
  }

  function openBatchTags(items: UntaggedResourceItem[]) {
    const resources = items.map((item) => ({
      id: item.resourceId,
      type: item.resourceType,
      title: item.title,
    }));
    if (!resources.length) return;
    sessionStorage.setItem(
      'resource-center-batch-items',
      JSON.stringify({
        selection: { mode: 'explicit', items: resources.map(({ id, type }) => ({ id, type })) },
        items: resources,
        selectedCount: resources.length,
      }),
    );
    void router.push({ path: '/search/batch-tags', query: { mode: 'add', from: route.fullPath } });
  }

  async function ignoreSelectedUntagged() {
    if (!selectedUntaggedItems.value.length || ignoringUntagged.value) return;
    ignoringUntagged.value = true;
    try {
      const items = selectedUntaggedItems.value.map(({ resourceType, resourceId }) => ({ resourceType, resourceId }));
      const response = await ignoreUntaggedResources(items);
      if (response.status !== 200) {
        message.error(response.msg || t('organize.actionFailed'));
        return;
      }
      const keys = new Set(items.map((item) => `${item.resourceType}:${item.resourceId}`));
      organize.removeIssueItems('untagged', (item) => keys.has(untaggedKey(item as UntaggedResourceItem)));
      selectedUntaggedKeys.value = [];
      message.success(
        t('organize.untagged.ignoreSuccess', { count: Number(response.data?.ignoredCount || items.length) }),
      );
      await refreshSummary();
    } catch (error) {
      message.error(actionErrorMessage(error));
    } finally {
      ignoringUntagged.value = false;
    }
  }

  function confirmDeleteUntagged() {
    const items = [...selectedUntaggedItems.value];
    if (!items.length) return;
    Alert.alert({
      title: t('organize.deleteConfirmTitle'),
      content: t('organize.deleteConfirmDescription', { count: items.length }),
      okText: t('organize.moveToTrash'),
      cancelText: t('common.cancel'),
      onOk: () => deleteUntagged(items),
    });
  }

  async function deleteUntagged(items: UntaggedResourceItem[]) {
    try {
      const response = await batchDeleteSearchResources(
        items.map((item) => ({ id: item.resourceId, type: item.resourceType })),
      );
      if (response.status !== 200) {
        message.error(response.msg || t('organize.actionFailed'));
        return;
      }
      const keys = new Set(items.map(untaggedKey));
      organize.removeIssueItems('untagged', (item) => keys.has(untaggedKey(item as UntaggedResourceItem)));
      selectedUntaggedKeys.value = [];
      clearGlobalSearchCache();
      message.success(t('organize.deleteSuccess', { count: Number(response.data?.affectedItemCount || items.length) }));
      await refreshSummary();
    } catch (error) {
      message.error(actionErrorMessage(error));
    }
  }

  function openResource(item: UntaggedResourceItem) {
    if (item.resourceType === 'bookmark') {
      void router.push({ path: `/manage/editBookmark/${item.resourceId}`, query: { organize: 'untagged' } });
    } else if (item.resourceType === 'note') {
      void router.push({ path: `/noteLibrary/${item.resourceId}`, query: { organize: 'untagged' } });
    } else {
      void router.push({
        path: '/cloudSpace',
        query: { fileId: item.resourceId, fileName: item.title, organize: 'untagged' },
      });
    }
  }

  function resourceIcon(type: OrganizeResourceType) {
    return icon.resource[type];
  }

  function resourceTypeLabel(type: OrganizeResourceType) {
    return t(`resourceCenter.types.${type}`);
  }

  function formatDate(value?: string | null) {
    if (!value) return t('organize.unknownTime');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('organize.unknownTime');
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  async function openDuplicatePreview(group: DuplicateBookmarkGroup) {
    duplicateReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    duplicateModalVisible.value = true;
    duplicatePreviewLoading.value = true;
    duplicatePreviewError.value = false;
    duplicatePreview.value = null;
    duplicateKeepId.value = '';
    mergeDuplicateTags.value = true;
    try {
      const response = await getDuplicateBookmarkPreview(group.groupKey);
      if (response.status !== 200) {
        duplicatePreviewError.value = true;
        message.error(response.msg || t('organize.duplicate.previewFailed'));
        return;
      }
      duplicatePreview.value = response.data as DuplicateBookmarkGroup;
      duplicateKeepId.value = duplicatePreview.value.recommendedKeepBookmarkId;
    } catch (error) {
      duplicatePreviewError.value = true;
      message.error(actionErrorMessage(error, t('organize.duplicate.previewFailed')));
    } finally {
      duplicatePreviewLoading.value = false;
    }
  }

  function canKeepDuplicateMember(memberId: string) {
    const preview = duplicatePreview.value;
    if (!preview) return false;
    return preview.members.every((member) => member.id === memberId || member.guard.blockerCount === 0);
  }

  function closeDuplicateModal() {
    if (resolvingDuplicate.value) return;
    duplicateModalVisible.value = false;
  }

  async function resolveDuplicateGroup() {
    const preview = duplicatePreview.value;
    if (!preview || !selectedKeeperCanSubmit.value || resolvingDuplicate.value) return;
    const payloadKey = JSON.stringify({
      groupKey: preview.groupKey,
      keepBookmarkId: duplicateKeepId.value,
      deleteBookmarkIds: [...duplicateDeleteIds.value].sort(),
      mergeTags: mergeDuplicateTags.value,
      expectedContextHash: preview.contextHash,
    });
    if (pendingDuplicateResolveRequest.value?.payloadKey !== payloadKey) {
      pendingDuplicateResolveRequest.value = { payloadKey, requestId: generateUUID() };
    }
    resolvingDuplicate.value = true;
    try {
      const response = await resolveDuplicateBookmarks(preview.groupKey, {
        keepBookmarkId: duplicateKeepId.value,
        deleteBookmarkIds: duplicateDeleteIds.value,
        mergeTags: mergeDuplicateTags.value,
        expectedContextHash: preview.contextHash,
        clientRequestId: pendingDuplicateResolveRequest.value.requestId,
      });
      if (response.status !== 200) {
        message.error(response.msg || t('organize.actionFailed'));
        if (response.status === 409) {
          pendingDuplicateResolveRequest.value = null;
          duplicateModalVisible.value = false;
          await loadDuplicates(true);
        }
        return;
      }
      organize.removeIssueItems(
        'duplicate_bookmark',
        (item) => (item as DuplicateBookmarkGroup).groupKey === preview.groupKey,
      );
      duplicateModalVisible.value = false;
      pendingDuplicateResolveRequest.value = null;
      clearGlobalSearchCache();
      message.success(t('organize.duplicate.resolveSuccess', { count: Number(response.data?.deletedCount || 0) }));
      await refreshSummary();
    } catch (error) {
      message.error(actionErrorMessage(error));
      if (actionErrorStatus(error) === 409) {
        pendingDuplicateResolveRequest.value = null;
        duplicateModalVisible.value = false;
        await loadDuplicates(true);
      }
    } finally {
      resolvingDuplicate.value = false;
    }
  }

  function ignoreDuplicate(group: DuplicateBookmarkGroup) {
    Alert.alert({
      title: t('organize.duplicate.ignoreTitle'),
      content: t('organize.duplicate.ignoreDescription'),
      okText: t('organize.ignore'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const response = await ignoreDuplicateBookmarks(group.groupKey);
          if (response.status !== 200) {
            message.error(response.msg || t('organize.actionFailed'));
            return;
          }
          organize.removeIssueItems(
            'duplicate_bookmark',
            (item) => (item as DuplicateBookmarkGroup).groupKey === group.groupKey,
          );
          message.success(t('organize.duplicate.ignoreSuccess'));
          await refreshSummary();
        } catch (error) {
          message.error(actionErrorMessage(error));
        }
      },
    });
  }

  async function recheckHealth(item: BookmarkHealthItem) {
    checkingHealthIds.value = new Set([...checkingHealthIds.value, item.id]);
    try {
      const response = await recheckBookmarkHealth(item.id);
      if (response.status !== 200) {
        message.error(response.msg || t('organize.actionFailed'));
        return;
      }
      const status = String(response.data?.observation?.status || 'unknown');
      message.success(t(`organize.health.recheckResult.${status}`));
      await Promise.all([loadHealth(true), refreshSummary(), refreshHealthScan({ silent: true })]);
    } catch (error) {
      message.error(actionErrorMessage(error));
    } finally {
      const next = new Set(checkingHealthIds.value);
      next.delete(item.id);
      checkingHealthIds.value = next;
    }
  }

  async function markHealthNormal(item: BookmarkHealthItem) {
    try {
      const response = await markBookmarkHealthNormal(item.id);
      if (response.status !== 200 || !response.data?.ok) {
        message.error(response.msg || t('organize.actionFailed'));
        return;
      }
      organize.removeIssueItems('bookmark_health', (entry) => (entry as BookmarkHealthItem).id === item.id);
      message.success(t('organize.health.markNormalSuccess'));
      await Promise.all([refreshSummary(), refreshHealthScan({ silent: true })]);
    } catch (error) {
      message.error(actionErrorMessage(error));
    }
  }

  function openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function leaveOrganizer() {
    if (window.history.length > 1) router.back();
    else void router.replace('/search');
  }

  useMobileTopBar(['organizeCenter'], {
    title: () => t('organize.title'),
    onBack: leaveOrganizer,
    showNotification: false,
  });

  watch(organizeOwnerKey, async (ownerKey) => {
    stopHealthPolling();
    healthRequestGeneration += 1;
    healthSummary.value = null;
    healthSummaryError.value = false;
    organize.resetForOwner(ownerKey);
    selectedUntaggedKeys.value = [];
    await Promise.all([refreshSummary(), loadActiveView(true)]);
  });

  watch(duplicateModalVisible, async (visible) => {
    if (visible) return;
    await nextTick();
    if (duplicateReturnFocus?.isConnected) duplicateReturnFocus.focus({ preventScroll: true });
    else organizeMainRef.value?.focus({ preventScroll: true });
    duplicateReturnFocus = null;
  });

  watch(
    () => [route.query.issue, route.query._rt],
    async () => {
      if (!mounted) return;
      if (activeView.value !== 'bookmark_health') stopHealthPolling();
      await loadActiveView(true);
      if (route.query._rt) await refreshSummary();
    },
  );

  onMounted(async () => {
    document.addEventListener('visibilitychange', handleHealthVisibilityChange);
    organize.resetForOwner(organizeOwnerKey.value);
    mounted = true;
    await Promise.all([refreshSummary(), loadActiveView(true)]);
  });

  onActivated(() => {
    if (!mounted) return;
    if (!activatedOnce) {
      activatedOnce = true;
      return;
    }
    void Promise.all([organize.loadSummary({ silent: true }), loadActiveView(true)]);
  });

  onDeactivated(stopHealthPolling);

  onBeforeUnmount(() => {
    stopHealthPolling();
    healthRequestGeneration += 1;
    document.removeEventListener('visibilitychange', handleHealthVisibilityChange);
  });
</script>

<style scoped lang="less">
  .organize-center-route {
    width: 100%;
    height: 100%;
    min-height: 0;
    color: var(--text-color);
  }

  .organize-shell {
    --organize-accent: var(--primary-color);
  }

  .organize-page,
  .organize-workspace,
  .organize-main {
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }

  .organize-workspace {
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    gap: 14px;
  }

  .organize-sidebar {
    min-height: 0;
    overflow: hidden auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 12px 10px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .organize-sidebar__heading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 10px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 700;
  }

  .organize-nav-item.b_btn {
    width: 100%;
    min-height: 42px;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    gap: 8px;
    padding: 0 10px 0 7px;
    border: 1px solid transparent;
    border-left: 4px solid transparent;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent;
    text-align: left;
    transition:
      color 0.16s ease,
      background-color 0.16s ease,
      border-color 0.16s ease;
  }

  .organize-nav-item > span:nth-child(2) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .organize-nav-item:hover,
  .organize-nav-item:focus-visible,
  .organize-nav-item.active {
    border-color: color-mix(in srgb, var(--primary-color) 30%, var(--surface-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }

  .organize-nav-item.active {
    border-left-color: var(--primary-color);
    font-weight: 700;
  }

  .organize-nav-item__count,
  .organize-mobile-nav__count {
    min-width: 22px;
    padding: 1px 6px;
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 11px;
    line-height: 18px;
    text-align: center;
  }

  .organize-nav-item.active .organize-nav-item__count,
  .organize-mobile-nav__item.active .organize-mobile-nav__count {
    color: #fff;
    background: var(--primary-color);
  }

  .organize-main {
    overflow: hidden;
  }

  .organize-scroll-view,
  .organize-issue-view {
    height: 100%;
    min-height: 0;
    overflow: hidden auto;
    padding: 2px 4px 24px;
    box-sizing: border-box;
    scrollbar-gutter: stable;
  }

  .organize-issue-view {
    display: flex;
    flex-direction: column;
  }

  .organize-issue-view--pending {
    overflow: hidden;
  }

  .organize-view-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .organize-view-heading--compact {
    flex: 0 0 auto;
    margin-bottom: 14px;
  }

  .organize-view-heading__eyebrow {
    display: block;
    margin-bottom: 5px;
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .organize-view-heading h2,
  .organize-overview-section h3 {
    margin: 0;
    color: var(--text-color);
  }

  .organize-view-heading h2 {
    font-size: clamp(22px, 2vw, 28px);
    line-height: 1.25;
  }

  .organize-view-heading p,
  .organize-overview-section p {
    margin: 5px 0 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.55;
  }

  .organize-overview__content {
    display: grid;
    gap: 20px;
  }

  .organize-overview-section {
    display: grid;
    gap: 12px;
  }

  .organize-overview-section--pending {
    padding-bottom: 20px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .organize-overview-section__heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }

  .organize-overview-section h3 {
    font-size: 16px;
  }

  .organize-overview-section__rule,
  .organize-overview-section__total {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 12px;
  }

  .organize-overview-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .organize-overview-card {
    width: 100%;
    height: auto;
    min-height: 108px;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow, none);
    text-align: left;
    white-space: normal;
  }

  .organize-overview-card:hover,
  .organize-overview-card:focus-visible {
    border-color: var(--primary-color);
  }

  .organize-overview-card--pending {
    min-height: 92px;
    border-left: 4px solid var(--primary-color);
  }

  .organize-overview-card__icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .organize-overview-card__icon.is-untagged {
    color: var(--resource-tag-color, #ec4899);
  }

  .organize-overview-card__icon.is-duplicate_bookmark {
    color: var(--resource-bookmark-color, #615ced);
  }

  .organize-overview-card__icon.is-bookmark_health {
    color: var(--danger-color, #dc3f4f);
  }

  .organize-overview-card__body {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .organize-overview-card__body strong {
    font-size: 15px;
  }

  .organize-overview-card__body small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .organize-overview-card__count {
    color: var(--text-color);
    font-size: 28px;
    font-weight: 760;
    line-height: 1;
  }

  .organize-overview-card__state {
    color: var(--danger-color, #dc3f4f);
    font-size: 11px;
  }

  .organize-pending-content {
    min-height: 0;
    flex: 1 1 auto;
  }

  .organize-filter-bar {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 150px auto;
    gap: 8px;
    margin-bottom: 10px;
  }

  .organize-filter-bar__search,
  .organize-filter-bar__type {
    min-width: 0;
  }

  .organize-selection-bar {
    flex: 0 0 auto;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    padding: 7px 10px;
    box-sizing: border-box;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 6%, var(--card-background));
  }

  .organize-selection-bar__actions,
  .organize-resource-row__actions,
  .organize-duplicate-card__actions,
  .organize-health-row__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
    flex-wrap: wrap;
  }

  .organize-list-state {
    min-height: 240px;
    flex: 1 1 auto;
  }

  .organize-list-state__content {
    min-height: 100%;
  }

  .organize-resource-list,
  .organize-duplicate-list,
  .organize-health-list {
    display: grid;
    gap: 10px;
  }

  .organize-resource-row,
  .organize-duplicate-card,
  .organize-health-row {
    min-width: 0;
    display: grid;
    align-items: center;
    gap: 12px;
    padding: 13px 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }

  .organize-resource-row {
    grid-template-columns: auto 40px minmax(0, 1fr) auto;
  }

  .organize-resource-row__icon,
  .organize-duplicate-card__icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .organize-resource-row__icon.is-note {
    color: var(--resource-note-color, #00a884);
  }

  .organize-resource-row__icon.is-file {
    color: var(--resource-file-color, #f59e0b);
  }

  .organize-resource-row__body,
  .organize-duplicate-card__body,
  .organize-health-row__body {
    min-width: 0;
  }

  .organize-resource-row__title-line,
  .organize-duplicate-card__heading,
  .organize-health-row__heading {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .organize-resource-row__title-line strong,
  .organize-duplicate-card__heading strong,
  .organize-health-row__heading strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .organize-resource-row__body p,
  .organize-duplicate-card__body p,
  .organize-health-row__body p {
    margin: 4px 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .organize-resource-row__body small,
  .organize-health-row__body small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .organize-type-chip,
  .organize-status-chip {
    flex: 0 0 auto;
    padding: 2px 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 10px;
    line-height: 17px;
    font-style: normal;
  }

  .organize-type-chip.is-bookmark {
    color: var(--resource-bookmark-color, #615ced);
  }

  .organize-type-chip.is-note {
    color: var(--resource-note-color, #00a884);
  }

  .organize-type-chip.is-file {
    color: var(--resource-file-color, #f59e0b);
  }

  .organize-status-chip.is-blocked,
  .organize-status-chip.is-suspect {
    border-color: var(--danger-color, #dc3f4f);
    color: var(--danger-color, #dc3f4f);
    background: var(--card-background);
  }

  .organize-status-chip.is-recommended {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--card-background);
  }

  .organize-duplicate-card {
    grid-template-columns: 42px minmax(0, 1fr) auto;
  }

  .organize-duplicate-card__members {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .organize-duplicate-card__members span {
    max-width: 180px;
    padding: 2px 7px;
    overflow: hidden;
    border-radius: 6px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .organize-health-scan {
    flex: 0 0 auto;
    display: grid;
    gap: 12px;
    margin-bottom: 10px;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--card-background);
  }

  .organize-health-scan.is-running,
  .organize-health-scan.is-queued {
    border-color: var(--primary-color);
  }

  .organize-health-scan.is-completed_with_errors,
  .organize-health-scan.is-failed,
  .organize-health-scan.is-error {
    border-color: var(--danger-color, #dc3f4f);
  }

  .organize-health-scan__heading {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .organize-health-scan__heading > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .organize-health-scan__heading strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .organize-health-scan__heading span,
  .organize-health-scan__coverage,
  .organize-health-scan__progress-copy span,
  .organize-health-scan__results span {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .organize-health-scan__coverage {
    margin: 0;
  }

  .organize-health-scan__progress-copy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
  }

  .organize-health-scan__progress-copy strong {
    color: var(--primary-color);
    font-variant-numeric: tabular-nums;
  }

  .organize-health-scan__results {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .organize-health-scan__results > div {
    min-width: 0;
    display: grid;
    gap: 2px;
    padding: 9px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .organize-health-scan__results strong {
    color: var(--text-color);
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }

  .organize-health-scan__stale {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--surface-border-color);
    color: var(--danger-color, #dc3f4f);
    font-size: 12px;
  }

  .organize-health-note,
  .organize-inline-warning {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding: 9px 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .organize-inline-warning.is-error {
    border-color: var(--danger-color, #dc3f4f);
    color: var(--danger-color, #dc3f4f);
    background: var(--card-background);
  }

  .organize-health-row {
    grid-template-columns: 34px minmax(0, 1fr) auto;
  }

  .organize-health-row__status {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 2px solid var(--danger-color, #dc3f4f);
    border-radius: 50%;
    color: var(--danger-color, #dc3f4f);
    background: var(--card-background);
  }

  .organize-load-more {
    margin: 16px auto 0;
  }

  .organize-state {
    min-height: 230px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    box-sizing: border-box;
    color: var(--desc-color);
    text-align: center;
  }

  .organize-state strong {
    color: var(--text-color);
    font-size: 16px;
  }

  .organize-state__mark {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border: 2px solid var(--success-color, #00a884);
    border-radius: 50%;
    color: var(--success-color, #00a884);
    font-size: 21px;
    font-weight: 800;
  }

  .organize-state--error {
    border: 1px solid var(--danger-color, #dc3f4f);
    border-radius: 14px;
    background: var(--card-background);
  }

  .duplicate-review {
    display: grid;
    gap: 14px;
  }

  .duplicate-review__url {
    display: grid;
    gap: 4px;
    padding: 11px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .duplicate-review__url span,
  .duplicate-review__hint,
  .duplicate-review__recommendation span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .duplicate-review__url strong {
    overflow-wrap: anywhere;
    font-size: 13px;
  }

  .duplicate-review__hint {
    margin: 0;
  }

  .duplicate-review__members {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .duplicate-candidate {
    width: 100%;
    height: auto;
    min-height: 128px;
    display: flex;
    align-items: stretch;
    flex-direction: column;
    gap: 7px;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    color: var(--text-color);
    background: var(--card-background);
    text-align: left;
    white-space: normal;
  }

  .duplicate-candidate.selected {
    border: 2px solid var(--primary-color);
    padding: 11px;
    box-shadow: inset 4px 0 0 var(--primary-color);
  }

  .duplicate-candidate.blocked {
    border-color: var(--danger-color, #dc3f4f);
  }

  .duplicate-candidate__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .duplicate-candidate__header strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .duplicate-candidate__meta,
  .duplicate-candidate__blockers {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.4;
  }

  .duplicate-candidate__blockers {
    color: var(--danger-color, #dc3f4f);
  }

  .duplicate-candidate__tags {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .duplicate-candidate__tags span {
    padding: 2px 6px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    font-size: 10px;
  }

  .duplicate-candidate__tags em {
    color: var(--desc-color);
    font-size: 11px;
    font-style: normal;
  }

  .duplicate-review__recommendation {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-left: 4px solid var(--primary-color);
    border-radius: 8px;
    background: var(--workspace-panel-bg-color);
  }

  .duplicate-review__footer {
    width: 100%;
    min-height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 18px;
    box-sizing: border-box;
    border-top: 1px solid var(--surface-divider-color);
  }

  .duplicate-review__footer > span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .duplicate-review__footer > div {
    display: flex;
    gap: 8px;
  }

  :global(.organize-duplicate-modal__content) {
    overflow: hidden auto;
  }

  .organize-mobile-nav,
  .organize-resource-tabs {
    display: none;
  }

  @media (max-width: 1100px) and (min-width: 768px) {
    .organize-workspace {
      grid-template-columns: 198px minmax(0, 1fr);
    }

    .organize-overview-grid {
      grid-template-columns: 1fr;
    }

    .organize-resource-row,
    .organize-duplicate-card,
    .organize-health-row {
      align-items: flex-start;
    }

    .organize-resource-row__actions,
    .organize-duplicate-card__actions,
    .organize-health-row__actions {
      grid-column: 2 / -1;
      justify-content: flex-start;
    }
  }

  @media (max-width: 767px) {
    .organize-shell {
      padding: 0 12px max(12px, env(safe-area-inset-bottom));
    }

    .organize-page {
      display: flex;
      flex-direction: column;
    }

    .organize-resource-tabs {
      width: 100%;
      display: grid;
      margin: 6px 0 8px;
      flex: 0 0 auto;
    }

    .organize-workspace {
      min-height: 0;
      display: flex;
      flex: 1 1 auto;
    }

    .organize-main {
      display: flex;
      flex-direction: column;
    }

    .organize-mobile-nav {
      width: 100%;
      min-height: 46px;
      display: flex;
      gap: 7px;
      margin-bottom: 9px;
      padding: 1px 1px 5px;
      overflow-x: auto;
      flex: 0 0 auto;
      scrollbar-width: none;
      scroll-snap-type: x proximity;
    }

    .organize-mobile-nav::-webkit-scrollbar {
      display: none;
    }

    .organize-mobile-nav__item {
      width: auto;
      min-width: max-content;
      min-height: 42px;
      display: flex;
      flex: 0 0 auto;
      gap: 7px;
      padding: 0 12px;
      border: 1px solid var(--surface-border-color);
      border-radius: 12px;
      color: var(--desc-color);
      background: var(--card-background);
      scroll-snap-align: start;
    }

    .organize-mobile-nav__item.active {
      border: 2px solid var(--primary-color);
      color: var(--primary-color);
      background: var(--card-background);
      font-weight: 700;
    }

    .organize-scroll-view,
    .organize-issue-view {
      min-height: 0;
      flex: 1 1 auto;
      padding: 0 0 18px;
    }

    .organize-issue-view--pending {
      overflow: hidden;
    }

    .organize-view-heading {
      align-items: flex-start;
      gap: 10px;
      margin: 2px 2px 14px;
    }

    .organize-view-heading h2 {
      font-size: 21px;
    }

    .organize-view-heading p {
      display: block;
      font-size: 12px;
    }

    .organize-view-heading > .b_btn {
      min-height: 40px;
      flex: 0 0 auto;
    }

    .organize-overview-section__heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }

    .organize-overview-grid {
      grid-template-columns: 1fr;
      gap: 9px;
    }

    .organize-overview-card {
      min-height: 92px;
      padding: 13px;
    }

    .organize-overview-card__count {
      font-size: 24px;
    }

    .organize-filter-bar {
      grid-template-columns: minmax(0, 1fr) 118px;
    }

    .organize-filter-bar > .b_btn {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 40px;
    }

    .organize-selection-bar {
      align-items: flex-start;
      flex-direction: column;
    }

    .organize-selection-bar__actions {
      width: 100%;
      justify-content: flex-start;
    }

    .organize-health-scan {
      padding: 12px;
    }

    .organize-health-scan__progress-copy {
      align-items: flex-start;
      flex-direction: column;
      gap: 3px;
    }

    .organize-health-scan__results {
      grid-template-columns: repeat(3, minmax(74px, 1fr));
    }

    .organize-resource-row,
    .organize-duplicate-card,
    .organize-health-row {
      align-items: flex-start;
      padding: 12px;
    }

    .organize-resource-row {
      grid-template-columns: auto 36px minmax(0, 1fr);
    }

    .organize-duplicate-card {
      grid-template-columns: 38px minmax(0, 1fr);
    }

    .organize-health-row {
      grid-template-columns: 32px minmax(0, 1fr);
    }

    .organize-resource-row__actions,
    .organize-duplicate-card__actions,
    .organize-health-row__actions {
      grid-column: 2 / -1;
      justify-content: flex-start;
    }

    .organize-resource-row__actions :deep(.b_btn),
    .organize-duplicate-card__actions :deep(.b_btn),
    .organize-health-row__actions :deep(.b_btn) {
      min-height: 38px;
    }

    .duplicate-review__members {
      grid-template-columns: 1fr;
    }

    .duplicate-candidate {
      min-height: 116px;
    }

    .duplicate-review__recommendation {
      flex-direction: column;
    }

    .duplicate-review__footer {
      align-items: stretch;
      flex-direction: column;
      padding-bottom: max(10px, env(safe-area-inset-bottom));
    }

    .duplicate-review__footer > div {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .duplicate-review__footer :deep(.b_btn) {
      width: 100%;
      min-height: 44px;
    }
  }

  :global(html.light-note-mobile-rendering .organize-nav-item.active),
  :global(html.light-note-mobile-rendering .organize-mobile-nav__item.active),
  :global(html.light-note-mobile-rendering .duplicate-candidate.selected) {
    border-color: var(--primary-color);
    box-shadow: none;
  }

  :global(html.light-note-mobile-rendering .organize-overview-card),
  :global(html.light-note-mobile-rendering .organize-resource-row),
  :global(html.light-note-mobile-rendering .organize-duplicate-card),
  :global(html.light-note-mobile-rendering .organize-health-row) {
    box-shadow: none;
  }
</style>
