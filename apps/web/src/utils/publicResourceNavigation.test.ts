import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { resolvePublicResourceReturnPath, returnFromPublicResource } from './publicResourceNavigation';
const resolver = createRouter({
  history: createMemoryHistory(),
  routes: [
    ...[
      '/search',
      '/home',
      '/workbenches',
      '/noteLibrary',
      '/noteLibrary/:id',
      '/cloudSpace',
      '/tag/:id',
      '/public-resources/:id',
    ].map((path) => ({ path, meta: { requireAuth: true }, component: { render: () => null } })),
    { path: '/login', component: { render: () => null } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: { render: () => null } },
  ],
});
const router = (back: unknown) =>
  ({
    resolve: resolver.resolve,
    options: { history: { state: { back } } },
    back: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
  }) as unknown as Router;
describe('public resource return navigation', () => {
  it.each([
    '/workbenches',
    '/home?tag=x#cards',
    '/noteLibrary?parent=abc&preview=n1',
    '/cloudSpace?folderId=7',
    '/search?q=ai&public=1',
  ])('accepts the actual signed-in source: %s', (source) => {
    expect(resolvePublicResourceReturnPath(resolver, source)).toBe(source);
  });
  it.each([
    'https://example.org/home',
    '//example.org/home',
    '/\\example.org/home',
    '/login',
    '/missing',
    '/home\n',
    '/%2f%2fexample.org',
  ])('rejects external, unknown or recursive destinations: %s', (source) => {
    expect(resolvePublicResourceReturnPath(resolver, source)).toBe('');
  });
  it('returns to a previous public detail without growing recursive from addresses', () => {
    const source = '/public-resources/previous?from=%2Fhome%3Ftag%3Dx#body';
    expect(resolvePublicResourceReturnPath(resolver, source)).toBe('/public-resources/previous#body');
    const target = router(source);
    returnFromPublicResource(target, '/public-resources/previous#body');
    expect(target.back).toHaveBeenCalledOnce();
    expect(target.replace).not.toHaveBeenCalled();
  });
  it('pops matching history instead of pushing a new source entry', () => {
    const target = router('/noteLibrary?preview=n1');
    returnFromPublicResource(target, '/noteLibrary?preview=n1');
    expect(target.back).toHaveBeenCalledOnce();
    expect(target.replace).not.toHaveBeenCalled();
    expect(target.push).not.toHaveBeenCalled();
  });
  it('refresh/deep-link fallback replaces the detail, preserving query and hash without a Back loop', () => {
    const target = router(undefined);
    returnFromPublicResource(target, '/home?tag=x#cards');
    expect(target.replace).toHaveBeenCalledWith('/home?tag=x#cards');
    expect(target.back).not.toHaveBeenCalled();
  });
  it('does not pop unrelated history; safe real history is usable when from is absent', () => {
    const target = router('/cloudSpace');
    returnFromPublicResource(target, '/workbenches');
    expect(target.replace).toHaveBeenCalledWith('/workbenches');
    returnFromPublicResource(target, undefined);
    expect(target.back).toHaveBeenCalledOnce();
  });
  it('direct entry without a trusted origin replaces with resource center', () => {
    const target = router('https://outside.example');
    returnFromPublicResource(target, '//outside.example');
    expect(target.replace).toHaveBeenCalledWith('/search');
    expect(target.push).not.toHaveBeenCalled();
  });
});
