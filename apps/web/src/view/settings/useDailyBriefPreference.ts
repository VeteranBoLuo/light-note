import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { useI18n } from 'vue-i18n';
import { getDailyBriefPreference, updateDailyBriefPreference } from '@/api/dailyBriefApi.ts';
import message from '@/components/base/BasicComponents/BMessage/BMessage';

type PreferenceError = '' | 'load' | 'save';

interface DailyBriefPreferenceOptions {
  ownerKey?: MaybeRefOrGetter<string>;
  writable?: MaybeRefOrGetter<boolean>;
}

/**
 * 桌面 AI 设置里的今日简报偏好状态。
 * 后端对未设置过的账号返回默认开启；前端也以 true 宽容初始化，
 * 首次请求期间禁用开关；读取失败后仍允许用户明确写入自己的选择。
 */
export function useDailyBriefPreference(options: DailyBriefPreferenceOptions = {}) {
  const { t } = useI18n();
  const enabled = ref(true);
  const autoUpdate = ref(true);
  const featureEnabled = ref(true);
  const loading = ref(false);
  const saving = ref(false);
  const loaded = ref(false);
  const error = ref<PreferenceError>('');
  let stateOwnerKey = '';
  let requestSequence = 0;

  function currentOwnerKey() {
    return String(options.ownerKey === undefined ? 'default' : toValue(options.ownerKey) || '');
  }

  function isWritable() {
    return options.writable === undefined || Boolean(toValue(options.writable));
  }

  function reset(nextOwnerKey = currentOwnerKey()) {
    requestSequence += 1;
    stateOwnerKey = nextOwnerKey;
    enabled.value = true;
    autoUpdate.value = true;
    featureEnabled.value = true;
    loading.value = false;
    saving.value = false;
    loaded.value = false;
    error.value = '';
  }

  function syncOwner() {
    const ownerKey = currentOwnerKey();
    if (ownerKey !== stateOwnerKey) reset(ownerKey);
    return ownerKey;
  }

  const description = computed(() => {
    if (loading.value) return t('settings.ai.dailyBriefLoading');
    if (error.value === 'load') return t('settings.ai.dailyBriefLoadFailed');
    if (error.value === 'save') return t('settings.ai.dailyBriefSaveFailed');
    if (!featureEnabled.value) return t('settings.ai.dailyBriefUnavailable');
    return t('settings.ai.dailyBriefDescription');
  });

  async function load() {
    const ownerKey = syncOwner();
    if (!ownerKey) return;
    if (loading.value || loaded.value) return;
    const sequence = ++requestSequence;
    loading.value = true;
    error.value = '';
    try {
      const res = await getDailyBriefPreference();
      if (sequence !== requestSequence || ownerKey !== currentOwnerKey()) return;
      if (res?.status !== 200 || !res.data) throw new Error('daily brief preference unavailable');
      featureEnabled.value = res.data.featureEnabled !== false;
      enabled.value = res.data.enabled !== false;
      autoUpdate.value = res.data.autoUpdate !== false;
      loaded.value = true;
    } catch {
      if (sequence === requestSequence && ownerKey === currentOwnerKey()) error.value = 'load';
    } finally {
      if (sequence === requestSequence && ownerKey === currentOwnerKey()) loading.value = false;
    }
  }

  async function save(next: boolean, nextAutoUpdate?: boolean) {
    const ownerKey = syncOwner();
    if (!ownerKey || !isWritable() || loading.value || saving.value || !featureEnabled.value) return;
    const sequence = ++requestSequence;
    const previous = enabled.value;
    const previousAutoUpdate = autoUpdate.value;
    enabled.value = next;
    if (nextAutoUpdate !== undefined) autoUpdate.value = nextAutoUpdate;
    saving.value = true;
    error.value = '';
    try {
      const res = await updateDailyBriefPreference(next, nextAutoUpdate);
      if (sequence !== requestSequence || ownerKey !== currentOwnerKey()) return;
      if (res?.status !== 200) throw new Error('daily brief preference update failed');
      enabled.value = typeof res.data?.enabled === 'boolean' ? res.data.enabled : next;
      autoUpdate.value = typeof res.data?.autoUpdate === 'boolean' ? res.data.autoUpdate : autoUpdate.value;
      loaded.value = true;
    } catch {
      if (sequence === requestSequence && ownerKey === currentOwnerKey()) {
        enabled.value = previous;
        autoUpdate.value = previousAutoUpdate;
        error.value = 'save';
        message.warning(t('settings.ai.dailyBriefSaveFailed'));
      }
    } finally {
      if (sequence === requestSequence && ownerKey === currentOwnerKey()) saving.value = false;
    }
  }

  watch(currentOwnerKey, (ownerKey) => reset(ownerKey), { immediate: true });

  const setEnabled = (next: boolean) => save(next);
  const setAutoUpdate = (next: boolean) => save(enabled.value, next);
  return {
    enabled,
    autoUpdate,
    featureEnabled,
    loading,
    saving,
    loaded,
    error,
    description,
    load,
    setEnabled,
    setAutoUpdate,
    reset,
  };
}
