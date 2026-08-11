import type { MobileShellSection } from '@/config/mobileNavigation';

declare module 'vue-router' {
  interface RouteMeta {
    mobileShell?: MobileShellSection;
    mobileTopBar?: boolean;
    mobileTopSwitcher?: boolean;
    mobileBottomNav?: boolean;
    mobileCompactResourceHeading?: boolean;
  }
}

export {};
