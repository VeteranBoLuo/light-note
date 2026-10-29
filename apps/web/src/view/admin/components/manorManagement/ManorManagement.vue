<template>
  <AdminDataPage
    :title="a('title')"
    :subtitle="a('subtitle')"
    eyebrow="Admin / Manor"
    layout="scroll"
    class="manor-management"
    :class="{ 'is-mobile': bookmark.isMobile }"
  >
    <template #actions>
      <BChip
        v-if="runtime"
        :tone="!runtime.deploymentEnabled ? 'neutral' : runtime.mode === 'maintenance' ? 'pending' : 'success'"
        >{{ !runtime.deploymentEnabled ? a('disabled') : a(runtime.mode) }}</BChip
      >
      <BButton :loading="loading" @click="reload">{{ a('refresh') }}</BButton>
    </template>
    <div class="manor-toolbar">
      <BTabs :active-tab="tab" :options="tabs" variant="line" @change="changeTab" />
      <div v-if="tab !== 'settings'" class="manor-filters">
        <BSelect
          v-if="tab !== 'players'"
          :value="days"
          :options="[7, 30].map((value) => ({ value, label: a('range', { days: value }) }))"
          @update:value="updateFilter('days', $event)"
        />
        <label
          ><BSwitch :checked="hideInternal" @update:checked="updateFilter('internal', $event ? 'hide' : 'show')" />{{
            a('hideInternal')
          }}</label
        >
      </div>
    </div>
    <p v-if="error" class="manor-admin-notice" role="alert"
      >{{ error }} <BButton size="small" @click="reload">{{ a('refresh') }}</BButton></p
    >
    <ManorOverview
      v-if="tab === 'overview' && overview"
      :data="overview"
      @records="changeTab('operations')"
      @operation="selectedOperation = $event"
    />
    <template v-else-if="tab === 'players' || tab === 'operations'">
      <div class="manor-search">
        <BInput
          v-model:value="searchDraft"
          clearable
          :placeholder="tab === 'players' ? a('search') : a('user') + ' ID'"
          @enter="applySearch"
        />
        <BSelect
          v-if="tab === 'operations'"
          v-model:value="actionDraft"
          :options="actionOptions"
          :placeholder="a('allActions')"
        />
        <BButton type="primary" :disabled="loading" @click="applySearch">{{ a('query') }}</BButton>
        <BButton :disabled="loading" @click="resetSearch">{{ a('reset') }}</BButton>
      </div>
      <p class="manor-muted">{{ tab === 'players' ? a('listHint') : a('recordHint') }}</p>
      <BTable
        v-if="!bookmark.isMobile"
        :data="rows"
        :columns="columns"
        row-key="rowKey"
        :loading="loading"
        :pagination="tab === 'players'"
        :total="total"
        :current-page="page"
        :page-size="20"
        :page-size-options="[20]"
        @page-change="updateFilter('page', $event)"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'user'"
            ><div class="manor-user-summary"
              ><strong>{{ record.alias || record.userId }}</strong
              ><small class="manor-user-id">{{ record.userId }}</small></div
            ></template
          >
          <template v-else-if="column.key === 'time'">{{ time(record.updatedAt || record.createdAt) }}</template>
          <template v-else-if="column.key === 'action'"
            >{{ action(record.action)
            }}<BChip v-if="record.effectful === false" tone="neutral">{{ a('noop') }}</BChip></template
          >
          <template v-else-if="column.key === 'changes'">{{ changes(record as ManorOperation) }}</template>
          <template v-else-if="column.key === 'pointsDelta'"
            ><span
              :class="record.pointsDelta > 0 ? 'manor-positive' : record.pointsDelta < 0 ? 'manor-negative' : ''"
              >{{ signed(record.pointsDelta) }}</span
            ></template
          >
          <template v-else-if="column.key === 'view'"
            ><BButton
              size="small"
              @click="tab === 'players' ? openPlayer(record.userId) : (selectedOperation = record as ManorOperation)"
              >{{ a('view') }}</BButton
            ></template
          >
        </template>
      </BTable>
      <div v-else class="manor-mobile-list" :aria-busy="loading">
        <article v-for="row in rows" :key="row.rowKey" class="manor-panel">
          <div class="manor-section-title"
            ><strong>{{ row.alias || row.userId }}</strong
            ><BButton
              size="small"
              @click="tab === 'players' ? openPlayer(row.userId) : (selectedOperation = row as ManorOperation)"
              >{{ a('view') }}</BButton
            ></div
          >
          <small>{{ row.userId }}</small>
          <p v-if="tab === 'players'">Lv.{{ row.level }} · {{ a('discovered') }} {{ row.discoveries }}</p>
          <template v-else
            ><p>{{ action(row.action) }} · {{ signed(row.pointsDelta) }}</p
            ><p>{{ changes(row as ManorOperation) }}</p></template
          >
          <small>{{ time(row.updatedAt || row.createdAt) }}</small> </article
        ><p v-if="!loading && !rows.length">{{ a('empty') }}</p>
      </div>
      <div v-if="tab === 'operations' || bookmark.isMobile" class="manor-pagination">
        <BButton
          :disabled="loading || (tab === 'operations' ? !cursorStack.length : page <= 1)"
          @click="previousPage"
          >{{ a('previous') }}</BButton
        >
        <span>{{ tab === 'players' ? page : cursorStack.length + 1 }}</span>
        <BButton :disabled="loading || (tab === 'operations' ? !nextCursor : page * 20 >= total)" @click="nextPage">{{
          a('next')
        }}</BButton>
      </div>
      <BButton v-if="tab === 'operations'" size="small" @click="goApiLogs">{{ a('apiLogs') }}</BButton>
    </template>
    <section v-else-if="tab === 'settings' && runtime" class="manor-settings-grid">
      <section class="manor-panel">
        <h3>{{ a('controls') }}</h3
        ><p class="manor-muted">{{ a('controlsHint') }}</p>
        <dl class="manor-info-list"
          ><div
            ><dt>{{ a('deployment') }}</dt
            ><dd>{{ runtime.deploymentEnabled ? a('enabled') : a('disabled') }}</dd></div
          ></dl
        >
        <p class="manor-muted">{{ a('deploymentHint') }}</p>
        <label class="manor-field"
          ><span>{{ a('mode') }}</span
          ><BSelect
            v-model:value="draft.mode"
            :options="['open', 'maintenance'].map((value) => ({ value, label: a(value) }))"
        /></label>
        <p class="manor-muted">{{ a('maintenanceHint') }}</p>
        <label class="manor-field"
          ><span>{{ a('message') }}</span
          ><BInput v-model:value="draft.message" type="textarea" :rows="3" :maxlength="120"
        /></label>
        <label class="manor-field"
          ><span>{{ a('reason') }}</span
          ><BInput v-model:value="draft.reason" :maxlength="500" :placeholder="a('reasonHint')"
        /></label>
        <p class="manor-muted"
          >{{ time(runtime.updatedAt) }} · {{ runtime.updatedBy || '—' }}
          <BChip v-if="dirty" tone="pending">{{ a('dirty') }}</BChip></p
        >
        <div class="manor-actions"
          ><BButton :disabled="saving" @click="resetDraft">{{ a('cancel') }}</BButton
          ><BButton
            type="primary"
            :loading="saving"
            :disabled="!dirty || draft.reason.trim().length < 6"
            @click="confirmRuntime"
            >{{ a('save') }}</BButton
          ></div
        >
      </section>
      <section class="manor-panel"
        ><div class="manor-section-title"
          ><h3>{{ a('rules') }}</h3
          ><BChip tone="neutral">{{ a('readonly') }}</BChip></div
        >
        <dl class="manor-info-list"
          ><div v-for="rule in rules" :key="rule.label"
            ><dt>{{ rule.label }}</dt
            ><dd>{{ rule.value }}</dd></div
          ></dl
        >
        <BButton @click="router.push(bookmark.isMobile ? '/adminAudit' : '/admin/adminAudit')">{{
          a('audit')
        }}</BButton>
      </section>
    </section>
    <p v-else-if="!loading && !error">{{ a('empty') }}</p>
    <BDrawer
      :open="!!playerId"
      :title="player ? a('playerTitle', { name: player.alias || player.userId }) : a('players')"
      width="var(--ui-layout-560, 560px)"
      :full-screen="bookmark.isMobile"
      :modal="bookmark.isMobile"
      @close="closePlayer"
    >
      <p v-if="playerLoading">{{ a('refresh') }}…</p
      ><p v-else-if="playerError" role="alert"
        >{{ playerError }} <BButton @click="loadPlayer">{{ a('refresh') }}</BButton></p
      >
      <ManorPlayerDetail
        v-else-if="player"
        :player="player"
        :mobile="bookmark.isMobile"
        @records="showUserRecords"
        @points="goPoints"
      />
    </BDrawer>
    <BDrawer
      :open="!!selectedOperation"
      :title="a('operationDetail')"
      width="var(--ui-layout-480, 480px)"
      :full-screen="bookmark.isMobile"
      :modal="bookmark.isMobile"
      @close="selectedOperation = null"
    >
      <div v-if="selectedOperation" class="manor-operation-detail"
        ><BChip tone="success">{{ a('submitted') }}</BChip>
        <dl class="manor-info-list"
          ><div
            ><dt>{{ a('user') }}</dt
            ><dd>{{ selectedOperation.alias || selectedOperation.userId }}</dd></div
          ><div
            ><dt>{{ a('action') }}</dt
            ><dd>{{ action(selectedOperation.action) }}</dd></div
          ><div
            ><dt>{{ a('time') }}</dt
            ><dd>{{ time(selectedOperation.createdAt) }}</dd></div
          ><div
            ><dt>{{ a('revision') }}</dt
            ><dd>{{ selectedOperation.revision }}</dd></div
          ><div
            ><dt>{{ a('version') }}</dt
            ><dd>{{ selectedOperation.version }}</dd></div
          ><div
            ><dt>{{ a('points') }}</dt
            ><dd>{{ signed(selectedOperation.pointsDelta) }}</dd></div
          ></dl
        >
        <p>{{ changes(selectedOperation) }}</p
        ><p v-if="selectedOperation.effectful === false">{{ a('noop') }}</p
        ><h3>{{ a('receipt') }}</h3
        ><code class="manor-receipt">{{ selectedOperation.requestId }}</code
        ><p class="manor-muted">{{ a('atomic') }}</p>
        <div class="manor-actions"
          ><BButton @click="openOperationPlayer">{{ a('players') }}</BButton
          ><BButton v-if="!bookmark.isMobile" @click="goPoints(selectedOperation.userId)">{{
            a('pointsAdmin')
          }}</BButton></div
        >
      </div>
    </BDrawer>
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { MANOR_COMMANDS } from '@lightnote/shared/manor';
  import { bookmarkStore } from '@/store';
  import {
    getManorAdminStatus,
    getManorAdminOverview,
    getManorAdminPlayers,
    getManorAdminPlayer,
    getManorAdminOperations,
    setManorAdminRuntime,
    type ManorRuntime,
    type ManorOverview as Overview,
    type ManorPlayer,
    type ManorOperation,
    type ManorPlayerRow,
  } from '@/api/manorAdminApi';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import ManorOverview from './ManorOverview.vue';
  import ManorPlayerDetail from './ManorPlayerDetail.vue';
  import { useManorAdminFormat } from './manorAdminFormat';
  import './manorManagement.less';

  const route = useRoute(),
    router = useRouter(),
    bookmark = bookmarkStore();
  const { a, signed, time, action, resource } = useManorAdminFormat();
  const tab = computed(() =>
    ['players', 'operations', 'settings'].includes(String(route.query.tab)) ? String(route.query.tab) : 'overview',
  );
  const days = computed(() => (route.query.days === '30' ? 30 : 7)),
    hideInternal = computed(() => route.query.internal !== 'show');
  const page = computed(() => Math.max(1, Math.min(500, Number(route.query.page) || 1)));
  const tabs = computed(() => ['overview', 'players', 'operations', 'settings'].map((key) => ({ key, label: a(key) })));
  const actionOptions = computed(() => [
    { value: '', label: a('allActions') },
    ...MANOR_COMMANDS.map((value) => ({ value, label: action(value) })),
  ]);
  const runtime = ref<ManorRuntime | null>(null),
    overview = ref<Overview | null>(null),
    player = ref<ManorPlayer | null>(null),
    selectedOperation = ref<ManorOperation | null>(null);
  const players = ref<ManorPlayerRow[]>([]),
    operations = ref<ManorOperation[]>([]),
    total = ref(0);
  const loading = ref(false),
    saving = ref(false),
    error = ref(''),
    playerLoading = ref(false),
    playerError = ref('');
  const searchDraft = ref(''),
    actionDraft = ref(''),
    nextCursor = ref<string | null>(null),
    cursorStack = ref<Array<string | null>>([]);
  let cursor: string | null = null,
    generation = 0,
    controller: AbortController | null = null,
    playerGeneration = 0,
    playerController: AbortController | null = null;
  const draft = reactive({ mode: 'open' as ManorRuntime['mode'], message: '', reason: '', revision: 0 });
  const dirty = computed(
    () => !!runtime.value && (draft.mode !== runtime.value.mode || draft.message !== runtime.value.message),
  );
  const playerId = computed(() => (typeof route.query.player === 'string' ? route.query.player : ''));
  const rows = computed<any[]>(() =>
    tab.value === 'players'
      ? players.value.map((r) => ({ ...r, rowKey: r.userId }))
      : operations.value.map((r) => ({ ...r, rowKey: `${r.userId}:${r.requestId}` })),
  );
  const columns = computed(() =>
    tab.value === 'players'
      ? [
          { title: a('user'), key: 'user' },
          { title: a('level'), key: 'level' },
          { title: a('discovered'), key: 'discoveries' },
          { title: a('updated'), key: 'time' },
          { title: a('view'), key: 'view' },
        ]
      : [
          { title: a('time'), key: 'time' },
          { title: a('user'), key: 'user' },
          { title: a('action'), key: 'action' },
          { title: a('changes'), key: 'changes', ellipsis: false },
          { title: a('points'), key: 'pointsDelta' },
          { title: a('view'), key: 'view' },
        ],
  );
  const rules = computed(() =>
    runtime.value
      ? [
          { label: a('version'), value: runtime.value.rules.version },
          { label: a('ruleWater'), value: runtime.value.rules.dailyWater },
          { label: a('ruleFree'), value: a('perDay', { count: runtime.value.rules.freeCasts }) },
          { label: a('rulePity'), value: a('pity', { count: runtime.value.rules.pityCasts }) },
          { label: a('ruleWeight'), value: a('weight', { count: runtime.value.rules.targetWeight }) },
          { label: a('ruleBuy'), value: a('notForSale') },
        ]
      : [],
  );
  const changes = (item: ManorOperation) =>
    item.deltas.map((d) => `${resource(d.key)} ${signed(d.delta)}`).join(' · ') || '—';
  function resetDraft() {
    if (runtime.value)
      Object.assign(draft, {
        mode: runtime.value.mode,
        message: runtime.value.message,
        reason: '',
        revision: runtime.value.revision,
      });
  }
  function setRuntime(value: ManorRuntime) {
    const preserve = dirty.value;
    runtime.value = value;
    if (!preserve) resetDraft();
  }
  async function reload() {
    controller?.abort();
    controller = new AbortController();
    const id = ++generation;
    loading.value = true;
    error.value = '';
    const input = {
      days: days.value,
      hideInternal: hideInternal.value,
      page: page.value,
      search: String(route.query.search || ''),
      userId: String(route.query.user || ''),
      action: String(route.query.action || ''),
      cursor,
    };
    try {
      if (tab.value === 'overview') {
        const result = await getManorAdminOverview(input, controller.signal);
        if (id !== generation) return;
        overview.value = result;
        setRuntime(result.runtime);
      } else {
        const state = await getManorAdminStatus(controller.signal);
        if (id !== generation) return;
        setRuntime(state);
        if (tab.value === 'players') {
          const result = await getManorAdminPlayers(input, controller.signal);
          if (id !== generation) return;
          players.value = result.items;
          total.value = result.total;
        } else if (tab.value === 'operations') {
          const result = await getManorAdminOperations(input, controller.signal);
          if (id !== generation) return;
          operations.value = result.items;
          nextCursor.value = result.nextCursor;
        }
      }
    } catch {
      if (id === generation && !controller.signal.aborted) error.value = a('failed');
    } finally {
      if (id === generation) loading.value = false;
    }
  }
  async function patchQuery(patch: Record<string, string | undefined>) {
    const changed = Object.entries(patch).some(([key, value]) => route.query[key] !== value);
    await router.replace({ query: { ...route.query, ...patch } });
    if (!changed) await reload();
  }
  function changeTab(value: string) {
    cursor = null;
    cursorStack.value = [];
    selectedOperation.value = null;
    void patchQuery({ tab: value, page: undefined, player: undefined });
  }
  function updateFilter(key: string, value: unknown) {
    cursor = null;
    cursorStack.value = [];
    void patchQuery({ [key]: String(value), ...(key === 'page' ? {} : { page: undefined }) });
  }
  function applySearch() {
    cursor = null;
    cursorStack.value = [];
    void patchQuery({
      [tab.value === 'players' ? 'search' : 'user']: searchDraft.value.trim() || undefined,
      action: actionDraft.value || undefined,
      page: undefined,
    });
  }
  function resetSearch() {
    searchDraft.value = '';
    actionDraft.value = '';
    cursor = null;
    cursorStack.value = [];
    void patchQuery({ search: undefined, user: undefined, action: undefined, page: undefined });
  }
  function previousPage() {
    if (tab.value === 'players') updateFilter('page', page.value - 1);
    else {
      cursor = cursorStack.value.pop() ?? null;
      void reload();
    }
  }
  function nextPage() {
    if (tab.value === 'players') updateFilter('page', page.value + 1);
    else if (nextCursor.value) {
      cursorStack.value.push(cursor);
      cursor = nextCursor.value;
      void reload();
    }
  }
  function openPlayer(id: string) {
    void patchQuery({ player: id });
  }
  function closePlayer() {
    void patchQuery({ player: undefined });
  }
  function showUserRecords(id: string) {
    cursor = null;
    cursorStack.value = [];
    void patchQuery({ tab: 'operations', user: id, player: undefined });
  }
  function goPoints(id: string) {
    void router.push({ path: '/admin/pointsOps', query: { userId: id } });
  }
  function goApiLogs() {
    void router.push({ path: bookmark.isMobile ? '/apiLog' : '/admin/apiLog', query: { keyword: '/growth/manor' } });
  }
  function openOperationPlayer() {
    const id = selectedOperation.value?.userId;
    selectedOperation.value = null;
    if (id) openPlayer(id);
  }
  async function loadPlayer() {
    playerController?.abort();
    playerController = new AbortController();
    const id = ++playerGeneration;
    player.value = null;
    playerError.value = '';
    if (!playerId.value) return;
    playerLoading.value = true;
    try {
      const value = await getManorAdminPlayer(playerId.value, playerController.signal);
      if (id === playerGeneration) player.value = value;
    } catch {
      if (id === playerGeneration && !playerController.signal.aborted) playerError.value = a('failed');
    } finally {
      if (id === playerGeneration) playerLoading.value = false;
    }
  }
  function confirmRuntime() {
    if (!runtime.value || saving.value || !dirty.value || draft.reason.trim().length < 6) return;
    const input = {
      mode: draft.mode,
      message: draft.message,
      expectedRevision: draft.revision,
      reason: draft.reason.trim(),
      confirmed: true as const,
    };
    const escape = (value: string) =>
      value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    Alert.alert({
      title: a('confirmTitle'),
      content: a('confirm', { from: a(runtime.value.mode), to: a(input.mode), reason: escape(input.reason) }),
      okText: a('confirmSave'),
      onOk: () => saveRuntime(input),
    });
  }
  async function saveRuntime(input: Parameters<typeof setManorAdminRuntime>[0]) {
    saving.value = true;
    error.value = '';
    try {
      runtime.value = await setManorAdminRuntime(input);
      resetDraft();
      message.success(a('saved'));
    } catch (e) {
      error.value =
        (e as { code?: string })?.code === 'MANOR_RUNTIME_CONFLICT' ? a('runtimeConflict') : a('writeUnknown');
      try {
        runtime.value = await getManorAdminStatus();
        draft.revision = runtime.value.revision;
      } catch {
        /* Preserve the draft until an explicit refresh succeeds. */
      }
    } finally {
      saving.value = false;
    }
  }
  watch(
    () => [
      tab.value,
      days.value,
      hideInternal.value,
      page.value,
      route.query.search,
      route.query.user,
      route.query.action,
    ],
    () => {
      cursor = null;
      cursorStack.value = [];
      overview.value = null;
      players.value = [];
      operations.value = [];
      total.value = 0;
      nextCursor.value = null;
      searchDraft.value = String(route.query[tab.value === 'players' ? 'search' : 'user'] || '');
      actionDraft.value = String(route.query.action || '');
      void reload();
    },
    { immediate: true },
  );
  watch(playerId, () => void loadPlayer(), { immediate: true });
  onBeforeUnmount(() => {
    generation++;
    playerGeneration++;
    controller?.abort();
    playerController?.abort();
  });
</script>
