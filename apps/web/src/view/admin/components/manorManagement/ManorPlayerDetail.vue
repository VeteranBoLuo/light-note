<template>
  <div class="manor-player-detail">
    <p class="manor-muted"
      >{{ player.userId }} <BChip tone="neutral">{{ a('readonly') }}</BChip></p
    >
    <p class="manor-muted"
      >{{ player.version || '—' }} · {{ a('revision') }} {{ player.revision }} ·
      {{ a('snapshot', { time: time(player.snapshotAt) }) }}</p
    >
    <template v-if="s">
      <p v-if="s.casting" class="manor-admin-notice">{{ a('castPending') }}</p>
      <div class="manor-metrics is-detail">
        <article v-for="item in metrics" :key="item.label" class="manor-panel"
          ><span>{{ item.label }}</span
          ><strong>{{ item.value }}</strong></article
        >
      </div>
      <section class="manor-detail-section"
        ><h3>{{ a('garden') }} · Lv.{{ player.level }}</h3>
        <p class="manor-muted">{{
          a('plotsOpened', {
            count: player.plots?.filter((p) => p.status !== 'locked').length || 0,
            total: player.plots?.length || 0,
          })
        }}</p>
        <div class="manor-plot-grid"
          ><article v-for="(plot, index) in player.plots" :key="index" class="manor-panel">
            <span>{{
              plot.crop ? resource(`crops:${plot.crop}`).split(' · ')[0] : a('plotIndex', { index: index + 1 })
            }}</span>
            <BChip :tone="plot.status === 'ripe' ? 'success' : plot.status === 'dry' ? 'pending' : 'neutral'">{{
              a(`states.${plot.status}`)
            }}</BChip>
            <small v-if="plot.status === 'growing' && plot.remaining != null">{{
              a('remainingHours', { hours: Math.ceil(plot.remaining) })
            }}</small>
          </article></div
        >
      </section>
      <section
        v-for="field in ['seeds', 'crops', 'fertilizers', 'craftedBait']"
        :key="field"
        class="manor-detail-section"
      >
        <h3>{{ a(field) }}</h3
        ><div class="manor-inventory"
          ><span v-for="[key, value] in Object.entries(s[field] || {}).filter(([, n]) => Number(n) > 0)" :key="key"
            >{{ resource(`${field}:${key}`) }} <b>×{{ value }}</b></span
          ><small v-if="!Object.values(s[field] || {}).some((n) => Number(n) > 0)">{{ a('empty') }}</small></div
        >
      </section>
      <section class="manor-detail-section"
        ><h3>{{ a('tanks') }}</h3
        ><dl class="manor-info-list">
          <div
            ><dt>{{ a('farmSlots') }}</dt
            ><dd>{{ (s.fishSlots || []).filter(Boolean).length }} / 6</dd></div
          >
          <div
            ><dt>{{ a('showSlots') }}</dt
            ><dd>{{ (s.showSlots || []).filter(Boolean).length }} / 3</dd></div
          >
          <div v-for="key in ['workshop', 'beehive', 'purifier', 'composter']" :key="key"
            ><dt>{{ a(key) }}</dt
            ><dd
              >{{ s[key] ? `Lv.${s[key].level || 1}` : a('notBuilt')
              }}<small v-if="s[key]" class="manor-machine-summary">{{ machineSummary(key) }}</small></dd
            ></div
          >
        </dl></section
      >
      <section class="manor-detail-section"
        ><h3>{{ a('fish') }}</h3
        ><div class="manor-inventory"
          ><span v-for="[key, value] in fishCounts" :key="key"
            >{{ resource(`fish:${key}`) }} <b>×{{ value }}</b></span
          ><small v-if="!fishCounts.length">{{ a('empty') }}</small></div
        ></section
      > </template
    ><p v-else role="status">{{ player.unavailable ? a('unavailable') : a('notAdopted') }}</p>
    <p class="manor-muted">{{ a('readHint') }}</p>
    <div class="manor-actions"
      ><BButton @click="$emit('records', player.userId)">{{ a('recentRecords') }}</BButton
      ><BButton v-if="!mobile" @click="$emit('points', player.userId)">{{ a('pointsAdmin') }}</BButton
      ><small v-else>{{ a('desktopPoints') }}</small></div
    >
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import type { ManorPlayer } from '@/api/manorAdminApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import { useManorAdminFormat } from './manorAdminFormat';
  const props = defineProps<{ player: ManorPlayer; mobile: boolean }>();
  defineEmits<{ records: [id: string]; points: [id: string] }>();
  const { a, number, time, resource } = useManorAdminFormat();
  const s = computed(() => props.player.state);
  const sum = (field: string) => Object.values(s.value?.[field] || {}).reduce<number>((n, v) => n + Number(v), 0);
  const metrics = computed(() => [
    { label: a('water'), value: `${number(s.value?.water)} / 60` },
    { label: a('mainPoints'), value: number(props.player.points) },
    { label: a('seeds'), value: number(sum('seeds')) },
    { label: a('fertilizers'), value: number(sum('fertilizers')) },
    { label: a('bait'), value: number(s.value?.bait) },
    { label: a('rainbowBait'), value: number(s.value?.rainbowBait) },
  ]);
  const fishCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const fish of s.value?.fish || []) counts[fish.kind] = (counts[fish.kind] || 0) + 1;
    return Object.entries(counts);
  });
  function machineSummary(key: string) {
    const status = props.player.facilities?.[key];
    if (!status) return '';
    if (key === 'beehive') return `${a('pollen')} ${status.pollen} / ${status.capacity}`;
    if (key === 'composter')
      return `${a('stock')} ${status.stock} / ${status.storage} · ${a('residue')} ${status.residue}`;
    if (key === 'purifier') return `${a('readyWater')} ${status.ready} / ${status.daily}`;
    return status.job
      ? `${resource(`craftedBait:${status.job.recipe}`)} ×${status.job.count} · ${a('remainingHours', { hours: Math.ceil(status.remaining) })}`
      : a('empty');
  }
</script>
