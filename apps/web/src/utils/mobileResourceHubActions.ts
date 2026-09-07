import icon from '@/config/icon';

interface MobileResourceHubActionItem {
  key: MobileResourceHubActionKey;
  label: string;
  icon: string;
}

export type MobileResourceHubActionKey = 'resource-center' | 'organize-center';

const PATHS: Record<MobileResourceHubActionKey, '/search' | '/organize'> = {
  'resource-center': '/search',
  'organize-center': '/organize',
};

export function createMobileResourceHubActions(t: (key: string) => string): MobileResourceHubActionItem[] {
  return [
    { key: 'resource-center', label: t('navigation.resourceCenter'), icon: icon.navigation.search },
    { key: 'organize-center', label: t('resourceCenter.sections.organize'), icon: icon.ai.organize },
  ];
}

export function mobileResourceHubPath(key: string): '/search' | '/organize' | null {
  return PATHS[key as MobileResourceHubActionKey] || null;
}
