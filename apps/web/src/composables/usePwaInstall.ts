import { computed, ref, shallowRef } from 'vue';
import { recordOperation } from '@/api/commonApi';
import { OPERATION_LOG_MAP } from '@/config/logMap';

export type PwaGuidePlatform = 'harmony' | 'ios' | 'android' | 'desktop';
export type PwaInstallSource = 'landing' | 'landing-final' | 'person-center' | 'settings';
export type PwaBrowserFamily =
  | 'huawei'
  | 'quark'
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'safari'
  | '360'
  | 'opera'
  | 'uc'
  | 'qq'
  | 'baidu'
  | 'sogou'
  | 'other';
export type PwaInstallResult = 'accepted' | 'dismissed' | 'unsupported' | 'failed' | 'installed';

type InstallChoice = {
  outcome: 'accepted' | 'dismissed';
  platform?: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<InstallChoice | void> | InstallChoice | void;
  userChoice?: Promise<InstallChoice>;
}

const deferredPrompt = shallowRef<BeforeInstallPromptEvent | null>(null);
const standalone = ref(false);
const prompting = ref(false);
const guideVisible = ref(false);
const guidePlatform = ref<PwaGuidePlatform>('harmony');
const guideSource = ref<PwaInstallSource>('settings');
const detectedBrowser = ref<PwaBrowserFamily>('other');
const detectedPlatform = ref<PwaGuidePlatform>('desktop');
let initialized = false;

export function detectPwaBrowserFamily(userAgent: string): PwaBrowserFamily {
  if (/HuaweiBrowser/i.test(userAgent)) return 'huawei';
  if (/Quark/i.test(userAgent)) return 'quark';
  if (/360SE|360EE|QihooBrowser|QHBrowser|360 Aphone Browser/i.test(userAgent)) return '360';
  if (/EdgA|EdgiOS|Edg\//i.test(userAgent)) return 'edge';
  if (/FxiOS|Firefox/i.test(userAgent)) return 'firefox';
  if (/OPiOS|OPR\/|Opera/i.test(userAgent)) return 'opera';
  if (/UCBrowser|UCWEB/i.test(userAgent)) return 'uc';
  if (/MQQBrowser|QQBrowser/i.test(userAgent)) return 'qq';
  if (/BIDUBrowser|baidubrowser/i.test(userAgent)) return 'baidu';
  if (/MetaSr|SogouMobileBrowser/i.test(userAgent)) return 'sogou';
  if (/CriOS|Chrome|Chromium/i.test(userAgent)) return 'chrome';
  if (/Safari/i.test(userAgent)) return 'safari';
  return 'other';
}

function detectGuidePlatform(userAgent: string): PwaGuidePlatform {
  const browserNavigator = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = browserNavigator.userAgentData?.platform || navigator.platform || '';
  const isIPadDesktopMode = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/i.test(userAgent) || isIPadDesktopMode) return 'ios';
  if (/HarmonyOS|OpenHarmony|HUAWEI|HONOR|HuaweiBrowser/i.test(userAgent)) return 'harmony';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

function updateDetectedEnvironment() {
  const userAgent = navigator.userAgent || '';
  detectedBrowser.value = detectPwaBrowserFamily(userAgent);
  detectedPlatform.value = detectGuidePlatform(userAgent);
}

function updateStandaloneState() {
  const navigatorStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  standalone.value = navigatorStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || (!window.isSecureContext && window.location.hostname !== 'localhost')) return;
  try {
    await navigator.serviceWorker.register('/light-note-sw.js?v=2', {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch (error) {
    console.warn('PWA service worker registration failed:', error);
  }
}

export function initializePwaInstall() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  updateDetectedEnvironment();
  updateStandaloneState();
  void registerServiceWorker();

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

function isInstallChoice(value: unknown): value is InstallChoice {
  if (!value || typeof value !== 'object') return false;
  const outcome = (value as { outcome?: unknown }).outcome;
  return outcome === 'accepted' || outcome === 'dismissed';
}

async function resolvePromptChoice(promptEvent: BeforeInstallPromptEvent): Promise<InstallChoice | null> {
  const promptResult = await promptEvent.prompt();
  if (isInstallChoice(promptResult)) return promptResult;
  if (!promptEvent.userChoice) return null;
  const userChoice = await promptEvent.userChoice;
  return isInstallChoice(userChoice) ? userChoice : null;
}

function recordInstallResult(source: PwaInstallSource, result: Exclude<PwaInstallResult, 'installed'>) {
  const operation = {
    accepted: OPERATION_LOG_MAP.pwa.accepted,
    dismissed: OPERATION_LOG_MAP.pwa.dismissed,
    unsupported: OPERATION_LOG_MAP.pwa.unsupported,
    failed: OPERATION_LOG_MAP.pwa.failed,
  }[result];
  void recordOperation({
    ...operation,
    operation: `${operation.operation}【${source}】`,
  });
}

export function usePwaInstall() {
  const canPrompt = computed(() => Boolean(deferredPrompt.value) && !standalone.value);
  const installState = computed<'installed' | 'prompt-ready' | 'manual'>(() =>
    standalone.value ? 'installed' : canPrompt.value ? 'prompt-ready' : 'manual',
  );

  function openGuide(source: PwaInstallSource, platform?: PwaGuidePlatform) {
    guideSource.value = source;
    guidePlatform.value = platform || detectedPlatform.value;
    guideVisible.value = true;
    void recordOperation({
      ...OPERATION_LOG_MAP.pwa.openGuide,
      operation: `${OPERATION_LOG_MAP.pwa.openGuide.operation}【${source}】`,
    });
  }

  async function requestInstall(source: PwaInstallSource): Promise<PwaInstallResult> {
    if (standalone.value) return 'installed';
    const promptEvent = deferredPrompt.value;
    if (!promptEvent) {
      recordInstallResult(source, 'unsupported');
      return 'unsupported';
    }

    prompting.value = true;
    try {
      const choice = await resolvePromptChoice(promptEvent);
      deferredPrompt.value = null;
      if (!choice) {
        recordInstallResult(source, 'failed');
        return 'failed';
      }
      recordInstallResult(source, choice.outcome);
      return choice.outcome;
    } catch (error) {
      deferredPrompt.value = null;
      recordInstallResult(source, 'failed');
      console.warn('PWA install prompt failed:', error);
      return 'failed';
    } finally {
      prompting.value = false;
    }
  }

  return {
    canPrompt,
    detectedBrowser: computed(() => detectedBrowser.value),
    detectedPlatform: computed(() => detectedPlatform.value),
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
