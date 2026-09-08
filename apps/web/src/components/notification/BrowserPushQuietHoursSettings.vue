<template>
  <div v-if="browserPushDesktop" class="browser-push-quiet-hours">
    <div class="quiet-hours-row">
      <div class="quiet-hours-copy"
        ><strong
          >{{ t('settings.notificationsDnd') }}
          <BChip tone="neutral">{{ t('settingsRefine.push.account') }}</BChip></strong
        ><p>{{ t(enabled ? 'settingsRefine.dnd.desc' : 'settingsRefine.dnd.off') }}</p></div
      >
      <BSwitch controlled
        :disabled="restricted || saving"
        :checked="enabled"
        :aria-label="t('settings.notificationsDnd')"
        @change="setDnd"
      />
    </div>
    <div v-if="enabled" class="quiet-hours-schedule"
      ><span>{{ start }} — {{ end }}</span
      ><span v-if="end < start">{{ t('settingsRefine.dnd.nextDay') }}</span
      ><span>{{ t('settingsRefine.dnd.timezone', { zone: timeZone }) }}</span
      ><BButton size="small" :disabled="restricted || saving" @click="edit">{{
        t('settingsRefine.dnd.edit')
      }}</BButton></div
    >
    <p v-if="enabled && start === end" class="quiet-hours-warning">{{ t('settingsRefine.dnd.equal') }}</p>
    <SettingsSaveStatus :keys="keys" />
    <BModal v-model:visible="editing" :title="t('settingsRefine.dnd.title')" width="440px" :close-disabled="saving">
      <div class="quiet-hours-editor">
        <label
          >{{ t('settings.notificationsDndStart')
          }}<BTimePicker
            v-model:value="draftStart"
            :disabled="saving"
            :aria-label="t('settings.notificationsDndStart')"
        /></label>
        <label
          >{{ t('settings.notificationsDndEnd')
          }}<BTimePicker v-model:value="draftEnd" :disabled="saving" :aria-label="t('settings.notificationsDndEnd')"
        /></label>
      </div>
      <p>{{ t('settingsRefine.dnd.desc') }}</p>
      <p v-if="invalid" class="quiet-hours-warning" role="alert">{{ t('settingsRefine.dnd.invalid') }}</p>
      <template #footer
        ><div class="quiet-hours-footer"
          ><BButton :disabled="saving" @click="editing = false">{{ t('common.cancel') }}</BButton
          ><BButton type="primary" :loading="saving" :disabled="restricted" @click="confirm">{{
            t('settingsRefine.dnd.save')
          }}</BButton></div
        ></template
      >
    </BModal>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { updatePreference, usePreferenceSaveState } from '@/utils/savePreference';
  import { useBrowserPushDesktop } from '@/utils/browserPushPlatform';
  import { isAdminLoginPreview } from '@/utils/authStorage';
  import BTimePicker from '@/components/base/BasicComponents/BTimePicker.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SettingsSaveStatus from '@/view/settings/components/SettingsSaveStatus.vue';
  const { t } = useI18n();
  const user = useUserStore(),
    browserPushDesktop = useBrowserPushDesktop();
  const keys = ['notificationsDnd', 'notificationsDndStart', 'notificationsDndEnd', 'notificationsTimezoneOffset'];
  const { pending } = usePreferenceSaveState();
  const saving = computed(() => keys.some(pending));
  const restricted = computed(
    () => !user.id || user.role === 'visitor' || Boolean(user.adminContext) || isAdminLoginPreview(),
  );
  const enabled = computed(() => user.preferences.notificationsDnd === true);
  const start = computed(() => user.preferences.notificationsDndStart || '22:00'),
    end = computed(() => user.preferences.notificationsDndEnd || '08:00');
  const timeZone = computed(() => {
    const minutes = -(user.preferences.notificationsTimezoneOffset ?? new Date().getTimezoneOffset());
    return `UTC${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
  });
  const editing = ref(false),
    invalid = ref(false),
    draftStart = ref('22:00'),
    draftEnd = ref('08:00');
  function edit() {
    if (restricted.value || saving.value) return;
    draftStart.value = start.value;
    draftEnd.value = end.value;
    invalid.value = false;
    editing.value = true;
  }
  async function setDnd(next: boolean) {
    if (restricted.value || saving.value) return;
    if (next) {
      edit();
      return;
    }
    try {
      await updatePreference({ notificationsDnd: false });
    } catch {
      /* field status owns failure */
    }
  }
  async function confirm() {
    if (restricted.value || saving.value) return;
    const valid = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    invalid.value = !valid(draftStart.value) || !valid(draftEnd.value) || draftStart.value === draftEnd.value;
    if (invalid.value) return;
    try {
      await updatePreference({
        notificationsDnd: true,
        notificationsDndStart: draftStart.value,
        notificationsDndEnd: draftEnd.value,
        notificationsTimezoneOffset: new Date().getTimezoneOffset(),
      });
      editing.value = false;
    } catch {
      editing.value = false;
    }
  }
  watch(
    () => [user.id, user.adminContext?.id, browserPushDesktop.value],
    () => {
      editing.value = false;
      invalid.value = false;
    },
  );
</script>
<style scoped>
  .browser-push-quiet-hours {
    border-top: 1px solid var(--surface-divider-color, var(--border-color));
    margin-top: 18px;
    padding-top: 16px;
  }
  .quiet-hours-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
  }
  .quiet-hours-copy {
    min-width: 0;
  }
  .quiet-hours-copy strong {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    font-size: 13px;
  }
  p {
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.7;
  }
  .quiet-hours-schedule {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    color: var(--desc-color);
    padding: 10px 0;
  }
  .quiet-hours-editor {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }
  .quiet-hours-editor label {
    display: grid;
    gap: 8px;
    flex: 1;
    min-width: 120px;
  }
  .quiet-hours-warning {
    color: var(--error-color);
  }
  .quiet-hours-footer {
    display: flex;
    justify-content: flex-end;
    padding: 12px 20px 18px;
    gap: 8px;
  }
</style>
