export type BActionMenuTrigger = 'hover' | 'contextmenu' | 'click';

export type BActionMenuSource = BActionMenuTrigger | 'keyboard';

export type BActionMenuPlacement =
  'right-start' | 'left-start' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface BActionMenuItem {
  key: string;
  label?: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}
