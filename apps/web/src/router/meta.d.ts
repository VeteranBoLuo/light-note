import type { MobileShellSection } from '@/config/mobileNavigation';

declare module 'vue-router' {
  interface RouteMeta {
    mobileShell?: MobileShellSection;
    mobileTopSwitcher?: boolean;
    mobileBottomNav?: boolean;
    mobileCompactResourceHeading?: boolean;
  }
}

export {};
