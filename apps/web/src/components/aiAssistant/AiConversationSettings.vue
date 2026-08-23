<template>
  <BPopover
    v-model:open="open"
    trigger="click"
    placement="top-left"
    overlay-class-name="ai-conversation-settings-popover"
  >
    <BButton
      class="ai-conversation-settings__trigger"
      :class="{ 'is-active': hasCustomSettings }"
      :aria-label="t('ai.capabilitySettings.open')"
      :title="t('ai.capabilitySettings.open')"
      :aria-expanded="open"
      aria-haspopup="dialog"
    >
      <SvgIcon :src="icon.settings.ai" size="15" aria-hidden="true" />
      <span v-if="hasCustomSettings" class="ai-conversation-settings__indicator" aria-hidden="true"></span>
    </BButton>
    <template #content>
      <section class="ai-conversation-settings" role="dialog" :aria-label="t('ai.capabilitySettings.title')">
        <header>
          <strong>{{ t('ai.capabilitySettings.title') }}</strong>
          <span>{{ t('ai.capabilitySettings.description') }}</span>
        </header>

        <div class="ai-conversation-settings__field">
          <div>
            <strong>{{ t('ai.capabilityPolicy.label') }}</strong>
            <small>{{ t('ai.capabilityPolicy.description') }}</small>
          </div>
          <BSelect
            v-model:value="capabilityPolicyValue"
            :options="capabilityPolicyOptions"
            :aria-label="t('ai.capabilityPolicy.label')"
          />
        </div>

        <p v-if="capabilityPolicyProfile === 'chat_only'" class="ai-conversation-settings__boundary">
          {{ t('ai.capabilityPolicy.noDataAccess') }}
        </p>

        <BButton
          v-if="capabilityPolicyProfile !== 'chat_only'"
          class="ai-conversation-settings__advanced-trigger"
          :aria-expanded="advancedOpen"
          @click="advancedOpen = !advancedOpen"
        >
          <span>
            <strong>{{ t('ai.capabilitySettings.advanced') }}</strong>
            <small>{{ t('ai.capabilitySettings.advancedDescription') }}</small>
          </span>
          <SvgIcon
            class="ai-conversation-settings__chevron"
            :class="{ 'is-open': advancedOpen }"
            :src="icon.noteTree.chevron"
            size="15"
            aria-hidden="true"
          />
        </BButton>

        <div
          v-if="capabilityPolicyProfile !== 'chat_only' && advancedOpen"
          class="ai-conversation-settings__field is-advanced"
        >
          <div>
            <strong>{{ t('ai.capabilityScope.label') }}</strong>
            <small>{{ t('ai.capabilityScope.description') }}</small>
          </div>
          <BSelect
            v-model:value="capabilityModuleValue"
            :options="capabilityModuleOptions"
            :aria-label="t('ai.capabilityScope.label')"
          />
        </div>
      </section>
    </template>
  </BPopover>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { BaseOptions } from '@/config/bookmarkCfg';
  import type { AiCapabilityModule } from '@/types/aiCapabilityScope';
  import type { AiCapabilityPolicyProfile } from '@/types/aiCapabilityPolicy';

  const props = withDefaults(
    defineProps<{
      capabilityModule?: AiCapabilityModule;
      capabilityModuleOptions?: BaseOptions[];
      capabilityPolicyProfile?: AiCapabilityPolicyProfile;
      capabilityPolicyOptions?: BaseOptions[];
    }>(),
    {
      capabilityModule: 'auto',
      capabilityModuleOptions: () => [],
      capabilityPolicyProfile: 'auto',
      capabilityPolicyOptions: () => [],
    },
  );
  const emit = defineEmits<{
    'update:capabilityModule': [value: AiCapabilityModule];
    'update:capabilityPolicyProfile': [value: AiCapabilityPolicyProfile];
  }>();
  const { t } = useI18n();
  const open = ref(false);
  const advancedOpen = ref(props.capabilityModule !== 'auto');
  const hasActiveTurnScope = computed(
    () => props.capabilityPolicyProfile !== 'chat_only' && props.capabilityModule !== 'auto',
  );
  const hasCustomSettings = computed(
    () => props.capabilityPolicyProfile !== 'auto' || hasActiveTurnScope.value,
  );
  const capabilityModuleValue = computed({
    get: () => props.capabilityModule || 'auto',
    set: (value: unknown) => emit('update:capabilityModule', String(value || 'auto') as AiCapabilityModule),
  });
  const capabilityPolicyValue = computed({
    get: () => props.capabilityPolicyProfile || 'auto',
    set: (value: unknown) =>
      emit('update:capabilityPolicyProfile', String(value || 'auto') as AiCapabilityPolicyProfile),
  });

  watch(
    () => props.capabilityModule,
    (value) => {
      if (value !== 'auto') advancedOpen.value = true;
    },
  );
  watch(
    () => props.capabilityPolicyProfile,
    (value) => {
      if (value === 'chat_only') advancedOpen.value = false;
    },
  );
</script>

<style scoped lang="less">
  .ai-conversation-settings__trigger {
    position: relative;
    display: grid;
    width: 28px;
    min-width: 28px;
    height: 28px;
    min-height: 28px;
    padding: 0;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--desc-color);
  }

  .ai-conversation-settings__trigger.is-active {
    border-color: var(--primary-color);
    background: var(--card-background);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    color: var(--primary-color);
  }

  .ai-conversation-settings__indicator {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 5px;
    height: 5px;
    border: 1px solid var(--card-background);
    border-radius: 50%;
    background: var(--primary-color);
  }

  @media (hover: hover) and (pointer: fine) {
    .ai-conversation-settings__trigger:hover {
      border-color: var(--surface-border-color);
      background: var(--hover-background);
      color: var(--text-color);
    }
  }

  html.light-note-mobile-rendering .ai-conversation-settings__trigger.is-active {
    border-color: var(--primary-color);
    background: var(--card-background);
    color: var(--primary-color);
  }
</style>

<style lang="less">
  .ai-conversation-settings-popover {
    width: min(310px, calc(100vw - 20px));
    padding: 12px;
  }

  .ai-conversation-settings {
    display: grid;
    gap: 12px;
    min-width: 0;
    color: var(--text-color);
  }

  .ai-conversation-settings > header,
  .ai-conversation-settings__field > div,
  .ai-conversation-settings__advanced-trigger > span {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .ai-conversation-settings > header strong {
    font-size: 14px;
    line-height: 20px;
  }

  .ai-conversation-settings > header span,
  .ai-conversation-settings__field small,
  .ai-conversation-settings__advanced-trigger small,
  .ai-conversation-settings__boundary {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
    line-height: 16px;
  }

  .ai-conversation-settings__field {
    display: grid;
    gap: 7px;
  }

  .ai-conversation-settings__field strong,
  .ai-conversation-settings__advanced-trigger strong {
    color: var(--text-color);
    font-size: 12px;
    line-height: 18px;
  }

  .ai-conversation-settings__field > .b-select,
  .ai-conversation-settings__field .select-trigger {
    width: 100%;
  }

  .ai-conversation-settings__field .select-trigger {
    min-height: 34px;
  }

  .ai-conversation-settings__boundary {
    margin: -5px 0 0;
    padding: 7px 8px;
    border: 1px solid var(--primary-color);
    border-radius: 8px;
    background: var(--card-background);
    background: color-mix(in srgb, var(--primary-color) 6%, var(--card-background));
    color: var(--primary-color);
  }

  .ai-conversation-settings__advanced-trigger {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18px;
    gap: 8px;
    width: 100%;
    height: auto;
    min-height: 42px;
    padding: 6px 8px;
    border: 1px solid var(--surface-divider-color);
    border-radius: 9px;
    background: var(--surface-panel-bg);
    text-align: left;
  }

  .ai-conversation-settings__chevron {
    transition: transform 0.16s ease;
  }

  .ai-conversation-settings__chevron.is-open {
    transform: rotate(180deg);
  }

  .ai-conversation-settings__field.is-advanced {
    padding: 0 2px 2px;
  }

  html.light-note-mobile-rendering .ai-conversation-settings__boundary {
    border-color: var(--primary-color);
    background: var(--card-background);
    color: var(--primary-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-conversation-settings__chevron {
      transition: none;
    }
  }
</style>
