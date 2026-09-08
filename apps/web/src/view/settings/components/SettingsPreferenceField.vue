<template>
  <SettingsFieldRow :label="label" :description="description" :stacked="kind !== 'switch'">
    <template #feedback><SettingsSaveStatus :keys="[prefKey]" /></template>
    <BSwitch controlled
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
    <div v-else class="settings-choices" role="group" :aria-label="label">
      <BButton
        v-for="option in options"
        :key="option.v"
        :type="value === option.v ? 'primary' : undefined"
        :aria-pressed="value === option.v"
        :disabled="disabled || pending(prefKey)"
        @click="save(option.v)"
        >{{ option.label }}</BButton
      >
    </div>
  </SettingsFieldRow>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useUserStore } from '@/store';
  import { updatePreference, usePreferenceSaveState, isGuestUser } from '@/utils/savePreference';
  import { recordOperation } from '@/api/commonApi';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
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
  .settings-choices {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .settings-choice-select {
    width: 180px;
    max-width: 100%;
  }
  .settings-choices .b_btn {
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
  }
  .settings-choices .default_btn {
    background: var(--card-background);
    color: var(--text-color);
  }
  .settings-choices .primary_btn {
    border-color: var(--primary-color);
    background: var(--primary-color);
  }
</style>
