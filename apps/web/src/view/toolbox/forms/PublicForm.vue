<template>
  <main class="collection-public" :class="{ 'collection-public--success': receipt }">
    <header v-if="membersOnly" class="collection-public-header">
      <span class="success-brand">{{ t('collectionForms.publicBrand') }}</span>
      <BButton type="text" class="collection-return" :disabled="busy" @click="returnToLightNote">{{
        t('collectionForms.returnToLightNote')
      }}</BButton>
    </header>
    <ToolboxFeedback v-if="loading" state="loading" :title="t('collectionForms.opening')" />
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
      ><template v-if="receivedReward?.received"
        ><p>{{ t('collectionForms.rewardReceived', { points: receivedReward.points }) }}</p
        ><p class="collection-muted">{{ t('collectionForms.rewardOnceHint') }}</p></template
      ><div class="success-next"
        ><p>{{ t(membersOnly ? 'collectionForms.savedReturnHint' : 'collectionForms.savedCloseHint') }}</p
        ><BButton v-if="membersOnly" type="primary" :disabled="busy" @click="returnToLightNote">{{
          t('collectionForms.returnToLightNote')
        }}</BButton
        ><BButton v-if="membersOnly && receivedReward?.received" :disabled="busy" @click="openRewardNotifications">{{
          t('collectionForms.viewRewardNotification')
        }}</BButton
        ><BButton :type="membersOnly ? 'text' : 'primary'" :disabled="busy" @click="again">{{
          t(form?.submissionPolicy === 'replace' ? 'collectionForms.editSubmission' : 'collectionForms.again')
        }}</BButton></div
      ></section
    >
    <section
      v-else-if="form?.status === 'collecting' && form.requiresLogin"
      class="collection-card collection-stack collection-login"
    >
      <h1>{{ form.definition.title }}</h1
      ><p class="collection-description">{{ form.definition.description }}</p>
      <p v-if="form.reward">{{ t('collectionForms.rewardOffer', { points: form.reward.points }) }}</p>
      <p>{{ t('collectionForms.memberLoginHint') }}</p
      ><p class="collection-muted">{{ t('collectionForms.memberPrivacyHint') }}</p>
      <BButton type="primary" class="collection-login-action" @click="login">{{
        t('collectionForms.loginToParticipate')
      }}</BButton>
    </section>
    <template v-else-if="form?.status === 'collecting'">
      <section v-if="form.account" class="collection-card collection-stack collection-account">
        <strong>{{ t('collectionForms.currentAccount', { name: form.account.alias || form.account.id }) }}</strong>
        <p class="collection-muted">{{ t('collectionForms.memberPrivacyHint') }}</p>
        <template v-if="form.reward"
          ><p>{{
            t(form.reward.received ? 'collectionForms.rewardReceived' : 'collectionForms.rewardOffer', {
              points: form.reward.points,
            })
          }}</p
          ><p class="collection-muted">{{ t('collectionForms.rewardOnceHint') }}</p></template
        >
      </section>
      <p v-if="form.mySubmission" class="collection-muted" role="status">{{ t('collectionForms.alreadySubmitted') }}</p>
      <FormRenderer
        ref="renderer"
        :key="renderKey"
        :definition="form.definition"
        :initial-answers="draftAnswers || form.mySubmission?.answers"
        :submit-label="form.mySubmission ? t('collectionForms.updateSubmission') : undefined"
        :busy="busy"
        @submit="submit"
      />
      <p v-if="form.submissionPolicy !== 'replace'" class="collection-muted">{{ t('collectionForms.publicHint') }}</p>
    </template>
    <section v-else-if="form" class="collection-card"
      ><h1>{{ form.definition.title }}</h1
      ><p>{{
        form.status === 'ended'
          ? t('collectionForms.endedHint')
          : form.reward?.remaining === 0
            ? t('collectionForms.rewardFull')
            : t('collectionForms.pausedHint')
      }}</p></section
    >
    <footer v-if="receipt" class="success-footer">{{ t('collectionForms.poweredBy') }}</footer>
    <ToolboxFeedback v-if="error" state="error"
      >{{ error }}
      <template v-if="!form" #actions
        ><BButton :loading="loading" @click="load">{{ t('collectionForms.reload') }}</BButton></template
      >
      <template v-else-if="loginRequired || reloadRequired" #actions
        ><BButton @click="loginRequired ? login() : load()">{{
          t(loginRequired ? 'collectionForms.loginAgain' : 'collectionForms.reload')
        }}</BButton></template
      >
    </ToolboxFeedback>
  </main>
</template>
<script setup lang="ts">
  import ToolboxFeedback from '../components/ToolboxFeedback.vue';
  import './forms.css';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n();
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { rememberAuthNavigationIntent } from '@/utils/authNavigationIntent';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import type { FormDefinition, FormAnswers } from '@lightnote/shared/collection-forms';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import FormRenderer from './FormRenderer.vue';
  const route = useRoute(),
    router = useRouter(),
    form = ref<{
      status: string;
      definition: FormDefinition;
      submissionPolicy?: 'multiple' | 'replace';
      mySubmission?: { receipt: string; answers: FormAnswers } | null;
      requiresLogin?: boolean;
      account?: { id: string; alias: string } | null;
      reward?: { points: number; received: boolean; remaining: number | null } | null;
    }>(),
    loading = ref(true),
    busy = ref(false),
    error = ref(''),
    receipt = ref(''),
    outcome = ref(''),
    receivedReward = ref<{ points: number; received: boolean } | null>(null),
    draftAnswers = ref<FormAnswers>(),
    renderer = ref<InstanceType<typeof FormRenderer>>(),
    loginRequired = ref(false),
    reloadRequired = ref(false),
    renderKey = ref(0),
    requestKey = ref(crypto.randomUUID());
  const membersOnly = computed(() => form.value?.definition.membersOnly === true);
  let generation = 0;
  let lastPayload = '';
  let editingReceipt = '';
  let lastAnswers: FormAnswers | undefined;
  function returnToLightNote() {
    if (membersOnly.value && !busy.value) void router.push({ name: 'workbenches' });
  }
  function openRewardNotifications() {
    if (membersOnly.value && receivedReward.value?.received && !busy.value) void router.push({ name: 'notifications' });
  }
  useMobileTopBar(['publicCollectionForm'], { onBack: returnToLightNote, canGoBack: () => membersOnly.value });
  const draftKey = () => `collection-login-draft:${String(route.params.publicId)}`;
  function login() {
    if (!rememberAuthNavigationIntent(route.fullPath)) return;
    const answers = renderer.value?.getAnswers() || lastAnswers;
    if (answers && form.value?.account) {
      try {
        sessionStorage.setItem(
          draftKey(),
          JSON.stringify({ accountId: form.value.account.id, answers, at: Date.now() }),
        );
      } catch {
        /* Storage may be disabled. */
      }
    }
    void router.push('/login');
  }

  let controller: AbortController | undefined;
  async function request(method: string, body?: unknown) {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    const timeout = setTimeout(() => current.abort(), 30000);
    try {
      let sid = '';
      try {
        sid = localStorage.getItem('rememberedSid') || '';
      } catch {
        /* Use the session cookie. */
      }
      const res = await fetch(
        `/api/public/forms/${encodeURIComponent(String(route.params.publicId))}${method === 'POST' ? '/responses' : ''}`,
        {
          method,
          signal: current.signal,
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', ...(sid ? { 'X-Session-Id': sid } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw Object.assign(new Error(data.msg || t('collectionForms.networkError')), {
          status: res.status,
          field: data.data?.field,
        });
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
    receivedReward.value = null;
    loginRequired.value = false;
    reloadRequired.value = false;
    draftAnswers.value = undefined;
    try {
      const data = await request('GET');
      if (g === generation) {
        if (
          !['multiple', 'replace'].includes(data.submissionPolicy) ||
          !Object.prototype.hasOwnProperty.call(data, 'mySubmission')
        )
          throw new Error(t('collectionForms.incompatibleServer'));
        if (
          data.definition.membersOnly &&
          (typeof data.requiresLogin !== 'boolean' || (!data.requiresLogin && !data.account?.id))
        )
          throw new Error(t('collectionForms.incompatibleServer'));
        if (
          editingReceipt &&
          !data.requiresLogin &&
          (data.submissionPolicy !== 'replace' || data.mySubmission?.receipt !== editingReceipt)
        )
          throw new Error(
            t(
              data.definition.membersOnly
                ? 'collectionForms.missingAccountSubmission'
                : 'collectionForms.missingPreviousSubmission',
            ),
          );
        form.value = data;
        try {
          const raw = sessionStorage.getItem(draftKey());
          if (raw) {
            const draft = JSON.parse(raw);
            if (
              data.account?.id === draft.accountId &&
              Date.now() - draft.at >= 0 &&
              Date.now() - draft.at < 30 * 60 * 1000
            )
              draftAnswers.value = draft.answers;
            sessionStorage.removeItem(draftKey());
          }
        } catch {
          /* Draft restoration is optional. */
        }
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
      lastAnswers = answers;
      if (lastPayload && lastPayload !== payload) requestKey.value = crypto.randomUUID();
      lastPayload = payload;
      const data = await request('POST', {
        requestKey: requestKey.value,
        answers,
        ...(form.value?.account ? { expectedAccountId: form.value.account.id } : {}),
        ...(form.value?.submissionPolicy === 'replace' && form.value.mySubmission?.receipt
          ? { expectedReceipt: form.value.mySubmission.receipt }
          : {}),
      });
      if (g === generation) {
        receipt.value = data.receipt;
        outcome.value = data.outcome || 'created';
        receivedReward.value = data.reward || null;
      }
    } catch (e) {
      if (g === generation) {
        error.value = (e as Error).message;
        loginRequired.value = (e as { status?: number }).status === 401;
        const field = (e as { field?: string }).field;
        reloadRequired.value = field === 'account' || field === 'state';
        if (field === 'account') {
          form.value = undefined;
          draftAnswers.value = undefined;
          lastAnswers = undefined;
          editingReceipt = '';
          lastPayload = '';
          requestKey.value = crypto.randomUUID();
        }
      }
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
      lastAnswers = undefined;
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
  .collection-account {
    margin-bottom: var(--ui-space-20, 20px);
  }
  .collection-account p {
    margin: 0;
  }
  .collection-login p {
    margin: 0;
  }
  .collection-login-action {
    min-height: var(--ui-control-44, 44px);
  }
  .collection-public-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    width: 100%;
    margin-bottom: var(--ui-space-20, 20px);
  }
  .collection-return {
    margin-left: auto;
    min-height: var(--ui-control-40, 40px);
  }
  @media (max-width: 767px) {
    .collection-public {
      padding: var(--ui-space-16, 16px);
    }
    .collection-return {
      min-height: var(--ui-control-44, 44px);
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
  .collection-public--success .collection-public-header {
    margin-bottom: 0;
  }
  .success-brand {
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
    min-height: var(--ui-control-40, 40px);
    margin-top: var(--ui-space-8, 8px);
  }
  .success-footer {
    padding-bottom: var(--ui-space-16, 16px);
  }
  @media (max-width: 767px) {
    .success-card {
      padding: var(--ui-space-24, 24px);
    }
    .success-next :deep(.b_btn) {
      min-height: var(--ui-control-44, 44px);
    }
  }
</style>
