import { computed, ref, shallowRef } from 'vue';
import { recordOperation } from '@/api/commonApi';
import { OPERATION_LOG_MAP } from '@/config/logMap';

export type PwaGuidePlatform = 'harmony' | 'ios' | 'android' | 'desktop';
export type PwaInstallSource = 'landing' | 'landing-final' | 'person-center' | 'settings';

type InstallChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

const deferredPrompt = shallowRef<BeforeInstallPromptEvent | null>(null);
const standalone = ref(false);
const prompting = ref(false);
const guideVisible = ref(false);
const guidePlatform = ref<PwaGuidePlatform>('harmony');
const guideSource = ref<PwaInstallSource>('settings');
let initialized = false;

function updateStandaloneState() {
  const navigatorStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  standalone.value = navigatorStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || (!window.isSecureContext && window.location.hostname !== 'localhost')) return;
  window.addEventListener(
    'load',
    () => {
      void navigator.serviceWorker.register('/light-note-sw.js', { scope: '/' }).catch((error) => {
        console.warn('PWA service worker registration failed:', error);
      });
    },
    { once: true },
  );
}

export function initializePwaInstall() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  updateStandaloneState();
  registerServiceWorker();

  const displayMode = window.matchMedia('(display-mode: standalone)');
  displayMode.addEventListener?.('change', updateStandaloneState);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt.value = event as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null;
    standalone.value = true;
    guideVisible.value = false;
    void recordOperation(OPERATION_LOG_MAP.pwa.installed);
  });
}

function defaultGuidePlatform(): PwaGuidePlatform {
  return window.matchMedia('(max-width: 767px)').matches ? 'harmony' : 'desktop';
}

export function usePwaInstall() {
  const canPrompt = computed(() => Boolean(deferredPrompt.value) && !standalone.value);
  const installState = computed<'installed' | 'prompt-ready' | 'manual'>(() =>
    standalone.value ? 'installed' : canPrompt.value ? 'prompt-ready' : 'manual',
  );

  function openGuide(source: PwaInstallSource, platform?: PwaGuidePlatform) {
    guideSource.value = source;
    guidePlatform.value = platform || defaultGuidePlatform();
    guideVisible.value = true;
    void recordOperation({
      ...OPERATION_LOG_MAP.pwa.openGuide,
      operation: `${OPERATION_LOG_MAP.pwa.openGuide.operation}【${source}】`,
    });
  }

  async function requestInstall(source: PwaInstallSource): Promise<'accepted' | 'dismissed' | 'manual' | 'installed'> {
    if (standalone.value) return 'installed';
    const promptEvent = deferredPrompt.value;
    if (!promptEvent) {
      openGuide(source);
      return 'manual';
    }

    prompting.value = true;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      deferredPrompt.value = null;
      const operation =
        choice.outcome === 'accepted' ? OPERATION_LOG_MAP.pwa.accepted : OPERATION_LOG_MAP.pwa.dismissed;
      void recordOperation({
        ...operation,
        operation: `${operation.operation}【${source}】`,
      });
      return choice.outcome;
    } finally {
      prompting.value = false;
    }
  }

  return {
    canPrompt,
    guidePlatform,
    guideSource,
    guideVisible,
    installState,
    isStandalone: computed(() => standalone.value),
    prompting: computed(() => prompting.value),
    openGuide,
    requestInstall,
  };
}
