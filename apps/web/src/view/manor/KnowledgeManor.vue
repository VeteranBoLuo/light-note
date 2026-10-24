<template>
  <main class="knowledge-manor">
    <div v-if="loading" class="knowledge-manor__state"><BLoading inline loading :title="t('manor.loading')" /></div>
    <div v-else-if="failed" class="knowledge-manor__state" role="alert">
      <p>{{ t('manor.loadFailed') }}</p>
      <BButton @click="initialise">{{ t('common.retry') }}</BButton>
      <BButton @click="exit">{{ t('manor.returnToApp') }}</BButton>
    </div>
    <iframe v-else ref="frame" :key="nonce" :src="frameUrl" :title="t('manor.title')" referrerpolicy="same-origin" />
  </main>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { onBeforeRouteLeave, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import type { ManorCommand, ManorSnapshot } from '@lightnote/shared/manor';
  import { MANOR_COMMANDS } from '@lightnote/shared/manor';
  import { useUserStore, bookmarkStore } from '@/store';
  import { useGrowth } from '@/composables/useGrowth';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { getManor, runManorCommand } from '@/api/manorApi';
  import { isUncertainManorResult, readPendingManorCommand, savePendingManorCommand } from '@/utils/manorPending';
  import { registerMobileOverlayHistory, releaseMobileOverlayHistory, type MobileOverlayHistoryHandle } from '@/utils/mobileOverlayHistory';
  import { inventoryPointsRoute } from '@/utils/inventoryNavigation';

  const user = useUserStore(), bookmark = bookmarkStore(), router = useRouter(), growth = useGrowth();
  const { t } = useI18n();
  const frame = ref<HTMLIFrameElement | null>(null), nonce = ref(crypto.randomUUID());
  const loading = ref(true), failed = ref(false);
  let snapshot: ManorSnapshot | null = null, pending: ManorCommand | null = null;
  let owner = '', generation = 0, disposed = false, commanding = false, initialProvided = false;
  let overlay: MobileOverlayHistoryHandle | null = null;
  const frameUrl = computed(() => `/manor/index.html?bridge=${encodeURIComponent(nonce.value)}${bookmark.isMobile ? '&renderProfile=mobile' : ''}`);
  const questKeys: Record<string, string> = {
    checkin: 'growth.quest_checkin', create: 'growth.quest_create', exp30: 'growth.quest_exp30',
    daily_note: 'growth.quest_daily_note', daily_bookmark: 'growth.quest_daily_bookmark', daily_file: 'growth.quest_daily_file',
    daily_todo_create: 'growth.quest_daily_todo_create', daily_todo: 'growth.quest_daily_todo', daily_organize: 'growth.quest_daily_organize',
    knowledge_action_1: 'growth.quest_knowledge_action_1', knowledge_action_2: 'growth.quest_knowledge_action_2',
  };
  const current = (g: number) => !disposed && g === generation && owner === user.id && user.role === 'root' && !user.adminContext;
  const control = (action: string) => frame.value?.contentWindow?.postMessage({ type: 'lightnote-manor-control', nonce: nonce.value, action }, location.origin);

  function decorated(value: ManorSnapshot): ManorSnapshot {
    return { ...value, quests: value.quests.map(q => ({ ...q, label: t(questKeys[q.key] || 'growth.questUnknown') })) };
  }
  async function settlePending(g: number) {
    if (!pending) return;
    const request = pending;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await runManorCommand(request);
        if (!current(g)) throw new Error('stale');
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
    const result = await getManor();
    if (!current(g)) throw new Error('stale');
    snapshot = result;
    return decorated(result);
  }
  async function initialise() {
    const g = ++generation;
    releaseMobileOverlayHistory(overlay); overlay = null;
    owner = user.id; snapshot = null; nonce.value = crypto.randomUUID(); initialProvided = false;
    loading.value = true; failed.value = false;
    pending = owner ? readPendingManorCommand(owner) : null;
    if (!owner || user.role !== 'root' || user.adminContext) { loading.value = false; failed.value = true; return; }
    try { await refresh(g); }
    catch { if (g === generation) failed.value = true; }
    finally { if (g === generation) loading.value = false; }
  }
  async function exit() {
    releaseMobileOverlayHistory(overlay); overlay = null;
    const g = generation;
    if (disposed || g !== generation) return;
    if (window.history.state?.back) router.back(); else await router.replace('/app');
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
      if (data.action === 'get') {
        value = !initialProvided && snapshot && !pending ? decorated(snapshot) : await refresh(g);
        initialProvided = true;
      }
      else if (data.action === 'command') {
        if (commanding || !snapshot || !MANOR_COMMANDS.includes(data.payload?.action) || !Array.isArray(data.payload?.args)) throw new Error('command');
        commanding = true;
        try {
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
        } finally { commanding = false; }
      } else if (data.action === 'exit') { await exit(); return; }
      else if (data.action === 'tasks') { await router.push('/growth#growth-daily'); return; }
      else if (data.action === 'ledger') { await router.push(inventoryPointsRoute()); return; }
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
  useMobileTopBar(['knowledgeManor'], { title: () => t('manor.title'), ownTopBar: true, onBack: () => control('back') });
  onBeforeRouteLeave(async () => {
    // All exits, including browser back and links to tasks/ledger, refresh the shared balance.
    if (current(generation)) await Promise.all([growth.load(true), growth.loadInventory()]);
  });
  watch(() => [user.id, user.role, Boolean(user.adminContext)], () => { void initialise(); });
  onMounted(() => { window.addEventListener('message', message); void initialise(); });
  onBeforeUnmount(() => { disposed = true; ++generation; window.removeEventListener('message', message); releaseMobileOverlayHistory(overlay); });
</script>

<style scoped>
  .knowledge-manor { width: 100%; height: 100%; min-height: 0; overflow: hidden; }
  .knowledge-manor iframe { display: block; width: 100%; height: 100%; border: 0; }
  .knowledge-manor__state { display: grid; height: 100%; place-content: center; justify-items: center; gap: var(--ui-space-12, 12px); color: var(--text-color); background: var(--background-color); }
</style>
