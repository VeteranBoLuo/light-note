import { PREWARM_PRIORITY } from '@/config/staticPrewarmGroups';
import { scheduleStaticPrewarm } from './staticPrewarm';

/** Browse first; editor code stays byte-only and follows the common navigation paths. */
export function scheduleAppStartupPrewarm() {
  const stops = [
    scheduleStaticPrewarm({
      groups: ['route.home', 'route.noteLibrary', 'route.cloudSpace', 'route.tagMg', 'route.searchCenter'],
      priority: PREWARM_PRIORITY.browsing,
      optional: true,
    }),
    scheduleStaticPrewarm({
      groups: ['route.bookmarkMg', 'route.noteDetail', 'editor.html', 'editor.markdown'],
      priority: PREWARM_PRIORITY.detail,
      optional: true,
    }),
  ];
  return () => stops.forEach((stop) => stop());
}
