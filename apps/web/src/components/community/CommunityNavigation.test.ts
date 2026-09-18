import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import CommunityNavigation from './CommunityNavigation.vue';
const push = vi.hoisted(() => vi.fn());
const user = vi.hoisted(() => ({ id: '', role: 'visitor', alias: '', headPicture: '' }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }), useRoute: () => ({ path: '/community/posts/example' }) }));
vi.mock('@/store', () => ({ useUserStore: () => user }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/composables/useCommunityChatUnread', () => ({
  useCommunityChatUnread: () => ({ totalUnread: { value: 8 } }),
}));
let cleanup = () => {};
afterEach(() => {
  cleanup();
  push.mockClear();
  Object.assign(user, { id: '', role: 'visitor', alias: '', headPicture: '' });
});
describe('Community navigation', () => {
  it.each(['user', 'root'])('uses the real profile and limits management to Root (%s)', async (role) => {
    Object.assign(user, { id: 'member', role, alias: '真实昵称', headPicture: '/avatar.png' });
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(CommunityNavigation, { active: 'feed' });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    expect(host.textContent?.includes('community.feed.moderation')).toBe(role === 'root');
    const profile = host.querySelector<HTMLButtonElement>('.community-navigation-profile')!;
    expect(profile.textContent).toContain('真实昵称');
    expect(profile.querySelector('img')?.getAttribute('src')).toBe('/avatar.png');
    profile.click();
    await nextTick();
    expect(push).toHaveBeenCalledWith('/community/profile');
  });
  it('opens the feed even when the feed section is already selected on a child page', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(CommunityNavigation, { active: 'feed' });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    const tabs = host.querySelectorAll<HTMLElement>('.community-destination');
    expect(tabs[1].getAttribute('aria-current')).toBe('page');
    tabs[1].click();
    await nextTick();
    expect(push).toHaveBeenCalledWith('/community/feed');
    expect(tabs[0].textContent).toContain('8');
    tabs[0].click();
    await nextTick();
    expect(push).toHaveBeenLastCalledWith('/community/chat');
  });
});
