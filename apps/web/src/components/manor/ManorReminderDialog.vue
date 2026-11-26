<template>
  <ManorSettingsDialog
    :open="open"
    :title="t('manor.reminders.title')"
    width="var(--ui-layout-560, 560px)"
    @close="emit('close')"
  >
    <ManorReminderPreferences appearance="game" />
    <template #footer="{ close }">
      <footer class="manor-reminder-dialog__footer">
        <p class="manor-reminder-dialog__schedule">
          <span>{{
            t(user.preferences.notifyManor === true ? 'manor.reminders.schedule' : 'manor.reminders.disabledNote')
          }}</span>
        </p>
        <p
          v-if="user.preferences.notifyManor === true && user.preferences.notificationsInApp === false"
          class="manor-reminder-dialog__channel-hint"
          role="status"
          >{{ t('manor.reminders.inAppOff') }}</p
        >
        <BButton class="manor-reminder-dialog__return" @click="close">{{ t('manor.reminders.return') }}</BButton>
        <p class="manor-reminder-dialog__sync">{{ t('manor.reminders.sync') }}</p>
      </footer>
    </template>
  </ManorSettingsDialog>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import ManorSettingsDialog from './ManorSettingsDialog.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import ManorReminderPreferences from './ManorReminderPreferences.vue';

  defineProps<{ open: boolean }>();
  const emit = defineEmits<{ close: [] }>();
  const { t } = useI18n();
  const user = useUserStore();
</script>

<style lang="less">
  .manor-reminder-dialog__footer {
    display: grid;
    justify-items: center;
    flex: none;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px) var(--ui-space-24, 24px) var(--ui-space-20, 20px);
    text-align: center;
  }
  .manor-reminder-dialog__schedule {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-12, 12px);
    width: 100%;
    margin: 0;
    color: #775b32;
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  .manor-reminder-dialog__schedule::before,
  .manor-reminder-dialog__schedule::after {
    content: '';
    flex: 1;
    /* ui-density-fixed: 游戏弹窗的装饰分隔线保持 1px 描边，不随密度增厚。 */
    height: 1px;
    background: #d9c28f;
  }
  .manor-settings-modal .manor-reminder-dialog__return.b_btn {
    width: var(--ui-layout-220, 220px);
    max-width: 100%;
    height: var(--ui-control-44, 44px);
    padding: 0 var(--ui-space-20, 20px);
    border: 2px solid #b69848;
    border-radius: var(--ui-layout-24, 24px);
    background: linear-gradient(#9ab94c, #6f8e28);
    box-shadow:
      inset 0 0 0 2px #e1d58e,
      0 var(--ui-space-3, 3px) #76843d;
    color: #fffced;
    font-size: var(--ui-font-18, 18px);
    font-weight: 700;
    line-height: 1.3;
    text-shadow: 0 1px #526725;
  }
  .manor-reminder-dialog__sync {
    margin: 0;
    color: #806238;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .manor-reminder-dialog__channel-hint {
    margin: 0;
    color: #934921;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  html.light-note-mobile-rendering {
    .manor-reminder-dialog__footer {
      padding-inline: var(--ui-space-16, 16px);
    }
    .manor-reminder-dialog__schedule::before,
    .manor-reminder-dialog__schedule::after {
      display: none;
    }
  }
</style>
