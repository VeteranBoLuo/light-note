<template>
  <main class="extension-auth-page">
    <section class="extension-auth-card" aria-labelledby="extension-auth-title">
      <header class="extension-auth-brand">
        <img :src="logoUrl" :alt="t('extensionAuthorize.logoAlt')" />
        <div>
          <span>LIGHT NOTE</span>
          <strong id="extension-auth-title">{{ t('extensionAuthorize.title') }}</strong>
        </div>
      </header>

      <BLoading
        v-if="loadingIdentity"
        :loading="true"
        inline
        class="extension-auth-loading"
        :title="t('extensionAuthorize.loading')"
      />

      <div v-else-if="!requestValid" class="extension-auth-state" role="alert">
        <SvgIcon :src="icon.message.warning" size="32" aria-hidden="true" />
        <h2>{{ t('extensionAuthorize.invalidTitle') }}</h2>
        <p>{{ t('extensionAuthorize.invalidDescription') }}</p>
      </div>

      <template v-else>
        <div class="extension-auth-intro">
          <span class="extension-auth-shield" aria-hidden="true">
            <SvgIcon :src="icon.settings.privacy" size="28" />
          </span>
          <div>
            <h2>{{ t('extensionAuthorize.requestTitle') }}</h2>
            <p>{{ t('extensionAuthorize.requestDescription') }}</p>
          </div>
        </div>

        <ul class="extension-auth-permissions">
          <li>
            <SvgIcon :src="icon.resource.bookmark" size="19" aria-hidden="true" />
            <span>{{ t('extensionAuthorize.permissionBookmark') }}</span>
          </li>
          <li>
            <SvgIcon :src="icon.resource.note" size="19" aria-hidden="true" />
            <span>{{ t('extensionAuthorize.permissionNote') }}</span>
          </li>
          <li>
            <SvgIcon :src="icon.resource.file" size="19" aria-hidden="true" />
            <span>{{ t('extensionAuthorize.permissionFile') }}</span>
          </li>
        </ul>

        <div v-if="isLoggedIn" class="extension-auth-account" role="status">
          <span class="extension-auth-account__dot" aria-hidden="true"></span>
          <span>{{ t('extensionAuthorize.signedInAs', { name: accountName }) }}</span>
        </div>
        <div v-else class="extension-auth-account extension-auth-account--signed-out" role="status">
          <span class="extension-auth-account__dot" aria-hidden="true"></span>
          <span>{{ t('extensionAuthorize.needLogin') }}</span>
        </div>

        <p v-if="errorMessage" class="extension-auth-error" role="alert">{{ errorMessage }}</p>

        <div class="extension-auth-actions">
          <BButton v-if="isLoggedIn" type="primary" block :loading="authorizing" @click="authorize">
            {{ t('extensionAuthorize.authorize') }}
          </BButton>
          <BButton v-else type="primary" block @click="openLogin">
            {{ t('extensionAuthorize.login') }}
          </BButton>
          <BButton block :disabled="authorizing" @click="cancel">{{ t('extensionAuthorize.cancel') }}</BButton>
        </div>

        <p class="extension-auth-footnote">{{ t('extensionAuthorize.footnote') }}</p>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import { apiBaseGet, apiBasePost } from '@/http/request.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { RoleEnum } from '@/config/bookmarkCfg.ts';
  import { rememberExtensionAuthReturnPath } from '@/utils/extensionAuthReturn.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const { t } = useI18n();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const loadingIdentity = ref(true);
  const authorizing = ref(false);
  const errorMessage = ref('');
  const logoUrl = '/icon-192.png';

  function queryText(name: string): string {
    const value = route.query[name];
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  const authorizationRequest = computed(() => ({
    clientId: queryText('client_id'),
    redirectUri: queryText('redirect_uri'),
    state: queryText('state'),
    codeChallenge: queryText('code_challenge'),
    codeChallengeMethod: queryText('code_challenge_method'),
    deviceDigest: queryText('device_digest'),
  }));
  const requestValid = computed(() => Object.values(authorizationRequest.value).every(Boolean));
  const isLoggedIn = computed(() => Boolean(user.id && user.role !== RoleEnum.VISITOR));
  const accountName = computed(() => user.alias || user.email || t('extensionAuthorize.accountFallback'));

  function currentReturnPath(): string {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function openLogin() {
    errorMessage.value = '';
    rememberExtensionAuthReturnPath(currentReturnPath());
    bookmark.openAuthModal('登录', 'browser_extension');
  }

  async function authorize() {
    if (!requestValid.value || !isLoggedIn.value || authorizing.value) return;
    authorizing.value = true;
    errorMessage.value = '';
    try {
      const response = await apiBasePost('/api/user/extension/authorize', authorizationRequest.value, {
        silent: true,
      });
      const redirectUrl = String(response?.data?.redirectUrl || '');
      if (response?.status !== 200 || !redirectUrl) {
        errorMessage.value = response?.msg || t('extensionAuthorize.failed');
        if (response?.status === 401 || response?.status === 'visitor') openLogin();
        return;
      }
      window.location.assign(redirectUrl);
    } catch (error: any) {
      errorMessage.value = error?.message || t('extensionAuthorize.failed');
    } finally {
      authorizing.value = false;
    }
  }

  function cancel() {
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.location.assign('/');
    }, 80);
  }

  onMounted(async () => {
    try {
      const response = await apiBaseGet('/api/user/me', undefined, {
        silent: true,
        suppressAuthExpired: true,
      });
      if (response?.data) user.setUserInfo(response.data);
    } catch {
      errorMessage.value = t('extensionAuthorize.identityFailed');
    } finally {
      loadingIdentity.value = false;
    }
  });
</script>

<style scoped lang="less">
  .extension-auth-page {
    box-sizing: border-box;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 32px 20px;
    color: var(--text-color);
    background:
      radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--primary-color) 12%, transparent), transparent 34%),
      var(--surface-page-bg);
  }

  .extension-auth-card {
    width: min(100%, 480px);
    box-sizing: border-box;
    padding: 28px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--surface-raised-background);
    box-shadow: var(--surface-raised-shadow);
  }

  .extension-auth-brand {
    display: flex;
    align-items: center;
    gap: 13px;
    padding-bottom: 22px;
    border-bottom: 1px solid var(--surface-divider-color);

    img {
      width: 44px;
      height: 44px;
      border-radius: 12px;
    }

    div {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    span {
      color: var(--desc-color);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.16em;
    }

    strong {
      font-size: 19px;
      line-height: 1.35;
    }
  }

  .extension-auth-loading {
    min-height: 230px;
    justify-content: center;
  }

  .extension-auth-state {
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--warning-color, #b86b00);

    h2 {
      margin: 16px 0 8px;
      color: var(--text-color);
      font-size: 19px;
    }

    p {
      max-width: 330px;
      margin: 0;
      color: var(--desc-color);
      line-height: 1.65;
    }
  }

  .extension-auth-intro {
    display: flex;
    gap: 14px;
    margin-top: 24px;

    h2 {
      margin: 0 0 7px;
      font-size: 18px;
    }

    p {
      margin: 0;
      color: var(--desc-color);
      font-size: 13px;
      line-height: 1.65;
    }
  }

  .extension-auth-shield {
    flex: 0 0 44px;
    height: 44px;
    display: grid;
    place-items: center;
    color: var(--primary-color);
    border: 1px solid color-mix(in srgb, var(--primary-color) 35%, var(--surface-border-color));
    border-radius: 13px;
    background: color-mix(in srgb, var(--primary-color) 10%, var(--surface-card-bg));
  }

  .extension-auth-permissions {
    margin: 20px 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 9px;

    li {
      display: flex;
      align-items: center;
      gap: 11px;
      min-height: 42px;
      padding: 0 13px;
      border: 1px solid var(--surface-border-color);
      border-radius: 10px;
      background: var(--surface-card-bg);
      font-size: 13px;
    }

    li:nth-child(1) { color: var(--resource-bookmark-color); }
    li:nth-child(2) { color: var(--resource-note-color); }
    li:nth-child(3) { color: var(--resource-file-color); }

    li span { color: var(--text-color); }
  }

  .extension-auth-account {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 38px;
    box-sizing: border-box;
    padding: 8px 12px;
    color: var(--success-color, #287a4b);
    border: 1px solid currentColor;
    border-radius: 9px;
    font-size: 13px;

    &--signed-out { color: var(--desc-color); }

    &__dot {
      width: 8px;
      height: 8px;
      flex: 0 0 8px;
      border-radius: 50%;
      background: currentColor;
    }
  }

  .extension-auth-error {
    margin: 12px 0 0;
    color: var(--error-color, #c53c4b);
    font-size: 13px;
    line-height: 1.5;
  }

  .extension-auth-actions {
    display: grid;
    gap: 9px;
    margin-top: 18px;

    :deep(.b_btn) { min-height: 38px; }
  }

  .extension-auth-footnote {
    margin: 17px 0 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
    text-align: center;
  }

  @media (max-width: 520px) {
    .extension-auth-page { padding: 16px 12px; }
    .extension-auth-card { padding: 22px 18px; border-radius: 15px; }
  }
</style>
