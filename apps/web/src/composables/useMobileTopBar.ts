import { onBeforeUnmount, shallowReactive } from 'vue';
import type { GlobalSearchType } from '@/utils/globalSearchTypes';

/**
 * 顶栏按路由绑定的动作。
 *
 * 这里不再有任何搜索取值/回填字段：移动端顶栏只承载全局搜索，
 * 不会按页面变成局部搜索框。入口外形可以因页面空间不同而不同
 * （宽框 / 图标），但都打开同一个 GlobalSearchOverlay。
 */
export interface MobileTopBarBinding {
  /**
   * 搜索入口形态：
   * - `wide`（默认）：宽全局搜索框，用于今日、资料、待办
   * - `icon`：只在动作区放一个放大镜，用于 AI、我的等自带标题区的页面
   */
  searchMode?: 'wide' | 'icon';
  /** 页面自己渲染顶栏（完整搜索页），共享顶栏整体不渲染，避免出现两个搜索框 */
  ownTopBar?: boolean;
  /**
   * 当前页面的主资源类型。搜索范围始终是全部内容，这里只让同类结果在
   * 相同相关度档位内稍微靠前（在待办页搜索时待办优先，但仍展示其它类型）。
   */
  searchSourceType?: GlobalSearchType;
  /** 通知铃铛，默认显示；AI 页操作已多，不常驻铃铛 */
  showNotification?: boolean;
  onAuxiliaryAction?: () => void;
  auxiliaryActionLabel?: () => string;
  auxiliaryActionIcon?: () => string;
  onAdd?: () => void;
  addLabel?: () => string;
}

interface MobileTopBarRegistration {
  token: symbol;
  binding: MobileTopBarBinding;
}

const mobileTopBarBindings = shallowReactive(new Map<string, MobileTopBarRegistration>());

export function getMobileTopBarBinding(routeName: unknown): MobileTopBarBinding | null {
  return mobileTopBarBindings.get(String(routeName || ''))?.binding || null;
}

export function registerMobileTopBarBinding(routeNames: readonly string[], binding: MobileTopBarBinding): () => void {
  const token = Symbol('mobile-top-bar-binding');
  routeNames.forEach((routeName) => {
    mobileTopBarBindings.set(routeName, { token, binding });
  });

  return () => {
    routeNames.forEach((routeName) => {
      if (mobileTopBarBindings.get(routeName)?.token === token) {
        mobileTopBarBindings.delete(routeName);
      }
    });
  };
}

export function useMobileTopBar(routeNames: readonly string[], binding: MobileTopBarBinding) {
  const unregister = registerMobileTopBarBinding(routeNames, binding);
  onBeforeUnmount(unregister);
  return unregister;
}
