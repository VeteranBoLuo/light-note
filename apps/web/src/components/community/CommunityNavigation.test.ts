import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { MOBILE_LAYOUT_CONTEXT } from '@/composables/useMobileLayout';
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

vi.mock('@/components/mobile/MobilePageActionsDrawer.vue', () => ({
  default: {
    props: ['open', 'actions'],
    template: `<div v-if="open" role="menu"><button v-for="action in actions" :key="action.key" @click="$emit('action', action)">{{ action.label }}</button></div>`,
  },
}));
it.each(['visitor', 'user', 'root'])(
  'opens mobile destinations from the current title and gates management (%s)',
  async (role) => {
    Object.assign(user, { id: role === 'visitor' ? '' : 'member', role });
    const host = document.createElement('div');
    const app = createApp(CommunityNavigation, { active: 'feed' });
    app.provide(MOBILE_LAYOUT_CONTEXT, ref(true));
    app.mount(host);
    cleanup = () => app.unmount();
    const trigger = host.querySelector<HTMLButtonElement>('.community-mobile-switch')!;
    expect(trigger.textContent).toContain('community.feed.title');
    expect(host.querySelector('[role=menu]')).toBeNull();
    trigger.click();
    await nextTick();
    const menu = host.querySelector('[role=menu]')!;
    expect(menu.textContent?.includes('community.feed.myProfile')).toBe(role !== 'visitor');
    expect(menu.textContent?.includes('community.feed.moderation')).toBe(role === 'root');
    const destinations = menu.querySelectorAll<HTMLButtonElement>('button');
    destinations[0].click();
    expect(push).toHaveBeenLastCalledWith('/community/chat');
    destinations[1].click();
    expect(push).toHaveBeenLastCalledWith('/community/feed');
  },
);
