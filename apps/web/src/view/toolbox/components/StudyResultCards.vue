<template>
  <section class="study-result-cards">
    <BTabs v-model:active-tab="mode" :options="modes" />
    <p v-if="error" role="alert">{{ t('toolbox.study.loadFailed') }}</p>
    <slot v-if="mode === 'overview'"></slot>
    <template v-else-if="current">
      <p
        >{{ index + 1 }} / {{ visibleCards.length }} ·
        {{ t('toolbox.study.masteredCount', { count: masteredCount }) }}</p
      >
      <article>
        <h3>{{ current.question }}</h3>
        <BInput
          v-if="mode === 'quiz'"
          v-model:value="answer"
          type="textarea"
          :placeholder="t('toolbox.study.answerPlaceholder')"
        />
        <BButton v-if="!revealed" @click="revealed = true">{{ t('toolbox.study.reveal') }}</BButton>
        <p v-else class="study-result-cards__answer">{{ current.answer }}</p>
      </article>
      <div class="study-result-cards__actions">
        <BButton :disabled="index === 0" @click="index--">{{ t('toolbox.study.previous') }}</BButton>
        <BButton :disabled="saving || loading || error || !revealed" @click="mark(false)">{{
          t('toolbox.study.reviewAgain')
        }}</BButton>
        <BButton
          :disabled="saving || loading || error || !revealed"
          :type="mastered[current.id] ? 'primary' : undefined"
          :aria-pressed="Boolean(mastered[current.id])"
          @click="mark(true)"
          >{{ t('toolbox.study.mastered') }}</BButton
        >
        <BButton :disabled="index + 1 >= visibleCards.length" @click="index++">{{ t('toolbox.study.next') }}</BButton>
      </div>
    </template>
    <p v-else>{{ t('toolbox.study.empty') }}</p>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import { apiBaseGet, apiBasePost } from '@/http/request';
  import { useUserStore } from '@/store';
  const props = defineProps<{
    artifactId: string;
    version: number;
    cards: { id: string; kind: string; question: string; answer: string }[];
  }>();
  const { t } = useI18n();
  const user = useUserStore();
  const mode = ref('overview');
  const index = ref(0);
  const revealed = ref(false);
  const answer = ref('');
  const mastered = ref<Record<string, boolean>>({});
  const error = ref(false);
  const saving = ref(false);
  const loading = ref(false);
  let generation = 0;
  onBeforeUnmount(() => {
    generation++;
  });
  const modes = computed(() => [
    { key: 'overview', label: t('toolbox.study.overview') },
    { key: 'flashcard', label: t('toolbox.study.flashcards') },
    { key: 'quiz', label: t('toolbox.study.quiz') },
  ]);
  const visibleCards = computed(() => props.cards.filter((card) => card.kind === mode.value));
  const current = computed(() => visibleCards.value[index.value]);
  const masteredCount = computed(() => props.cards.filter((card) => mastered.value[card.id]).length);
  watch(mode, () => {
    index.value = 0;
  });
  watch([mode, index], () => {
    revealed.value = false;
    answer.value = '';
  });
  watch(
    () => [props.artifactId, props.version, user.id],
    async () => {
      const token = ++generation;
      loading.value = true;
      saving.value = false;
      mastered.value = {};
      index.value = 0;
      revealed.value = false;
      answer.value = '';
      error.value = false;
      try {
        const response = await apiBaseGet(
          `/api/toolbox/artifacts/${encodeURIComponent(props.artifactId)}/study`,
          undefined,
          { silent: true },
        );
        if (token !== generation) return;
        if (response.status !== 200) throw new Error('unavailable');
        mastered.value = Object.fromEntries(
          (response.data?.cards || []).map((card: { id: string; mastered: boolean }) => [card.id, card.mastered]),
        );
      } catch {
        if (token === generation) error.value = true;
      } finally {
        if (token === generation) loading.value = false;
      }
    },
    { immediate: true },
  );
  async function mark(value: boolean) {
    if (!current.value || saving.value) return;
    const cardId = current.value.id;
    const token = generation;
    saving.value = true;
    try {
      const response = await apiBasePost(
        `/api/toolbox/artifacts/${encodeURIComponent(props.artifactId)}/study`,
        { version: props.version, cardId, mastered: value },
        { silent: true },
      );
      if (token !== generation) return;
      if (response.status !== 200) throw new Error('unavailable');
      mastered.value = { ...mastered.value, [cardId]: value };
      error.value = false;
    } catch {
      if (token === generation) error.value = true;
    } finally {
      if (token === generation) saving.value = false;
    }
  }
</script>
<style scoped lang="less">
  .study-result-cards {
    padding: 20px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    margin-bottom: 20px;
  }
  .study-result-cards article {
    padding: 20px 0;
    min-height: 160px;
  }
  .study-result-cards__answer {
    white-space: pre-wrap;
  }
  .study-result-cards__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .study-result-cards__actions :deep(button) {
    min-height: 44px;
  }
</style>
