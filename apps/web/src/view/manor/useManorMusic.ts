import { onBeforeUnmount, onMounted, ref } from 'vue';

const TRACK_URL = '/manor/knowledge-garden-v19/audio/bay-letter-r1.mp3';

export function useManorMusic() {
  const enabled = ref(false);
  const playbackFailed = ref(false);
  let player: HTMLAudioElement | null = null;
  let playAttempt = 0;

  function stop() {
    const audio = player;
    player = null;
    enabled.value = false;
    playbackFailed.value = false;
    if (!audio) return;
    audio.removeEventListener('error', onMediaError);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  function failPlayback() {
    stop();
    playbackFailed.value = true;
  }

  function onMediaError(event: Event) {
    if (event.currentTarget === player) failPlayback();
  }

  function syncPlayback() {
    const audio = player;
    if (!audio) return;
    if (document.hidden) {
      ++playAttempt;
      audio.pause();
    } else if (audio.paused) {
      const attempt = ++playAttempt;
      void audio.play().catch(() => {
        // Pausing a pending play request also rejects it. The next foreground
        // attempt, or a newly enabled player, owns the current switch state.
        if (audio === player && attempt === playAttempt && !document.hidden) failPlayback();
      });
    }
  }

  function setEnabled(value: boolean) {
    if (!value) {
      stop();
      return;
    }
    if (player) return;
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'none';
    audio.addEventListener('error', onMediaError);
    player = audio;
    enabled.value = true;
    playbackFailed.value = false;
    audio.src = TRACK_URL;
    // The switch click must start playback within the browser's user gesture.
    syncPlayback();
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', syncPlayback);
    window.addEventListener('pagehide', stop);
  });
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', syncPlayback);
    window.removeEventListener('pagehide', stop);
    stop();
  });

  return { enabled, playbackFailed, setEnabled, stop };
}
