import { computed, onScopeDispose, readonly, ref, shallowRef } from 'vue';
import type { LotteryPrize } from '@/composables/useGrowth';

export type LotteryRevealPhase = 'idle' | 'charging' | 'waiting' | 'opening' | 'revealing' | 'result' | 'uncertain';
export type LotteryDrawMode = 'free' | 'paid';
export const LOTTERY_TIMINGS = {
  free: { charge: 1050, opening: 600 },
  paid: { charge: 1450, opening: 320 },
} as const;
export const LOTTERY_CARD_MS = 520;
export const LOTTERY_STAGGER_MS = 82;

/** Presentation only. A receipt is required before any reward can be revealed. */
export function useLotteryReveal() {
  const phase = ref<LotteryRevealPhase>('idle');
  const results = shallowRef<readonly LotteryPrize[]>([]);
  const skipped = ref(false);
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const motionReduced = ref(false);
  const busy = computed(() => ['charging', 'waiting', 'opening', 'revealing'].includes(phase.value));
  let mode: LotteryDrawMode = 'free';
  let chargeFinished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }
  function finish() {
    clearTimer();
    phase.value = 'result';
  }
  function reveal() {
    clearTimer();
    if (skipped.value || motionReduced.value || document.hidden) {
      finish();
      return;
    }
    phase.value = 'revealing';
    timer = setTimeout(finish, LOTTERY_CARD_MS + (results.value.length - 1) * LOTTERY_STAGGER_MS + 80);
  }
  function open() {
    clearTimer();
    if (skipped.value || motionReduced.value || document.hidden) {
      finish();
      return;
    }
    phase.value = 'opening';
    timer = setTimeout(reveal, LOTTERY_TIMINGS[mode].opening);
  }
  function skip() {
    if (!busy.value) return;
    skipped.value = true;
    chargeFinished = true;
    clearTimer();
    if (results.value.length) finish();
    else phase.value = 'waiting';
  }
  function reset() {
    clearTimer();
    phase.value = 'idle';
    results.value = [];
    skipped.value = false;
    chargeFinished = false;
  }
  function begin(drawMode: LotteryDrawMode = 'free') {
    reset();
    mode = drawMode;
    skipped.value = motionReduced.value || document.hidden;
    chargeFinished = skipped.value;
    phase.value = chargeFinished ? 'waiting' : 'charging';
    if (!chargeFinished) {
      timer = setTimeout(() => {
        chargeFinished = true;
        if (results.value.length) open();
        else phase.value = 'waiting';
      }, LOTTERY_TIMINGS[mode].charge);
    }
  }
  function accept(receipt: readonly LotteryPrize[]) {
    if (!busy.value || phase.value === 'opening' || phase.value === 'revealing') return;
    if (!receipt.length) {
      uncertain();
      return;
    }
    results.value = receipt.map((prize) => ({ ...prize }));
    if (chargeFinished || skipped.value || motionReduced.value) open();
  }
  function uncertain() {
    clearTimer();
    results.value = [];
    phase.value = 'uncertain';
  }
  function syncMotion() {
    motionReduced.value = Boolean(media?.matches || document.documentElement.classList.contains('disable-animations'));
    if (motionReduced.value) skip();
  }
  function onVisibility() {
    if (document.hidden) skip();
  }
  const observer = new MutationObserver(syncMotion);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  media?.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', onVisibility);
  syncMotion();
  onScopeDispose(() => {
    reset();
    observer.disconnect();
    media?.removeEventListener('change', syncMotion);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return {
    phase: readonly(phase),
    results: readonly(results),
    skipped: readonly(skipped),
    motionReduced: readonly(motionReduced),
    busy,
    begin,
    accept,
    skip,
    reset,
    uncertain,
  };
}
