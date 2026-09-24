<template>
  <div class="collection-stack">
    <p v-if="error" class="collection-error" role="alert"
      >{{ error }} <BButton @click="load">{{ t('collectionForms.retry') }}</BButton></p
    >
    <p v-if="loading && !data" role="status">{{ t('collectionForms.loadingStatistics') }}</p>
    <template v-if="data">
      <div class="collection-stat-summary" :aria-busy="loading">
        <div v-for="(key, index) in ['total', 'valid', 'spam']" :key="key"
          ><span>{{ t('collectionForms.' + ['allResponses', 'validResponses', 'spam'][index]) }}</span
          ><strong :class="{ 'is-accent': key === 'valid' }"
            >{{ data.summary[key] }}<small>{{ t('collectionForms.unit') }}</small></strong
          ></div
        >
      </div>
      <section class="collection-card collection-stat-trend">
        <div class="collection-row"
          ><h3>{{ t('collectionForms.trend') }}</h3
          ><span class="collection-muted">{{
            t('collectionForms.validCount', { count: data.summary.valid })
          }}</span></div
        >
        <p class="collection-muted"
          >{{ t(grouped ? 'collectionForms.intervalTrend' : 'collectionForms.dailyTrend')
          }}<span v-if="loading"> · {{ t('collectionForms.loadingStatistics') }}</span></p
        >
        <div
          v-if="data.summary.valid > 0"
          class="collection-trend-chart"
          role="img"
          :aria-label="trend.map((d) => d.label + ': ' + d.count).join('; ')"
        >
          <div class="collection-trend-axis"
            ><span>{{ ceiling }}</span
            ><span>{{ ceiling / 2 }}</span
            ><span>0</span></div
          >
          <div class="collection-trend-plot">
            <div
              v-for="(day, index) in trend"
              :key="day.day"
              class="collection-trend-column"
              :title="day.label + ': ' + day.count"
            >
              <div class="collection-trend-stick" :style="{ height: (day.count / ceiling) * 100 + '%' }"
                ><span v-if="day.count && trend.length <= 12">{{ day.count }}</span></div
              >
              <small v-if="index % Math.max(1, Math.ceil(trend.length / 7)) === 0 || index === trend.length - 1">{{
                day.day.slice(5).replace('-', '/')
              }}</small>
            </div>
          </div>
        </div>
        <p v-else class="collection-stat-empty">{{ t('collectionForms.emptyStatistics') }}</p>
      </section>
      <div class="collection-stat-section"
        ><h3>{{ t('collectionForms.questionAnalysis') }}</h3
        ><span class="collection-muted">{{
          t('collectionForms.questionTotal', { count: data.questions.length })
        }}</span></div
      >
      <div class="collection-stat-questions">
        <section v-for="(q, index) in data.questions" :key="q.id" class="collection-card collection-stat-question">
          <div class="collection-stat-question-heading"
            ><span class="collection-stat-index">{{ String(Number(index) + 1).padStart(2, '0') }}</span
            ><h3>{{ q.title }}</h3
            ><small>{{ t('collectionForms.' + q.type) }}</small></div
          >
          <p class="collection-muted">{{
            t('collectionForms.answeredCount', {
              answered: q.answered,
              missing: Math.max(0, Number(data.summary.valid) - q.answered),
            })
          }}</p>
          <template v-if="['single', 'multiple'].includes(q.type)">
            <p v-if="q.type === 'multiple'" class="collection-muted">{{ t('collectionForms.multipleHint') }}</p>
            <div v-for="o in q.options" :key="o.id" class="collection-stat-option"
              ><div class="collection-row"
                ><span>{{ o.label }}</span
                ><span
                  >{{ choice(q, o.id) }} {{ t('collectionForms.unit') }} ·
                  {{ percent(choice(q, o.id), q.answered) }}%</span
                ></div
              ><div class="collection-stat-track"
                ><div :style="{ width: percent(choice(q, o.id), q.answered) + '%' }"></div></div
            ></div>
          </template>
          <div v-else-if="q.type === 'rating'" class="collection-stat-rating">
            <div class="collection-stat-average"
              ><strong>{{ number(q.average) }}</strong
              ><span>/5</span><small>{{ t('collectionForms.averageLabel') }}</small></div
            >
            <div class="collection-stat-distribution"
              ><div v-for="score in [5, 4, 3, 2, 1]" :key="score"
                ><span>{{ score }} {{ t('collectionForms.scoreUnit') }}</span
                ><div class="collection-stat-track"
                  ><div :style="{ width: percent(ratingCount(q, score), q.answered) + '%' }"></div></div
                ><span>{{ ratingCount(q, score) }} {{ t('collectionForms.unit') }}</span></div
              ></div
            >
          </div>
          <div v-else-if="q.type === 'number'" class="collection-stat-number"
            ><div class="collection-stat-average"
              ><strong>{{ number(q.average) }}</strong
              ><small>{{ t('collectionForms.meanValue') }}</small></div
            ><span class="collection-muted">{{
              t('collectionForms.extremes', { min: number(q.minimum), max: number(q.maximum) })
            }}</span></div
          >
          <template v-else-if="q.type === 'date'"
            ><div v-for="v in q.values" :key="v.value" class="collection-stat-option"
              ><div class="collection-row"
                ><span>{{ v.value }}</span
                ><span>{{ v.count }} {{ t('collectionForms.unit') }}</span></div
              ><div class="collection-stat-track"
                ><div :style="{ width: percent(v.count, q.answered) + '%' }"></div></div></div
            ><p v-if="!q.values.length" class="collection-muted">{{
              t('collectionForms.emptyStatistics')
            }}</p></template
          >
          <BButton v-else type="text" :disabled="loading || !!error || !q.answered" @click="openText(q.id)">{{
            t('collectionForms.viewText')
          }}</BButton>
        </section>
      </div>
      <p class="collection-muted">{{ t('collectionForms.statisticsFootnote') }}</p>
    </template>
    <BDrawer :open="textOpen" @close="textOpen = false" :title="t('collectionForms.textAnswers')" mobile-full-screen
      ><div class="collection-stack"
        ><BInput v-model:value="search" :placeholder="t('collectionForms.searchAnswers')" /><BButton
          @click="
            textPage = 1;
            loadText();
          "
          >{{ t('collectionForms.search') }}</BButton
        ><p v-if="textError" role="alert">{{ textError }}</p
        ><p v-for="(r, i) in textRows" :key="i" class="collection-description">{{ r.text_value }}</p
        ><div class="collection-toolbar"
          ><BButton
            :disabled="textPage <= 1"
            @click="
              textPage--;
              loadText();
            "
            >{{ t('collectionForms.previous') }}</BButton
          ><span>{{ textPage }}</span
          ><BButton
            :disabled="textRows.length < 30"
            @click="
              textPage++;
              loadText();
            "
            >{{ t('collectionForms.next') }}</BButton
          ></div
        ></div
      ></BDrawer
    >
  </div>
</template>
<script setup lang="ts">
  import './forms.css';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n();
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import { buildTrend } from './statistics';
  import { formsApi } from './api';
  const props = defineProps<{ formId: string; from: string; to: string }>();
  const data = ref<any>(),
    loading = ref(false),
    error = ref(''),
    textOpen = ref(false),
    search = ref(''),
    questionId = ref(''),
    textRows = ref<any[]>([]),
    textPage = ref(1),
    textError = ref('');
  const loadedRange = ref({ from: '', to: '' });
  let generation = 0,
    textGeneration = 0;
  async function load() {
    const g = ++generation;
    loading.value = true;
    error.value = '';
    try {
      const result = await formsApi(`/${props.formId}/statistics`, 'GET', { from: props.from, to: props.to });
      if (g === generation) {
        data.value = result;
        loadedRange.value = { from: props.from, to: props.to };
      }
    } catch (e) {
      if (g === generation) error.value = (e as Error).message;
    } finally {
      if (g === generation) loading.value = false;
    }
  }
  const trend = computed(() => buildTrend(data.value?.trend || [], loadedRange.value.from, loadedRange.value.to));
  const grouped = computed(() => trend.value.some((d) => d.day !== d.end));
  const ceiling = computed(() => Math.max(2, Math.ceil(Math.max(...trend.value.map((d) => d.count), 0) / 2) * 2));
  const ratingCount = (q: any, score: number) =>
    Number(q.values?.find((v: any) => Number(v.value) === score)?.count || 0);
  const choice = (q: any, id: string) => Number(q.choices.find((c: any) => c.option_id === id)?.count || 0);
  const percent = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const number = (v: any) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  function openText(id: string) {
    questionId.value = id;
    textPage.value = 1;
    search.value = '';
    textOpen.value = true;
    void loadText();
  }
  async function loadText() {
    const g = ++textGeneration;
    textRows.value = [];
    textError.value = '';
    try {
      const result = await formsApi(`/${props.formId}/text-answers`, 'GET', {
        questionId: questionId.value,
        page: textPage.value,
        search: search.value,
        from: props.from,
        to: props.to,
      });
      if (g === textGeneration) textRows.value = result;
    } catch (e) {
      if (g === textGeneration) textError.value = (e as Error).message;
    }
  }
  watch(
    () => [props.formId, props.from, props.to],
    (value, previous) => {
      if (previous && value[0] !== previous[0]) data.value = undefined;
      textOpen.value = false;
      textGeneration++;
      void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
    textGeneration++;
  });
</script>

<style scoped>
  .collection-stat-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    background: var(--workspace-content);
    border: 1px solid var(--workspace-border);
    border-radius: var(--ui-space-12, 12px);
    padding: var(--ui-space-20, 20px);
  }
  .collection-stat-summary > div {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    padding-inline: var(--ui-space-20, 20px);
    border-right: 1px solid var(--workspace-border);
  }
  .collection-stat-summary > div:last-child {
    border: 0;
  }
  .collection-stat-summary span {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .collection-stat-summary strong {
    font-size: var(--ui-font-28, 28px);
    line-height: 1.2;
  }
  .collection-stat-summary small {
    font-size: var(--ui-font-12, 12px);
    margin-left: var(--ui-space-6, 6px);
    font-weight: normal;
    color: var(--workspace-muted);
  }
  .collection-stat-summary .is-accent {
    color: var(--workspace-purple-text);
  }
  .collection-stat-section h3,
  .collection-stat-trend h3,
  .collection-stat-question h3 {
    margin: 0;
    font-size: var(--ui-font-14, 14px);
  }
  .collection-stat-trend > p {
    margin: var(--ui-space-6, 6px) 0 0;
  }
  .collection-stat-section {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-8, 8px);
  }
  .collection-trend-chart {
    display: flex;
    gap: var(--ui-space-12, 12px);
    padding-top: var(--ui-space-28, 28px);
    padding-bottom: var(--ui-space-24, 24px);
  }
  .collection-trend-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: var(--ui-font-11, 11px);
    color: var(--workspace-muted);
  }
  .collection-trend-plot {
    height: var(--ui-layout-120, 120px);
    display: flex;
    align-items: stretch;
    flex: 1;
    min-width: 0;
    border-bottom: 1px solid var(--workspace-border);
    border-top: 1px solid var(--workspace-border);
    background: linear-gradient(
      to bottom,
      transparent calc(50% - 0.5px),
      var(--workspace-border) 50%,
      transparent calc(50% + 0.5px)
    );
  }
  .collection-trend-column {
    flex: 1;
    min-width: 0;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: flex-end;
  }
  .collection-trend-stick {
    width: 60%;
    max-width: var(--ui-layout-20, 20px);
    background: var(--workspace-purple-text);
    position: relative;
    border-radius: var(--ui-space-2, 2px) var(--ui-space-2, 2px) 0 0;
  }
  .collection-trend-stick > span {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    font-size: var(--ui-font-11, 11px);
    color: var(--workspace-purple-text);
    line-height: 1.8;
  }
  .collection-trend-column > small {
    position: absolute;
    top: 100%;
    padding-top: var(--ui-space-8, 8px);
    font-size: var(--ui-font-10, 10px);
    white-space: nowrap;
    color: var(--workspace-muted);
  }
  .collection-stat-questions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-16, 16px);
    align-items: start;
  }
  .collection-stat-question {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-16, 16px);
  }
  .collection-stat-question p {
    margin: 0;
  }
  .collection-stat-question-heading {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-8, 8px);
  }
  .collection-stat-question-heading h3 {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .collection-stat-question-heading > small {
    flex-shrink: 0;
    border: 1px solid var(--workspace-border);
    border-radius: var(--ui-space-6, 6px);
    padding: var(--ui-space-2, 2px) var(--ui-space-6, 6px);
    font-size: var(--ui-font-11, 11px);
    color: var(--workspace-muted);
  }
  .collection-stat-index {
    color: var(--workspace-purple-text);
    background: var(--workspace-hover);
    padding: var(--ui-space-2, 2px) var(--ui-space-4, 4px);
    border-radius: var(--ui-space-4, 4px);
    font-size: var(--ui-font-12, 12px);
  }
  .collection-stat-option {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
  }
  .collection-stat-option .collection-row {
    align-items: flex-start;
  }
  .collection-stat-option .collection-row > span:first-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .collection-stat-option .collection-row > span:last-child {
    flex-shrink: 0;
    color: var(--workspace-muted);
  }
  .collection-stat-track {
    height: var(--ui-space-8, 8px);
    border-radius: var(--ui-space-4, 4px);
    background: var(--workspace-hover);
    overflow: hidden;
  }
  .collection-stat-track > div {
    height: 100%;
    background: var(--workspace-purple-text);
    border-radius: inherit;
  }
  .collection-stat-rating {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    align-items: center;
    gap: var(--ui-space-16, 16px);
  }
  .collection-stat-average {
    text-align: center;
    min-width: 0;
  }
  .collection-stat-average strong {
    font-size: var(--ui-font-32, 32px);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .collection-stat-average small {
    display: block;
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
    margin-top: var(--ui-space-8, 8px);
  }
  .collection-stat-distribution {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    border-left: 1px solid var(--workspace-border);
    padding-left: var(--ui-space-16, 16px);
  }
  .collection-stat-distribution > div {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-11, 11px);
    white-space: nowrap;
  }
  .collection-stat-number {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: var(--ui-space-16, 16px);
  }
  .collection-stat-empty {
    min-height: var(--ui-layout-120, 120px);
    display: grid;
    place-items: center;
    color: var(--workspace-muted);
  }
  @media (max-width: 767px) {
    .collection-stat-questions {
      grid-template-columns: minmax(0, 1fr);
    }
    .collection-stat-summary {
      padding: var(--ui-space-16, 16px) var(--ui-space-8, 8px);
    }
    .collection-stat-summary > div {
      padding-inline: var(--ui-space-8, 8px);
    }
    .collection-stat-summary strong {
      font-size: var(--ui-font-24, 24px);
    }
    .collection-stat-question,
    .collection-stat-trend {
      padding: var(--ui-space-16, 16px);
    }
    .collection-stat-rating {
      gap: var(--ui-space-8, 8px);
    }
    .collection-stat-average strong {
      font-size: var(--ui-font-28, 28px);
    }
    .collection-stat-distribution {
      padding-left: var(--ui-space-12, 12px);
    }
    .collection-trend-plot {
      height: var(--ui-layout-80, 80px);
    }
    .collection-trend-chart {
      padding-top: var(--ui-space-20, 20px);
    }
  }
</style>
