import icon from '@/config/icon';

interface MobileResourceHubActionItem {
  key: MobileResourceHubActionKey;
  label: string;
  icon: string;
}

export type MobileResourceHubActionKey = 'resource-center' | 'organize-center' | 'toolbox';
export type MobileResourceHubPath = '/search' | '/organize' | '/toolbox';

const PATHS: Record<MobileResourceHubActionKey, MobileResourceHubPath> = {
  'resource-center': '/search',
  'organize-center': '/organize',
  toolbox: '/toolbox',
};

export function createMobileResourceHubActions(t: (key: string) => string): MobileResourceHubActionItem[] {
  return [
    { key: 'resource-center', label: t('navigation.resourceCenter'), icon: icon.navigation.search },
    { key: 'organize-center', label: t('organize.title'), icon: icon.ai.organize },
    { key: 'toolbox', label: t('navigation.toolbox'), icon: icon.toolbox.home },
  ];
}

export function mobileResourceHubPath(key: string): MobileResourceHubPath | null {
  return PATHS[key as MobileResourceHubActionKey] || null;
}
