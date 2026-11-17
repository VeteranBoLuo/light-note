import type { MobileShellSection } from '@/config/mobileNavigation';
import type { RouteLocaleSection } from '@/i18n';

declare module 'vue-router' {
  interface RouteMeta {
    localeSection?: RouteLocaleSection;
    mobileShell?: MobileShellSection;
    mobileTopBar?: boolean;
    mobileTopSwitcher?: boolean;
    mobileBottomNav?: boolean;
    mobileCompactResourceHeading?: boolean;
  }
}

export {};
