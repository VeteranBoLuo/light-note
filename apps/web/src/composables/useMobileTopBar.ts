import { onBeforeUnmount, shallowReactive } from 'vue';

export interface MobileTopBarBinding {
  getSearchValue?: () => string;
  setSearchValue?: (value: string) => void;
  onSearchInput?: (value: string) => void;
  onSearchEnter?: () => void;
  searchPlaceholder?: () => string;
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
