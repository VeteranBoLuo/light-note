import { scheduleStaticPrewarm, type PrewarmSelection } from './staticPrewarm';

/** Access checks stay at the caller; the scheduler controls network eligibility. */
export function manorPrewarmSelections(mobile: boolean): PrewarmSelection[] {
  return [
    { groups: [mobile ? 'manor.mobileCritical' : 'manor.critical'], priority: 1, optional: true },
    { groups: [mobile ? 'manor.mobile' : 'manor.desktop'], priority: 4, optional: true },
  ];
}
export function scheduleManorPrewarm(mobile: boolean) {
  const stops = manorPrewarmSelections(mobile).map((selection) => scheduleStaticPrewarm(selection));
  return () => stops.forEach((stop) => stop());
}
