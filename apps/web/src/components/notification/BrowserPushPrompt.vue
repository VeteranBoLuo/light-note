<template>
  <aside v-if="visible" class="push-prompt" :aria-label="t('browserPush.promptTitle')">
    <div class="push-prompt__copy">
      <strong>{{ t('browserPush.promptTitle') }}</strong>
      <span role="status">{{
        t(state === 'error' ? 'browserPush.state.error' : 'browserPush.promptDescription')
      }}</span>
    </div>
    <div class="push-prompt__actions">
      <BButton size="small" type="primary" :disabled="busy" @click="authorize">{{
        t('browserPush.promptAllow')
      }}</BButton>
      <BButton size="small" :disabled="busy" @click="dismiss">{{ t('browserPush.promptDismiss') }}</BButton>
    </div>
  </aside>
  <div v-if="allowed && preferred && enabled" class="push-prompt-help"><BrowserPushHelp /></div>
</template>
<script setup lang="ts">
  import BrowserPushHelp from './BrowserPushHelp.vue';
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { isAdminLoginPreview } from '@/utils/authStorage';
  import { useBrowserPush } from '@/composables/useBrowserPush';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const { t, locale } = useI18n();
  const user = useUserStore();
  const { state, busy, preferred, enabled, refresh, setEnabled } = useBrowserPush();
  const dismissed = ref(false);
  const attempted = ref(false);
  const owner = computed(() => String(user.id || ''));
  const allowed = computed(
    () => Boolean(owner.value) && user.role !== 'visitor' && !user.adminContext && !isAdminLoginPreview(),
  );
  const key = (id: string) => `light-note:push-prompt-dismissed:${id}`;
  watch(
    [owner, allowed],
    () => {
      attempted.value = false;
      try {
        dismissed.value = localStorage.getItem(key(owner.value)) === 'true';
      } catch {
        dismissed.value = false;
      }
      if (allowed.value) void refresh();
    },
    { immediate: true },
  );
  const visible = computed(
    () =>
      allowed.value &&
      !dismissed.value &&
      preferred.value &&
      !enabled.value &&
      ((state.value === 'pending' && typeof Notification !== 'undefined' && Notification.permission === 'default') ||
        (attempted.value && (busy.value || state.value === 'error'))),
  );
  function dismiss() {
    dismissed.value = true;
    try {
      localStorage.setItem(key(owner.value), 'true');
    } catch {
      /* Current session still stays dismissed. */
    }
  }
  async function authorize() {
    const id = owner.value;
    attempted.value = true;
    await setEnabled(true, locale.value);
    // Dismissing the browser dialog must not cause repeated prompts on every inbox visit.
    if (id === owner.value && state.value === 'pending') dismiss();
  }
</script>
<style scoped lang="less">
  .push-prompt-help {
    padding: 8px 12px;
  }
  .push-prompt {
    margin: 8px 12px;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .push-prompt__copy {
    flex: 1 1 220px;
    min-width: 0;
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .push-prompt__copy strong {
    color: var(--text-color);
    font-weight: 500;
  }
  .push-prompt__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
</style>
