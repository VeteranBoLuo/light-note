import type { Router } from 'vue-router';
import { scheduleStaticPrewarm } from '@/utils/staticPrewarm';

export function scheduleLandingStartupPreload(router: Router, target: string) {
  const name = String(router.resolve(target).name || 'workbenches');
  return scheduleStaticPrewarm({ groups: [`route.${name}`, 'route.workbenches', 'account'], priority: 2 });
}
