<template>
  <ResourceBatchTagsDrawer
    v-if="snapshot"
    :selection="snapshot.selection"
    :initial-items="snapshot.items"
    :count="snapshot.count"
    :initial-mode="mode"
    :is-current="isCurrent"
    @updated="updated = true"
    @close="goBack"
  />
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { computed, ref } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { useUserStore, cloudSpaceStore } from '@/store';
  import { useResourceSelectionStore } from '@/store/resourceSelection';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import ResourceBatchTagsDrawer from '@/components/resourceActions/ResourceBatchTagsDrawer.vue';
  import type { BatchSelection } from '@/api/search';
  const store = useResourceSelectionStore();
  const user = useUserStore();
  const route = useRoute();
  const router = useRouter();
  const identity = buildNoteDetailRequestScope(user);
  const token = String(route.query.selectionSession || '');
  const handoff = token && store.handoff?.token === token ? store.handoff : null;
  const rawFrom = String(handoff?.from || route.query.from || '/search');
  const from = ['/search', '/cloudSpace', '/noteLibrary', '/organize', '/home', '/manage/bookmarkMg'].includes(
    rawFrom.split('?')[0],
  )
    ? rawFrom
    : '/search';
  const mode = computed(() => (route.query.mode === 'remove' ? ('remove' as const) : ('add' as const)));
  const updated = ref(false);
  const isCurrent = () =>
    identity === buildNoteDetailRequestScope(user) &&
    (!token || (!!handoff && store.handoff?.token === token && store.busy && store.isCurrent(handoff.operation)));
  function readSnapshot(): { selection: BatchSelection; items: any[]; count: number } | null {
    if (token)
      return isCurrent() && handoff
        ? {
            selection: handoff.operation.selection,
            items: handoff.operation.items,
            count: handoff.operation.selection.mode === 'allMatching' ? store.count : handoff.operation.items.length,
          }
        : null;
    if (from.split('?')[0] !== '/organize') return null;
    try {
      const stored = JSON.parse(sessionStorage.getItem('resource-center-batch-items') || 'null');
      const rawItems = Array.isArray(stored) ? stored : stored?.items;
      if (!Array.isArray(rawItems)) return null;
      const items = [
        ...new Map(
          rawItems
            .filter((item) => ['bookmark', 'note', 'file'].includes(item?.type) && item.id)
            .map((item) => [`${item.type}:${item.id}`, { ...item, id: String(item.id) }]),
        ).values(),
      ];
      return {
        items,
        selection: { mode: 'explicit', items: items.map(({ type, id }) => ({ type, id })) },
        count: items.length,
      };
    } catch {
      return null;
    }
  }
  const snapshot = readSnapshot();
  async function goBack() {
    if (updated.value && isCurrent()) {
      if (handoff) store.completeTags(token);
      else sessionStorage.removeItem('resource-center-batch-items');
      if (from.split('?')[0] === '/cloudSpace') void cloudSpaceStore().queryFieldList({ silent: true });
    }
    const target = router.resolve(from);
    await router.replace({
      path: target.path,
      query: { ...target.query, ...(updated.value ? { _rt: String(Date.now()) } : {}) },
      hash: target.hash,
    });
  }
  if (!snapshot?.count) {
    message.warning(useI18n().t(token ? 'resourceSelection.expired' : 'resourceCenter.batch.noSelection'));
    void goBack();
  }
</script>
