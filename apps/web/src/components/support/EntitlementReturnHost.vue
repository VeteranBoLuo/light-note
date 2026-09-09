<template>
  <BModal
    v-if="task"
    v-model:visible="visible"
    :title="t('entitlementJourney.returnTask')"
    :show-footer="false"
    fullscreen-mobile
    width="min(720px, 94vw)"
  >
    <p>{{ t('entitlementJourney.returnHint') }}</p>
    <BLoading v-if="checking" inline loading />
    <template v-else-if="invalid">
      <p role="alert">{{ t('entitlementJourney.invalid') }}</p>
      <BButton @click="checkMaterials">{{ t('common.retry') }}</BButton>
    </template>
    <AiSkillPanel
      v-else
      :title="task.title || t('entitlementJourney.returnTask')"
      :skill-id="task.skillId"
      :surface="task.surface"
      :resource-refs="task.resourceRefs"
      :scope-selector="task.scopeSelector"
      :initial-input="task.input"
      :show-prompt="Boolean(task.promptKey)"
      :prompt-key="task.promptKey || 'question'"
      :initial-prompt="String(task.input[task.promptKey || 'question'] || '')"
      :actions="[{ id: 'resume', label: t('aiSkills.continue'), promptKey: task.promptKey }]"
      :show-grounding="task.showGrounding ?? true"
      :show-result-actions="false"
    />
  </BModal>
</template>
<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { readEntitlementJourney, finishEntitlementReturn, type EntitlementJourney } from '@/utils/entitlementJourney';
  import { previewSearchBatchSelection, type BatchResourceItem } from '@/api/search';
  import AiSkillPanel from '@/components/aiSkills/AiSkillPanel.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  const { t } = useI18n();
  const route = useRoute();
  const user = useUserStore();
  const visible = ref(false),
    checking = ref(false),
    invalid = ref(false);
  const task = ref<EntitlementJourney['task']>();
  let sequence = 0;
  async function checkMaterials() {
    const ticket = ++sequence;
    checking.value = true;
    invalid.value = false;
    try {
      const refs = task.value?.resourceRefs || [];
      const items = refs
        .filter((ref) => ['bookmark', 'note', 'file'].includes(ref.type))
        .map((ref) => ({ type: ref.type, id: ref.id })) as BatchResourceItem[];
      if (items.length) {
        const response = await previewSearchBatchSelection({ mode: 'explicit', items });
        if (ticket !== sequence) return;
        invalid.value =
          response.status !== 200 ||
          !Array.isArray(response.data?.unavailableItems) ||
          response.data.unavailableItems.length > 0;
      }
    } catch {
      if (ticket === sequence) invalid.value = true;
    } finally {
      if (ticket === sequence) checking.value = false;
    }
  }
  watch(
    [() => user.id, () => route.fullPath],
    () => {
      ++sequence;
      visible.value = false;
      task.value = undefined;
      const journey = readEntitlementJourney(user.id);
      if (!journey?.returning || !journey.task || journey.returnPath !== route.fullPath) return;
      task.value = journey.task;
      visible.value = true;
      finishEntitlementReturn(user.id);
      void checkMaterials();
    },
    { immediate: true },
  );
</script>
