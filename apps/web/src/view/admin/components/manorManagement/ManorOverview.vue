<template>
  <section class="manor-overview">
    <p v-if="data.failures.length" class="manor-admin-notice" role="status">{{ a('partialFailed') }}</p>
    <div class="manor-metrics">
      <article v-for="item in metrics" :key="item.label" class="manor-panel">
        <span>{{ item.label }}</span
        ><strong :class="item.tone">{{ item.value }}</strong
        ><small>{{ item.hint }}</small>
      </article>
    </div>
    <div class="manor-overview-grid">
      <section class="manor-panel"
        ><h3>{{ a('trend') }}</h3>
        <template v-if="data.finances">
          <div class="manor-chart-legend"
            ><span class="manor-issued">{{ a('issued') }}</span
            ><span>{{ a('spent') }}</span></div
          >
          <div class="manor-chart" role="img" :aria-label="a('trend')">
            <div
              v-for="day in data.finances.trend"
              :key="day.day"
              class="manor-chart-day"
              :title="`${day.day} · ${signed(day.issued)} / ${signed(-day.spent)}`"
            >
              <div class="manor-bars"
                ><i class="is-issued" :style="{ height: `${(day.issued / max) * 100}%` }" /><i
                  class="is-spent"
                  :style="{ height: `${(day.spent / max) * 100}%` }"
              /></div>
              <small>{{ day.day.slice(5) }}</small>
            </div>
          </div>
          <details class="manor-trend-values"
            ><summary>{{ a('view') }}</summary
            ><p v-for="day in data.finances.trend" :key="day.day"
              >{{ day.day }} · {{ a('issued') }} {{ signed(day.issued) }} · {{ a('spent') }} {{ signed(-day.spent) }}</p
            ></details
          > </template
        ><p v-else>{{ a('failed') }}</p>
      </section>
      <section class="manor-panel"
        ><h3>{{ a('participation') }}</h3>
        <template v-if="covered && data.activity">
          <div v-for="key in ['plant', 'fish', 'resource']" :key="key" class="manor-participation">
            <div
              ><span>{{ a(key) }}</span
              ><b>{{ a('people', { count: data.activity[key] }) }}</b></div
            >
            <div class="manor-progress"
              ><i :style="{ width: `${Math.min(100, (data.activity[key] / Math.max(data.activity.all, 1)) * 100)}%` }"
            /></div>
          </div> </template
        ><p v-else>{{ a('coverageUnknown') }}</p>
        <small>{{ a('overlap') }}</small>
      </section>
    </div>
    <section class="manor-panel"
      ><div class="manor-section-title"
        ><h3>{{ a('recent') }}</h3
        ><BButton size="small" @click="$emit('records')">{{ a('all') }}</BButton></div
      >
      <div v-if="data.recent?.length" class="manor-recent-list">
        <BButton
          v-for="item in data.recent"
          :key="`${item.userId}:${item.requestId}`"
          class="manor-recent-row"
          @click="$emit('operation', item)"
        >
          <span>{{ time(item.createdAt) }}</span
          ><strong>{{ item.alias || item.userId }}</strong
          ><span>{{ action(item.action) }}</span>
          <span class="manor-resource-summary">{{
            item.deltas.map((d) => `${resource(d.key)} ${signed(d.delta)}`).join(' · ') || '—'
          }}</span
          ><b :class="item.pointsDelta > 0 ? 'manor-positive' : item.pointsDelta < 0 ? 'manor-negative' : ''">{{
            signed(item.pointsDelta)
          }}</b>
        </BButton> </div
      ><p v-else>{{ data.recent === null ? a('failed') : a('empty') }}</p>
    </section>
    <p class="manor-muted"
      >{{ covered ? a('coverage', { date: time(data.runtime.coverageStartedAt) }) : a('coverageUnknown') }}
      <span v-if="partial">· {{ a('partial') }}</span></p
    >
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import type { ManorOverview as Overview, ManorOperation } from '@/api/manorAdminApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useManorAdminFormat } from './manorAdminFormat';
  const props = defineProps<{ data: Overview }>();
  defineEmits<{ records: []; operation: [item: ManorOperation] }>();
  const { a, number, signed, time, action, resource } = useManorAdminFormat();
  const covered = computed(() => Boolean(props.data.runtime.coverageStartedAt));
  const partial = computed(
    () =>
      covered.value &&
      new Date(props.data.runtime.coverageStartedAt!).getTime() >
        new Date(props.data.range.start.replace(' ', 'T') + '+08:00').getTime(),
  );
  const max = computed(() => Math.max(1, ...(props.data.finances?.trend.flatMap((d) => [d.issued, d.spent]) || [])));
  const metrics = computed(() => [
    { label: a('opened'), value: number(props.data.opened), hint: a('openedHint'), tone: '' },
    {
      label: a('active'),
      value: covered.value ? number(props.data.activity?.all) : '—',
      hint: a('activeHint'),
      tone: '',
    },
    {
      label: a('issued'),
      value: props.data.finances ? signed(props.data.finances.issued) : '—',
      hint: a('issuedHint'),
      tone: 'manor-positive',
    },
    {
      label: a('spent'),
      value: props.data.finances ? signed(-props.data.finances.spent) : '—',
      hint: a('net', {
        value: props.data.finances ? signed(props.data.finances.issued - props.data.finances.spent) : '—',
      }),
      tone: 'manor-negative',
    },
  ]);
</script>
