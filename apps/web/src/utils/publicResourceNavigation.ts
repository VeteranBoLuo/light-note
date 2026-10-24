import type { Router } from 'vue-router';

const INTERNAL_ORIGIN = 'https://light-note.local';

/** Only existing signed-in pages may be a return destination. Public-detail origins omit nested return metadata. */
export function resolvePublicResourceReturnPath(router: Pick<Router, 'resolve'>, value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f]/u.test(raw))
    return '';
  try {
    const parsed = new URL(raw, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return '';
    if (parsed.pathname.startsWith('/public-resources/')) parsed.searchParams.delete('from');
    const resolved = router.resolve(parsed.pathname + parsed.search + parsed.hash);
    if (!resolved.matched.length || resolved.meta.requireAuth !== true || resolved.name === 'not-found') return '';
    return resolved.fullPath;
  } catch {
    return '';
  }
}

/** Pop a known source entry; replace on refresh/deep links so Back cannot loop through the detail. */
export function returnFromPublicResource(router: Router, from: unknown) {
  const source = resolvePublicResourceReturnPath(router, from);
  const previous = resolvePublicResourceReturnPath(router, router.options.history.state.back);
  if (previous && (!source || previous === source)) router.back();
  else void router.replace(source || '/search');
}
