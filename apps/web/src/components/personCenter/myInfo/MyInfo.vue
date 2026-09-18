<template>
  <BModal
    v-if="visible"
    :visible="true"
    width="min(560px, 94vw)"
    :title="t('myInfo.title')"
    :mask-closable="false"
    :show-footer="false"
    :close-disabled="form?.saving"
    @close="form?.requestClose()"
  >
    <ProfileEditorForm ref="form" @close="visible = false" @saved="saved" @navigate="navigate" />
  </BModal>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import ProfileEditorForm from './ProfileEditorForm.vue';
  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{ saved: [] }>();
  const form = ref<InstanceType<typeof ProfileEditorForm>>();
  const { t } = useI18n();
  const router = useRouter();
  function navigate(path: string) {
    visible.value = false;
    void router.push(path);
  }
  function saved() {
    emit('saved');
    window.dispatchEvent(new CustomEvent('light-note:profile-saved'));
  }
</script>
