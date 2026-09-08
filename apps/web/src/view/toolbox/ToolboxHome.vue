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
        <BButton class="toolbox-home__balance is-ai" @click="router.push({ name: 'aiUsage' })">
          <span class="balance-label"
            ><SvgIcon :src="icon.ai.summary" size="17" aria-hidden="true" />{{ t('toolbox.aiQuotaBalance') }}</span
          >
          <strong>{{ aiQuotaBalanceLabel }}</strong>
          <SvgIcon class="balance-arrow" :src="icon.ai.sourceArrow" size="15" aria-hidden="true" />
        </BButton>
        <BButton class="toolbox-home__balance is-points" @click="router.push({ name: 'pointsUsage' })">
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
      <span class="workshop-view-switch__indicator" aria-hidden="true"></span>
      <BTabs
        v-model:active-tab="homeView"
        variant="segment"
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

    <div :key="homeView" class="workshop-view-content">
      <section
        v-if="!isGuest && homeView === 'work'"
        class="toolbox-section toolbox-continue"
        aria-labelledby="toolbox-continue-title"
      >
        <header class="toolbox-section__head">
          <h2 id="toolbox-continue-title">{{ t('toolbox.project.continueTitle') }}</h2>
          <BButton @click="openProjects(false)">{{ t('toolbox.project.allProjects') }}</BButton>
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
            <strong>{{ t('toolbox.project.intro') }}</strong>
            <small>{{ t('toolbox.project.introHint') }}</small>
          </span>
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
              <BChip tone="success">{{ t('toolbox.workspace.status.active') }}</BChip>
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
                >{{ t('toolbox.home.continueAction') }}<SvgIcon :src="icon.ai.sourceArrow" size="15" aria-hidden="true"
              /></span>
            </span>
          </BButton>
        </div>
      </section>

      <section v-if="!isGuest && homeView === 'work' && continueJobs.length" class="toolbox-section toolbox-tasks">
        <header class="toolbox-section__head"
          ><h2>{{ t('toolbox.project.tasks') }}</h2></header
        >
        <div class="toolbox-task-list">
          <BButton
            v-for="job in continueJobs"
            :key="`task-${job.id}`"
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
        </div>
      </section>

      <section v-if="homeView === 'work'" class="toolbox-section toolbox-quick" aria-labelledby="toolbox-quick-title">
        <header class="toolbox-section__head">
          <h2 id="toolbox-quick-title">{{ t('toolbox.project.quick') }}</h2>
          <p>{{ t('toolbox.project.quickHint') }}</p>
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
          <BButton
            v-for="tool in quickTools"
            :key="`quick-${tool.id}`"
            class="toolbox-quick-card"
            :class="`is-${presentation(tool.id).accent}`"
            @click="openTool(tool)"
          >
            <span class="toolbox-quick-card__icon"><SvgIcon :src="presentation(tool.id).icon" size="21" /></span>
            <span class="toolbox-quick-card__copy">
              <strong>{{
                tool.id === 'research_workspace' ? t('toolbox.workspace.myProjects') : toolName(tool.id)
              }}</strong>
            </span>
          </BButton>
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

      <section
        v-if="homeView === 'catalog'"
        class="toolbox-section toolbox-catalog"
        aria-labelledby="toolbox-catalog-title"
      >
        <header class="toolbox-section__head toolbox-catalog__head">
          <span>{{ isGuest ? '03' : '04' }}</span>
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
              <small>{{ groupToolCount(group.value) }}</small>
            </BChip>
          </div>
          <div class="toolbox-catalog__content">
            <div class="toolbox-catalog__controls">
              <div class="toolbox-catalog__search">
                <BInput
                  ref="searchInput"
                  v-model:value="keyword"
                  clearable
                  :placeholder="t('toolbox.searchPlaceholder')"
                  height="42px"
                >
                  <template #prefix><SvgIcon :src="icon.navigation.search" size="18" /></template>
                </BInput>
                <span v-if="!keyword" aria-hidden="true">⌘ K</span>
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
                  <span><SvgIcon :src="group.icon" size="20" /></span>
                  <div>
                    <h3 :id="`toolbox-group-${group.id}`">{{ t(`toolbox.homeGroup.${group.id}.title`) }}</h3>
                    <p>{{ t(`toolbox.homeGroup.${group.id}.description`) }}</p>
                  </div>
                  <BChip tone="neutral">{{ t('toolbox.home.groupToolCount', { count: group.tools.length }) }}</BChip>
                </header>
                <div class="toolbox-grid">
                  <div v-for="tool in group.tools" :key="tool.id" class="toolbox-card-wrap">
                    <BButton
                      class="toolbox-card"
                      :class="`is-${presentation(tool.id).accent}`"
                      :aria-label="toolAccessibleLabel(tool)"
                      @click="openTool(tool)"
                    >
                      <span class="toolbox-card__icon"><SvgIcon :src="presentation(tool.id).icon" size="23" /></span>
                      <span class="toolbox-card__copy">
                        <strong>{{
                          tool.id === 'research_workspace' ? t('toolbox.workspace.myProjects') : toolName(tool.id)
                        }}</strong>
                        <span>{{ toolDescription(tool.id) }}</span>
                        <small>{{ t('toolbox.outputLabel') }} · {{ t('toolbox.tool.' + tool.id + '.output') }}</small>
                      </span>
                      <span class="toolbox-card__aside"
                        ><BChip tone="neutral">{{ billingLabel(tool) }}</BChip></span
                      >
                    </BButton>
                    <BTooltip
                      v-if="!isGuest"
                      class="toolbox-card__pin-wrap"
                      :class="{ 'is-pinned': isPinned(tool.id) }"
                      :title="t(isPinned(tool.id) ? 'toolbox.home.unpinTool' : 'toolbox.home.pinTool')"
                    >
                      <BButton
                        class="toolbox-card__pin"
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
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    fetchToolboxCatalog,
    fetchToolboxHome,
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

  const { t, locale } = useI18n();
  const router = useRouter();
  const route = useRoute();
  const user = useUserStore();
  const { growth, load: loadGrowth } = useGrowth();
  const { status: aiQuotaStatus, load: loadAiQuota } = useAiQuotaStatus({ autoLoad: false });
  const tools = ref<ToolboxCatalogItem[]>([]);
  const overview = ref<ToolboxHomeOverview | null>(null);
  const localRecentUses = ref<ToolboxRecentUse[]>([]);
  const pinnedToolIds = ref<string[]>([]);
  const homeView = computed({
    get: () => (route.query.view === 'catalog' ? 'catalog' : 'work'),
    set: (view: string) => {
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
  const activeToolGroup = ref<ToolboxHomeGroupId>('workspace');
  const quickView = ref<QuickView>('common');
  const searchInput = ref<InstanceType<typeof BInput> | null>(null);
  const pageRef = ref<HTMLElement | null>(null);
  let overviewRequestVersion = 0;

  useMobileTopBar(['toolboxHome'], { searchMode: 'icon' });

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
  const groupOptions = computed(() =>
    TOOLBOX_HOME_GROUPS.map((group) => ({
      value: group.id,
      label: t(`toolbox.homeGroup.${group.id}.title`),
    })),
  );
  const continueWorkspaces = computed(() =>
    (overview.value?.workspaces?.continue || []).filter((item) => item.status === 'active').slice(0, 6),
  );
  const continueJobs = computed(() => {
    const seen = new Set<string>();
    return [...(overview.value?.tasks?.active || []), ...(overview.value?.tasks?.ready || [])]
      .filter((job) => {
        if (seen.has(job.id)) return false;
        seen.add(job.id);
        return true;
      })
      .slice(0, 3);
  });
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
  const visibleTools = computed(() => {
    const query = keyword.value.trim().toLocaleLowerCase(locale.value);
    return tools.value.filter((tool) => {
      if (activeCategory.value === 'free' && tool.billingMedium !== 'free') return false;
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
      tools: (group.id === 'workspace' ? group.toolIds.slice(0, 1) : group.toolIds)
        .map((id) => byId.get(id))
        .filter((tool): tool is ToolboxCatalogItem => Boolean(tool)),
    })).filter((group) => group.tools.length > 0);
  });

  function groupToolCount(groupId: ToolboxHomeGroupId) {
    return visibleGroups.value.find((group) => group.id === groupId)?.tools.length || 0;
  }

  const groupNavRef = ref<HTMLElement | null>(null);
  let groupScrollFrame = 0;
  function groupScrollContext() {
    const nav = groupNavRef.value;
    if (!nav) return null;
    const owner = findScrollContainer(nav);
    const documentOwner = owner === document.scrollingElement;
    const scale = documentOwner ? 1 : owner.getBoundingClientRect().height / owner.offsetHeight || 1;
    const top = documentOwner ? 0 : owner.getBoundingClientRect().top;
    const rail = getComputedStyle(nav).flexDirection === 'column';
    const inset = (parseFloat(getComputedStyle(nav).top) || 0) + (rail ? 0 : nav.offsetHeight) + 20;
    return { nav, owner, scale, top, inset };
  }
  function syncToolGroup() {
    groupScrollFrame = 0;
    if (homeView.value !== 'catalog') return;
    const context = groupScrollContext();
    if (!context) return;
    const { nav, owner, scale, top, inset } = context;
    const sections = visibleGroups.value
      .map((group) => ({
        id: group.id,
        element: document.getElementById(`toolbox-home-group-${group.id}`),
      }))
      .filter((item) => item.element);
    let current = sections[0];
    for (const section of sections) {
      if (section.element!.getBoundingClientRect().top <= top + (inset + 4) * scale) current = section;
    }
    if (owner.scrollTop > 0 && owner.scrollTop + owner.clientHeight >= owner.scrollHeight - 4)
      current = sections.at(-1);
    if (!current) return;
    activeToolGroup.value = current.id;
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
  function navigateToToolGroup(groupId: ToolboxHomeGroupId) {
    const context = groupScrollContext();
    const section = document.getElementById(`toolbox-home-group-${groupId}`);
    if (!context || !section) return;
    const { owner, scale, top, inset } = context;
    owner.scrollTo({
      top: Math.max(0, owner.scrollTop + (section.getBoundingClientRect().top - top) / scale - inset),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    onToolGroupScroll();
  }
  watch([homeView, visibleGroups], () => nextTick(onToolGroupScroll));

  function presentation(toolId: string) {
    return TOOLBOX_PRESENTATION[toolId as ToolboxToolId] || TOOLBOX_PRESENTATION.material_to_note;
  }
  const toolName = (toolId: string) => t('toolbox.tool.' + toolId + '.name');
  const toolDescription = (toolId: string) => t('toolbox.tool.' + toolId + '.description');
  function billingLabel(tool: ToolboxCatalogItem) {
    if (tool.price.kind !== 'free') {
      return tool.billingMedia.includes('ai_quota') ? t('toolbox.billingChoiceLabel') : t('toolbox.pointsLabel');
    }
    return tool.executionMode === 'service' ? t('toolbox.accountFreeLabel') : t('toolbox.localFreeLabel');
  }
  function toolAccessibleLabel(tool: ToolboxCatalogItem) {
    return `${toolName(tool.id)} · ${billingLabel(tool)}`;
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
    return isReadyTask(job) ? t('toolbox.home.resultReadyDescription') : t('toolbox.home.processingDescription');
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
    activeToolGroup.value = 'workspace';
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
    if (tool.executionMode === 'service' && isGuest.value && blockGuestWrite('toolbox-account')) return;
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
    if (isGuest.value) return;
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
    refreshLocalRecentUses();
    refreshPinnedTools();
    overview.value = null;
    if (isGuest.value) {
      overviewRequestVersion += 1;
      overviewLoading.value = false;
      overviewFailed.value = false;
    } else {
      void Promise.all([loadOverview(), loadGrowth(), loadAiQuota()]);
    }
  });
  async function initializeHome() {
    window.addEventListener('keydown', handleSearchShortcut);
    await Promise.all([
      loadCatalog(),
      isGuest.value ? Promise.resolve() : loadOverview(),
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
  .toolbox-home__views {
    display: flex;
    gap: 8px;
    margin: 16px 0 20px;
  }
  .toolbox-home .toolbox-overview__eyebrow {
    display: none;
  }
  .toolbox-home .toolbox-start-card.b_btn {
    background: var(--card-background);
  }

  @import './toolboxPageScroll.less';

  .toolbox-home {
    .toolbox-page-scroll();
    padding: 24px clamp(22px, 3.5vw, 54px) 56px;
    color: var(--text-color);
  }
  .toolbox-home > section {
    width: 100%;
    margin-right: auto;
    margin-left: auto;
  }
  .toolbox-overview {
    position: relative;
    padding: 8px 0 24px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 24px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--workspace-border);
  }
  .toolbox-overview.is-guest {
    grid-template-columns: minmax(0, 1fr);
  }
  .toolbox-overview__copy {
    position: relative;
    z-index: 1;
    min-width: 0;
    display: grid;
    justify-items: start;
    gap: 6px;
  }
  .toolbox-overview__eyebrow,
  .toolbox-section__head > span:first-child {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .toolbox-overview p {
    max-width: 700px;
    margin: 0;
    color: var(--desc-color);
    font-size: 12.5px;
    line-height: 1.6;
  }
  .toolbox-overview__assets {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }
  .toolbox-asset.b_btn {
    width: 100%;
    min-width: 0;
    min-height: 55px;
    height: auto;
    padding: 8px 10px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--card-background) 92%, transparent);
    line-height: 1.2;
    text-align: left;
  }
  .toolbox-asset__icon {
    width: 34px;
    height: 34px;
    padding: 6px;
    box-sizing: border-box;
    border: 1px solid #e8bd72;
    border-radius: 10px;
    color: #a34f00;
    background: #fff3dc;
  }
  .toolbox-asset.is-ai .toolbox-asset__icon {
    border-color: color-mix(in srgb, var(--primary-color) 40%, var(--surface-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background));
  }
  .toolbox-asset__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .toolbox-asset__copy small,
  .toolbox-asset__copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-asset__copy small {
    color: var(--desc-color);
    font-size: 10px;
  }
  .toolbox-asset__copy strong {
    font-size: 13px;
  }
  .toolbox-guest-guide {
    min-height: 88px;
    margin-top: 22px;
    padding: 16px 18px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-guest-guide__icon,
  .toolbox-home__state-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--surface-border-color));
    border-radius: 12px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }
  .toolbox-guest-guide h2 {
    margin: 0;
    font-size: 15px;
  }
  .toolbox-guest-guide p {
    margin: 4px 0 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.55;
  }
  .toolbox-section {
    margin-top: 28px;
  }

  .toolbox-section__head > span:first-child {
    grid-row: 1 / 3;
    align-self: start;
    padding-top: 4px;
  }
  .toolbox-section__head h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 730;
    letter-spacing: -0.025em;
  }
  .toolbox-section__head p {
    margin: 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.55;
  }
  .toolbox-start-content {
    display: grid;
    gap: 14px;
  }
  .toolbox-start-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .toolbox-start-card.b_btn {
    --tool-accent: var(--primary-color);
    width: 100%;
    min-width: 0;
    min-height: 112px;
    height: auto;
    padding: 14px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px 11px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 24%, var(--surface-border-color));
    border-radius: 16px;
    color: var(--text-color);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--tool-accent) 5%, var(--card-background)),
      var(--card-background)
    );
    box-shadow: var(--surface-card-shadow);
    text-align: left;
    white-space: normal;
  }
  .toolbox-start-card.is-blue {
    --tool-accent: #3975d5;
  }
  .toolbox-start-card.is-amber {
    --tool-accent: #ad6b0d;
  }
  .toolbox-start-card.is-teal {
    --tool-accent: #07835f;
  }
  .toolbox-start-card.is-rose {
    --tool-accent: #c24b68;
  }
  .toolbox-start-card__icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 30%, var(--surface-border-color));
    border-radius: 12px;
    color: var(--tool-accent);
    background: var(--card-background);
  }
  .toolbox-start-card__copy {
    min-width: 0;
    display: grid;
    gap: 5px;
  }
  .toolbox-start-card__meta {
    min-height: 20px;
  }
  .toolbox-start-card__copy strong {
    font-size: 13.5px;
    line-height: 1.25;
  }
  .toolbox-start-card__copy > small {
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .toolbox-start-card__action {
    min-width: 0;
    grid-column: 1 / -1;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    color: var(--tool-accent);
    font-size: 10.5px;
    font-weight: 700;
  }
  .toolbox-quick-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
  }
  .toolbox-quick__switch,
  .toolbox-group-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .toolbox-quick__switch {
    margin: -3px 0 11px 28px;
  }
  .toolbox-group-filter {
    position: sticky;
    top: 0;
    z-index: 6;
    margin: -3px 0 12px;
    padding: 9px 10px;
    flex-wrap: nowrap;
    overflow-x: auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    box-shadow: 0 8px 22px -18px rgba(17, 19, 32, 0.5);
    backdrop-filter: blur(14px);
    overscroll-behavior-inline: contain;
  }
  .toolbox-group-filter :deep(.b-chip) {
    flex: 0 0 auto;
  }
  .toolbox-group-filter small {
    min-width: 17px;
    margin-left: 3px;
    padding: 1px 5px;
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--surface-muted-bg, var(--active-background-color));
    font-size: 9px;
    text-align: center;
  }
  .toolbox-quick-card.is-amber {
    --tool-accent: var(--warning-color);
  }
  .toolbox-quick-card.is-teal {
    --tool-accent: var(--success-color);
  }
  .toolbox-quick-card.is-rose {
    --tool-accent: var(--danger-color);
  }
  .toolbox-quick-card__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .toolbox-quick-card__copy strong {
    display: -webkit-box;
    overflow: hidden;
    overflow-wrap: anywhere;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 12.5px;
    line-height: 1.25;
  }
  .toolbox-quick-card__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--desc-color);
    font-size: 9.5px;
  }
  .toolbox-home__state {
    min-height: 94px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 13px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    color: var(--desc-color);
    background: var(--card-background);
  }
  .toolbox-home__state-copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 3px;
  }
  .toolbox-home__state-copy strong {
    color: var(--text-color);
    font-size: 13px;
  }
  .toolbox-home__state-copy small {
    font-size: 10.5px;
    line-height: 1.5;
  }
  .toolbox-home__state.is-error {
    border-color: var(--chip-danger-border);
  }
  .toolbox-home__state.is-error .toolbox-home__state-icon,
  .toolbox-home__state.is-error .toolbox-home__state-copy strong {
    color: var(--danger-color);
  }
  .toolbox-activity-card.b_btn {
    width: 100%;
    min-width: 0;
    min-height: 118px;
    height: auto;
    padding: 14px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: start;
    gap: 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }
  .toolbox-activity-card__icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--surface-border-color));
    border-radius: 12px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }
  .toolbox-activity-card.is-ready .toolbox-activity-card__icon {
    border-color: var(--chip-success-border);
    color: var(--success-color);
  }
  .toolbox-activity-card__copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .toolbox-activity-card__topline {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .toolbox-activity-card__badges {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .toolbox-activity-card__type {
    max-width: 104px;
  }
  .toolbox-activity-card__topline small {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-activity-card__copy > strong {
    overflow: hidden;
    margin-top: 2px;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-activity-card__copy > small {
    color: var(--desc-color);
    font-size: 9.5px;
  }
  .toolbox-activity-card__copy > span:not(.toolbox-activity-card__topline) {
    display: -webkit-box;
    overflow: hidden;
    min-height: 16px;
    font-size: 11px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }
  .toolbox-activity-card__action {
    grid-column: 2;
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    color: var(--primary-color);
    font-size: 10.5px;
    font-weight: 650;
  }
  .toolbox-recent-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: 10px;
  }
  .toolbox-recent-row.b_btn {
    width: 100%;
    min-width: 0;
    min-height: 76px;
    height: auto;
    padding: 10px 12px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
    text-align: left;
  }
  .toolbox-recent-row__icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }
  .toolbox-recent-row__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .toolbox-recent-row__copy strong,
  .toolbox-recent-row__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-recent-row__copy strong {
    font-size: 12px;
  }
  .toolbox-recent-row__copy small,
  .toolbox-recent-row__time {
    color: var(--desc-color);
    font-size: 10px;
  }
  .toolbox-catalog__controls {
    margin-bottom: 16px;
    display: grid;
    grid-template-columns: minmax(260px, 500px) minmax(0, 1fr);
    align-items: center;
    gap: 12px 18px;
  }
  .toolbox-catalog__notice {
    min-height: 42px;
    margin: -4px 0 14px;
    padding: 7px 10px;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--surface-muted-bg, var(--active-background-color));
    font-size: 10.5px;
    line-height: 1.45;
  }
  .toolbox-catalog__notice > :first-child {
    color: var(--warning-color);
  }
  .toolbox-catalog__search {
    position: relative;
    min-width: 0;
  }
  .toolbox-catalog__search > span {
    position: absolute;
    z-index: 2;
    top: 50%;
    right: 10px;
    min-width: 38px;
    height: 22px;
    display: grid;
    place-items: center;
    transform: translateY(-50%);
    border: 1px solid var(--surface-border-color);
    border-radius: 7px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 9.5px;
    pointer-events: none;
  }
  .toolbox-catalog__search :deep(.input-container) {
    color: var(--desc-color);
  }
  .toolbox-catalog__search :deep(.b-input) {
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 12px;
    color: var(--text-color);
    background: var(--card-background);
    font-family: inherit;
    font-size: 12px;
  }
  .toolbox-catalog__search :deep(.b-input:hover) {
    border-color: var(--primary-color) !important;
  }
  .toolbox-catalog__search :deep(.b-input:focus-visible) {
    border-color: var(--focus-ring-color) !important;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring-color) 13%, transparent) !important;
  }
  .toolbox-category-filter {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 7px;
  }
  .toolbox-home-groups {
    display: grid;
    gap: 18px;
  }
  .toolbox-home-group.is-teal {
    --group-accent: var(--success-color);
  }
  .toolbox-home-group__head {
    min-width: 0;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }
  .toolbox-home-group__head > span:first-child {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--group-accent) 24%, var(--surface-border-color));
    border-radius: 10px;
    color: var(--group-accent);
    background: color-mix(in srgb, var(--group-accent) 7%, var(--card-background));
  }
  .toolbox-home-group__head h3 {
    margin: 0;
    font-size: 15px;
  }
  .toolbox-home-group__head p {
    margin: 2px 0 0;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
  }
  .toolbox-card-wrap {
    position: relative;
    min-width: 0;
  }
  .toolbox-card.is-violet {
    --tool-accent: var(--focus-ring-color);
  }
  .toolbox-card.is-amber {
    --tool-accent: var(--warning-color);
  }
  .toolbox-card.is-teal {
    --tool-accent: var(--success-color);
  }
  .toolbox-card.is-rose {
    --tool-accent: var(--danger-color);
  }
  .toolbox-card__copy strong,
  .toolbox-card__copy > span,
  .toolbox-card__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .toolbox-card__pin-wrap {
    position: absolute;
    z-index: 3;
    top: 8px;
    right: 8px;
    opacity: 0;
    transition: opacity 0.16s ease;
  }
  .toolbox-card__pin.b_btn {
    width: 28px;
    min-width: 28px;
    height: 28px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    color: var(--desc-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-card__pin.b_btn.is-pinned {
    opacity: 1;
    border-color: var(--primary-color);
    color: #fff;
    background: var(--primary-color);
  }
  .toolbox-card__pin.b_btn:focus-visible {
    outline: 2px solid var(--focus-ring-color);
    outline-offset: 2px;
  }
  @media (hover: hover) and (pointer: fine) {
    .toolbox-start-card.b_btn:hover {
      border-color: var(--tool-accent);
      background: color-mix(in srgb, var(--tool-accent) 7%, var(--card-background));
      transform: translateY(-1px);
    }
    .toolbox-asset.b_btn:hover,
    .toolbox-quick-card.b_btn:hover,
    .toolbox-activity-card.b_btn:hover,
    .toolbox-card.b_btn:hover {
      border-color: color-mix(in srgb, var(--primary-color) 48%, var(--surface-border-color));
      background: var(--hover-background);
    }
    .toolbox-recent-row.b_btn:hover {
      border-color: color-mix(in srgb, var(--primary-color) 42%, var(--surface-border-color));
      background: var(--hover-background);
    }
    .toolbox-card-wrap:hover .toolbox-card__pin-wrap,
    .toolbox-card__pin-wrap:focus-within,
    .toolbox-card__pin-wrap.is-pinned {
      opacity: 1;
    }
  }
  .toolbox-asset.b_btn:focus-visible,
  .toolbox-start-card.b_btn:focus-visible,
  .toolbox-quick-card.b_btn:focus-visible,
  .toolbox-activity-card.b_btn:focus-visible,
  .toolbox-recent-row.b_btn:focus-visible,
  .toolbox-card.b_btn:focus-visible {
    position: relative;
    z-index: 2;
    outline: 2px solid var(--focus-ring-color);
    outline-offset: -2px;
  }

  @media (max-width: 900px) {
    .toolbox-catalog__controls {
      grid-template-columns: 1fr;
    }
    .toolbox-category-filter {
      justify-content: flex-start;
    }
    .toolbox-start-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .toolbox-quick-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (min-width: 901px) and (max-width: 1380px) {
  }

  @media (max-width: 767px) {
    .toolbox-home {
      padding: 13px 12px calc(28px + env(safe-area-inset-bottom));
    }
    .toolbox-overview {
      min-height: 0;
      padding: 4px 0 16px;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .toolbox-overview h1 {
      font-size: 28px;
    }
    .toolbox-overview p {
      font-size: 11.5px;
    }
    .toolbox-overview__assets {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .toolbox-asset.b_btn {
      min-height: 45px;
      padding: 6px 8px;
      grid-template-columns: 30px minmax(0, 1fr);
    }
    .toolbox-asset__icon {
      width: 30px;
      height: 30px;
      padding: 4px;
    }
    .toolbox-guest-guide {
      min-height: 0;
      margin-top: 16px;
      padding: 14px;
      grid-template-columns: 38px minmax(0, 1fr);
      border-radius: 14px;
    }
    .toolbox-guest-guide__icon {
      width: 38px;
      height: 38px;
    }
    .toolbox-guest-guide > .b_btn {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 44px;
    }
    .toolbox-section {
      margin-top: 24px;
    }
    .toolbox-start-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .toolbox-start-card.b_btn {
      min-height: 96px;
      padding: 11px;
      grid-template-columns: 38px minmax(0, 1fr);
      gap: 8px;
      border-radius: 14px;
    }
    .toolbox-start-card__icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
    }
    .toolbox-start-card__copy {
      gap: 4px;
    }
    .toolbox-start-card__copy strong {
      font-size: 12.5px;
    }
    .toolbox-start-card__copy > small {
      font-size: 9.5px;
    }
    .toolbox-quick-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .toolbox-quick__switch,
    .toolbox-group-filter {
      margin-left: 0;
    }
    .toolbox-group-filter {
      margin-right: -12px;
      margin-left: -12px;
      padding-right: 12px;
      padding-left: 12px;
      border-right: 0;
      border-left: 0;
      border-radius: 0;
    }
    .toolbox-quick-card:nth-child(n + 5) {
      display: none;
    }
    .toolbox-section__head h2 {
      font-size: 18px;
    }
    .toolbox-home__state {
      min-height: 86px;
      padding: 13px;
      justify-content: flex-start;
      border-radius: 14px;
    }
    .toolbox-home__state > .b_btn {
      min-height: 44px;
    }
    .toolbox-activity-card.b_btn {
      min-height: 104px;
      padding: 12px;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .toolbox-activity-card + .toolbox-activity-card {
      border-top: 1px solid var(--surface-divider-color);
    }
    .toolbox-activity-card__action {
      min-height: 26px;
    }
    .toolbox-recent-row.b_btn {
      min-height: 62px;
      padding: 8px 10px;
      grid-template-columns: 34px minmax(0, 1fr);
    }
    .toolbox-recent-list {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .toolbox-recent-row__time {
      grid-column: 2;
      grid-row: 2;
    }
    .toolbox-catalog__controls {
      gap: 10px;
    }
    .toolbox-catalog__notice {
      min-height: 48px;
      grid-template-columns: 18px minmax(0, 1fr);
    }
    .toolbox-catalog__notice > .b_btn {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 40px;
    }
    .toolbox-catalog__search > span {
      display: none;
    }
    .toolbox-catalog__search :deep(.b-input) {
      min-height: 44px;
    }
    .toolbox-category-filter :deep(.b-chip--interactive) {
      min-height: 44px;
      padding-right: 14px;
      padding-left: 14px;
    }
    .toolbox-home-groups {
      gap: 20px;
    }
    .toolbox-home-group__head {
      grid-template-columns: 36px minmax(0, 1fr) auto;
    }
    .toolbox-home-group__head > span:first-child {
      width: 36px;
      height: 36px;
    }
    .toolbox-card__pin-wrap {
      top: 4px;
      right: 4px;
      opacity: 1;
    }
    .toolbox-card__pin.b_btn {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
  }

  :global(html.light-note-mobile-rendering .toolbox-asset.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-start-card.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-quick-card.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-guest-guide),
  :global(html.light-note-mobile-rendering .toolbox-home__state),
  :global(html.light-note-mobile-rendering .toolbox-activity-card.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-recent-row.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-card.b_btn) {
    border-color: var(--workspace-border);
    background: var(--workspace-content);
    box-shadow: none;
  }
  :global([data-theme='night'] .toolbox-asset__icon) {
    border-color: rgba(243, 180, 79, 0.46);
    color: #f3b44f;
    background: rgba(180, 83, 9, 0.22);
  }
  :global([data-theme='night'] .toolbox-asset.is-ai .toolbox-asset__icon) {
    border-color: color-mix(in srgb, var(--primary-color) 58%, var(--surface-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 18%, var(--card-background));
  }
  :global(html.light-note-mobile-rendering .toolbox-activity-card__icon),
  :global(html.light-note-mobile-rendering .toolbox-start-card__icon),
  :global(html.light-note-mobile-rendering .toolbox-quick-card__icon),
  :global(html.light-note-mobile-rendering .toolbox-recent-row__icon),
  :global(html.light-note-mobile-rendering .toolbox-card__icon),
  :global(html.light-note-mobile-rendering .toolbox-home-group__head > span:first-child) {
    border-color: var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
  .toolbox-overview h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 780;
    letter-spacing: -0.052em;
    line-height: 1.08;
  }
  .toolbox-overview__eyebrow {
    display: none;
  }
  .toolbox-task-list {
    display: grid;
    gap: 8px;
  }
  .toolbox-task-list .toolbox-activity-card {
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    padding: 12px 16px;
    gap: 12px;
  }
  .toolbox-task-list .toolbox-activity-card__copy {
    flex: 1;
  }
  .toolbox-task-list .toolbox-activity-card__copy > span:not(.toolbox-activity-card__topline),
  .toolbox-task-list .toolbox-activity-card__copy > small {
    display: none;
  }
  .toolbox-task-list .toolbox-activity-card__action {
    position: static;
  }

  .toolbox-section__head > .b_btn {
    margin-left: auto;
  }
  .toolbox-activity-card strong {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  @media (max-width: 767px) {
    .toolbox-task-list .toolbox-activity-card {
      flex-wrap: wrap;
    }
  }

  .workshop-view-switch.is-catalog .workshop-view-switch__indicator {
    transform: translateX(100%);
  }
  .workshop-view-switch :deep(.tab-container) {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .workshop-view-content {
    animation: workshop-view-appear 180ms ease-out;
  }
  @keyframes workshop-view-appear {
    from {
      opacity: 0.5;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .workshop-view-switch__indicator {
      transition: none;
    }
    .workshop-view-content {
      animation: none;
    }
  }
  .toolbox-catalog__content {
    min-width: 0;
  }
  @media (min-width: 1200px) {
    .toolbox-catalog__layout {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      gap: 24px;
      align-items: start;
    }
    .toolbox-catalog__layout > .toolbox-group-filter {
      flex-direction: column;
      top: 16px;
      margin: 0;
      padding: 8px;
      overflow: visible;
    }
    .toolbox-catalog__layout > .toolbox-group-filter :deep(.b-chip) {
      width: 100%;
      justify-content: space-between;
      min-height: 42px;
      border-radius: 8px;
    }
    .toolbox-catalog__controls {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  // 共享工作区表面：仅改变颜色，布局与滚动由原组件负责。
  .toolbox-group-filter,
  .toolbox-home-group,
  .toolbox-catalog__content {
    .workspace-open-surface();
  }
  .toolbox-card.b_btn,
  .toolbox-activity-card,
  .toolbox-quick-card {
    .workspace-content-surface();
  }

  .toolbox-group-filter {
    .workspace-navigation-colors();
  }
  .toolbox-group-filter :deep(.b-chip:not(.b-chip--selected):hover) {
    .workspace-navigation-hover();
  }
  .toolbox-group-filter :deep(.b-chip.b-chip--selected) {
    .workspace-navigation-selected();
  }
  // 首页层级：资产、项目、工具各自使用稳定的内容表面。
  .toolbox-home__balances {
    display: grid;
    grid-template-columns: repeat(2, minmax(160px, max-content));
    gap: 10px;
  }
  .toolbox-home__balance.b_btn {
    .workspace-content-surface();
    --balance-accent: var(--workspace-purple-text);
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 16px;
    gap: 7px 8px;
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 74px;
    padding: 12px 14px;
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    text-align: left;
    line-height: 1.25;
    white-space: normal;
  }
  .toolbox-home__balance.is-points {
    --balance-accent: var(--warning-color);
  }
  .balance-label {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--workspace-muted);
    font-size: 12px;
  }
  .balance-label > :first-child {
    color: var(--balance-accent);
  }
  .toolbox-home__balance strong {
    grid-column: 1 / -1;
    grid-row: 2;
    color: var(--workspace-text);
    font-size: 21px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .balance-arrow {
    grid-column: 2;
    grid-row: 1;
    align-self: center;
    color: var(--workspace-muted);
  }
  .toolbox-home__create.b_btn {
    height: 40px;
    gap: 6px;
    border-radius: 10px;
  }
  .workshop-view-switch {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: min(300px, 100%);
    padding: 4px;
    margin: 24px 0 28px;
    border: 0;
    border-radius: 12px;
    background: var(--workspace-canvas);
    isolation: isolate;
  }
  .workshop-view-switch__indicator {
    position: absolute;
    inset: 4px auto 4px 4px;
    width: calc(50% - 4px);
    border-radius: 9px;
    background: var(--workspace-content);
    border: 1px solid var(--workspace-border);
    box-shadow: none;
    transition: transform 220ms ease;
    z-index: -1;
    box-sizing: border-box;
  }
  .workshop-view-switch :deep(.tab) {
    width: 100%;
    justify-content: center;
    font-weight: 600;
    min-height: 36px;
    padding: 8px 14px;
    border: 0;
    background: transparent;
    color: var(--workspace-muted);
  }
  .workshop-view-switch :deep(.tab.is-active) {
    color: var(--workspace-purple-text);
    background: transparent;
    box-shadow: none;
  }
  .toolbox-section__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin-bottom: 16px;
  }
  .toolbox-section__head > .b_btn {
    background: transparent;
    color: var(--workspace-muted);
  }
  .toolbox-activity-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
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
    padding: 20px;
    gap: 18px;
    border: 1px solid var(--workspace-border);
    border-radius: 16px;
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
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .workshop-project__icon {
    flex: 0 0 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: var(--project-accent);
    background: var(--workspace-hover);
    background: color-mix(in srgb, var(--project-accent) 9%, var(--workspace-content));
  }
  .workshop-project__identity {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .workshop-project__identity strong {
    font-size: 17px;
    font-weight: 650;
    line-height: 1.45;
  }
  .workshop-project__identity strong,
  .workshop-project__next > span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .workshop-project__identity .toolbox-activity-card__type {
    max-width: none;
    color: var(--project-accent);
    font-size: 11px;
  }
  .workshop-project__head :deep(.b-chip) {
    flex-shrink: 0;
  }
  .workshop-project__next {
    display: grid;
    gap: 5px;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--workspace-canvas);
  }
  .workshop-project__next small {
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .workshop-project__next > span {
    font-size: 13px;
  }
  .workshop-project__next.is-empty > span {
    color: var(--workspace-muted);
  }
  .workshop-project__foot {
    margin-top: auto;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
  }
  .workshop-project__meta {
    display: grid;
    gap: 3px;
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .workshop-project__meta small {
    font-size: 10px;
  }
  .workshop-project__action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--workspace-purple-text);
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .toolbox-task-list .toolbox-activity-card.b_btn {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    box-shadow: none;
  }
  .toolbox-task-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .toolbox-task-time {
    align-self: center;
    color: var(--desc-color);
    font-size: 11px;
    white-space: nowrap;
  }
  .toolbox-task-list .toolbox-activity-card__action {
    grid-column: auto;
    color: var(--workspace-purple-text);
    font-size: 12px;
  }
  .toolbox-activity-card__icon {
    border: 0;
    background: var(--workspace-canvas);
  }
  .toolbox-quick-card.b_btn {
    .workspace-content-surface();
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 76px;
    padding: 14px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--workspace-divider);
    border-radius: 14px;
    text-align: left;
    white-space: normal;
    line-height: 1.4;
    box-shadow: none;
  }
  .toolbox-quick-card__icon,
  .toolbox-card__icon {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 11px;
    color: var(--tool-accent, var(--workspace-purple-text));
    background: var(--workspace-canvas);
  }
  .toolbox-home-group {
    --group-accent: var(--workspace-purple-text);
    scroll-margin-top: 76px;
    padding: 0;
    display: grid;
    gap: 16px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
  .toolbox-home-groups {
    display: grid;
    gap: 28px;
  }
  .toolbox-home-group__head > span:first-child {
    border: 0;
    background: var(--workspace-canvas);
  }
  .toolbox-home-group__head h3 {
    font-size: 16px;
  }
  .toolbox-home-group__head p {
    font-size: 12px;
  }
  .toolbox-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: 12px;
  }
  .toolbox-card.b_btn {
    .workspace-content-surface();
    --tool-accent: var(--workspace-purple-text);
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 18px;
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    text-align: left;
    white-space: normal;
    line-height: 1.5;
    box-shadow: none;
  }
  .toolbox-card.is-teal {
    --tool-accent: var(--workspace-note-text);
  }
  .toolbox-card.is-amber {
    --tool-accent: var(--warning-color);
  }
  .toolbox-card.is-blue {
    --tool-accent: var(--info-color);
  }
  .toolbox-card__copy {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding-right: 16px;
  }
  .toolbox-card__copy strong {
    font-size: 14px;
    white-space: normal;
  }
  .toolbox-card__copy > span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    color: var(--workspace-muted);
    font-size: 12px;
  }
  .toolbox-card__copy small {
    font-size: 11px;
    color: var(--workspace-muted);
    white-space: normal;
  }
  .toolbox-card__aside {
    grid-column: 2;
    align-self: end;
    justify-self: start;
  }
  .toolbox-group-filter {
    box-shadow: none;
    backdrop-filter: none;
  }
  @media (hover: hover) and (pointer: fine) {
    .workshop-project.b_btn:hover {
      border-color: var(--project-accent);
      background: var(--workspace-content);
    }
    .toolbox-home__balance.b_btn:hover {
      border-color: var(--balance-accent);
      background: var(--workspace-content);
    }
    .toolbox-card.b_btn:hover,
    .toolbox-quick-card.b_btn:hover {
      background: var(--workspace-content);
      border-color: var(--workspace-purple-text);
    }
  }
  @media (max-width: 767px) {
    .toolbox-overview {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px 10px;
    }
    .toolbox-overview__copy {
      display: contents;
    }
    .toolbox-overview__copy h1 {
      grid-column: 1;
      grid-row: 1;
    }
    .toolbox-overview__copy p {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .toolbox-home__create.b_btn {
      grid-column: 2;
      grid-row: 1;
      height: 44px;
      padding: 0 12px;
    }
    .toolbox-home__balances {
      grid-column: 1 / -1;
      grid-row: 3;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .toolbox-home__balance.b_btn {
      padding: 10px 12px;
    }
    .toolbox-home__balance strong {
      font-size: 18px;
    }
    .toolbox-overview h1 {
      font-size: 25px;
      overflow-wrap: anywhere;
    }
    .toolbox-activity-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
    .workshop-project.b_btn {
      padding: 16px;
      gap: 14px;
    }
    .workshop-project__head {
      flex-wrap: wrap;
      gap: 10px;
    }
    .workshop-project__identity {
      min-width: 140px;
    }
    .workshop-project__identity strong {
      font-size: 16px;
    }
    .workshop-project__head :deep(.b-chip) {
      margin-left: 52px;
    }
    .workshop-project__foot {
      flex-wrap: wrap;
    }
    .workshop-project__action {
      margin-left: auto;
    }
    .workshop-view-switch :deep(.tab) {
      min-height: 44px;
    }
    .toolbox-task-list .toolbox-activity-card.b_btn {
      grid-template-columns: 40px minmax(0, 1fr);
    }
    .toolbox-task-meta {
      grid-column: 2;
      min-width: 0;
      flex-wrap: wrap;
      gap: 6px 12px;
    }
    .toolbox-task-list .toolbox-activity-card__action {
      grid-column: 2;
    }
    .toolbox-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .toolbox-card__pin.b_btn {
      min-width: 44px;
      width: 44px;
      height: 44px;
      box-shadow: none;
    }
    .toolbox-card__copy {
      padding-right: 26px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .workshop-view-switch__indicator {
      transition: none;
    }
  }
</style>
