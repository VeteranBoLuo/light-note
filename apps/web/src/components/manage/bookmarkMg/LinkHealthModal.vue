<template>
  <BModal v-model:visible="visible" :title="$t('bookmarkMg.healthCheck')" :show-footer="false" width="480px">
    <div class="lh">
      <p class="lh-desc">{{ $t('bookmarkMg.healthDesc') }}</p>

      <div class="lh-bar">
        <div class="lh-stats">
          <span>{{ $t('bookmarkMg.healthProgress', { checked: summary.checked, total: summary.total }) }}</span>
          <span v-if="summary.dead.length" class="lh-dead-n">· {{ $t('bookmarkMg.healthDeadCount', { n: summary.dead.length }) }}</span>
        </div>
        <b-button size="small" type="primary" :loading="checking" :disabled="checking || allChecked" @click="checkBatch">
          {{ checking ? $t('bookmarkMg.healthChecking') : allChecked ? $t('bookmarkMg.healthAllChecked') : $t('bookmarkMg.healthCheckBatch') }}
        </b-button>
      </div>

      <div v-if="!summary.dead.length && summary.checked > 0" class="lh-empty">✅ {{ $t('bookmarkMg.healthNoDead') }}</div>

      <div v-if="summary.dead.length" class="lh-list">
        <div v-for="d in summary.dead" :key="d.id" class="lh-item">
          <div class="lh-item-main">
            <div class="lh-item-name">🔗 {{ d.name }}</div>
            <div class="lh-item-url">{{ d.url }}</div>
          </div>
          <div class="lh-item-actions">
            <button v-if="d.hasSnapshot" class="lh-act snap" @click="viewSnapshot(d.id)">{{ $t('bookmarkMg.healthViewSnapshot') }}</button>
            <button v-else class="lh-act" @click="viewSnapshot(d.id)">{{ $t('bookmarkMg.snapshot') }}</button>
          </div>
        </div>
      </div>
    </div>
  </BModal>

  <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="snapId" />
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { apiBaseGet, apiBasePost } from '@/http/request.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';

  const visible = defineModel<boolean>('visible');

  interface DeadItem { id: string; name: string; url: string; note: string; hasSnapshot: boolean }
  const summary = ref<{ total: number; checked: number; dead: DeadItem[] }>({ total: 0, checked: 0, dead: [] });
  const checking = ref(false);
  const snapVisible = ref(false);
  const snapId = ref('');

  const allChecked = computed(() => summary.value.total > 0 && summary.value.checked >= summary.value.total);

  async function loadSummary() {
    const res = await apiBaseGet('/api/bookmark/health');
    if (res?.status === 200 && res.data) summary.value = res.data;
  }
  async function checkBatch() {
    if (checking.value) return;
    checking.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/health/check');
      if (res?.status === 200 && res.data) {
        // 返回体含最新概览(checkedThisRun + total/checked/dead)
        summary.value = { total: res.data.total, checked: res.data.checked, dead: res.data.dead || [] };
      }
    } finally {
      checking.value = false;
    }
  }
  function viewSnapshot(id: string) {
    snapId.value = id;
    snapVisible.value = true;
  }

  watch(visible, (v) => {
    if (v) loadSummary();
  });
</script>

<style scoped lang="less">
  .lh {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .lh-desc {
    margin: 0;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .lh-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--card-border-color) 14%, transparent);
  }
  .lh-stats {
    font-size: 13px;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .lh-dead-n {
    color: #dc2626;
    font-weight: 700;
  }
  .lh-empty {
    text-align: center;
    padding: 20px 0;
    font-size: 14px;
    color: #16a34a;
    font-weight: 600;
  }
  .lh-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 50vh;
    overflow-y: auto;
  }
  .lh-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, #dc2626 22%, transparent);
    background: color-mix(in srgb, #dc2626 5%, transparent);
  }
  .lh-item-main {
    flex: 1 1 auto;
    min-width: 0;
  }
  .lh-item-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lh-item-url {
    font-size: 11px;
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lh-item-actions {
    flex: 0 0 auto;
  }
  .lh-act {
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
    background: transparent;
    color: var(--text-color);
    font-size: 12px;
    cursor: pointer;
  }
  .lh-act.snap {
    border-color: transparent;
    background: linear-gradient(135deg, var(--primary-color), #22d3ee);
    color: #fff;
    font-weight: 600;
  }
</style>
