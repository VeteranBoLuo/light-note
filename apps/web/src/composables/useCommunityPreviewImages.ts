import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import request, { type RequestOptions } from '@/http/request';
import { useCommunityPreview } from './useCommunityPreview';

/** img requests have no preview header; resolve protected media through the authenticated client. */
export function useCommunityPreviewImages(sources: () => (string | undefined)[]) {
  const { preview, identity } = useCommunityPreview();
  const resolved = shallowRef<{ identity: string; urls: Map<string, string> }>({ identity: '', urls: new Map() });
  const unavailable = shallowRef(new Set<string>());
  const urls = computed(() => [...new Set(sources().filter((url): url is string => Boolean(url)))]);
  const protectedPath = (url: string) => {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin &&
        /^\/api\/community\/(?:images\/[^/]+|(?:profiles|posts)\/[^/]+\/avatar)$/.test(parsed.pathname)
        ? parsed.pathname + parsed.search
        : null;
    } catch {
      return null;
    }
  };
  const stop = watch(
    [preview, identity, urls],
    ([active, owner, entries], _previous, cleanup) => {
      resolved.value = { identity: owner, urls: new Map() };
      unavailable.value = new Set();
      if (!active) return;
      let cancelled = false;
      const controller = new AbortController();
      const owned: string[] = [];
      cleanup(() => {
        cancelled = true;
        controller.abort();
        owned.forEach((url) => URL.revokeObjectURL(url));
      });
      for (const source of entries) {
        const path = protectedPath(source);
        if (!path) {
          if (!source.startsWith('/brand-scenes/') && !source.startsWith('data:image/')) unavailable.value.add(source);
          continue;
        }
        void request
          .get<Blob>(path, {
            responseType: 'blob',
            signal: controller.signal,
            silent: true,
          } as RequestOptions)
          .then(async ({ data }) => {
            if (cancelled) return;
            if (data.type.includes('application/json')) {
              const payload = JSON.parse(await data.text());
              const remote = new URL(payload.publicAvatarUrl);
              if (cancelled) return;
              if (!/^https?:$/.test(remote.protocol) || remote.origin === window.location.origin)
                throw new Error('Unsupported avatar');
              // Public external avatars load as normal images without the administrator context header.
              resolved.value = { identity: owner, urls: new Map(resolved.value.urls).set(source, remote.href) };
              return;
            }
            if (!data.type.startsWith('image/')) throw new Error('Unavailable media');
            const url = URL.createObjectURL(data);
            owned.push(url);
            resolved.value = { identity: owner, urls: new Map(resolved.value.urls).set(source, url) };
          })
          .catch(() => {
            /* Unavailable media must not fall back to the administrator's cookie. */
            if (!cancelled) unavailable.value = new Set(unavailable.value).add(source);
          });
      }
    },
    { immediate: true, flush: 'sync' },
  );
  onBeforeUnmount(stop);
  function imageSource(source?: string): string | undefined {
    if (!source) return undefined;
    if (!preview.value) return source;
    // Public bundled assets and self-contained avatars have no identity-dependent authorization.
    if (source.startsWith('/brand-scenes/') || source.startsWith('data:image/')) return source;
    return resolved.value.identity === identity.value ? resolved.value.urls.get(source) : undefined;
  }
  return { imageSource, imageUnavailable: (source: string) => preview.value && unavailable.value.has(source) };
}
