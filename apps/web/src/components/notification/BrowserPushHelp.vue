<template>
  <div class="push-help">
    <BButton ref="trigger" size="small" :aria-expanded="open" @click="open = true">{{
      t('settingsRefine.push.help')
    }}</BButton>
    <BDrawer
      :open="open"
      :title="t('settingsRefine.push.help')"
      width="510px"
      mobile-full-screen
      body-padding="24px"
      @close="open = false"
      @after-close="restoreFocus"
    >
      <div class="push-help-content">
        <section class="push-help-section">
          <div class="push-help-section__heading">
            <h3>{{ t('settingsRefine.push.currentStatus') }}</h3>
            <BButton
              size="small"
              :loading="busy || state === 'loading'"
              :disabled="busy || state === 'loading'"
              @click="refresh"
            >
              {{ t('settingsRefine.push.check') }}
            </BButton>
          </div>
          <BrowserPushFacts stacked />
          <p class="push-help__hint">{{ t('settingsRefine.push.checkDesc') }}</p>
        </section>
        <section class="push-help-section">
          <div class="push-help-section__heading">
            <h3>{{ t('settingsRefine.push.guide') }}</h3>
            <BSelect
              class="push-help__platform"
              v-model:value="platform"
              :options="platforms"
              :aria-label="t('settingsRefine.push.platform')"
            />
          </div>
          <p class="push-help__hint">{{ t('settingsRefine.push.systemLimit') }}</p>
          <div class="push-help__instruction">
            {{ t(platform === 'mac' ? 'browserPush.helpMac' : 'browserPush.helpWindows') }}
          </div>
        </section>
        <section class="push-help-section">
          <h3>{{ t('settingsRefine.push.more') }}</h3>
          <p class="push-help__hint">{{ t('settingsRefine.push.moreDesc') }}</p>
        </section>
      </div>
    </BDrawer>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { useBrowserPush } from '@/composables/useBrowserPush';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BrowserPushFacts from './BrowserPushFacts.vue';
  const { t } = useI18n();
  const { state, busy, refresh } = useBrowserPush();
  const user = useUserStore();
  const open = ref(false),
    trigger = ref<InstanceType<typeof BButton> | null>(null);
  // Platform only selects documentation; actual push capability stays in useBrowserPush.
  const platform = ref(/Mac/i.test(navigator.platform) ? 'mac' : 'windows');
  const platforms = computed(() => [
    { value: 'mac', label: t('settingsRefine.push.mac') },
    { value: 'windows', label: t('settingsRefine.push.windows') },
  ]);
  const restoreFocus = () => trigger.value?.$el?.focus?.({ preventScroll: true });
  watch(
    () => [user.id, user.adminContext?.id],
    () => {
      open.value = false;
    },
  );
</script>
<style scoped>
  .push-help-content {
    color: var(--text-color);
    font-size: 13px;
    line-height: 1.7;
  }
  .push-help-section + .push-help-section {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid var(--surface-divider-color, var(--border-color));
  }
  .push-help-section__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
  }
  .push-help-content h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .push-help__platform {
    width: 132px;
  }
  .push-help__hint {
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--desc-color);
  }
  .push-help__instruction {
    margin-top: 14px;
    padding: 14px 16px;
    background: var(--chip-neutral-bg);
    border: 1px solid var(--chip-neutral-border);
    border-radius: 10px;
    overflow-wrap: anywhere;
  }
</style>
