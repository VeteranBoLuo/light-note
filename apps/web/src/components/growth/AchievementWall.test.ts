import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Achievement } from '@/composables/useGrowth';
import { ACHIEVEMENT_KEYS, achievementVisualFor } from '@/config/achievements';
import zh from '@/i18n/locales/zh-CN';
const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('@/api/communityChatApi.ts', () => ({
  getCommunityChatOwnProfile: api.get,
  updateCommunityChatOwnProfile: api.update,
}));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { info: vi.fn(), success: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { props: ['visible'], template: '<div v-if="visible" role="dialog"><slot /></div>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('./AchievementEmblem.vue', () => ({ default: { template: '<span />' } }));
vi.mock('./AvatarFramePreview.vue', () => ({
  default: {
    props: { frameId: String, animated: Boolean, pauseWhenOffscreen: Boolean },
    template:
      '<span class="frame-preview" :data-frame="frameId" :data-animated="animated" :data-offscreen="pauseWhenOffscreen" />',
  },
}));
import AchievementWall from './AchievementWall.vue';
let cleanup: () => void;
const profile = {
  bio: 'fixture',
  showCommunityTenure: true,
  featuredAchievementKeys: ['streak_1', 'streak_7', 'streak_30'],
  revision: 4,
};
beforeEach(() => {
  api.get.mockResolvedValue({ status: 200, data: profile });
  api.update.mockResolvedValue({
    status: 200,
    data: { ...profile, featuredAchievementKeys: ['streak_7', 'streak_30'] },
  });
});
afterEach(() => {
  cleanup?.();
  vi.clearAllMocks();
});
async function flush() {
  for (let i = 0; i < 6; i++) await nextTick();
}
function achievement(key: string, unlocked = true): Achievement {
  return {
    key,
    group: achievementVisualFor(key).group,
    target: 100,
    cur: unlocked ? 100 : 75,
    unlocked,
    claimed: unlocked,
    claimable: false,
    reward: 50,
  };
}
function mount(items: Achievement[], overrides: Record<string, unknown> = {}) {
  const onClaim = vi.fn();
  const props = reactive({
    achievements: items,
    totalAchievements: items.length,
    unlockedCount: items.filter((a) => a.unlocked).length,
    onClaim,
    ...overrides,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ setup: () => () => h(AchievementWall, props) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, props, onClaim };
}
function click(host: HTMLElement, selector: string) {
  (host.querySelector(selector) as HTMLButtonElement).click();
}
describe('achievement collection behavior', () => {
  it('previews frame motion in the wall and detail while respecting the shared motion switch', async () => {
    const { host, props } = mount([{ ...achievement('public_resource_500'), frameId: 'frame_knowledge_lighthouse' }], {
      animated: true,
    });
    click(host, '.aw-badge__main');
    await flush();
    expect(host.querySelectorAll('.frame-preview')).toHaveLength(2);
    for (const frame of host.querySelectorAll('.frame-preview')) {
      expect(frame.getAttribute('data-animated')).toBe('true');
      expect(frame.getAttribute('data-offscreen')).toBe('true');
    }
    Object.assign(props, { animated: false });
    await flush();
    expect(
      [...host.querySelectorAll('.frame-preview')].every((frame) => frame.getAttribute('data-animated') === 'false'),
    ).toBe(true);
  });
  it('shows every achievement exactly once across ten distinct families', () => {
    const { host } = mount(ACHIEVEMENT_KEYS.map((key) => achievement(key)));
    expect(host.querySelectorAll('.aw-badge')).toHaveLength(48);
    expect(host.querySelectorAll('.aw-group')).toHaveLength(10);
    const groups = [...host.querySelectorAll('.aw-group')];
    for (const [label, count] of [
      ['公开贡献', 5],
      ['书签收藏', 5],
      ['笔记创作', 6],
      ['云端文件', 6],
    ] as const) {
      expect(
        groups.find((g) => g.querySelector('.aw-group-title')?.textContent === label)?.querySelectorAll('.aw-badge'),
      ).toHaveLength(count);
    }
  });
  it('keeps tiers ascending and same-tier thresholds stable despite claim status, unlock time and progress', async () => {
    const keys = ['streak_365', 'checkin_100', 'streak_30', 'checkin_50', 'streak_100', 'streak_7', 'streak_1'];
    const items = keys.map((key, i) => ({
      ...achievement(key, i % 2 === 0),
      target: Number(key.split('_').at(-1)),
      claimable: key === 'checkin_100',
      unlocked: key === 'checkin_100' || i % 2 === 0,
      unlockedAt: `2026-10-${25 - i}T00:00:00Z`,
    }));
    const { host, props } = mount(items);
    const names = () => [...host.querySelectorAll('.aw-name')].map((e) => e.textContent);
    const expected = ['初见轻笺', '七日不辍', '勤学不倦', '卅日勤学', '百日筑基', '百日如一', '岁月长明'];
    expect(names()).toEqual(expected);
    props.achievements = [...items]
      .reverse()
      .map((a) => ({ ...a, claimable: false, claimed: true, unlocked: true, cur: a.target }));
    await flush();
    expect(names()).toEqual(expected);
  });
  it.each(['claimable', 'near', 'unlocked'] as const)('preserves tier order in the %s filter', async (filter) => {
    const items = ['level_15', 'level_5', 'level_10'].map((key) => ({
      ...achievement(key, filter !== 'near'),
      claimable: filter === 'claimable',
      target: Number(key.split('_').at(-1)),
      cur: Number(key.split('_').at(-1)) * 0.8,
    }));
    const { host } = mount(items);
    const index = { claimable: 2, near: 3, unlocked: 4 }[filter];
    click(host, `.aw-filters [role="tab"]:nth-child(${index})`);
    await flush();
    expect([...host.querySelectorAll('.aw-name')].map((e) => e.textContent)).toEqual([
      '登堂入室',
      '出类拔萃',
      '文坛巨擘',
    ]);
  });
  it('updates a selected detail after claiming and gives an empty filter a way back', async () => {
    const item = { ...achievement('streak_30'), claimed: false, claimable: true };
    const { host, props, onClaim } = mount([item]);
    click(host, '.aw-filters [role="tab"]:nth-child(2)');
    await flush();
    click(host, '.aw-badge__main');
    await flush();
    click(host, '.awd-claim');
    expect(onClaim).toHaveBeenCalledWith('streak_30');
    props.achievements = [{ ...item, claimed: true, claimable: false }];
    await flush();
    expect(host.querySelector('.awd-claim')).toBeNull();
    expect(host.querySelector('.awd-status')?.textContent).toContain('已领取');
    expect(host.querySelector('.aw-empty button')?.textContent).toContain('查看全部成就');
    click(host, '.aw-empty button');
    await flush();
    expect(host.querySelectorAll('.aw-badge')).toHaveLength(1);
  });
  it.each([{ readOnly: true }, { claimingKey: 'another' }])(
    'blocks claim writes while unavailable (%j)',
    async (override) => {
      const { host, onClaim } = mount([{ ...achievement('streak_30'), claimable: true, claimed: false }], override);
      click(host, '.aw-claim');
      click(host, '.aw-badge__main');
      await flush();
      click(host, '.awd-claim');
      expect(onClaim).not.toHaveBeenCalled();
      expect((host.querySelector('.awd-claim') as HTMLButtonElement).disabled).toBe(true);
      if (override.readOnly) {
        expect(host.querySelector('.awd-community')).toBeNull();
        expect(api.get).not.toHaveBeenCalled();
      }
      expect(host.querySelector('.awd-status.unlocked')).toBeNull();
    },
  );
  it('keeps locked details informational, without claim or community writes', async () => {
    const { host } = mount([achievement('streak_365', false)]);
    click(host, '.aw-badge__main');
    await flush();
    expect(host.querySelector('.awd-num')?.textContent).toContain('75 / 100');
    expect(host.querySelector('.awd-claim')).toBeNull();
    expect(host.querySelector('.awd-community')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });
  it('loads existing featured state before offering removal and preserves profile fields', async () => {
    const { host } = mount([achievement('streak_1')]);
    click(host, '.aw-badge__main');
    await flush();
    expect(host.querySelector('.awd-community')?.textContent).toContain('取消社区展示');
    click(host, '.awd-community');
    await flush();
    expect(api.update).toHaveBeenCalledWith({
      bio: 'fixture',
      showCommunityTenure: true,
      featuredAchievementKeys: ['streak_7', 'streak_30'],
      baseRevision: 4,
    });
  });
  it('disables adding a fourth featured achievement', async () => {
    const { host } = mount([achievement('level_15')]);
    click(host, '.aw-badge__main');
    await flush();
    expect((host.querySelector('.awd-community') as HTMLButtonElement).disabled).toBe(true);
    click(host, '.awd-community');
    expect(api.update).not.toHaveBeenCalled();
  });
});
