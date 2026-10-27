import { PREWARM_PRIORITY } from '@/config/staticPrewarmGroups';
import { scheduleStaticPrewarm, type PrewarmSelection } from './staticPrewarm';

/** Access checks stay at the caller; the scheduler controls network eligibility. */
export function manorPrewarmSelections(mobile: boolean): PrewarmSelection[] {
  return [
    { groups: [mobile ? 'manor.mobileCritical' : 'manor.critical'], priority: PREWARM_PRIORITY.nearby, optional: true },
    { groups: [mobile ? 'manor.mobile' : 'manor.desktop'], priority: PREWARM_PRIORITY.extended, optional: true },
    { groups: ['manor.catalog'], priority: PREWARM_PRIORITY.decorative, optional: true },
  ];
}
export function scheduleManorPrewarm(mobile: boolean) {
  const stops = manorPrewarmSelections(mobile).map((selection) => scheduleStaticPrewarm(selection));
  return () => stops.forEach((stop) => stop());
}
