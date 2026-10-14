<template>
  <SettingsFieldRow :label="label" :description="description" :stacked="kind !== 'switch'">
    <template #feedback><SettingsSaveStatus :keys="[prefKey]" /></template>
    <BSwitch
      controlled
      v-if="kind === 'switch'"
      :checked="Boolean(value)"
      :disabled="disabled || pending(prefKey)"
      :aria-label="label"
      @change="save"
    />
    <BSelect
      v-else-if="kind === 'select'"
      class="settings-choice-select"
      :value="value"
      :options="selectOptions"
      :disabled="disabled || pending(prefKey)"
      :aria-label="label"
      @change="save"
    />
    <BRadio
      v-else
      variant="segment"
      :value="value"
      :options="selectOptions"
      :aria-label="label"
      :disabled="disabled || pending(prefKey)"
      @update:value="save"
    />
  </SettingsFieldRow>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useUserStore } from '@/store';
  import { updatePreference, usePreferenceSaveState, isGuestUser } from '@/utils/savePreference';
  import { recordOperation } from '@/api/commonApi';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BRadio from '@/components/base/BasicComponents/BRadio.vue';
  import SettingsFieldRow from './SettingsFieldRow.vue';
  import SettingsSaveStatus from './SettingsSaveStatus.vue';
  const props = withDefaults(
    defineProps<{
      prefKey: string;
      label: string;
      description?: string;
      kind?: 'switch' | 'select' | 'choice';
      defaultValue?: any;
      selectedValue?: any;
      options?: { v: string; label: string }[];
      disabled?: boolean;
    }>(),
    { kind: 'choice', options: () => [] },
  );
  const user = useUserStore();
  const { pending } = usePreferenceSaveState();
  const value = computed(
    () => props.selectedValue ?? (user.preferences as Record<string, any>)[props.prefKey] ?? props.defaultValue,
  );
  const selectOptions = computed(() => props.options.map((o) => ({ value: o.v, label: o.label })));
  async function save(next: any) {
    if (props.disabled || pending(props.prefKey) || next === value.value) return;
    try {
      await updatePreference({ [props.prefKey]: next });
      if (!isGuestUser()) void recordOperation({ module: '设置', operation: `修改偏好【${props.prefKey}=${next}】` });
    } catch {
      /* The shared state supplies the field error and retry; request layer owns toasts. */
    }
  }
</script>
<style scoped>
  .settings-choice-select {
    width: var(--ui-layout-180, 180px);
    max-width: 100%;
  }
</style>
