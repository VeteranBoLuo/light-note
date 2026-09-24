<template>
  <main ref="pageRef" class="toolbox-home" data-mobile-resource-scroll>
    <section class="toolbox-overview" :class="{ 'is-guest': isGuest }" aria-labelledby="toolbox-title">
      <div class="toolbox-overview__copy">
        <span class="toolbox-overview__eyebrow">
          <SvgIcon :src="icon.toolbox.home" size="15" />{{ t('toolbox.eyebrow') }}
        </span>
        <h1 id="toolbox-title">{{ t('toolbox.title') }}</h1>
        <p>{{ t('toolbox.subtitle') }}</p>
      </div>
      <div v-if="!isGuest" class="toolbox-home__balances">
        <BButton type="text" class="toolbox-home__balance is-ai" @click="router.push({ name: 'aiUsage' })">
          <span class="balance-label"
            ><SvgIcon :src="icon.ai.summary" size="17" aria-hidden="true" />{{ t('toolbox.aiQuotaBalance') }}</span
          >
          <strong>{{ aiQuotaBalanceLabel }}</strong>
          <SvgIcon class="balance-arrow" :src="icon.ai.sourceArrow" size="15" aria-hidden="true" />
        </BButton>
        <BButton type="text" class="toolbox-home__balance is-points" @click="router.push({ name: 'pointsUsage' })">
          <span class="balance-label"
            ><SvgIcon :src="icon.toolbox.coin" size="17" aria-hidden="true" />{{ t('toolbox.pointsBalance') }}</span
          >
          <strong>{{ pointsBalanceLabel }}</strong>
          <SvgIcon class="balance-arrow" :src="icon.ai.sourceArrow" size="15" aria-hidden="true" />
        </BButton>
      </div>
      <BButton v-if="!isGuest" class="toolbox-home__create" type="primary" @click="openProjects(true)">
        <SvgIcon :src="icon.common.plus" size="16" aria-hidden="true" />
        {{ t('toolbox.project.newProject') }}
      </BButton>
    </section>

    <nav
      class="workshop-view-switch"
      :aria-label="t('toolbox.title')"
      :class="{ 'is-catalog': homeView === 'catalog' }"
    >
      <BTabs
        v-model:active-tab="homeView"
        variant="line"
        :options="[
          { key: 'work', label: t('toolbox.project.overview') },
          { key: 'catalog', label: t('toolbox.home.allToolsTitle') },
        ]"
      />
    </nav>

    <section
      v-if="!user.id || user.role === 'visitor'"
      class="toolbox-guest-guide"
      aria-labelledby="toolbox-guest-title"
    >
      <span class="toolbox-guest-guide__icon"><SvgIcon :src="icon.noteDetail.history" size="22" /></span>
      <div>
        <h2 id="toolbox-guest-title">{{ t('toolbox.home.guestTitle') }}</h2>
        <p>{{ t('toolbox.home.guestDescription') }}</p>
      </div>
      <BButton type="primary" @click="router.push({ name: 'login' })">{{ t('toolbox.home.guestAction') }}</BButton>
    </section>

    <div
      :key="homeView"
      class="workshop-view-content"
      :class="{ 'is-overview': homeView === 'work', 'has-tasks': !isGuest && continueJobs.length > 0 }"
    >
      <BButton
        v-if="!isGuest && homeView === 'work' && attentionJob && !overviewLoading && !overviewFailed"
        class="workshop-attention"
        @click="taskSection?.scrollIntoView({ block: 'start' })"
      >
        <SvgIcon :src="icon.toolbox.audit" size="18" aria-hidden="true" />
        <span>{{ taskAttentionSummary }}</span>
        <SvgIcon :src="icon.ai.sourceArrow" size="16" aria-hidden="true" />
      </BButton>
      <section
        v-if="canReadProjects && homeView === 'work'"
        class="toolbox-section toolbox-continue"
        aria-labelledby="toolbox-continue-title"
      >
        <header class="toolbox-section__head">
          <h2 id="toolbox-continue-title">{{
            t(isGuest ? 'toolbox.project.examples' : 'toolbox.project.continueTitle')
          }}</h2>
          <BButton type="text" @click="openProjects(false)">{{ t('toolbox.project.allProjects') }}</BButton>
        </header>
        <div v-if="overviewLoading" class="toolbox-home__state">
          <BLoading inline loading :title="t('common.loading')" />
        </div>
        <div v-else-if="overviewFailed" class="toolbox-home__state is-error" role="alert">
          <span class="toolbox-home__state-icon"><SvgIcon :src="icon.toolbox.audit" size="20" /></span>
          <span class="toolbox-home__state-copy">
            <strong>{{ t('toolbox.home.loadFailed') }}</strong>
            <small>{{ t('toolbox.home.loadFailedHint') }}</small>
          </span>
          <BButton size="small" @click="loadOverview">{{ t('common.retry') }}</BButton>
        </div>
        <div v-else-if="!continueWorkspaces.length" class="toolbox-home__state is-empty">
          <span class="toolbox-home__state-icon"><SvgIcon :src="icon.toolbox.actionPlan" size="20" /></span>
          <span class="toolbox-home__state-copy">
            <strong>{{ t('toolbox.presentation.emptyProject') }}</strong>
            <small>{{ t('toolbox.presentation.emptyProjectHint') }}</small>
          </span>
          <BButton v-if="!isGuest" type="primary" size="small" @click="openProjects(true)">{{
            t('toolbox.project.newProject')
          }}</BButton>
        </div>
        <div v-else class="toolbox-activity-grid">
          <BButton
            v-for="workspace in continueWorkspaces"
            :key="`workspace-${workspace.id}`"
            class="workshop-project"
            :class="`is-${presentation(toolboxWorkspaceToolId(workspace.kind)).accent}`"
            @click="openWorkspace(workspace)"
          >
            <span class="workshop-project__head">
              <span class="workshop-project__icon">
                <SvgIcon
                  :src="presentation(toolboxWorkspaceToolId(workspace.kind)).icon"
                  size="24"
                  aria-hidden="true"
                />
              </span>
              <span class="workshop-project__identity">
                <strong :title="workspace.title">{{ workspace.title }}</strong>
                <span class="toolbox-activity-card__type">{{ toolName(toolboxWorkspaceToolId(workspace.kind)) }}</span>
              </span>
              <span class="workshop-project__status"
                ><i aria-hidden="true" />{{ t('toolbox.workspace.status.active') }}</span
              >
            </span>
            <span class="workshop-project__next" :class="{ 'is-empty': !workspace.nextStep }">
              <small>{{ t('toolbox.workspace.nextStep') }}</small>
              <span>{{ workspace.nextStep || t('toolbox.workspace.noNextStep') }}</span>
            </span>
            <span class="workshop-project__foot">
              <span class="workshop-project__meta">
                <span>{{
                  t('toolbox.home.workspaceMeta', { resources: workspace.resourceCount, open: workspace.openItemCount })
                }}</span>
                <small>{{
                  formatRelativeDate(Math.max(dateValue(workspace.lastOpenedAt), dateValue(workspace.updatedAt)))
                }}</small>
              </span>
              <span class="workshop-project__action"
                >{{ t(isGuest ? 'toolbox.project.viewExample' : 'toolbox.home.continueAction')
                }}<SvgIcon :src="icon.ai.sourceArrow" size="15" aria-hidden="true"
              /></span>
            </span>
          </BButton>
        </div>
      </section>

      <section
        v-if="!isGuest && homeView === 'work' && continueJobs.length"
        class="toolbox-section toolbox-tasks"
        ref="taskSection"
      >
        <header class="toolbox-section__head"
          ><h2>{{ t('toolbox.presentation.tasks') }}</h2></header
        >
        <div class="toolbox-task-list">
          <div v-for="job in continueJobs" :key="`task-${job.id}`" class="toolbox-task-row">
            <BButton
              class="toolbox-activity-card is-task"
              :class="{ 'is-ready': isReadyTask(job) }"
              @click="openTask(job)"
            >
              <span class="toolbox-activity-card__icon">
                <SvgIcon :src="presentation(job.toolId).icon" size="21" />
              </span>
              <span class="toolbox-activity-card__copy">
                <span class="toolbox-activity-card__topline">
                  <BChip :tone="jobTone(job.status)">{{ taskStateLabel(job) }}</BChip>
                </span>
                <strong>{{ job.artifact?.title || toolName(job.toolId) }}</strong>
                <span>{{ taskContinueDescription(job) }}</span>
                <small>{{ toolName(job.toolId) }}</small>
              </span>
              <span class="toolbox-task-meta">
                <small class="toolbox-task-time">{{ formatRelativeDate(job.updatedAt) }}</small>
                <span class="toolbox-activity-card__action">
                  {{ isReadyTask(job) ? t('toolbox.home.viewResultAction') : t('toolbox.home.viewProgressAction') }}
                </span>
              </span>
            </BButton>
            <BTooltip v-if="canDismissTask(job)" :title="t('toolbox.home.dismissTask')" class="toolbox-task-dismiss">
              <BButton
                icon-only
                :loading="dismissingJobs.has(job.id)"
                :aria-label="t('toolbox.home.dismissTaskLabel', { title: job.artifact?.title || toolName(job.toolId) })"
                @click="confirmDismissTask(job)"
                ><SvgIcon :src="icon.common.close" size="17"
              /></BButton>
            </BTooltip>
          </div>
        </div>
      </section>

      <section v-if="homeView === 'work'" class="toolbox-section toolbox-quick" aria-labelledby="toolbox-quick-title">
        <header class="toolbox-section__head">
          <h2 id="toolbox-quick-title">{{ t('toolbox.presentation.commonTools') }}</h2>
          <BButton type="text" @click="homeView = 'catalog'"
            >{{ t('toolbox.home.allToolsTitle') }}<SvgIcon :src="icon.ai.sourceArrow" size="15"
          /></BButton>
        </header>
        <div v-if="catalogLoading" class="toolbox-home__state">
          <BLoading inline loading :title="t('common.loading')" />
        </div>
        <div v-else-if="catalogFailed" class="toolbox-home__state is-error" role="alert">
          <span class="toolbox-home__state-copy">
            <strong>{{ t('toolbox.home.loadFailed') }}</strong>
            <small>{{ t('toolbox.home.loadFailedHint') }}</small>
          </span>
          <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
        </div>
        <div v-else-if="quickView === 'common' && quickTools.length" class="toolbox-quick-grid">
          <ToolboxToolCard
            v-for="tool in quickTools.slice(0, 4)"
            :key="`quick-${tool.id}`"
            class="toolbox-quick-card"
            :tool-id="tool.id"
            :name="displayToolName(tool.id)"
            :description="toolDescription(tool.id)"
            :billing="billingLabel(tool)"
            featured
            @open="openTool(tool)"
          />
        </div>
        <div v-else-if="quickView === 'common'" class="toolbox-home__state is-empty">
          <span class="toolbox-home__state-copy">
            <strong>{{ t('toolbox.home.quickEmpty') }}</strong>
            <small>{{ t('toolbox.home.quickEmptyHint') }}</small>
          </span>
        </div>
        <div v-else-if="overviewLoading && !recentEntries.length" class="toolbox-home__state">
          <BLoading inline loading :title="t('common.loading')" />
        </div>
        <div v-else-if="overviewFailed && !recentEntries.length" class="toolbox-home__state is-error" role="alert">
          <span class="toolbox-home__state-icon"><SvgIcon :src="icon.toolbox.audit" size="20" /></span>
          <span class="toolbox-home__state-copy">
            <strong>{{ t('toolbox.home.loadFailed') }}</strong>
            <small>{{ t('toolbox.home.loadFailedHint') }}</small>
          </span>
        </div>
        <div v-else-if="!recentEntries.length" class="toolbox-home__state is-empty">
          <span class="toolbox-home__state-icon"><SvgIcon :src="icon.common.time" size="20" /></span>
          <span class="toolbox-home__state-copy">
            <strong>{{ t('toolbox.home.recentEmpty') }}</strong>
            <small>{{ t('toolbox.home.recentEmptyHint') }}</small>
          </span>
        </div>
        <div v-else class="toolbox-recent-list">
          <BButton
            v-for="entry in recentEntries"
            :key="entry.key"
            class="toolbox-recent-row"
            @click="openRecentEntry(entry)"
          >
            <span class="toolbox-recent-row__icon"><SvgIcon :src="presentation(entry.toolId).icon" size="19" /></span>
            <span class="toolbox-recent-row__copy">
              <strong>{{ entry.title }}</strong>
              <small>{{ entry.detail }}</small>
            </span>
            <small class="toolbox-recent-row__time">{{ formatRelativeDate(entry.usedAt) }}</small>
          </BButton>
        </div>
      </section>

      <section v-if="homeView === 'work'" class="toolbox-section toolbox-more">
        <header v-if="moreTools.length" class="toolbox-section__head"
          ><h2>{{ t('toolbox.presentation.moreTools') }}</h2></header
        >
        <div v-if="moreTools.length" class="toolbox-more-grid">
          <ToolboxToolCard
            v-for="tool in moreTools"
            :key="tool.id"
            :tool-id="tool.id"
            :name="displayToolName(tool.id)"
            :description="toolDescription(tool.id)"
            :billing="billingLabel(tool)"
            @open="openTool(tool)"
          />
        </div>
        <BButton class="toolbox-external-link" type="text" @click="openDeveloperToolbox">
          {{ t('toolbox.home.developerToolbox') }}<SvgIcon :src="icon.ai.sourceExternal" size="16" aria-hidden="true" />
        </BButton>
      </section>

      <section
        v-if="homeView === 'catalog'"
        class="toolbox-section toolbox-catalog"
        aria-labelledby="toolbox-catalog-title"
      >
        <header class="toolbox-section__head toolbox-catalog__head sr-only">
          <h2 id="toolbox-catalog-title">{{ t('toolbox.home.allToolsTitle') }}</h2>
          <p>{{ t('toolbox.home.allToolsDescription') }}</p>
        </header>
        <div class="toolbox-catalog__layout">
          <div ref="groupNavRef" class="toolbox-group-filter" :aria-label="t('toolbox.home.toolCategoryLabel')">
            <BChip
              v-for="group in groupOptions"
              :key="group.value"
              tone="neutral"
              size="medium"
              interactive
              :selected="activeToolGroup === group.value"
              :data-group="group.value"
              :aria-current="activeToolGroup === group.value ? 'location' : undefined"
              @click="navigateToToolGroup(group.value)"
            >
              {{ group.label }}
            </BChip>
          </div>
          <div class="toolbox-catalog__content" ref="catalogContentRef">
            <div class="toolbox-catalog__controls" ref="catalogControlsRef">
              <div class="toolbox-catalog__search">
                <BInput
                  ref="searchInput"
                  v-model:value="keyword"
                  clearable
                  :placeholder="t('toolbox.searchPlaceholder')"
                  height="var(--ui-layout-42, 42px)"
                >
                  <template #prefix><SvgIcon :src="icon.navigation.search" size="18" /></template>
                </BInput>
                <span v-if="!keyword" aria-hidden="true">⌘ K</span>
              </div>
              <div class="toolbox-mobile-filters">
                <BSelect
                  :value="activeToolGroup"
                  :options="groupOptions"
                  :aria-label="t('toolbox.home.toolCategoryLabel')"
                  @update:value="navigateToToolGroup(String($event) as ToolboxHomeGroupId | 'all')"
                />
                <BSelect
                  v-model:value="activeCategory"
                  :options="mobileCategoryOptions"
                  :aria-label="t('toolbox.presentation.allFees')"
                />
              </div>
              <div class="toolbox-category-filter" :aria-label="t('toolbox.home.allToolsTitle')">
                <BChip
                  v-for="category in categoryOptions"
                  :key="category.value"
                  tone="neutral"
                  size="medium"
                  interactive
                  :selected="activeCategory === category.value"
                  @click="activeCategory = category.value"
                >
                  {{ category.label }}
                </BChip>
              </div>
            </div>
            <div v-if="catalogDegraded" class="toolbox-catalog__notice" role="status">
              <SvgIcon :src="icon.toolbox.audit" size="16" />
              <span>{{ t('toolbox.home.catalogFallback') }}</span>
              <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
            </div>
            <div v-if="catalogLoading" class="toolbox-home__state">
              <BLoading inline loading :title="t('common.loading')" />
            </div>
            <div v-else-if="catalogFailed" class="toolbox-home__state is-error" role="alert">
              <span>{{ t('common.requestFailedDescription') }}</span>
              <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
            </div>
            <div v-else-if="!visibleGroups.length" class="toolbox-home__state is-empty">
              <span>{{ t('toolbox.emptySearch') }}</span>
              <BButton size="small" @click="clearFilters">{{ t('toolbox.clearSearch') }}</BButton>
            </div>
            <div v-else class="toolbox-home-groups">
              <section
                v-for="group in visibleGroups"
                :key="group.id"
                :id="`toolbox-home-group-${group.id}`"
                class="toolbox-home-group"
                :class="[`is-${group.id}`, `is-${group.accent}`]"
                :aria-labelledby="`toolbox-group-${group.id}`"
              >
                <header class="toolbox-home-group__head">
                  <div>
                    <h3 :id="`toolbox-group-${group.id}`">{{ t(`toolbox.homeGroup.${group.id}.title`) }}</h3>
                    <p>{{ t(`toolbox.homeGroup.${group.id}.description`) }}</p>
                  </div>
                </header>
                <div class="toolbox-grid">
                  <div v-for="tool in group.tools" :key="tool.id" class="toolbox-card-wrap">
                    <ToolboxToolCard
                      class="toolbox-card"
                      :tool-id="tool.id"
                      :name="displayToolName(tool.id)"
                      :description="toolDescription(tool.id)"
                      :billing="billingLabel(tool)"
                      :featured="group.id === 'create'"
                      @open="openTool(tool)"
                    />
                    <BTooltip
                      v-if="!isGuest"
                      class="toolbox-card__pin-wrap"
                      :class="{ 'is-pinned': isPinned(tool.id) }"
                      :title="t(isPinned(tool.id) ? 'toolbox.home.unpinTool' : 'toolbox.home.pinTool')"
                    >
                      <BButton
                        class="toolbox-card__pin"
                        icon-only
                        type="text"
                        :class="{ 'is-pinned': isPinned(tool.id) }"
                        :aria-label="t(isPinned(tool.id) ? 'toolbox.home.unpinTool' : 'toolbox.home.pinTool')"
                        @click.stop="togglePinnedTool(tool.id)"
                      >
                        <SvgIcon :src="isPinned(tool.id) ? icon.contextMenu.unpin : icon.contextMenu.pin" size="15" />
                      </BButton>
                    </BTooltip>
                  </div>
                </div>
              </section>
            </div>
            <BCard class="toolbox-external-card" :aria-label="t('toolbox.home.developerToolbox')">
              <div class="toolbox-external-card__copy">
                <h3>{{ t('toolbox.home.developerToolbox') }}</h3>
                <p>{{ t('toolbox.home.developerToolboxDescription') }}</p>
              </div>
              <BButton class="toolbox-external-link" type="text" @click="openDeveloperToolbox">
                {{ t('toolbox.home.openDeveloperToolbox') }}
                <SvgIcon :src="icon.ai.sourceExternal" size="16" aria-hidden="true" />
              </BButton>
            </BCard>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { findScrollContainer } from '@/utils/scrollContainer';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { TOOLBOX_TOOL_CATALOG, type ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import ToolboxToolCard from './components/ToolboxToolCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    fetchToolboxCatalog,
    fetchToolboxHome,
    dismissToolboxJob,
    type ToolboxCatalogItem,
    type ToolboxHomeOverview,
    type ToolboxHomeWorkspaceSummary,
    type ToolboxJob,
  } from '@/api/toolbox';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { formatAiQuotaTokens, useAiQuotaStatus } from '@/composables/useAiQuotaStatus';
  import { useGrowth } from '@/composables/useGrowth';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import icon from '@/config/icon';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';
  import {
    TOOLBOX_HOME_GROUPS,
    TOOLBOX_DEFAULT_QUICK_TOOL_IDS,
    TOOLBOX_PRESENTATION,
    resolveToolboxQuickToolIds,
    toolboxToolPath,
    toolboxWorkspaceToolId,
  } from '@/config/toolbox';
  import { useUserStore } from '@/store';
  import {
    readToolboxRecentUses,
    recordToolboxRecentUse,
    toolboxRecentUseIdentityKey,
    type ToolboxRecentUse,
  } from '@/utils/toolboxRecentUse';
  import { restoreToolboxScrollSnapshot, saveToolboxScrollSnapshot } from '@/utils/toolboxNavigation';
  import {
    readToolboxPinnedTools,
    toggleToolboxPinnedTool,
    TOOLBOX_PINNED_TOOL_LIMIT,
  } from '@/utils/toolboxPinnedTools';

  type CategoryFilter = 'all' | 'free' | 'points';
  type QuickView = 'common' | 'recent';
  type ToolboxHomeGroupId = (typeof TOOLBOX_HOME_GROUPS)[number]['id'];
  type RecentEntry = {
    key: string;
    dedupeKey: string;
    toolId: string;
    title: string;
    detail: string;
    usedAt: string | number;
  };

  function openDeveloperToolbox() {
    window.open('https://boluo66.top/toolkit/', '_blank', 'noopener,noreferrer');
  }

  const { t, locale } = useI18n();
  const { dimension } = useUiDensity();
  const router = useRouter();
  const route = useRoute();
  const user = useUserStore();
  const { growth, load: loadGrowth } = useGrowth();
  const { status: aiQuotaStatus, load: loadAiQuota } = useAiQuotaStatus({ autoLoad: false });
  const tools = ref<ToolboxCatalogItem[]>([]);
  const overview = ref<ToolboxHomeOverview | null>(null);
  const localRecentUses = ref<ToolboxRecentUse[]>([]);
  const pinnedToolIds = ref<string[]>([]);
  const viewScrollOffsets = new Map<string, number>();
  const homeView = computed({
    get: () => (route.query.view === 'catalog' ? 'catalog' : 'work'),
    set: (view: string) => {
      viewScrollOffsets.set(homeView.value, pageRef.value?.scrollTop || 0);
      rememberHomeScroll();
      void router.replace({ query: { ...route.query, view } });
    },
  });
  const catalogLoading = ref(true);
  const catalogFailed = ref(false);
  const catalogDegraded = ref(false);
  const overviewLoading = ref(false);
  const overviewFailed = ref(false);
  const keyword = ref('');
  const activeCategory = ref<CategoryFilter>('all');
  const activeToolGroup = ref<ToolboxHomeGroupId | 'all'>('all');
  const catalogContentRef = ref<HTMLElement | null>(null);
  const catalogControlsRef = ref<HTMLElement | null>(null);
  const quickView = ref<QuickView>('common');
  const searchInput = ref<InstanceType<typeof BInput> | null>(null);
  const pageRef = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(pageRef);
  let overviewRequestVersion = 0;

  useMobileTopBar(['toolboxHome'], { searchMode: 'icon' });

  const canReadProjects = computed(() => !user.adminContext && !user.visitorWorkspace);
  const isGuest = computed(() => !user.id || user.role === 'visitor' || !!user.adminContext || !!user.visitorWorkspace);
  const identityKey = computed(() => toolboxRecentUseIdentityKey(user));
  const aiQuotaBalanceLabel = computed(() =>
    aiQuotaStatus.value?.exempt
      ? t('toolbox.aiQuotaUnlimited')
      : formatAiQuotaTokens(aiQuotaStatus.value?.availableRemaining ?? aiQuotaStatus.value?.remaining, locale.value),
  );
  const pointsBalanceLabel = computed(() => {
    const points = growth.value?.points;
    if (points == null) return '—';
    return new Intl.NumberFormat(locale.value, {
      notation: points >= 10_000 ? 'compact' : 'standard',
      maximumFractionDigits: 1,
    }).format(points);
  });
  const categoryOptions = computed(() => [
    { value: 'all' as const, label: t('toolbox.allTools') },
    { value: 'free' as const, label: t('toolbox.freeTools') },
    { value: 'points' as const, label: t('toolbox.pointsTools') },
  ]);
  const mobileCategoryOptions = computed(() =>
    categoryOptions.value.map((option) => ({
      ...option,
      label: option.value === 'all' ? t('toolbox.presentation.allFees') : option.label,
    })),
  );
  const groupOptions = computed(() => [
    { value: 'all' as const, label: t('toolbox.home.allToolsTitle') },
    ...TOOLBOX_HOME_GROUPS.map((group) => ({
      value: group.id,
      label: t(`toolbox.homeGroup.${group.id}.title`),
    })),
  ]);
  const continueWorkspaces = computed(() =>
    (overview.value?.workspaces?.continue || [])
      .filter((item) => item.status === 'active')
      .sort(
        (a, b) =>
          Math.max(dateValue(b.lastOpenedAt) || 0, dateValue(b.updatedAt) || 0) -
          Math.max(dateValue(a.lastOpenedAt) || 0, dateValue(a.updatedAt) || 0),
      )
      .slice(0, 4),
  );
  const continueJobs = computed(() => {
    const seen = new Set<string>();
    return [
      ...(overview.value?.tasks?.active || []),
      ...(overview.value?.tasks?.ready || []),
      ...(overview.value?.tasks?.recent || []).filter(
        (job) => job.status === 'failed' || job.save.status === 'save_failed',
      ),
    ]
      .filter((job) => {
        if (seen.has(job.id)) return false;
        seen.add(job.id);
        return true;
      })
      .sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)))
      .slice(0, 3);
  });
  const dismissingJobs = ref(new Set<string>());
  function canDismissTask(job: ToolboxJob) {
    return (
      ['succeeded', 'partial_succeeded', 'failed', 'cancelled', 'expired'].includes(job.status) &&
      job.save.status !== 'saving'
    );
  }
  function confirmDismissTask(job: ToolboxJob) {
    if (!canDismissTask(job) || dismissingJobs.value.has(job.id)) return;
    const identity = identityKey.value;
    Alert.alert({
      title: t('toolbox.home.dismissTask'),
      content: t('toolbox.home.dismissTaskHint'),
      okText: t('toolbox.home.dismissTask'),
      cancelText: t('common.cancel'),
      onOk: () => void runDismissTask(job.id, identity),
    });
  }
  async function runDismissTask(jobId: string, identity: string) {
    if (identity !== identityKey.value || dismissingJobs.value.has(jobId)) return;
    dismissingJobs.value.add(jobId);
    try {
      await dismissToolboxJob(jobId);
      if (identity !== identityKey.value) return;
      ++overviewRequestVersion;
      overviewLoading.value = false;
      const tasks = overview.value?.tasks;
      if (tasks) {
        tasks.active = tasks.active.filter((job) => job.id !== jobId);
        tasks.ready = tasks.ready.filter((job) => job.id !== jobId);
        tasks.recent = tasks.recent.filter((job) => job.id !== jobId);
      }
    } catch {
      if (identity === identityKey.value) message.error(t('toolbox.home.dismissTaskFailed'));
    } finally {
      dismissingJobs.value.delete(jobId);
    }
  }
  const attentionJob = computed(() => continueJobs.value.find(needsAttention));
  const taskSection = ref<HTMLElement | null>(null);
  const taskAttentionSummary = computed(() => {
    const ready = continueJobs.value.filter(isReadyTask).length;
    const failed = continueJobs.value.filter((job) => needsAttention(job) && !isReadyTask(job)).length;
    return [
      ready ? t('toolbox.home.readyTaskCount', { count: ready }) : '',
      failed ? t('toolbox.home.failedTaskCount', { count: failed }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });
  function needsAttention(job: ToolboxJob) {
    return isReadyTask(job) || job.status === 'failed' || job.save.status === 'save_failed';
  }
  const enabledToolIds = computed(() => new Set(tools.value.map((tool) => tool.id)));
  const recentEntries = computed<RecentEntry[]>(() => {
    const workspaceEntries = (overview.value?.workspaces?.recent || []).map((workspace) => ({
      key: `workspace-${workspace.id}`,
      dedupeKey: `tool-${toolboxWorkspaceToolId(workspace.kind)}`,
      toolId: toolboxWorkspaceToolId(workspace.kind),
      title: toolName(toolboxWorkspaceToolId(workspace.kind)),
      detail: t('toolbox.home.lastWorkspace', { title: workspace.title }),
      usedAt: workspace.lastOpenedAt || workspace.updatedAt,
    }));
    const localEntries = localRecentUses.value.map((entry) => ({
      key: `local-${entry.toolId}`,
      dedupeKey: `tool-${entry.toolId}`,
      toolId: entry.toolId,
      title: toolName(entry.toolId),
      detail: t('toolbox.home.openToolAgain'),
      usedAt: entry.usedAt,
    }));
    const seen = new Set<string>();
    return [...workspaceEntries, ...localEntries]
      .filter(
        (entry) => enabledToolIds.value.has(entry.toolId as ToolboxToolId) && Number.isFinite(dateValue(entry.usedAt)),
      )
      .sort((left, right) => dateValue(right.usedAt) - dateValue(left.usedAt))
      .filter((entry) => {
        if (seen.has(entry.dedupeKey)) return false;
        seen.add(entry.dedupeKey);
        return true;
      })
      .slice(0, 6);
  });
  const quickTools = computed(() => {
    const byId = new Map(tools.value.map((tool) => [tool.id, tool]));
    const candidates = resolveToolboxQuickToolIds(pinnedToolIds.value);
    const seen = new Set<string>();
    return candidates
      .map((toolId) => byId.get(toolId as ToolboxToolId))
      .filter((tool): tool is ToolboxCatalogItem => {
        if (!tool || seen.has(tool.id)) return false;
        if (
          isGuest.value &&
          tool.id !== TOOLBOX_DEFAULT_QUICK_TOOL_IDS[0] &&
          (tool.billingMedium !== 'free' || tool.executionMode !== 'browser')
        )
          return false;
        seen.add(tool.id);
        return true;
      })
      .slice(0, TOOLBOX_PINNED_TOOL_LIMIT);
  });
  const moreTools = computed(() => {
    const featuredIds = new Set(quickTools.value.slice(0, 4).map((tool) => tool.id));
    const ids = new Set([
      ...quickTools.value.slice(4).map((tool) => tool.id),
      'forms',
      'image_optimizer',
      'ocr_to_text',
    ]);
    return tools.value.filter(
      (tool) =>
        ids.has(tool.id) &&
        !featuredIds.has(tool.id) &&
        (!isGuest.value || (tool.executionMode === 'browser' && tool.billingMedium === 'free')),
    );
  });
  const visibleTools = computed(() => {
    const query = keyword.value.trim().toLocaleLowerCase(locale.value);
    return tools.value.filter((tool) => {
      if (activeCategory.value === 'free' && !tool.billingMedia.includes('free')) return false;
      if (activeCategory.value === 'points' && tool.billingMedium === 'free') return false;
      if (!query) return true;
      return [toolName(tool.id), toolDescription(tool.id), t('toolbox.tool.' + tool.id + '.output')]
        .join(' ')
        .toLocaleLowerCase(locale.value)
        .includes(query);
    });
  });
  const visibleGroups = computed(() => {
    const byId = new Map(visibleTools.value.map((tool) => [tool.id, tool]));
    return TOOLBOX_HOME_GROUPS.map((group) => ({
      ...group,
      tools: (group.id === 'workspace'
        ? group.toolIds.filter((id) => !['learning_workspace', 'writing_workspace'].includes(id))
        : group.toolIds
      )
        .map((id) => byId.get(id))
        .filter((tool): tool is ToolboxCatalogItem => Boolean(tool)),
    })).filter((group) => group.tools.length > 0);
  });

  const groupNavRef = ref<HTMLElement | null>(null);
  let groupScrollFrame = 0;
  let preferredToolGroup: ToolboxHomeGroupId | 'all' = 'all';
  function groupScrollContext() {
    const rail = groupNavRef.value;
    if (!rail) return null;
    const isMobile = getComputedStyle(rail).display === 'none';
    const nav = isMobile ? catalogControlsRef.value : rail;
    if (!nav) return null;
    const owner = findScrollContainer(nav);
    const documentOwner = owner === document.scrollingElement;
    const top = documentOwner ? 0 : owner.getBoundingClientRect().top;
    const inset = isMobile ? nav.offsetHeight + dimension(8) : dimension(20);
    return { nav, owner, top, inset };
  }
  function syncToolGroup() {
    groupScrollFrame = 0;
    if (homeView.value !== 'catalog') return;
    const context = groupScrollContext();
    if (!context) return;
    const { nav, owner, top, inset } = context;
    const sections = visibleGroups.value
      .map((group) => ({
        id: group.id,
        element: document.getElementById(`toolbox-home-group-${group.id}`),
      }))
      .filter((item) => item.element);
    let current: (typeof sections)[number] | undefined;
    for (const section of sections) {
      const sectionTop = section.element!.getBoundingClientRect().top;
      if (sectionTop > top + inset + dimension(4)) continue;
      const currentTop = current?.element!.getBoundingClientRect().top;
      // The two compact utility groups share a desktop row; keep the chosen group in that row.
      if (currentTop == null || sectionTop > currentTop + 4 || section.id === preferredToolGroup) current = section;
    }
    if (owner.scrollTop > 0 && owner.scrollTop + owner.clientHeight >= owner.scrollHeight - 4) {
      const last = sections.at(-1);
      const lastTop = last?.element!.getBoundingClientRect().top;
      current =
        sections.find(
          (section) =>
            section.id === preferredToolGroup &&
            lastTop != null &&
            Math.abs(section.element!.getBoundingClientRect().top - lastTop) <= 4,
        ) || last;
    }
    activeToolGroup.value = current?.id || 'all';
    if (!current) return;
    const selected = nav.querySelector<HTMLElement>(`[data-group="${current.id}"]`);
    if (selected && nav.scrollWidth > nav.clientWidth) {
      const left = selected.offsetLeft;
      if (left < nav.scrollLeft) nav.scrollLeft = left;
      else if (left + selected.offsetWidth > nav.scrollLeft + nav.clientWidth)
        nav.scrollLeft = left + selected.offsetWidth - nav.clientWidth;
    }
  }
  function onToolGroupScroll(event?: Event) {
    if (event?.target === groupNavRef.value) return;
    if (!groupScrollFrame) groupScrollFrame = requestAnimationFrame(syncToolGroup);
  }
  function navigateToToolGroup(groupId: ToolboxHomeGroupId | 'all') {
    preferredToolGroup = groupId;
    const context = groupScrollContext();
    const section =
      groupId === 'all' ? catalogContentRef.value : document.getElementById(`toolbox-home-group-${groupId}`);
    if (!context || !section) return;
    const { owner, top, inset } = context;
    owner.scrollTo({
      top: Math.max(0, owner.scrollTop + section.getBoundingClientRect().top - top - inset),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    onToolGroupScroll();
  }
  watch([homeView, visibleGroups], () => nextTick(onToolGroupScroll));
  watch(homeView, async (view) => {
    await nextTick();
    if (viewScrollOffsets.has(view) && pageRef.value) {
      pageRef.value.scrollTop = viewScrollOffsets.get(view)!;
      return;
    }
    const restored = restoreToolboxScrollSnapshot({
      routeFullPath: route.fullPath,
      identityKey: identityKey.value,
      element: pageRef.value,
    });
    if (!restored && pageRef.value) pageRef.value.scrollTop = 0;
  });

  function presentation(toolId: string) {
    return TOOLBOX_PRESENTATION[toolId as ToolboxToolId] || TOOLBOX_PRESENTATION.material_to_note;
  }
  const displayToolName = (toolId: string) =>
    toolId === 'research_workspace' ? t('toolbox.workspace.myProjects') : toolName(toolId);
  const toolName = (toolId: string) => t('toolbox.tool.' + toolId + '.name');
  const toolDescription = (toolId: string) => t('toolbox.tool.' + toolId + '.description');
  function billingLabel(tool: ToolboxCatalogItem) {
    if (tool.id === 'ocr_to_text') return t('toolbox.ocrBillingLabel');
    if (tool.price.kind !== 'free') {
      return tool.billingMedia.includes('ai_quota') ? t('toolbox.billingChoiceLabel') : t('toolbox.pointsLabel');
    }
    return tool.executionMode === 'service' ? t('toolbox.accountFreeLabel') : t('toolbox.localFreeLabel');
  }
  function jobTone(status: ToolboxJob['status']): 'neutral' | 'success' | 'pending' | 'danger' {
    if (status === 'succeeded') return 'success';
    if (['queued', 'processing', 'partial_succeeded'].includes(status)) return 'pending';
    if (['failed', 'expired'].includes(status)) return 'danger';
    return 'neutral';
  }
  function isReadyTask(job: ToolboxJob) {
    return job.artifactState === 'ready' && ['unsaved', 'save_failed'].includes(job.save.status);
  }
  function taskStateLabel(job: ToolboxJob) {
    return isReadyTask(job) ? t('toolbox.home.resultReady') : t(`toolbox.task.${job.status}`);
  }
  function taskContinueDescription(job: ToolboxJob) {
    if (job.save.status === 'save_failed') return t('toolbox.task.saveFailed');
    if (isReadyTask(job)) return t('toolbox.home.resultReadyDescription');
    if (job.status === 'failed') return t('toolbox.task.processingFailed');
    if (job.status === 'queued' && job.stage === 'retrying') return t('toolbox.task.retryingTitle');
    if (job.status !== 'processing') return t(`toolbox.task.${job.status}`);
    return t('toolbox.home.processingDescription');
  }
  function dateValue(value: string | number) {
    return typeof value === 'number' ? value : new Date(value).getTime();
  }
  function formatRelativeDate(value: string | number) {
    const timestamp = dateValue(value);
    if (!Number.isFinite(timestamp)) return '';
    const diff = timestamp - Date.now();
    const abs = Math.abs(diff);
    const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
    if (abs < 60_000) return formatter.format(0, 'second');
    if (abs < 3_600_000) return formatter.format(Math.round(diff / 60_000), 'minute');
    if (abs < 86_400_000) return formatter.format(Math.round(diff / 3_600_000), 'hour');
    if (abs < 604_800_000) return formatter.format(Math.round(diff / 86_400_000), 'day');
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(timestamp));
  }
  function clearFilters() {
    keyword.value = '';
    activeCategory.value = 'all';
    activeToolGroup.value = 'all';
  }
  function rememberHomeScroll() {
    saveToolboxScrollSnapshot({
      routeFullPath: route.fullPath,
      identityKey: identityKey.value,
      element: pageRef.value,
    });
  }
  function openProjects(create: boolean) {
    rememberHomeScroll();
    void router.push({
      path: '/toolbox/research_workspace',
      query: create ? { create: '1', entry: 'workshop' } : { entry: 'workshop' },
    });
  }
  function openTool(tool: ToolboxCatalogItem) {
    if (
      tool.executionMode === 'service' &&
      !['research_workspace', 'learning_workspace', 'writing_workspace'].includes(tool.id) &&
      isGuest.value &&
      blockGuestWrite('toolbox-account')
    )
      return;
    if (tool.billingMedium !== 'free' && isGuest.value && blockGuestWrite('toolbox-paid')) return;
    recordToolboxRecentUse(user, tool.id);
    rememberHomeScroll();
    void router.push(toolboxToolPath(tool.id));
  }
  function openWorkspace(workspace: ToolboxHomeWorkspaceSummary) {
    recordToolboxRecentUse(user, toolboxWorkspaceToolId(workspace.kind));
    rememberHomeScroll();
    void router.push({
      path: toolboxToolPath(toolboxWorkspaceToolId(workspace.kind)),
      query: { workspace: workspace.id, entry: 'workshop' },
    });
  }
  function openTask(job: ToolboxJob) {
    recordToolboxRecentUse(user, job.toolId);
    rememberHomeScroll();
    void router.push(`/toolbox/task/${job.id}`);
  }
  function openRecentEntry(entry: RecentEntry) {
    recordToolboxRecentUse(user, entry.toolId);
    rememberHomeScroll();
    void router.push(toolboxToolPath(entry.toolId as ToolboxToolId));
  }
  function refreshPinnedTools() {
    pinnedToolIds.value = readToolboxPinnedTools(user, { allowedToolIds: enabledToolIds.value });
  }
  function isPinned(toolId: string) {
    return pinnedToolIds.value.includes(toolId);
  }
  function togglePinnedTool(toolId: string) {
    const result = toggleToolboxPinnedTool(user, toolId, { allowedToolIds: enabledToolIds.value });
    pinnedToolIds.value = result.toolIds;
    if (result.limitReached) message.warning(t('toolbox.home.pinLimit', { count: TOOLBOX_PINNED_TOOL_LIMIT }));
  }
  function refreshLocalRecentUses() {
    localRecentUses.value = readToolboxRecentUses(user, { allowedToolIds: enabledToolIds.value });
  }
  async function loadCatalog() {
    catalogLoading.value = true;
    catalogFailed.value = false;
    catalogDegraded.value = false;
    try {
      tools.value = (await fetchToolboxCatalog()).tools.filter((tool) => tool.availability.enabled);
      refreshLocalRecentUses();
      refreshPinnedTools();
    } catch {
      tools.value = TOOLBOX_TOOL_CATALOG.filter(
        (tool) => tool.availability.enabled && tool.executionMode === 'browser' && tool.billingMedium === 'free',
      ).map((tool) => ({
        ...tool,
        price: { kind: 'free' as const, currency: null, min: 0, max: 0 },
      }));
      catalogDegraded.value = true;
      catalogFailed.value = tools.value.length === 0;
      refreshLocalRecentUses();
      refreshPinnedTools();
    } finally {
      catalogLoading.value = false;
    }
  }
  async function loadOverview() {
    const version = ++overviewRequestVersion;
    if (!canReadProjects.value) {
      overviewLoading.value = false;
      overviewFailed.value = false;
      return;
    }
    overviewLoading.value = true;
    overviewFailed.value = false;
    try {
      const result = await fetchToolboxHome();
      if (version === overviewRequestVersion) overview.value = result;
    } catch {
      if (version === overviewRequestVersion) overviewFailed.value = true;
    } finally {
      if (version === overviewRequestVersion) overviewLoading.value = false;
    }
  }
  function handleSearchShortcut(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
      event.preventDefault();
      searchInput.value?.focus();
    }
  }

  watch(identityKey, () => {
    viewScrollOffsets.clear();
    refreshLocalRecentUses();
    refreshPinnedTools();
    overview.value = null;
    void loadOverview();
    if (!isGuest.value) void Promise.all([loadGrowth(), loadAiQuota()]);
  });
  async function initializeHome() {
    window.addEventListener('keydown', handleSearchShortcut);
    await Promise.all([
      loadCatalog(),
      loadOverview(),
      isGuest.value ? Promise.resolve() : loadGrowth(),
      isGuest.value ? Promise.resolve() : loadAiQuota(),
    ]);
    await nextTick();
    window.requestAnimationFrame(() => {
      restoreToolboxScrollSnapshot({
        routeFullPath: route.fullPath,
        identityKey: identityKey.value,
        element: pageRef.value,
      });
    });
  }
  onMounted(() => {
    document.addEventListener('scroll', onToolGroupScroll, { capture: true, passive: true });
    window.addEventListener('resize', onToolGroupScroll, { passive: true });
    void initializeHome();
  });
  onBeforeUnmount(() => {
    document.removeEventListener('scroll', onToolGroupScroll, true);
    window.removeEventListener('resize', onToolGroupScroll);
    cancelAnimationFrame(groupScrollFrame);
    overviewRequestVersion += 1;
    window.removeEventListener('keydown', handleSearchShortcut);
  });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  @import './toolboxPageScroll.less';

  .toolbox-home {
    .toolbox-page-scroll();
    .workspace-open-surface();
    padding: var(--ui-space-24, 24px) clamp(var(--ui-space-20, 20px), 3vw, var(--ui-space-48, 48px))
      var(--ui-space-48, 48px);
    color: var(--workspace-text);
  }
  .toolbox-overview {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--ui-space-20, 20px);
    padding-bottom: var(--ui-space-12, 12px);
  }
  .toolbox-overview.is-guest {
    grid-template-columns: minmax(0, 1fr);
  }
  .toolbox-overview__copy {
    min-width: 0;
  }
  .toolbox-overview__eyebrow {
    display: none;
  }
  .toolbox-overview h1 {
    margin: 0;
    font-size: var(--ui-font-26, 26px);
    line-height: 1.35;
    font-weight: 750;
    letter-spacing: -0.035em;
  }
  .toolbox-overview p {
    margin: var(--ui-space-6, 6px) 0 0;
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  .toolbox-home__balances {
    display: flex;
    align-items: center;
    gap: var(--ui-space-16, 16px);
    flex-wrap: wrap;
  }
  .toolbox-home__balance.b_btn {
    height: auto;
    padding: var(--ui-space-6, 6px) 0;
    gap: var(--ui-space-6, 6px);
    line-height: 1.4;
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .balance-label {
    display: flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
  }
  .balance-label > :first-child {
    display: none;
  }
  .toolbox-home__balance strong {
    color: var(--workspace-text);
    font-size: inherit;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .toolbox-home__create.b_btn {
    gap: var(--ui-space-6, 6px);
    border-radius: 8px;
  }
  .workshop-view-switch {
    margin-bottom: var(--ui-space-24, 24px);
    border-bottom: 1px solid var(--workspace-divider);
  }
  .workshop-view-switch :deep(.tab-container) {
    margin: 0;
  }
  .workshop-view-switch :deep(.tab) {
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
  }
  .workshop-view-content.is-overview {
    display: grid;
    gap: var(--ui-space-28, 28px);
  }
  .toolbox-section {
    min-width: 0;
  }
  .toolbox-section__head {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    margin-bottom: var(--ui-space-12, 12px);
    flex-wrap: wrap;
  }
  .toolbox-section__head h2 {
    margin: 0;
    font-size: var(--ui-font-18, 18px);
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .toolbox-section__head > .b_btn {
    margin-left: auto;
    color: var(--workspace-purple-text);
    gap: var(--ui-space-5, 5px);
    padding: 0;
    font-size: var(--ui-font-12, 12px);
  }
  .toolbox-activity-grid {
    display: grid;
    gap: var(--ui-space-12, 12px);
  }
  .workshop-project.b_btn {
    .workspace-content-surface();
    --project-accent: var(--workspace-purple-text);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    width: 100%;
    min-width: 0;
    height: auto;
    padding: var(--ui-space-16, 16px);
    gap: var(--ui-space-10, 10px);
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    color: var(--workspace-text);
    text-align: left;
    white-space: normal;
    line-height: 1.5;
  }
  .workshop-project.is-blue {
    --project-accent: var(--info-color);
  }
  .workshop-project.is-teal {
    --project-accent: var(--workspace-note-text);
  }
  .workshop-project__head {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-10, 10px);
    min-width: 0;
  }
  .workshop-project__icon {
    flex: 0 0 var(--ui-layout-40, 40px);
    height: var(--ui-layout-40, 40px);
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--project-accent);
    background: var(--workspace-canvas);
  }
  .workshop-project__identity {
    display: grid;
    gap: var(--ui-space-3, 3px);
    flex: 1;
    min-width: 0;
  }
  .workshop-project__identity strong {
    font-size: var(--ui-font-16, 16px);
    font-weight: 650;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .toolbox-activity-card__type {
    color: var(--workspace-muted);
    font-size: var(--ui-font-11, 11px);
  }
  .workshop-project__status {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    color: var(--workspace-muted);
    font-size: var(--ui-font-11, 11px);
    flex-shrink: 0;
    padding-top: var(--ui-space-3, 3px);
  }
  .workshop-project__status i {
    width: var(--ui-space-6, 6px);
    height: var(--ui-space-6, 6px);
    border-radius: 50%;
    background: var(--success-color);
  }
  .workshop-project__next {
    .workspace-canvas-surface();
    display: grid;
    gap: var(--ui-space-3, 3px);
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
    border-radius: 7px;
  }
  .workshop-project__next small {
    color: var(--workspace-muted);
    font-size: var(--ui-font-11, 11px);
  }
  .workshop-project__next > span {
    font-size: var(--ui-font-13, 13px);
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .workshop-project__next.is-empty > span {
    color: var(--workspace-muted);
  }
  .workshop-project__foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    flex-wrap: wrap;
  }
  .workshop-project__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
    font-size: var(--ui-font-11, 11px);
    color: var(--workspace-muted);
  }
  .workshop-project__meta small {
    font-size: inherit;
  }
  .workshop-project__action {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    margin-left: auto;
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-purple-text);
  }
  .toolbox-tasks {
    scroll-margin-top: var(--ui-space-20, 20px);
  }
  .toolbox-task-list {
    display: grid;
    gap: var(--ui-space-10, 10px);
  }
  .toolbox-task-row {
    position: relative;
    min-width: 0;
  }
  .toolbox-activity-card.b_btn {
    .workspace-content-surface();
    display: grid;
    grid-template-columns: var(--ui-layout-34, 34px) minmax(0, 1fr);
    width: 100%;
    min-width: 0;
    height: auto;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-14, 14px);
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    text-align: left;
    white-space: normal;
    color: var(--workspace-text);
    line-height: 1.5;
  }
  .toolbox-activity-card__icon {
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    display: grid;
    place-items: center;
    background: var(--workspace-canvas);
    color: var(--workspace-purple-text);
    border-radius: 8px;
  }
  .toolbox-activity-card.is-ready .toolbox-activity-card__icon {
    color: var(--workspace-note-text);
  }
  .toolbox-activity-card__copy {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-5, 5px);
  }
  .toolbox-activity-card__topline {
    display: flex;
  }
  .toolbox-activity-card__copy strong {
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .toolbox-activity-card__copy > span:not(.toolbox-activity-card__topline) {
    color: var(--workspace-muted);
    font-size: var(--ui-font-11, 11px);
  }
  .toolbox-activity-card__copy > small {
    display: none;
  }
  .toolbox-task-meta {
    grid-column: 2;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    padding-right: var(--ui-space-28, 28px);
  }
  .toolbox-task-time {
    color: var(--workspace-muted);
    font-size: var(--ui-font-10, 10px);
  }
  .toolbox-activity-card__action {
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-purple-text);
  }
  .toolbox-task-dismiss {
    position: absolute;
    right: var(--ui-space-4, 4px);
    bottom: var(--ui-space-4, 4px);
  }
  .toolbox-task-dismiss .b_btn {
    width: var(--ui-control-32, 32px);
    height: var(--ui-control-32, 32px);
    padding: 0;
    background: transparent;
    color: var(--workspace-muted);
  }
  .workshop-attention.b_btn {
    display: none;
  }
  .toolbox-quick-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .toolbox-more-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--ui-layout-260, 260px)), 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .toolbox-external-link.b_btn {
    gap: var(--ui-space-6, 6px);
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-12, 12px);
  }
  .toolbox-more > .toolbox-external-link {
    margin-top: var(--ui-space-12, 12px);
    padding: 0;
  }
  .toolbox-home__state,
  .toolbox-guest-guide {
    .workspace-content-surface();
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    min-height: var(--ui-layout-100, 100px);
    box-sizing: border-box;
    padding: var(--ui-space-16, 16px);
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    color: var(--workspace-muted);
    font-size: var(--ui-font-13, 13px);
  }
  .toolbox-home__state.is-error {
    border-color: var(--chip-danger-border);
  }
  .toolbox-home__state.is-empty {
    border-style: dashed;
  }
  .toolbox-home__state-icon,
  .toolbox-guest-guide__icon {
    color: var(--workspace-purple-text);
  }
  .toolbox-home__state-copy {
    display: grid;
    gap: var(--ui-space-4, 4px);
    flex: 1;
    min-width: 0;
  }
  .toolbox-home__state-copy strong {
    font-size: var(--ui-font-14, 14px);
    color: var(--workspace-text);
  }
  .toolbox-home__state-copy small {
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .toolbox-guest-guide {
    margin-bottom: var(--ui-space-20, 20px);
  }
  .toolbox-guest-guide > div {
    flex: 1;
    min-width: 0;
  }
  .toolbox-guest-guide h2 {
    margin: 0;
    font-size: var(--ui-font-15, 15px);
    color: var(--workspace-text);
  }
  .toolbox-guest-guide p {
    margin: var(--ui-space-4, 4px) 0 0;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .toolbox-catalog__layout {
    display: grid;
    grid-template-columns: var(--ui-layout-180, 180px) minmax(0, 1fr);
    gap: var(--ui-space-24, 24px);
    align-items: start;
  }
  .toolbox-group-filter {
    .workspace-navigation-colors();
    position: sticky;
    top: var(--ui-space-12, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
    min-width: 0;
  }
  .toolbox-group-filter :deep(.b-chip) {
    min-height: var(--ui-control-40, 40px);
    width: 100%;
    justify-content: flex-start;
    border-radius: 8px;
  }
  .toolbox-group-filter :deep(.b-chip:not(.b-chip--selected)) {
    .workspace-navigation-default();
  }
  .toolbox-group-filter :deep(.b-chip:not(.b-chip--selected):hover) {
    .workspace-navigation-hover();
  }
  .toolbox-group-filter :deep(.b-chip.b-chip--selected) {
    .workspace-navigation-selected();
  }
  .toolbox-catalog__content {
    min-width: 0;
  }
  .toolbox-catalog__controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-14, 14px);
    margin-bottom: var(--ui-space-20, 20px);
  }
  .toolbox-catalog__search {
    position: relative;
    min-width: 0;
  }
  .toolbox-catalog__search > span {
    position: absolute;
    top: 50%;
    right: var(--ui-space-12, 12px);
    transform: translateY(-50%);
    font-size: var(--ui-font-11, 11px);
    color: var(--workspace-muted);
    pointer-events: none;
  }
  .toolbox-category-filter {
    display: flex;
    gap: var(--ui-space-6, 6px);
    flex-wrap: wrap;
  }
  .toolbox-category-filter :deep(.b-chip) {
    border-radius: 7px;
    color: var(--workspace-muted);
  }
  .toolbox-category-filter :deep(.b-chip--selected) {
    color: var(--workspace-purple-text);
    border-color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }
  .toolbox-mobile-filters {
    display: none;
  }
  .toolbox-home-groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-24, 24px);
    align-items: start;
  }
  .toolbox-home-group {
    grid-column: 1 / -1;
    min-width: 0;
    scroll-margin-top: var(--ui-space-20, 20px);
  }
  .toolbox-home-group.is-maintain,
  .toolbox-home-group.is-data {
    grid-column: auto;
  }
  .toolbox-home-group__head {
    margin-bottom: var(--ui-space-10, 10px);
  }
  .toolbox-home-group__head h3 {
    margin: 0;
    font-size: var(--ui-font-16, 16px);
    font-weight: 650;
  }
  .toolbox-home-group__head p {
    display: none;
    margin: var(--ui-space-5, 5px) 0 0;
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-muted);
    line-height: 1.5;
  }
  .toolbox-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .is-create .toolbox-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .is-prepare .toolbox-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--ui-layout-200, 200px)), 1fr));
  }
  .toolbox-card-wrap {
    position: relative;
    min-width: 0;
  }
  .toolbox-card__pin-wrap {
    position: absolute;
    bottom: var(--ui-space-4, 4px);
    right: var(--ui-space-4, 4px);
  }
  .toolbox-card__pin.b_btn {
    width: var(--ui-control-32, 32px);
    height: var(--ui-control-32, 32px);
    padding: 0;
    color: var(--workspace-muted);
  }
  .toolbox-card__pin.b_btn.is-pinned {
    color: var(--workspace-purple-text);
  }
  .toolbox-catalog__notice {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-12, 12px);
    margin-bottom: var(--ui-space-16, 16px);
    border: 1px solid var(--chip-warning-border);
    border-radius: 8px;
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .toolbox-catalog__notice > span {
    flex: 1;
  }
  .toolbox-external-card {
    .workspace-content-surface();
    margin-top: var(--ui-space-24, 24px);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    box-shadow: none;
  }
  .toolbox-external-card__copy {
    flex: 1;
    min-width: 0;
  }
  .toolbox-external-card h3 {
    margin: 0;
    font-size: var(--ui-font-14, 14px);
  }
  .toolbox-external-card p {
    margin: var(--ui-space-4, 4px) 0 0;
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .sr-only {
    position: absolute;
    /* ui-density-fixed: Screen-reader-only clipping box, not a visible interface dimension. */
    width: 1px;
    /* ui-density-fixed: Screen-reader-only clipping box, not a visible interface dimension. */
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (min-width: 1200px) {
    .workshop-view-content.is-overview.has-tasks {
      grid-template-columns: minmax(0, 2fr) minmax(var(--ui-layout-280, 280px), 1fr);
      column-gap: var(--ui-space-24, 24px);
    }
    .toolbox-continue {
      grid-column: 1;
    }
    .toolbox-tasks {
      grid-column: 2;
      padding-left: var(--ui-space-20, 20px);
      border-left: 1px solid var(--workspace-divider);
    }
    .toolbox-quick,
    .toolbox-more {
      grid-column: 1 / -1;
    }
  }
  @media (min-width: 768px) and (max-width: 1199px) {
    .toolbox-catalog__layout {
      grid-template-columns: var(--ui-layout-140, 140px) minmax(0, 1fr);
      gap: var(--ui-space-16, 16px);
    }
    .toolbox-catalog__controls {
      grid-template-columns: 1fr;
    }
    .toolbox-home-groups {
      grid-template-columns: 1fr;
    }
    .is-create .toolbox-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .toolbox-overview {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .toolbox-home__balances {
      grid-column: 1;
      grid-row: 2;
    }
    .toolbox-home__create {
      grid-column: 2;
      grid-row: 1;
    }
    .toolbox-quick-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .workshop-project.b_btn:hover,
    .toolbox-activity-card.b_btn:hover {
      .workspace-content-surface();
      border-color: var(--workspace-purple-text);
    }
  }
  @media (max-width: 767px) {
    .toolbox-home {
      padding: var(--ui-space-14, 14px) var(--ui-space-16, 16px)
        calc(var(--ui-space-28, 28px) + env(safe-area-inset-bottom));
    }
    .toolbox-overview {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--ui-space-10, 10px);
      padding-bottom: 0;
    }
    .toolbox-overview h1 {
      font-size: var(--ui-font-24, 24px);
    }
    .toolbox-overview p {
      display: none;
    }
    .toolbox-home__create.b_btn {
      grid-column: 2;
      grid-row: 1;
      padding: 0 var(--ui-space-10, 10px);
      font-size: var(--ui-font-12, 12px);
    }
    .toolbox-home__balances {
      grid-column: 1 / -1;
      grid-row: 2;
      gap: var(--ui-space-16, 16px);
    }
    .toolbox-home__balance.b_btn {
      font-size: var(--ui-font-11, 11px);
    }
    .workshop-view-switch {
      margin-top: var(--ui-space-8, 8px);
      margin-bottom: var(--ui-space-16, 16px);
    }
    .workshop-view-content.is-overview {
      gap: var(--ui-space-22, 22px);
    }
    .toolbox-section__head {
      margin-bottom: var(--ui-space-10, 10px);
      gap: var(--ui-space-8, 8px);
    }
    .toolbox-section__head h2 {
      font-size: var(--ui-font-17, 17px);
    }
    .workshop-attention.b_btn {
      .workspace-canvas-surface();
      display: flex;
      align-items: center;
      gap: var(--ui-space-8, 8px);
      width: 100%;
      height: auto;
      min-height: var(--ui-control-40, 40px);
      padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
      border: 1px solid var(--workspace-border);
      border-radius: 9px;
      font-size: var(--ui-font-12, 12px);
      color: var(--workspace-purple-text);
    }
    .workshop-attention > span {
      flex: 1;
      text-align: left;
      white-space: normal;
    }
    .toolbox-continue {
      order: 1;
    }
    .toolbox-quick {
      order: 2;
    }
    .toolbox-tasks {
      order: 3;
    }
    .toolbox-more {
      order: 4;
    }
    .workshop-project.b_btn {
      padding: var(--ui-space-12, 12px);
      gap: var(--ui-space-8, 8px);
    }
    .workshop-project__head {
      display: grid;
      grid-template-columns: var(--ui-layout-34, 34px) minmax(0, 1fr);
      gap: var(--ui-space-8, 8px);
    }
    .workshop-project__icon {
      width: var(--ui-layout-34, 34px);
      height: var(--ui-layout-34, 34px);
    }
    .workshop-project__identity strong {
      font-size: var(--ui-font-15, 15px);
    }
    .workshop-project__status {
      grid-column: 2;
      padding: 0;
    }
    .workshop-project__next {
      padding: var(--ui-space-7, 7px) var(--ui-space-8, 8px);
    }
    .workshop-project__meta small {
      display: none;
    }
    .toolbox-quick-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ui-space-10, 10px);
    }
    .toolbox-more-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ui-space-10, 10px);
    }
    .toolbox-task-dismiss .b_btn,
    .toolbox-card__pin.b_btn {
      width: var(--ui-control-44, 44px);
      height: var(--ui-control-44, 44px);
    }
    .toolbox-task-meta {
      padding-right: var(--ui-space-32, 32px);
    }
    .toolbox-catalog__layout {
      display: block;
    }
    .toolbox-group-filter {
      display: none;
    }
    .toolbox-catalog__controls {
      position: sticky;
      top: calc(-1 * var(--ui-space-14, 14px));
      z-index: 1;
      .workspace-open-surface();
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ui-space-10, 10px);
      padding: var(--ui-space-8, 8px) 0 var(--ui-space-12, 12px);
    }
    .toolbox-mobile-filters {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--ui-space-10, 10px);
    }
    .toolbox-category-filter,
    .toolbox-catalog__search > span {
      display: none;
    }
    .toolbox-home-groups {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ui-space-24, 24px);
    }
    .toolbox-home-group__head h3 {
      font-size: var(--ui-font-17, 17px);
    }
    .toolbox-home-group__head p {
      display: block;
    }
    .toolbox-grid,
    .is-create .toolbox-grid,
    .is-prepare .toolbox-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ui-space-10, 10px);
    }
    .toolbox-home__state {
      padding: var(--ui-space-14, 14px);
    }
    .toolbox-home__state-copy {
      flex-basis: 70%;
    }
    .toolbox-home__state > .b_btn {
      margin-left: auto;
    }
  }
</style>
