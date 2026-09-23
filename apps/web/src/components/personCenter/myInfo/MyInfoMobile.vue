<template>
  <CommonContainer :title="t('myInfo.title')" @backClick="form?.requestClose()">
    <div class="mobile-profile-editor"
      ><ProfileEditorForm ref="form" @close="leave" @saved="saved" @navigate="navigate"
    /></div>
  </CommonContainer>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import { useRouter, onBeforeRouteLeave } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import ProfileEditorForm from './ProfileEditorForm.vue';
  const form = ref<InstanceType<typeof ProfileEditorForm>>();
  const { t } = useI18n();
  const router = useRouter();
  let leaving = false;
  let resolveLeave: ((value: boolean) => void) | null = null;
  function navigate(path: string) {
    leaving = true;
    void router.push(path);
  }
  function saved() {
    window.dispatchEvent(new CustomEvent('light-note:profile-saved'));
  }
  function leave() {
    leaving = true;
    if (resolveLeave) {
      resolveLeave(true);
      resolveLeave = null;
    } else router.back();
  }
  onBeforeRouteLeave(() => {
    if (leaving || !form.value?.dirty) return true;
    if (form.value?.saving) return false;
    return new Promise<boolean>((resolve) => {
      resolveLeave = resolve;
      form.value?.requestClose(() => {
        resolveLeave = null;
        resolve(false);
      });
    });
  });
</script>
<style scoped>
  .mobile-profile-editor {
    padding: var(--ui-space-24, 24px) var(--ui-space-20, 20px);
    padding-bottom: calc(var(--ui-space-24, 24px) + env(safe-area-inset-bottom));
  }
</style>
