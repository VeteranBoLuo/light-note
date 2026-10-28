<template>
  <section class="collection-card collection-stack collection-participation">
    <h3>{{ t('collectionForms.participation') }}</h3>
    <div class="participation-switch">
      <div
        ><strong id="collection-members-label">{{ t('collectionForms.membersOnly') }}</strong
        ><p class="collection-muted">{{ t('collectionForms.membersOnlyHint') }}</p></div
      >
      <BSwitch
        :checked="Boolean(model.membersOnly)"
        :disabled="locked || Boolean(model.reward)"
        aria-labelledby="collection-members-label"
        @update:checked="model.membersOnly = $event"
      />
    </div>
    <div class="participation-switch">
      <div
        ><strong id="collection-reward-label">{{ t('collectionForms.autoReward') }}</strong
        ><p class="collection-muted">{{
          t(
            model.reward?.maxRecipients === null
              ? 'collectionForms.unlimitedRewardHint'
              : 'collectionForms.autoRewardHint',
          )
        }}</p></div
      >
      <BSwitch
        :checked="Boolean(model.reward)"
        :disabled="locked"
        aria-labelledby="collection-reward-label"
        @update:checked="setReward"
      />
    </div>
    <div v-if="model.reward" class="participation-fields">
      <label
        >{{ t('collectionForms.rewardPoints')
        }}<BInput
          type="number"
          :value="model.reward.points || ''"
          :min="1"
          :max="FORM_LIMITS.rewardPoints"
          :step="1"
          :disabled="locked"
          @update:value="model.reward.points = Number($event)"
      /></label>
      <label v-if="model.reward.maxRecipients !== null"
        >{{ t('collectionForms.rewardRecipients')
        }}<BInput
          type="number"
          :value="model.reward.maxRecipients || ''"
          :min="1"
          :max="FORM_LIMITS.rewardRecipients"
          :step="1"
          :disabled="locked"
          @update:value="model.reward.maxRecipients = Number($event)"
      /></label>
      <p v-if="model.reward.maxRecipients !== null" class="collection-muted participation-wide">{{
        t('collectionForms.rewardBudget', { points: model.reward.points * model.reward.maxRecipients })
      }}</p>
    </div>
    <p v-if="summary" class="collection-muted">{{
      t('collectionForms.rewardSummary', { count: summary.recipients, points: summary.totalPoints })
    }}</p>
    <p class="collection-muted">{{ t('collectionForms.participationLocked') }}</p>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { FORM_LIMITS, type FormDefinition } from '@lightnote/shared/collection-forms';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  const { t } = useI18n();
  const model = defineModel<FormDefinition>({ required: true });
  defineProps<{ locked: boolean; summary?: { recipients: number; totalPoints: number } }>();
  function setReward(enabled: boolean) {
    model.value.reward = enabled ? { points: 0, maxRecipients: 0 } : null;
    if (enabled) model.value.membersOnly = true;
  }
</script>

<style scoped>
  .collection-participation h3,
  .collection-participation p {
    margin: 0;
  }
  .participation-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
  }
  .participation-switch > div {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-4, 4px);
  }
  .participation-switch :deep(.b-switch) {
    flex-shrink: 0;
    min-width: var(--ui-control-44, 44px);
    min-height: var(--ui-control-44, 44px);
    justify-content: center;
  }
  .participation-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .participation-fields label {
    display: grid;
    min-width: 0;
    gap: var(--ui-space-8, 8px);
  }
  .participation-wide {
    grid-column: 1 / -1;
  }
</style>
