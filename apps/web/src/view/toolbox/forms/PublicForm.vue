<template>
  <main class="collection-public" :class="{ 'collection-public--success': receipt }">
    <div v-if="receipt" class="success-brand">{{ t('collectionForms.publicBrand') }}</div>
    <div v-if="loading" role="status">{{ t('collectionForms.opening') }}</div>
    <section v-else-if="receipt" class="collection-card success-card" role="status"
      ><span class="success-symbol" aria-hidden="true"><SvgIcon :src="icon.organize.check" size="32" /></span
      ><h1>{{
        t(
          outcome === 'updated'
            ? 'collectionForms.updatedSuccess'
            : outcome === 'unchanged'
              ? 'collectionForms.unchangedSuccess'
              : 'collectionForms.success',
        )
      }}</h1
      ><h2>{{ form?.definition.title }}</h2
      ><p class="success-message">{{ form?.definition.successMessage }}</p
      ><div class="success-next"
        ><p>{{ t('collectionForms.savedCloseHint') }}</p
        ><BButton type="primary" @click="again">{{
          t(form?.submissionPolicy === 'replace' ? 'collectionForms.editSubmission' : 'collectionForms.again')
        }}</BButton
        ><p v-if="form?.submissionPolicy === 'replace'" class="success-policy">{{
          t('collectionForms.replaceHint')
        }}</p></div
      ></section
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
    <footer v-if="receipt" class="success-footer">{{ t('collectionForms.poweredBy') }}</footer>
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
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
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
  let editingReceipt = '';

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
        if (
          !['multiple', 'replace'].includes(data.submissionPolicy) ||
          !Object.prototype.hasOwnProperty.call(data, 'mySubmission')
        )
          throw new Error(t('collectionForms.incompatibleServer'));
        if (editingReceipt && (data.submissionPolicy !== 'replace' || data.mySubmission?.receipt !== editingReceipt))
          throw new Error(t('collectionForms.missingPreviousSubmission'));
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
      const data = await request('POST', {
        requestKey: requestKey.value,
        answers,
        ...(form.value?.submissionPolicy === 'replace' && form.value.mySubmission?.receipt
          ? { expectedReceipt: form.value.mySubmission.receipt }
          : {}),
      });
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
    editingReceipt = form.value?.submissionPolicy === 'replace' ? receipt.value : '';
    receipt.value = '';
    lastPayload = '';
    requestKey.value = crypto.randomUUID();
    void load();
  }
  watch(
    () => route.params.publicId,
    () => {
      busy.value = false;
      editingReceipt = '';
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

<style scoped>
  .collection-public--success {
    max-width: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--workspace-canvas);
    gap: var(--ui-space-32, 32px);
  }
  .success-brand {
    align-self: flex-start;
    color: var(--primary-color);
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
  }
  .success-card {
    width: 100%;
    max-width: var(--ui-layout-480, 480px);
    box-sizing: border-box;
    margin: auto 0;
    padding: var(--ui-space-32, 32px);
    text-align: center;
  }
  .success-symbol {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-control-64, 64px);
    height: var(--ui-control-64, 64px);
    margin: 0 auto var(--ui-space-24, 24px);
    border-radius: 50%;
    background: var(--chip-success-bg);
    color: var(--chip-success-fg);
  }
  .success-card h2 {
    font-size: var(--ui-font-16, 16px);
    line-height: 1.5;
    margin: var(--ui-space-24, 24px) 0 var(--ui-space-12, 12px);
    overflow-wrap: anywhere;
  }
  .success-message {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--workspace-muted);
    line-height: 1.7;
    font-size: var(--ui-font-14, 14px);
  }
  .success-next {
    border-top: 1px solid var(--workspace-border);
    margin-top: var(--ui-space-24, 24px);
    padding-top: var(--ui-space-16, 16px);
  }
  .success-next p,
  .success-footer {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.7;
  }
  .success-next :deep(.b_btn) {
    width: 100%;
    margin-top: var(--ui-space-8, 8px);
  }
  .success-policy {
    margin-bottom: 0;
  }
  .success-footer {
    padding-bottom: var(--ui-space-16, 16px);
  }
  @media (max-width: 767px) {
    .success-card {
      padding: var(--ui-space-24, 24px);
    }
  }
</style>
