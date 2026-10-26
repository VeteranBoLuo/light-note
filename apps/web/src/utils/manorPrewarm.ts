import { scheduleStaticPrewarm } from './staticPrewarm';

/** Access checks stay at the caller; mobile budgets are reserved for common artwork. */
export function scheduleManorPrewarm(mobile: boolean) {
  return mobile ? () => {} : scheduleStaticPrewarm({ groups: ['manor.desktop'], priority: 4 });
}
