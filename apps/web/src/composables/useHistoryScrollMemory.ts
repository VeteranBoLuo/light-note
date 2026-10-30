import { onBeforeUnmount, onMounted, type Ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { restoreScrollTop } from '@/utils/scrollContainer';

// 头像框、成长信息、活动入口等异步补齐后页面会变高，按这些时间点再对齐；用户一操作就停止。
const RESTORE_RETRY_DELAYS = [80, 240, 640, 1280] as const;
const STOP_EVENTS = ['touchstart', 'pointerdown', 'wheel', 'keydown'] as const;
const MAX_REMEMBERED = 20;
const positions = new Map<string, number>();

/**
 * 离开即卸载的页面从子页面返回时回到原来的滚动位置。
 * 按浏览记录条目保存：只有后退/前进回到同一条记录（Vue Router 记下了它的 forward）才恢复，重新进入仍从顶部开始。
 */
export function useHistoryScrollMemory(scope: string, element: Ref<HTMLElement | null | undefined>) {
  const router = useRouter();
  const { position } = router.options.history.state;
  const entry = typeof position === 'number' ? `${scope}:${position}` : null;
  let stop = () => {};

  onMounted(() => {
    const container = element.value;
    const target = entry ? positions.get(entry) : undefined;
    const returning = typeof router.options.history.state.forward === 'string';
    if (!container || target === undefined || !returning) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    stop = () => {
      timers.forEach(clearTimeout);
      STOP_EVENTS.forEach((type) => container.removeEventListener(type, stop));
      stop = () => {};
    };
    STOP_EVENTS.forEach((type) => container.addEventListener(type, stop, { passive: true }));
    restoreScrollTop(container, target);
    RESTORE_RETRY_DELAYS.forEach((delay, index) =>
      timers.push(
        setTimeout(() => {
          restoreScrollTop(container, target);
          if (index === RESTORE_RETRY_DELAYS.length - 1) stop();
        }, delay),
      ),
    );
  });

  onBeforeRouteLeave(() => {
    stop();
    if (!entry || !element.value) return;
    positions.delete(entry);
    positions.set(entry, element.value.scrollTop);
    if (positions.size > MAX_REMEMBERED) positions.delete(positions.keys().next().value!);
  });

  onBeforeUnmount(() => stop());
}
