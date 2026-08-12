import { createApp } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { props: ['src', 'size'], template: '<span class="svg-icon-stub" />' },
}));

const { default: AchievementEmblem } = await import('./AchievementEmblem.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountEmblem(props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(AchievementEmblem, props);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('AchievementEmblem', () => {
  it('把入门成就渲染为对应家族的一阶静态徽章', () => {
    const host = mountEmblem({ achievementKey: 'streak_1' });
    const emblem = host.querySelector('.achievement-emblem');

    expect(emblem?.classList.contains('achievement-emblem--checkin')).toBe(true);
    expect(emblem?.classList.contains('achievement-emblem--tier-1')).toBe(true);
    expect(emblem?.classList.contains('achievement-emblem--rarity-starter')).toBe(true);
    expect(host.querySelectorAll('.achievement-emblem__tier i')).toHaveLength(1);
  });

  it('把高阶成就渲染为带完整装饰的五阶家族徽章', () => {
    const host = mountEmblem({ achievementKey: 'note_500', size: 76 });
    const emblem = host.querySelector<HTMLElement>('.achievement-emblem');

    expect(emblem?.classList.contains('achievement-emblem--note')).toBe(true);
    expect(emblem?.classList.contains('achievement-emblem--tier-5')).toBe(true);
    expect(emblem?.classList.contains('achievement-emblem--rarity-mythic')).toBe(true);
    expect(emblem?.classList.contains('achievement-emblem--showcase')).toBe(true);
    expect(emblem?.style.getPropertyValue('--achievement-size')).toBe('76px');
    expect(host.querySelectorAll('.achievement-emblem__tier i')).toHaveLength(5);
    expect(host.querySelector('.achievement-emblem__corona')).not.toBeNull();
    expect(host.querySelector('.achievement-emblem__orbit')).not.toBeNull();
    expect(host.querySelectorAll('.achievement-emblem__laurel i')).toHaveLength(10);
    expect(host.querySelectorAll('.achievement-emblem__crown i')).toHaveLength(5);
  });

  it('给最高难度成就独立顶级身份并适配社区名片小尺寸', () => {
    const host = mountEmblem({ achievementKey: 'streak_365', size: 30 });
    const emblem = host.querySelector('.achievement-emblem');

    expect(emblem?.classList.contains('achievement-emblem--apex')).toBe(true);
    expect(emblem?.classList.contains('achievement-emblem--compact')).toBe(true);
    expect(emblem?.classList.contains('achievement-emblem--rarity-mythic')).toBe(true);
  });

  it('锁定成就保留同款造型但进入弱化状态', () => {
    const host = mountEmblem({ achievementKey: 'level_15', locked: true });
    expect(host.querySelector('.achievement-emblem')?.classList.contains('achievement-emblem--locked')).toBe(true);
  });
});
