<template>
  <BModal
    :visible="open"
    :title="t('manor.reminders.title')"
    width="var(--ui-layout-560, 560px)"
    modal-class="manor-reminder-modal"
    mask-class="manor-reminder-mask"
    @close="emit('close')"
  >
    <template #title>
      <span class="manor-reminder-dialog__title">
        <span class="manor-reminder-dialog__leaves is-left" aria-hidden="true"></span>
        {{ t('manor.reminders.title') }}
        <span class="manor-reminder-dialog__leaves is-right" aria-hidden="true"></span>
      </span>
    </template>
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
  </BModal>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import ManorReminderPreferences from './ManorReminderPreferences.vue';

  defineProps<{ open: boolean }>();
  const emit = defineEmits<{ close: [] }>();
  const { t } = useI18n();
  const user = useUserStore();
</script>

<style lang="less">
  // BModal teleports its surfaces; every selector belongs to this manor dialog.
  .manor-reminder-mask {
    background: rgba(37, 45, 25, 0.48);
    backdrop-filter: blur(var(--ui-space-6, 6px));
  }
  .manor-reminder-mask .modal-view.manor-reminder-modal {
    --text-color: #634929;
    --desc-color: #806238;
    --primary-color: #65842e;
    min-width: 0;
    max-width: calc(100% - var(--ui-space-40, 40px));
    max-height: calc(100% - var(--ui-space-40, 40px));
    border: var(--ui-space-3, 3px) solid #cfb378;
    border-radius: var(--ui-layout-24, 24px);
    background: linear-gradient(135deg, #fffaf0, #f5ebd5);
    box-shadow:
      inset 0 0 0 var(--ui-space-3, 3px) #fff9e8,
      0 var(--ui-space-6, 6px) 0 #9e7d48,
      0 var(--ui-space-16, 16px) var(--ui-space-40, 40px) #241b133d;
  }
  .manor-reminder-modal .modal-header {
    justify-content: center;
    padding: var(--ui-space-24, 24px) var(--ui-space-28, 28px) var(--ui-space-16, 16px);
    border-bottom: 0;
  }
  .manor-reminder-modal .modal-title {
    max-width: 100%;
    text-align: center;
  }
  .manor-reminder-dialog__title {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--ui-control-44, 44px);
    box-sizing: border-box;
    padding: var(--ui-space-6, 6px) var(--ui-space-32, 32px);
    border: 2px solid #c8a35a;
    border-radius: var(--ui-space-9, 9px);
    background: repeating-linear-gradient(
      1deg,
      #657e36 0,
      #657e36 var(--ui-space-5, 5px),
      #6c883c var(--ui-space-6, 6px),
      #739244 var(--ui-space-14, 14px)
    );
    box-shadow:
      inset 0 2px #afc96c,
      0 var(--ui-space-3, 3px) #486329;
    color: #fff9e1;
    font-size: var(--ui-font-22, 22px);
    font-weight: 700;
    line-height: 1.35;
    text-shadow: 0 2px #3e5225;
  }
  .manor-reminder-dialog__leaves {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: var(--ui-layout-54, 54px);
    height: var(--ui-layout-54, 54px);
    pointer-events: none;
    // Existing decorative illustration atlas; percentages crop its native pixels.
    background-image: url('/manor/knowledge-garden-v19/farm/game-ui-r53.webp');
    background-repeat: no-repeat;
  }
  .manor-reminder-dialog__leaves.is-left {
    left: calc(-1 * var(--ui-space-19, 19px));
    background-size: 647.4453% 323.7226%;
    background-position: 79.6% 99.6737%;
  }
  .manor-reminder-dialog__leaves.is-right {
    right: calc(-1 * var(--ui-space-19, 19px));
    background-size: 645.0909% 322.5455%;
    background-position: 99.3329% 100%;
  }
  .manor-reminder-modal .modal-close.b_btn {
    position: absolute;
    top: calc(-1 * var(--ui-space-12, 12px));
    right: calc(-1 * var(--ui-space-12, 12px));
    z-index: 1;
    width: var(--ui-control-44, 44px);
    height: var(--ui-control-44, 44px);
    padding: 0;
    border: 2px solid #fff4d8;
    border-radius: 50%;
    background: linear-gradient(#f3a56b, #d66d40);
    color: #fff9e8;
    box-shadow:
      0 0 0 2px #ba8351,
      0 var(--ui-space-3, 3px) #8e633c;
  }
  .manor-reminder-modal .modal-content {
    padding: var(--ui-space-8, 8px) var(--ui-space-24, 24px) var(--ui-space-12, 12px);
    overflow-x: hidden;
    overscroll-behavior: contain;
  }
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
  .manor-reminder-modal .manor-reminder-dialog__return.b_btn {
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
    .manor-reminder-modal .modal-header {
      padding: var(--ui-space-22, 22px) var(--ui-space-24, 24px) var(--ui-space-12, 12px);
    }
    .manor-reminder-modal .modal-content {
      padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px) var(--ui-space-10, 10px);
    }
    .manor-reminder-dialog__footer {
      padding-inline: var(--ui-space-16, 16px);
    }
    .manor-reminder-dialog__schedule::before,
    .manor-reminder-dialog__schedule::after {
      display: none;
    }
  }
</style>
