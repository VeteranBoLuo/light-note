import { onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue';
import type { Router } from 'vue-router';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { recordOperation } from '@/api/commonApi';
import { getFeaturedFeatures, saveFeaturedFeatures } from '@/api/updateLogApi';
import i18n from '@/i18n';
import type { FeatureShortcutDefinition, FeatureShortcutIntent } from '@/config/featureShortcuts';
import type { FeaturedFeatureItem } from '@/utils/featureShortcuts';

/** 目标页晚于该时长仍未接住动作，就视为该页面不处理（如手机端没有对应按钮），改为显示提示。 */
const INTENT_TTL_MS = 8000;
const INTENT_FALLBACK_DELAY_MS = 600;
const HINT_DURATION_MS = 7000;
const FEATURED_CACHE_MS = 5 * 60 * 1000;

interface PendingIntent {
  id: FeatureShortcutIntent;
  token: number;
  at: number;
}

const pendingIntent = ref<PendingIntent | null>(null);
let intentToken = 0;

function takeIntent(id: FeatureShortcutIntent) {
  const pending = pendingIntent.value;
  if (!pending || pending.id !== id) return false;
  pendingIntent.value = null;
  return Date.now() - pending.at <= INTENT_TTL_MS;
}

/**
 * 目标页登记一次性动作：功能直达跳转过来时执行，例如打开导入弹框。
 * 页面已经在当前路由时同样生效；动作只执行一次，不写进 URL，刷新不会重复弹出。
 */
export function useFeatureIntent(id: FeatureShortcutIntent, handler: () => void | Promise<void>) {
  // 挂载后再接，保证弹框、按钮等锚点已经渲染；被 keep-alive 缓存而处于后台时不接，等页面重新激活。
  const active = ref(false);
  onMounted(() => (active.value = true));
  onActivated(() => (active.value = true));
  onDeactivated(() => (active.value = false));
  const stop = watch([pendingIntent, active], ([pending, isActive]) => {
    if (isActive && pending?.id === id && takeIntent(id)) void handler();
  });
  onBeforeUnmount(stop);
}

function translate(key: string) {
  return String(i18n.global.t(key));
}

/** 统一执行一项功能：调用方先关闭自己的搜索浮层，再调用这里跳转。 */
export async function runFeatureShortcut(feature: FeatureShortcutDefinition, router: Router, source: string) {
  recordOperation({ module: '全局搜索', operation: `打开功能直达【${feature.id}】${source}` });
  const token = ++intentToken;
  pendingIntent.value = feature.intent ? { id: feature.intent, token, at: Date.now() } : null;
  try {
    await router.push(feature.route);
  } catch {
    // 守卫拦截或重复导航时仍保留后续提示逻辑；目标页可能已经在当前路由。
  }
  if (!feature.hint) return;
  window.setTimeout(() => {
    if (feature.intent) {
      // 目标页已经接住（如电脑端书签页用气泡指出按钮），就不再重复提示。
      if (pendingIntent.value?.token !== token) return;
      pendingIntent.value = null;
    }
    message.info(translate(`featureShortcut.items.${feature.key}.hint`), HINT_DURATION_MS);
  }, INTENT_FALLBACK_DELAY_MS);
}

const featuredState = reactive({
  items: [] as FeaturedFeatureItem[],
  loadedAt: 0,
  loading: false,
  failed: false,
});
let featuredRequest: Promise<void> | null = null;

function normalizeFeaturedItems(value: unknown): FeaturedFeatureItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.featureId === 'string')
    .map((item) => ({
      featureId: String(item.featureId),
      description: String(item.description || ''),
      publishDate: String(item.publishDate || ''),
    }));
}

/** 「最近上线」读模型：全站共用一份，短时缓存；Root 保存后直接替换。 */
export function useFeaturedFeatures() {
  async function ensure(force = false) {
    if (!force && featuredState.loadedAt && Date.now() - featuredState.loadedAt < FEATURED_CACHE_MS) return;
    if (featuredRequest) return featuredRequest;
    featuredState.loading = true;
    featuredRequest = (async () => {
      try {
        const response = await getFeaturedFeatures();
        if (response?.status !== 200) throw new Error('featured unavailable');
        featuredState.items = normalizeFeaturedItems(response.data?.items);
        featuredState.failed = false;
        featuredState.loadedAt = Date.now();
      } catch {
        // 读取失败不影响搜索；保留上一次成功的内容，下次打开再试。
        featuredState.failed = true;
      } finally {
        featuredState.loading = false;
        featuredRequest = null;
      }
    })();
    return featuredRequest;
  }

  async function save(items: FeaturedFeatureItem[]) {
    const response = await saveFeaturedFeatures(items);
    if (response?.status !== 200) return false;
    featuredState.items = normalizeFeaturedItems(response.data?.items);
    featuredState.failed = false;
    featuredState.loadedAt = Date.now();
    return true;
  }

  return { state: featuredState, ensure, save };
}
