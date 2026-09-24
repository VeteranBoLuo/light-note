<template>
  <main class="collection-public">
    <div v-if="loading" role="status">{{ t('collectionForms.opening') }}</div>
    <section v-else-if="receipt" class="collection-card"
      ><h1>{{
        t(
          outcome === 'updated'
            ? 'collectionForms.updatedSuccess'
            : outcome === 'unchanged'
              ? 'collectionForms.unchangedSuccess'
              : 'collectionForms.success',
        )
      }}</h1
      ><p>{{ form?.definition.successMessage }}</p
      ><BButton @click="again">{{
        t(form?.submissionPolicy === 'replace' ? 'collectionForms.editSubmission' : 'collectionForms.again')
      }}</BButton></section
    >
    <template v-else-if="form?.status === 'collecting'">
      <p v-if="form.mySubmission" class="collection-muted" role="status">{{ t('collectionForms.alreadySubmitted') }}</p>
      <FormRenderer
        :key="renderKey"
        :definition="form.definition"
        :initial-answers="form.mySubmission?.answers"
        :submit-label="form.mySubmission ? t('collectionForms.updateSubmission') : undefined"
        :busy="busy"
        @submit="submit"
      />
      <p class="collection-muted">{{
        t(form.submissionPolicy === 'replace' ? 'collectionForms.replaceHint' : 'collectionForms.publicHint')
      }}</p>
    </template>
    <section v-else-if="form" class="collection-card"
      ><h1>{{ form.definition.title }}</h1
      ><p>{{ form.status === 'ended' ? t('collectionForms.endedHint') : t('collectionForms.pausedHint') }}</p></section
    >
    <p v-if="error" class="collection-error" role="alert">{{ error }}</p>
    <BButton v-if="!loading && !form" @click="load">{{ t('collectionForms.reload') }}</BButton>
  </main>
</template>
<script setup lang="ts">
  import './forms.css';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n();
  import { ref, watch, onBeforeUnmount } from 'vue';
  import { useRoute } from 'vue-router';
  import type { FormDefinition, FormAnswers } from '@lightnote/shared/collection-forms';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import FormRenderer from './FormRenderer.vue';
  const route = useRoute(),
    form = ref<{
      status: string;
      definition: FormDefinition;
      submissionPolicy?: 'multiple' | 'replace';
      mySubmission?: { receipt: string; answers: FormAnswers } | null;
    }>(),
    loading = ref(true),
    busy = ref(false),
    error = ref(''),
    receipt = ref(''),
    outcome = ref(''),
    renderKey = ref(0),
    requestKey = ref(crypto.randomUUID());
  let generation = 0;
  let lastPayload = '';

  let controller: AbortController | undefined;
  async function request(method: string, body?: unknown) {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    const timeout = setTimeout(() => current.abort(), 30000);
    try {
      const res = await fetch(
        `/api/public/forms/${encodeURIComponent(String(route.params.publicId))}${method === 'POST' ? '/responses' : ''}`,
        {
          method,
          signal: current.signal,
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || t('collectionForms.networkError'));
      return data.data;
    } finally {
      clearTimeout(timeout);
      if (controller === current) controller = undefined;
    }
  }
  async function load() {
    const g = ++generation;
    loading.value = true;
    form.value = undefined;
    error.value = '';
    receipt.value = '';
    try {
      const data = await request('GET');
      if (g === generation) {
        form.value = data;
        renderKey.value++;
      }
    } catch (e) {
      if (g === generation) error.value = (e as Error).message;
    } finally {
      if (g === generation) loading.value = false;
    }
  }
  async function submit(answers: FormAnswers) {
    if (busy.value) return;
    const g = generation;
    busy.value = true;
    error.value = '';
    try {
      const payload = JSON.stringify(answers);
      if (lastPayload && lastPayload !== payload) requestKey.value = crypto.randomUUID();
      lastPayload = payload;
      const data = await request('POST', { requestKey: requestKey.value, answers });
      if (g === generation) {
        receipt.value = data.receipt;
        outcome.value = data.outcome || 'created';
      }
    } catch (e) {
      if (g === generation) error.value = (e as Error).message;
    } finally {
      if (g === generation) busy.value = false;
    }
  }
  onBeforeUnmount(() => {
    generation++;
    controller?.abort();
  });
  function again() {
    receipt.value = '';
    lastPayload = '';
    requestKey.value = crypto.randomUUID();
    void load();
  }
  watch(
    () => route.params.publicId,
    () => {
      busy.value = false;
      lastPayload = '';
      requestKey.value = crypto.randomUUID();
      void load();
    },
    { immediate: true },
  );
</script>

<style scoped>
  .collection-public {
    min-height: 100%;
    max-width: var(--ui-layout-800, 800px);
    margin: auto;
    padding: var(--ui-space-24, 24px);
    color: var(--workspace-text);
  }
  @media (max-width: 767px) {
    .collection-public {
      padding: var(--ui-space-16, 16px);
    }
  }

  .collection-public {
    box-sizing: border-box;
  }
  .collection-public :deep(h1) {
    font-size: var(--ui-font-24, 24px);
    line-height: 1.4;
    margin: 0 0 var(--ui-space-8, 8px);
    overflow-wrap: anywhere;
  }

  .collection-public {
    height: 100%;
    overflow: auto;
  }
</style>
