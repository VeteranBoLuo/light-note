<template>
  <div
    class="ln-extension-overlay"
    role="presentation"
    @click.self="emit('close')"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <section class="ln-extension-login" role="dialog" aria-modal="true" :aria-label="t('browserExtension.login.title')">
      <header>
        <div>
          <span>{{ t('browserExtension.login.eyebrow') }}</span>
          <h2>{{ t('browserExtension.login.title') }}</h2>
        </div>
        <BButton class="ln-icon-button" :title="t('common.close')" @click="emit('close')">
          <SvgIcon :src="icon.common.close" size="17" aria-hidden="true" />
        </BButton>
      </header>
      <p>{{ t('browserExtension.login.description') }}</p>

      <form @submit.prevent="loginWithEmail">
        <label for="extension-email">{{ t('auth.email') }}</label>
        <BInput
          id="extension-email"
          v-model:value="email"
          type="email"
          autocomplete="username"
          :placeholder="t('auth.emailPlaceholder')"
        />
        <label for="extension-password">{{ t('auth.password') }}</label>
        <BInput
          id="extension-password"
          v-model:value="password"
          type="password"
          autocomplete="current-password"
          :placeholder="t('auth.passwordPlaceholder')"
        />
        <p v-if="errorMessage" class="ln-extension-inline-error" role="alert">{{ errorMessage }}</p>
        <BButton native-type="submit" type="primary" block :loading="emailLoading">
          {{ t('browserExtension.login.emailAction') }}
        </BButton>
      </form>

      <div class="ln-extension-login__divider"><span>{{ t('browserExtension.login.or') }}</span></div>
      <BButton block :loading="websiteLoading" @click="loginThroughWebsite">
        <SvgIcon :src="icon.github" size="17" aria-hidden="true" />
        {{ t('browserExtension.login.websiteAction') }}
      </BButton>
      <small>{{ t('browserExtension.login.websiteHint') }}</small>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { loginExtensionThroughWebsite, loginExtensionWithEmail } from '../auth';
  import type { ExtensionSession } from '../types';

  const emit = defineEmits<{ close: []; authenticated: [session: ExtensionSession] }>();
  const { t } = useI18n();
  const email = ref('');
  const password = ref('');
  const emailLoading = ref(false);
  const websiteLoading = ref(false);
  const errorMessage = ref('');

  async function loginWithEmail() {
    if (emailLoading.value) return;
    if (!email.value.trim() || !password.value) {
      errorMessage.value = t('browserExtension.login.required');
      return;
    }
    emailLoading.value = true;
    errorMessage.value = '';
    try {
      emit('authenticated', await loginExtensionWithEmail(email.value, password.value));
      password.value = '';
    } catch (error: any) {
      errorMessage.value = error?.message || t('browserExtension.login.failed');
    } finally {
      emailLoading.value = false;
    }
  }

  async function loginThroughWebsite() {
    if (websiteLoading.value) return;
    websiteLoading.value = true;
    errorMessage.value = '';
    try {
      emit('authenticated', await loginExtensionThroughWebsite());
    } catch (error: any) {
      errorMessage.value = error?.message || t('browserExtension.login.failed');
    } finally {
      websiteLoading.value = false;
    }
  }
</script>
