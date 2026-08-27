<template>
  <div class="ln-extension-shell">
    <header class="ln-extension-header">
      <BButton
        v-if="view !== 'home' && view !== 'success'"
        class="ln-icon-button"
        :title="t('browserExtension.back')"
        @click="goHome"
      >
        <SvgIcon :src="icon.arrow_left" size="18" aria-hidden="true" />
      </BButton>
      <div v-else class="ln-extension-logo">
        <img :src="extensionLogoUrl" :alt="t('browserExtension.logoAlt')" />
      </div>
      <BButton
        v-if="!sessionLoading && !authenticated"
        class="ln-extension-header__title is-login-entry"
        :aria-label="t('browserExtension.login.headerAction')"
        @click="openAuth"
      >
        <strong>{{ headerTitle }}</strong>
        <span>{{ t('browserExtension.login.headerAction') }}</span>
      </BButton>
      <div v-else class="ln-extension-header__title">
        <strong>{{ headerTitle }}</strong>
        <span>{{ sessionLabel }}</span>
      </div>
      <BButton class="ln-icon-button" :title="t('browserExtension.toggleTheme')" @click="toggleTheme">
        <SvgIcon :src="theme === 'day' ? icon.navigation.moon : icon.navigation.sun" size="17" aria-hidden="true" />
      </BButton>
    </header>

    <main ref="mainRef" class="ln-extension-main">
      <section v-if="sessionLoading" class="ln-extension-centered">
        <BLoading :loading="true" inline :title="t('browserExtension.restoringSession')" />
      </section>

      <ExtensionHome
        v-else-if="view === 'home'"
        :authenticated="authenticated"
        :user-label="sessionLabel"
        @select="selectResource"
        @login="openAuth"
        @logout="logout"
      />
      <BookmarkCapture
        v-else-if="view === 'bookmark'"
        :authenticated="authenticated"
        :draft-session-id="draftSessionId"
        @auth-required="openAuth"
        @success="showSuccess"
      />
      <NoteCapture
        v-else-if="view === 'note'"
        :authenticated="authenticated"
        @auth-required="openAuth"
        @success="showSuccess"
      />
      <FileCapture
        v-else-if="view === 'file'"
        :authenticated="authenticated"
        @auth-required="openAuth"
        @success="showSuccess"
      />
      <ExtensionSuccessView v-else-if="view === 'success' && success" :result="success" @continue="goHome" />
    </main>

    <ExtensionLogin v-if="authVisible" @close="authVisible = false" @authenticated="handleAuthenticated" />
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { applyDocumentTheme } from '@/utils/theme';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import ExtensionHome from './components/ExtensionHome.vue';
  import BookmarkCapture from './components/BookmarkCapture.vue';
  import NoteCapture from './components/NoteCapture.vue';
  import FileCapture from './components/FileCapture.vue';
  import ExtensionLogin from './components/ExtensionLogin.vue';
  import ExtensionSuccessView from './components/ExtensionSuccessView.vue';
  import { logoutExtension, restoreExtensionSession } from './auth';
  import { saveExtensionTheme } from './storage';
  import type { ExtensionResourceType, ExtensionSession, ExtensionSuccess } from './types';

  type View = 'home' | ExtensionResourceType | 'success';
  const { t } = useI18n();
  const view = ref<View>('home');
  const session = ref<ExtensionSession | null>(null);
  const sessionLoading = ref(true);
  const authVisible = ref(false);
  const success = ref<ExtensionSuccess | null>(null);
  const draftSessionId = crypto.randomUUID();
  const mainRef = ref<HTMLElement | null>(null);
  const theme = ref<'day' | 'night'>(document.documentElement.getAttribute('data-theme') === 'night' ? 'night' : 'day');
  const extensionLogoUrl = chrome.runtime.getURL('icons/icon-32.png');

  const authenticated = computed(() => Boolean(session.value?.sid && session.value?.user?.id));
  const sessionLabel = computed(() => {
    if (!authenticated.value) return t('browserExtension.notSignedIn');
    return session.value?.user.alias || session.value?.user.email || t('browserExtension.signedIn');
  });
  const headerTitle = computed(() => {
    const key: Record<View, string> = {
      home: 'browserExtension.title',
      bookmark: 'browserExtension.bookmark.title',
      note: 'browserExtension.note.title',
      file: 'browserExtension.file.title',
      success: 'browserExtension.success.title',
    };
    return t(key[view.value]);
  });

  function selectResource(type: ExtensionResourceType) {
    success.value = null;
    view.value = type;
  }

  function goHome() {
    success.value = null;
    view.value = 'home';
  }

  function openAuth() {
    authVisible.value = true;
  }

  function handleAuthenticated(value: ExtensionSession) {
    session.value = value;
    authVisible.value = false;
    message.success(t('browserExtension.login.success'));
  }

  function showSuccess(value: ExtensionSuccess) {
    success.value = value;
    view.value = 'success';
  }

  async function logout() {
    await logoutExtension();
    session.value = null;
    message.success(t('browserExtension.login.loggedOut'));
  }

  async function toggleTheme() {
    theme.value = theme.value === 'day' ? 'night' : 'day';
    applyDocumentTheme(theme.value);
    await saveExtensionTheme(theme.value);
  }

  function handleAuthExpired() {
    session.value = null;
    authVisible.value = true;
    message.info(t('browserExtension.login.expired'));
  }

  watch(view, async () => {
    await nextTick();
    if (mainRef.value) mainRef.value.scrollTop = 0;
  });

  onMounted(async () => {
    window.addEventListener('light-note-extension-auth-expired', handleAuthExpired);
    session.value = await restoreExtensionSession();
    sessionLoading.value = false;
  });

  onBeforeUnmount(() => {
    window.removeEventListener('light-note-extension-auth-expired', handleAuthExpired);
  });
</script>
