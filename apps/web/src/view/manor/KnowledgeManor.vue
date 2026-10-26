<template>
  <main class="knowledge-manor">
    <div v-if="failed" class="knowledge-manor__state" role="alert">
      <p>{{ t('manor.loadFailed') }}</p>
      <BButton @click="initialise">{{ t('common.retry') }}</BButton>
      <BButton v-if="bookmark.isMobile" @click="exit">{{ t('manor.returnToApp') }}</BButton>
    </div>
    <ManorLoadingState v-else-if="loading || !frameShown" class="knowledge-manor__loading" />
    <iframe v-if="!loading && !failed" ref="frame" :key="nonce" :src="frameUrl" :title="t('manor.title')" referrerpolicy="same-origin" @error="failed = true" />
    <BButton v-if="bookmark.isMobile && !interactive && !failed" class="knowledge-manor__cancel" @click="exit">{{ t('manor.returnToApp') }}</BButton>
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

  const user = useUserStore(), bookmark = bookmarkStore(), router = useRouter(), growth = useGrowth();
  const { t } = useI18n();
  const emit = defineEmits<{ 'manor-immersive-change': [ready: boolean] }>();
  const frame = ref<HTMLIFrameElement | null>(null), nonce = ref(crypto.randomUUID());
  const loading = ref(true), failed = ref(false), frameShown = ref(false), interactive = ref(false);
  // Keep the app navigation available until the scene has its own usable back button.
  watch(() => interactive.value && !failed.value, ready => emit('manor-immersive-change', ready), { immediate: true });
  let readController = new AbortController();
  let bootTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshot: ManorSnapshot | null = null, pending: ManorCommand | null = null;
  let owner = '', generation = 0, disposed = false, commanding = false, initialProvided = false;
  let testSession: ReturnType<typeof createManorTestSession> | null = null;
  let overlay: MobileOverlayHistoryHandle | null = null;
  // Capture the parent route before iframe navigations add joint history entries.
  const previous = router.options.history.state.back;
  const returnTo = typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//')
    && !/^\/(?:knowledge-manor|manor)(?:[/?#]|$)/.test(previous) ? previous : '/app';
  let exiting = false, initialRead: Promise<ManorSnapshot> | null = null;
  useForegroundLoading(() => !interactive.value && !failed.value);
  const frameUrl = computed(() => `/manor/index.html?bridge=${encodeURIComponent(nonce.value)}${bookmark.isMobile ? '&renderProfile=mobile' : ''}`);
  const questKeys: Record<string, string> = {
    checkin: 'growth.quest_checkin', create: 'growth.quest_create', exp30: 'growth.quest_exp30',
    daily_note: 'growth.quest_daily_note', daily_bookmark: 'growth.quest_daily_bookmark', daily_file: 'growth.quest_daily_file',
    daily_todo_create: 'growth.quest_daily_todo_create', daily_todo: 'growth.quest_daily_todo', daily_organize: 'growth.quest_daily_organize',
    knowledge_action_1: 'growth.quest_knowledge_action_1', knowledge_action_2: 'growth.quest_knowledge_action_2',
  };
  const current = (g: number) => !disposed && g === generation && owner === user.id && user.role === 'root' && !user.adminContext;
  const control = (action: string) => frame.value?.contentWindow?.postMessage({ type: 'lightnote-manor-control', nonce: nonce.value, action }, location.origin);
  let balanceRefresh: Promise<unknown> | null = null;
  function refreshSharedBalance(afterPending = false) {
    const account = user.id, previous = afterPending ? balanceRefresh : null;
    balanceRefresh = Promise.resolve(previous).then(() => {
      if (user.id === account && user.role === 'root' && !user.adminContext) return Promise.all([growth.load(true), growth.loadInventory()]);
    }).catch(() => {});
  }

  function decorated(value: ManorSnapshot): ManorSnapshot & {testing: boolean} {
    return { ...value, testing: Boolean(testSession), quests: value.quests.map(q => ({ ...q, label: t(questKeys[q.key] || 'growth.questUnknown') })) };
  }
  async function settlePending(g: number) {
    if (!pending) return;
    const request = pending, requestOwner = owner;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await runManorCommand(request);
        if (!current(g)) {
          // Leaving must not wait for a purchase. Once its receipt arrives,
          // refresh the same account's shared balance without touching a new scene.
          if (user.id === requestOwner && user.role === 'root' && !user.adminContext) refreshSharedBalance(true);
          throw new Error('stale');
        }
        snapshot = result;
        pending = null; savePendingManorCommand(owner, null);
        return;
      } catch (error) {
        if (!current(g)) throw error;
        const uncertain = isUncertainManorResult(error);
        if (!uncertain) { pending = null; savePendingManorCommand(owner, null); }
        // One bounded recovery uses the identical receipt key, never a second purchase.
        if (uncertain && attempt === 0) continue;
        throw error;
      }
    }
  }
  async function refresh(g: number) {
    await settlePending(g);
    const result = await getManor(readController.signal);
    if (!current(g)) throw new Error('stale');
    snapshot = result;
    return decorated(result);
  }
  function armBootTimer() {
    clearTimeout(bootTimer);
    const g = generation;
    if (snapshot && !frameShown.value && !failed.value && document.visibilityState !== 'hidden')
      bootTimer = setTimeout(() => { if (current(g)) failed.value = true; }, 30000);
  }
  async function initialise() {
    const g = ++generation;
    readController.abort(); readController = new AbortController();
    clearTimeout(bootTimer); frameShown.value = false; interactive.value = false;
    releaseMobileOverlayHistory(overlay); overlay = null;
    owner = user.id; testSession = null; snapshot = null; nonce.value = crypto.randomUUID(); initialProvided = false;
    loading.value = true; failed.value = false;
    pending = owner ? readPendingManorCommand(owner) : null;
    if (!owner || user.role !== 'root' || user.adminContext) { loading.value = false; failed.value = true; return; }
    testSession = readManorTestSession(owner);
    // Start static downloads while the authenticated snapshot is in flight.
    loading.value = false;
    const read = refresh(g); initialRead = read;
    try { await read; if (current(g)) armBootTimer(); }
    catch { if (g === generation) failed.value = true; }
    finally { if (initialRead === read) initialRead = null; }
  }
  async function exit() {
    if (disposed || exiting) return;
    exiting = true;
    try {
      await closeCurrentMobileOverlayThen(() => { releaseMobileOverlayHistory(overlay); overlay = null; },
        () => disposed ? undefined : router.replace(returnTo));
    } finally { exiting = false; }
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
      if (data.action === 'loading') { clearTimeout(bootTimer); frameShown.value = true; interactive.value = false; return; }
      else if (data.action === 'ready') { clearTimeout(bootTimer); frameShown.value = true; interactive.value = true; return; }
      else if (data.action === 'get') {
        if (initialRead) await initialRead;
        if (!current(g)) return;
        value = testSession ? decorated(testSession.snapshot()) : !initialProvided && snapshot && !pending ? decorated(snapshot) : await refresh(g);
        initialProvided = true;
      }
      else if (data.action === 'reset-test' || data.action === 'restore-formal') {
        if (commanding || pending || !snapshot) throw new Error('command');
        testSession = data.action === 'reset-test' ? createManorTestSession(snapshot) : null;
        saveManorTestSession(owner, testSession);
        releaseMobileOverlayHistory(overlay); overlay = null;
        interactive.value = false; frameShown.value = false; initialProvided = true;
        nonce.value = crypto.randomUUID();
        return;
      }
      else if (data.action === 'command') {
        if (commanding || !snapshot || !MANOR_COMMANDS.includes(data.payload?.action) || !Array.isArray(data.payload?.args)) throw new Error('command');
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
            if (prior.action !== data.payload.action || JSON.stringify(prior.args) !== JSON.stringify(data.payload.args)) throw new Error('Previous action recovered');
          } else {
            pending = { requestId: crypto.randomUUID(), revision: snapshot.revision, version: snapshot.version, action: data.payload.action, args: data.payload.args };
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
        await router.push(key ? resolveDailyQuestRoute(key, bookmark.isMobile) || { path: '/growth', query: { section: key === 'checkin' ? 'overview' : 'tasks' } } : '/growth#growth-daily');
        return;
      }
      // Older cached renderers may still ask the host. Keep them inside the
      // manor too; the current renderer opens its existing local ledger.
      else if (data.action === 'ledger') { control('open-ledger'); }
      else if (data.action === 'dialog') {
        if (bookmark.isMobile && data.payload?.open && !overlay) overlay = registerMobileOverlayHistory(() => { overlay = null; control('close-dialog'); });
        else if (!data.payload?.open && overlay) { releaseMobileOverlayHistory(overlay); overlay = null; }
      } else if (data.action === 'load-error') failed.value = true;
      else throw new Error('unknown');
      if (current(g)) target.postMessage({ type: 'lightnote-manor-reply', nonce: token, id: data.id, value }, location.origin);
    } catch {
      // The scene shows one error, with no API internals or duplicated global toast.
      if (current(g)) target.postMessage({ type: 'lightnote-manor-reply', nonce: token, id: data.id, error: t('manor.actionFailed') }, location.origin);
    }
  }
  useMobileTopBar(['knowledgeManor'], { title: () => t('manor.title'), ownTopBar: true, onBack: () => interactive.value ? control('back') : exit() });
  onBeforeRouteLeave(() => {
    // All exits, including browser back and links to tasks/ledger, refresh the shared balance.
    // These reads must never hold navigation behind a slow or disconnected API.
    if (current(generation)) refreshSharedBalance();
  });
  watch(() => [user.id, user.role, Boolean(user.adminContext)], () => { void initialise(); });
  onMounted(() => { window.addEventListener('message', message); document.addEventListener('visibilitychange', armBootTimer); void initialise(); });
  onBeforeUnmount(() => { disposed = true; ++generation; readController.abort(); clearTimeout(bootTimer); window.removeEventListener('message', message); document.removeEventListener('visibilitychange', armBootTimer); releaseMobileOverlayHistory(overlay); });
</script>

<style scoped>
  .knowledge-manor { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; }
  .knowledge-manor iframe { display: block; width: 100%; height: 100%; border: 0; }
  .knowledge-manor__state { position: absolute; inset: 0; z-index: 1; display: grid; place-content: center; justify-items: center; gap: var(--ui-space-12, 12px); color: var(--text-color); background: var(--background-color); }
  .knowledge-manor__loading { position: absolute; inset: 0; z-index: 1; }
  .knowledge-manor__cancel { position: absolute; z-index: 2; bottom: var(--ui-space-24, 24px); left: 50%; transform: translateX(-50%); }
</style>
