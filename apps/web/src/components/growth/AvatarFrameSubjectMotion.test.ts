import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import AvatarFramePreview from './AvatarFramePreview.vue';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span', '头像') } }));
let app: App | undefined;
let target: HTMLDivElement;
function mount(initial = 'frame_bookmark_archive', subjectMotion = true) {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  target = document.createElement('div');
  document.body.append(target);
  const frameId = ref(initial),
    animated = ref(true);
  app = createApp({
    render: () =>
      h(AvatarFramePreview, {
        frameId: frameId.value,
        src: 'avatar',
        size: 64,
        animated: animated.value,
        subjectMotion,
      }),
  });
  app.mount(target);
  const images = () => [...target.querySelectorAll('.avatar-subject img')];
  const load = async () => {
    images().forEach((image) => image.dispatchEvent(new Event('load')));
    await nextTick();
  };
  return { frameId, animated, images, load };
}
afterEach(() => {
  app?.unmount();
  target?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('已确认头像框在正式组件中的加载和切换', () => {
  it.each([
    'frame_bookmark_archive',
    'frame_note_constellation',
    'frame_file_constellation',
    'frame_galaxy',
    'frame_streak_month',
  ])('%s 完整加载后替换结构层，并保留唯一头像', async (id) => {
    const { load, images } = mount(id);
    expect(target.querySelector('.avatar-frame__art')).not.toBeNull();
    expect(images().length).toBeGreaterThan(1);
    expect(
      images().every((img) => (img as HTMLImageElement).src && !(img as HTMLImageElement).src.includes('undefined')),
    ).toBe(true);
    await load();
    expect(target.querySelector('.avatar-frame--subject-ready')).not.toBeNull();
    expect(target.querySelector('.avatar-frame__art')).toBeNull();
    expect(target.querySelectorAll('.avatar-frame__portrait')).toHaveLength(1);
    expect(target.querySelector('.avatar-frame__motion--front')).not.toBeNull();
  });
  it('慢速加载和失败时保持完整旧框，不显示缺主体的新框', async () => {
    const { images } = mount();
    images()[0].dispatchEvent(new Event('load'));
    await nextTick();
    expect(target.querySelector('.avatar-frame--subject-ready')).toBeNull();
    images()[1].dispatchEvent(new Event('error'));
    images().forEach((img) => img.dispatchEvent(new Event('load')));
    await nextTick();
    expect(target.querySelector('.avatar-frame--subject-ready')).toBeNull();
    expect(target.querySelector('.avatar-frame__art')).not.toBeNull();
  });
  it('切换佩戴框时重置就绪状态，不把旧框的加载结果带给新框', async () => {
    const { frameId, load } = mount();
    await load();
    frameId.value = 'frame_note_constellation';
    await nextTick();
    expect(target.querySelector('.avatar-frame--subject-ready')).toBeNull();
    expect(target.querySelector('.avatar-frame__art')).not.toBeNull();
    await load();
    expect(target.querySelector('.avatar-frame--subject-ready')).not.toBeNull();
    frameId.value = 'frame_dragon';
    await nextTick();
    expect(target.querySelector('.avatar-subject')).toBeNull();
    expect(target.querySelector<HTMLImageElement>('.avatar-frame__art')!.src).toContain('frame_dragon_v4.webp');
    frameId.value = 'frame_bookmark_archive';
    await nextTick();
    expect(target.querySelector('.avatar-frame--subject-ready')).toBeNull();
  });
  it('暂停与继续保留主体图层及头像，避免重新加载或动画重播', async () => {
    const { animated, load, images } = mount();
    await load();
    const before = images();
    const portrait = target.querySelector('.avatar-frame__portrait');
    animated.value = false;
    await nextTick();
    expect(target.querySelector('.avatar-subject.is-paused')).not.toBeNull();
    animated.value = true;
    await nextTick();
    expect(target.querySelector('.avatar-subject.is-paused')).toBeNull();
    expect(images()).toEqual(before);
    expect(target.querySelector('.avatar-frame__portrait')).toBe(portrait);
  });
  it('隐藏标签页暂停主体，不拆卸图层', async () => {
    const { load, images } = mount();
    await load();
    const before = images();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(target.querySelector('.avatar-subject.is-paused')).not.toBeNull();
    expect(images()).toEqual(before);
  });
  it('龙曜保持原始结构和主题粒子，不接入被撤回的龙首方案', () => {
    mount('frame_dragon');
    expect(target.querySelector('.avatar-subject')).toBeNull();
    expect(target.querySelector<HTMLImageElement>('.avatar-frame__art')!.src).toContain('frame_dragon_v4.webp');
    expect(target.querySelectorAll('.avatar-frame__dragon-particles i')).toHaveLength(18);
    expect(target.querySelectorAll('.avatar-frame__dragon-orbit-particles i')).toHaveLength(4);
  });
  it('原型的旧版对照显式关闭主体层，避免重复叠加', () => {
    mount('frame_galaxy', false);
    expect(target.querySelector('.avatar-subject')).toBeNull();
    expect(target.querySelector('.avatar-frame__art')).not.toBeNull();
  });
});
