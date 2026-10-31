<template>
  <main class="knowledge-manor">
    <div v-if="maintenanceNotice && interactive" class="knowledge-manor__maintenance" role="status">{{ maintenanceNotice }}</div>
    <div v-if="failed" class="knowledge-manor__state" role="alert">
      <p>{{ t(failureCopy[failure]) }}</p>
      <BButton v-if="failure === 'version'" @click="reloadPage">{{ t('common.refresh') }}</BButton>
      <BButton v-else-if="failure === 'load'" @click="initialise()">{{ t('common.retry') }}</BButton>
      <!-- Access failures cannot be fixed by retrying; they only need a way back. -->
      <BButton v-if="bookmark.isMobile || !['version', 'load'].includes(failure)" @click="exit">{{ t('manor.returnToApp') }}</BButton>
    </div>
    <ManorLoadingState v-else-if="loading || !interactive" :progress="progress" class="knowledge-manor__loading" />
    <iframe v-if="!loading && !failed" ref="frame" :key="nonce" :src="frameUrl" :title="t('manor.title')" referrerpolicy="same-origin" @error="failed = true" />
  </main>
</template>

<script setup lang="ts">
  import { useForegroundLoading } from '@/composables/useForegroundLoading';
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { onBeforeRouteLeave, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import type { ManorCommand, ManorSnapshot } from '@lightnote/shared/manor';
  import { createManorTestSession, readManorTestSession, saveManorTestSession } from '@/utils/manorTestSession';
  import { MANOR_COMMANDS } from '@lightnote/shared/manor';
  import { useUserStore, bookmarkStore } from '@/store';
  import { useGrowth } from '@/composables/useGrowth';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { getManor, runManorCommand } from '@/api/manorApi';
  import { resolveDailyQuestRoute } from '@/utils/growthNavigation';
  import ManorLoadingState from './ManorLoadingState.vue';
  import { isUncertainManorResult, readPendingManorCommand, savePendingManorCommand } from '@/utils/manorPending';
  import { closeCurrentMobileOverlayThen, registerMobileOverlayHistory, releaseMobileOverlayHistory, type MobileOverlayHistoryHandle } from '@/utils/mobileOverlayHistory';
  import { randomRequestId } from '@/utils/randomRequestId';
  import { manorBrowserSupported } from '@/utils/manorAccess';
  import { refreshManorAttention } from '@/composables/useManorAttention';

  const user = useUserStore(), bookmark = bookmarkStore(), router = useRouter(), growth = useGrowth();
  const { t } = useI18n();
  const emit = defineEmits<{ 'manor-immersive-change': [ready: boolean] }>();
  const frame = ref<HTMLIFrameElement | null>(null), nonce = ref(randomRequestId());
  const loading = ref(true), failed = ref(false), frameShown = ref(false), interactive = ref(false);
  type ManorFailure = 'load' | 'version' | 'unavailable' | 'account' | 'login' | 'admin' | 'unsupported';
  const failure = ref<ManorFailure>('load');
  const failureCopy: Record<ManorFailure, string> = {
    load: 'manor.loadFailed', version: 'manor.updateRequired', unavailable: 'manor.unavailable',
    account: 'manor.accountUnavailable', login: 'manor.loginRequired', admin: 'manor.adminContext',
    unsupported: 'manor.unsupported',
  };
  const failureOf = (error: unknown): ManorFailure => ({
    MANOR_VERSION_UNSUPPORTED: 'version', MANOR_UNAVAILABLE: 'unavailable', MANOR_ACCOUNT_UNAVAILABLE: 'account',
    MANOR_ADMIN_CONTEXT_FORBIDDEN: 'admin', ADMIN_PREVIEW_READONLY: 'admin',
  } as Record<string, ManorFailure>)[String((error as {code?: string})?.code)] || 'load';
  // The server owns the audience; the host only excludes accounts that can never enter.
  const accountEligible = () => Boolean(user.id) && user.role !== 'visitor' && !user.adminContext;
  const maintenanceNotice = ref('');
  const reloadPage = () => window.location.reload();
  const progress = ref(0);
  // Keep the app navigation available until the scene has its own usable back button.
  watch(() => interactive.value && !failed.value, ready => emit('manor-immersive-change', ready), { immediate: true });
  let readController = new AbortController();
  let bootTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshot: (ManorSnapshot & {notice?: string}) | null = null, pending: ManorCommand | null = null;
  let pendingRetryAt = 0;
  let settlement: { request: ManorCommand; generation: number; promise: Promise<void> } | null = null;
  let owner = '', generation = 0, disposed = false, commanding = false, initialProvided = false;
  let testSession: ReturnType<typeof createManorTestSession> | null = null;
  let overlay: MobileOverlayHistoryHandle | null = null;
  // Capture the parent route before iframe navigations add joint history entries.
  const previous = router.options.history.state.back;
  const returnTo = typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//')
    && !/^\/(?:knowledge-manor|manor)(?:[/?#]|$)/.test(previous) ? previous : '/app';
  let exiting = false, initialRead: Promise<ManorSnapshot> | null = null;
  useForegroundLoading(() => !interactive.value && !failed.value);
  const frameUrl = computed(() => `/manor/index.html?bridge=${encodeURIComponent(nonce.value)}&loader=host${bookmark.isMobile ? '&renderProfile=mobile' : ''}`);
  const questKeys: Record<string, string> = {
    checkin: 'growth.quest_checkin', create: 'growth.quest_create', exp30: 'growth.quest_exp30',
    daily_note: 'growth.quest_daily_note', daily_bookmark: 'growth.quest_daily_bookmark', daily_file: 'growth.quest_daily_file',
    daily_todo_create: 'growth.quest_daily_todo_create', daily_todo: 'growth.quest_daily_todo', daily_organize: 'growth.quest_daily_organize',
    knowledge_action_1: 'growth.quest_knowledge_action_1', knowledge_action_2: 'growth.quest_knowledge_action_2',
  };
  const current = (g: number) => !disposed && g === generation && owner === user.id && accountEligible();
  const control = (action: string, requestId?: number) => frame.value?.contentWindow?.postMessage({ type: 'lightnote-manor-control', nonce: nonce.value, action, requestId }, location.origin);
  let deliberateLeave = false, navigationSequence = 0;
  let navigationCheck: { id: number; resolve: (allow: boolean) => void } | null = null;
  function checkNavigationBack() {
    navigationCheck?.resolve(false);
    return new Promise<boolean>(resolve => {
      const id = ++navigationSequence;
      // A frozen renderer must not trap the browser in the game. Saved commands stay with the host.
      const timer = setTimeout(() => finish(true), 1500);
      const finish = (allow: boolean) => {
        clearTimeout(timer);
        if (navigationCheck?.id === id) navigationCheck = null;
        resolve(allow);
      };
      navigationCheck = { id, resolve: finish };
      control('navigation-back', id);
    });
  }
  let balanceRefresh: Promise<unknown> | null = null;
  function refreshSharedBalance(afterPending = false) {
    const account = user.id, previous = afterPending ? balanceRefresh : null;
    balanceRefresh = Promise.resolve(previous).then(() => {
      if (user.id === account && accountEligible()) return Promise.all([growth.load(true), growth.loadInventory()]);
    }).catch(() => {});
  }

  function decorated(value: ManorSnapshot & {notice?: string}): ManorSnapshot & {testing: boolean; canTest: boolean; copy: Record<string, string>; notice?: string} {
    maintenanceNotice.value = !testSession && value.runtime?.mode === 'maintenance' ? value.runtime.message || t('manor.maintenance') : '';
    // Test saves are a Root tool; other accounts never see or reach the reset entry.
    return { ...value, testing: Boolean(testSession), canTest: user.role === 'root', copy: Object.fromEntries(['actionFailed','offline','panelUpdated','castSync'].map(key => [key,t(`manor.${key}`)])), quests: value.quests.map(q => ({ ...q, label: t(questKeys[q.key] || 'growth.questUnknown') })) };
  }
  const conflict = (error: unknown) => ['MANOR_REVISION_CONFLICT','MANOR_CAST_PENDING'].includes(String((error as {code?: string})?.code));
  function settlePending(g: number): Promise<void> {
    if (!pending) return Promise.resolve();
    if (Date.now() < pendingRetryAt) return Promise.reject({status:429,code:'MANOR_RATE_LIMITED'});
    if (settlement?.request === pending && settlement.generation === g) return settlement.promise;
    const request = pending, requestOwner = owner;
    const flight = { request, generation: g, promise: Promise.resolve() };
    settlement = flight;
    flight.promise = executePending().finally(() => { if (settlement === flight) settlement = null; });
    return flight.promise;
    async function executePending() {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await runManorCommand(request);
          if (!current(g)) {
            // Leaving must not wait for a purchase. Once its receipt arrives,
            // refresh the same account's shared balance without touching a new scene.
            if (user.id === requestOwner && accountEligible()) refreshSharedBalance(true);
            throw new Error('stale');
          }
          snapshot = result;
          pendingRetryAt = 0;
          pending = null; savePendingManorCommand(owner, null);
          return;
        } catch (error) {
          if (!current(g)) throw error;
          const uncertain = isUncertainManorResult(error);
          const limited = (error as {status?:number})?.status === 429;
          if (limited) pendingRetryAt = Date.now() + Math.max(1,Math.min(300,Number((error as {retryAfter?:number})?.retryAfter)||60))*1000;
          if (!uncertain) { pending = null; savePendingManorCommand(owner, null); }
          // One bounded recovery uses the identical receipt key, never a second purchase.
          if (uncertain && !limited && attempt === 0) continue;
          throw error;
        }
      }
    }
  }
  async function refresh(g: number, background = false) {
    let notice: string | undefined = pending ? t('manor.actionRecovered') : undefined;
    try { await settlePending(g); }
    catch (error) { if (!conflict(error)) throw error; notice = t('manor.stateChanged'); }
    const result = await getManor(readController.signal, background);
    if (!current(g)) throw new Error('stale');
    if(snapshot&&result.revision<snapshot.revision)return decorated(snapshot);
    snapshot = { ...result, ...(notice ? {notice} : {}) };
    return decorated(snapshot);
  }
  function armBootTimer() {
    clearTimeout(bootTimer);
    const g = generation;
    if (snapshot && !frameShown.value && !failed.value && document.visibilityState !== 'hidden')
      bootTimer = setTimeout(() => { if (current(g)) failed.value = true; }, 30000);
  }
  async function initialise() {
    const g = ++generation;
    navigationCheck?.resolve(false);
    readController.abort(); readController = new AbortController();
    clearTimeout(bootTimer); frameShown.value = false; interactive.value = false; progress.value = 0;
    releaseMobileOverlayHistory(overlay); overlay = null;
    owner = user.id; testSession = null; snapshot = null; nonce.value = randomRequestId(); initialProvided = false;
    pendingRetryAt = 0;
    loading.value = true; failed.value = false; failure.value = 'load';
    pending = owner ? readPendingManorCommand(owner) : null;
    if (!accountEligible() || !manorBrowserSupported()) {
      failure.value = user.adminContext ? 'admin' : !accountEligible() ? 'login' : 'unsupported';
      loading.value = false; failed.value = true; return;
    }
    testSession = user.role === 'root' ? readManorTestSession(owner) : null;
    // Start static downloads while the authenticated snapshot is in flight.
    loading.value = false;
    const read = refresh(g); initialRead = read;
    try { await read; if (current(g)) armBootTimer(); }
    catch (error) { if (g === generation) { failed.value = true; failure.value = failureOf(error); } }
    finally { if (initialRead === read) initialRead = null; }
  }
  async function exit() {
    if (disposed || exiting) return;
    exiting = true; deliberateLeave = true;
    try {
      await closeCurrentMobileOverlayThen(() => { releaseMobileOverlayHistory(overlay); overlay = null; },
        () => disposed ? undefined : router.replace(returnTo));
    } finally { exiting = false; deliberateLeave = false; }
  }
  async function message(event: MessageEvent) {
    const data = event.data;
    if (event.source !== frame.value?.contentWindow || event.origin !== location.origin
      || data?.type !== 'lightnote-manor' || data?.nonce !== nonce.value || !Number.isSafeInteger(data.id)) return;
    const g = generation;
    if (!current(g)) return;
    const target = event.source as Window, token = nonce.value;
    try {
      let value: unknown = null;
      if (data.action === 'progress') {
        const percent = data.payload?.percent;
        if (Number.isInteger(percent) && percent >= 0 && percent <= 100) progress.value = Math.max(progress.value, percent);
        return;
      }
      else if (data.action === 'loading') { clearTimeout(bootTimer); frameShown.value = true; interactive.value = false; return; }
      // Hand keyboard focus to the scene so manor shortcuts work without a first click.
      else if (data.action === 'ready') { clearTimeout(bootTimer); frameShown.value = true; interactive.value = true; frame.value?.focus({ preventScroll: true }); return; }
      else if (data.action === 'get') {
        if (initialRead) await initialRead;
        if (!current(g)) return;
        value = testSession ? decorated(testSession.snapshot()) : !initialProvided && snapshot && !pending ? decorated(snapshot) : await refresh(g, data.payload?.background === true);
        initialProvided = true;
      }
      else if (data.action === 'reset-test' || data.action === 'restore-formal') {
        if (commanding || pending || !snapshot || (data.action === 'reset-test' && user.role !== 'root')) throw new Error('command');
        testSession = data.action === 'reset-test' ? createManorTestSession(snapshot) : null;
        saveManorTestSession(owner, testSession);
        releaseMobileOverlayHistory(overlay); overlay = null;
        interactive.value = false; frameShown.value = false; progress.value = 0; initialProvided = true;
        nonce.value = randomRequestId();
        return;
      }
      else if (data.action === 'command') {
        if (commanding || !snapshot || !MANOR_COMMANDS.includes(data.payload?.action) || !Array.isArray(data.payload?.args)) throw new Error('command');
        if (data.payload.revision !== undefined && data.payload.revision !== (testSession ? testSession.snapshot().revision : snapshot.revision)) throw { code: 'MANOR_REVISION_CONFLICT' };
        commanding = true;
        try {
          if (testSession) {
            value = decorated(testSession.execute(data.payload.action, data.payload.args));
            saveManorTestSession(owner, testSession);
          }
          else {
          if (pending) {
            const prior = pending;
            await settlePending(g);
            if (prior.action !== data.payload.action || JSON.stringify(prior.args) !== JSON.stringify(data.payload.args)) throw { code: 'MANOR_ACTION_RECOVERED' };
          } else {
            pending = { requestId: randomRequestId(), revision: snapshot.revision, version: snapshot.version, action: data.payload.action, args: data.payload.args };
            savePendingManorCommand(owner, pending);
            await settlePending(g);
          }
          value = decorated(snapshot);
          }
        } finally { commanding = false; }
      } else if (data.action === 'exit') { await exit(); return; }
      else if (data.action === 'tasks') {
        const index = data.payload?.index;
        if (index !== undefined && (!Number.isInteger(index) || index < 0 || !snapshot?.quests[index])) throw new Error('quest');
        const key = snapshot?.quests[index]?.key;
        deliberateLeave = true;
        try { await router.push(key ? resolveDailyQuestRoute(key, bookmark.isMobile) || { path: '/growth', query: { section: key === 'checkin' ? 'overview' : 'tasks' } } : '/growth#growth-daily'); }
        finally { deliberateLeave = false; }
        return;
      }
      // Older cached renderers may still ask the host. Keep them inside the
      // manor too; the current renderer opens its existing local ledger.
      else if (data.action === 'ledger') { control('open-ledger'); }
      else if (data.action === 'navigation') {
        if (navigationCheck?.id === data.payload?.requestId) navigationCheck.resolve(data.payload.allow === true);
      }
      else if (data.action === 'dialog') {
        if (bookmark.isMobile && data.payload?.open && !overlay) overlay = registerMobileOverlayHistory(() => { overlay = null; control('close-dialog'); });
        else if (!data.payload?.open && overlay) { releaseMobileOverlayHistory(overlay); overlay = null; }
      } else if (data.action === 'load-error') failed.value = true;
      else throw new Error('unknown');
      if (current(g)) target.postMessage({ type: 'lightnote-manor-reply', nonce: token, id: data.id, value }, location.origin);
    } catch (error) {
      // The scene shows one error, with no API internals or duplicated global toast.
      let code = 'MANOR_ACTION_FAILED', text = t('manor.actionFailed');
      let value: ReturnType<typeof decorated> | undefined;
      if ((error as {code?: string})?.code === 'MANOR_MAINTENANCE') {
        code='MANOR_MAINTENANCE';text=t('manor.maintenance');
        try {value=await refresh(g);} catch {maintenanceNotice.value=text;}
      } else if ((error as {status?:number})?.status === 429 || (error as {code?:string})?.code==='MANOR_RATE_LIMITED') {
        code='MANOR_RATE_LIMITED';text=t('manor.rateLimited');
      } else if (conflict(error)) {
        code = 'MANOR_REVISION_CONFLICT'; text = t('manor.stateChangedRetry');
        try { value = testSession ? decorated(testSession.snapshot()) : await refresh(g); text = t('manor.stateChanged'); }
        catch { /* Keep the original conflict when the follow-up read is unavailable. */ }
      } else if ((error as {code?: string})?.code === 'MANOR_ACTION_RECOVERED') {
        code = 'MANOR_ACTION_RECOVERED'; text = t('manor.actionRecovered');
        if (snapshot) value = decorated(snapshot);
      } else if ((error as {code?: string})?.code === 'MANOR_VERSION_UNSUPPORTED') {
        code = 'MANOR_VERSION_UNSUPPORTED'; text = t('manor.updateRequired');
      } else if (isUncertainManorResult(error)) {
        code = 'MANOR_RESULT_UNCERTAIN'; text = t('manor.actionUncertain');
      }
      if (current(g)) target.postMessage({ type: 'lightnote-manor-reply', nonce: token, id: data.id, error: text, errorCode: code, ...(value ? {value} : {}) }, location.origin);
    }
  }
  useMobileTopBar(['knowledgeManor'], { title: () => t('manor.title'), ownTopBar: true, onBack: () => interactive.value ? control('back') : exit() });
  onBeforeRouteLeave(async () => {
    if (interactive.value && !failed.value && current(generation) && !deliberateLeave && !await checkNavigationBack()) return false;
    // All exits, including browser back and links to tasks/ledger, refresh the shared balance.
    // These reads must never hold navigation behind a slow or disconnected API.
    if (current(generation)) refreshSharedBalance();
  });
  watch(() => [user.id, user.role, Boolean(user.adminContext)], () => { void initialise(); });
  onMounted(() => { window.addEventListener('message', message); document.addEventListener('visibilitychange', armBootTimer); void initialise(); });
  onBeforeUnmount(() => { navigationCheck?.resolve(false); disposed = true; ++generation; readController.abort(); clearTimeout(bootTimer); window.removeEventListener('message', message); document.removeEventListener('visibilitychange', armBootTimer); releaseMobileOverlayHistory(overlay); });
  // Water, harvests and gifts collected inside change the entry badge; re-read it on the way out.
  onBeforeUnmount(() => void refreshManorAttention(true));
</script>

<style scoped>
  .knowledge-manor { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; }
  .knowledge-manor__maintenance {position:absolute;left:5%;right:5%;bottom:var(--ui-layout-90,90px);z-index:1;padding:var(--ui-space-12,12px);border:1px solid var(--warning-color);border-radius:8px;background:var(--background-color);color:var(--text-color);font-size:var(--ui-font-14,14px);pointer-events:none;text-align:center;}
  .knowledge-manor iframe { display: block; width: 100%; height: 100%; border: 0; }
  .knowledge-manor__state { position: absolute; inset: 0; z-index: 1; display: grid; place-content: center; justify-items: center; gap: var(--ui-space-12, 12px); color: var(--text-color); background: var(--background-color); }
  .knowledge-manor__loading { position: absolute; inset: 0; z-index: 1; }
</style>
