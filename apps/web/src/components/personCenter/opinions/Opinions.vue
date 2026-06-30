<template>
  <b-modal
    :mask-closable="false"
    :show-footer="false"
    :title="t('personCenter.feedback')"
    width="760px"
    height="680px"
    top="50%"
    v-model:visible="visible"
    @close="visible = false"
  >
    <OpinionPanel @submitted="visible = false" @replyViewed="user.unreadOpinionReplyTotal = 0" />
  </b-modal>
</template>

<script setup lang="ts">
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import OpinionPanel from '@/components/personCenter/opinions/OpinionPanel.vue';
  import { type Ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';

  const { t } = useI18n();
  const visible = <Ref<boolean>>defineModel('visible');
  const user = useUserStore();
</script>
