import { createApp, type App } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useManorMusic } from './useManorMusic';

const playResult = vi.fn<() => Promise<void>>();
const players: TestAudio[] = [];

class TestAudio extends EventTarget {
  loop = false;
  paused = true;
  currentTime = 0;
  src = '';
  play = vi.fn(() => {
    this.paused = false;
    return playResult();
  });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn(() => { this.currentTime = 0; });
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  constructor() {
    super();
    players.push(this);
  }
}

let app: App | undefined;
function mount() {
  let music!: ReturnType<typeof useManorMusic>;
  app = createApp({ setup() { music = useManorMusic(); return () => null; } });
  app.mount(document.createElement('div'));
  return music;
}

let hidden: boolean;
function changeVisibility(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  hidden = false;
  players.length = 0;
  playResult.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('Audio', TestAudio);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('庄园背景音乐', () => {
  it('只在主动开启后循环，返回前台续播，离开时释放播放器', () => {
    const music = mount();
    expect(music.enabled.value).toBe(false);
    changeVisibility(true);
    changeVisibility(false);
    expect(players).toHaveLength(0);

    music.setEnabled(true);
    const [audio] = players;
    expect(music.enabled.value).toBe(true);
    expect(audio.loop).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
    audio.currentTime = 25;
    changeVisibility(true);
    expect(audio.paused).toBe(true);
    changeVisibility(false);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBe(25);

    app!.unmount();
    app = undefined;
    expect(audio.paused).toBe(true);
    expect(audio.src).toBe('');
    expect(audio.currentTime).toBe(0);
    changeVisibility(false);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('切到后台中断的旧播放请求不会覆盖恢复后的开关', async () => {
    let rejectFirst!: (reason: DOMException) => void;
    playResult.mockReturnValueOnce(new Promise((_, reject) => { rejectFirst = reject; }));
    const music = mount();
    music.setEnabled(true);
    changeVisibility(true);
    changeVisibility(false);
    rejectFirst(new DOMException('Interrupted', 'AbortError'));
    await Promise.resolve();
    expect(music.enabled.value).toBe(true);
    expect(music.playbackFailed.value).toBe(false);
    expect(players[0].paused).toBe(false);
  });

  it('播放失败时回退开关并允许重试，页面离开后也停止播放', async () => {
    playResult.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
    const music = mount();
    music.setEnabled(true);
    await Promise.resolve();
    expect(music.enabled.value).toBe(false);
    expect(music.playbackFailed.value).toBe(true);
    expect(players[0].src).toBe('');

    music.setEnabled(true);
    expect(music.playbackFailed.value).toBe(false);
    expect(players[1].paused).toBe(false);
    window.dispatchEvent(new Event('pagehide'));
    expect(music.enabled.value).toBe(false);
    expect(players[1].paused).toBe(true);
    expect(players[1].src).toBe('');
  });
});
