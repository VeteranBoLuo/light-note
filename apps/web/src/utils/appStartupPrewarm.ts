import { scheduleStaticPrewarm } from './staticPrewarm';

/** Byte-only startup packs; the normal user-triggered loader executes modules. */
export function scheduleAppStartupPrewarm() {
  return scheduleStaticPrewarm({
    groups: [
      'route.noteDetail',
      'editor.html',
      'editor.markdown',
      'route.home',
      'route.bookmarkMg',
      'route.noteLibrary',
      'route.cloudSpace',
      'route.tagMg',
      'route.searchCenter',
    ],
    priority: 2,
    optional: true,
  });
}
