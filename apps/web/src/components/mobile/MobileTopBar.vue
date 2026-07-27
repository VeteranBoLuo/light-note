<template>
  <header class="mobile-top-bar">
    <BButton
      class="mobile-top-bar__brand"
      :aria-label="t('mobileNavigation.backToResources')"
      :title="t('mobileNavigation.backToResources')"
      @click="goToResources"
      v-click-log="{ module: '移动端导航', operation: '返回资料首页' }"
    >
      <img src="/favicon.svg?v=7" width="25" height="25" alt="" />
      <span>{{ t('navigation.title') }}</span>
    </BButton>

    <div v-if="showSearch" class="mobile-top-bar__search">
      <BInput
        id="mobile-top-search-input"
        v-model:value="searchValue"
        :placeholder="searchLabel"
        height="34px"
        clearable
        @enter="submitSearch"
      >
        <template #prefix>
          <SvgIcon :src="icon.navigation.search" size="16" aria-hidden="true" />
        </template>
      </BInput>
    </div>

    <div v-if="showActions" class="mobile-top-bar__actions">
      <BButton
        v-if="
          activeBinding?.onAuxiliaryAction &&
          activeBinding.auxiliaryActionIcon?.() &&
          activeBinding.auxiliaryActionLabel?.()
        "
        class="mobile-top-bar__action mobile-top-bar__action--auxiliary"
        :aria-label="activeBinding.auxiliaryActionLabel()"
        :title="activeBinding.auxiliaryActionLabel()"
        @click="activeBinding.onAuxiliaryAction()"
        v-click-log="{ module: '移动端导航', operation: activeBinding.auxiliaryActionLabel() }"
      >
        <SvgIcon :src="activeBinding.auxiliaryActionIcon()" size="19" aria-hidden="true" />
      </BButton>
      <BButton
        v-if="activeBinding?.onAdd"
        class="mobile-top-bar__action"
        :aria-label="addLabel"
        :title="addLabel"
        @click="runAdd"
        v-click-log="{ module: '移动端导航', operation: addLabel }"
      >
        <SvgIcon :src="icon.common.plus" size="20" aria-hidden="true" />
      </BButton>
      <BDropdown
        v-if="showMoreMenu"
        trigger="click"
        align="right"
        overlay-class-name="mobile-top-bar-menu"
        :menu-options="moreMenuOptions"
      >
        <BButton
          class="mobile-top-bar__action"
          :aria-label="t('mobileNavigation.moreActions')"
          :title="t('mobileNavigation.moreActions')"
        >
          <SvgIcon :src="icon.common.more" size="21" aria-hidden="true" />
        </BButton>
      </BDropdown>
    </div>
  </header>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useMobileNavigationState } from '@/composables/useMobileNavigationState';
  import { getMobileTopBarBinding } from '@/composables/useMobileTopBar';
  import { useUserStore } from '@/store';
  import { getMobileHomePath } from '@/utils/preferences';

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const { t } = useI18n();
  const { getLastMobileResourcePath } = useMobileNavigationState();
  const fallbackSearchValue = ref('');

  const activeBinding = computed(() => getMobileTopBarBinding(route.name));
  const showSearch = computed(() => activeBinding.value?.showSearch !== false);
  const showMoreMenu = computed(() => activeBinding.value?.showMoreMenu !== false);
  const showActions = computed(() =>
    Boolean(activeBinding.value?.onAuxiliaryAction || activeBinding.value?.onAdd || showMoreMenu.value),
  );
  const searchValue = computed({
    get: () => activeBinding.value?.getSearchValue?.() ?? fallbackSearchValue.value,
    set: (value: string | number | undefined) => {
      const normalizedValue = String(value || '');
      if (activeBinding.value?.setSearchValue) {
        activeBinding.value.setSearchValue(normalizedValue);
        activeBinding.value.onSearchInput?.(normalizedValue);
        return;
      }
      fallbackSearchValue.value = normalizedValue;
    },
  });
  const searchLabel = computed(() => {
    if (activeBinding.value?.searchPlaceholder) return activeBinding.value.searchPlaceholder();
    return t('mobileNavigation.globalSearch');
  });
  const addLabel = computed(() => activeBinding.value?.addLabel?.() || t('common.add'));
  const moreMenuOptions = computed(() => [
    {
      key: 'bookmark-management',
      label: t('navigation.bookmarkManagement'),
      icon: icon.manage_categoryBtn_bookmark,
      function: () => router.push('/manage/bookmarkMg'),
    },
    {
      key: 'tag-management',
      label: t('navigation.tagManagement'),
      icon: icon.manage_categoryBtn_tag,
      function: () => router.push('/manage/tagMg'),
    },
    { key: 'management-divider', divider: true },
    {
      key: 'trash',
      label: t('trash.title'),
      icon: icon.table_delete,
      function: () => router.push('/ptrash'),
    },
    {
      key: 'settings',
      label: t('settings.title'),
      icon: icon.userCenter.settingsGear,
      function: () => router.push('/settings'),
    },
  ]);

  function goToResources() {
    const target = getLastMobileResourcePath(getMobileHomePath(user.preferences));
    if (route.path !== target) router.push(target);
  }

  function submitSearch() {
    if (activeBinding.value?.onSearchEnter) {
      activeBinding.value.onSearchEnter();
      return;
    }
    const keyword = fallbackSearchValue.value.trim();
    router.push({ path: '/search', query: keyword ? { q: keyword } : undefined });
  }

  function runAdd() {
    activeBinding.value?.onAdd?.();
  }
</script>

<style scoped lang="less">
  .mobile-top-bar {
    position: relative;
    z-index: 4;
    width: 100%;
    height: 56px;
    padding: 0 8px 0 12px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 56px;
    border-bottom: 1px solid var(--surface-divider-color);
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .mobile-top-bar__brand {
    flex: 0 0 auto;
    min-width: 0;
    height: 44px;
    padding: 0 6px 0 0;
    gap: 8px;
    border-radius: 10px;
    color: var(--text-color);
    background: transparent !important;
    font-size: 16px;
    font-weight: 720;
    letter-spacing: -0.01em;
  }

  .mobile-top-bar__brand img {
    width: 25px;
    height: 25px;
    display: block;
    flex: 0 0 auto;
  }

  .mobile-top-bar__actions {
    margin-left: auto;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .mobile-top-bar__action {
    width: 38px;
    min-width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent !important;
  }

  .mobile-top-bar__action:hover,
  .mobile-top-bar__action:active {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent) !important;
  }

  .mobile-top-bar__search {
    min-width: 0;
    flex: 1 1 auto;
  }

  .mobile-top-bar__search :deep(.b-input) {
    border-radius: 10px;
    font-size: 13px;
  }

  @media (max-width: 359px) {
    .mobile-top-bar__brand span {
      display: none;
    }
  }
</style>

<style lang="less">
  .mobile-top-bar-menu {
    min-width: 156px !important;
  }

  .mobile-top-bar-menu .b-dropdown-item {
    min-height: 40px;
    box-sizing: border-box;
  }
</style>
