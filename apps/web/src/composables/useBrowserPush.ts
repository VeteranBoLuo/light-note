import { ref, readonly } from 'vue';
import { apiBasePost } from '@/http/request';
import { isLightNoteAndroidApp } from '@/utils/androidBridge';
import { isBrowserPushDesktop } from '@/utils/browserPushPlatform';

interface Binding {
  id: string;
  generation: string;
  userId: string;
}
export type BrowserPushState =
  'loading' | 'pending' | 'off' | 'on' | 'denied' | 'unsupported' | 'unavailable' | 'error';
const state = ref<BrowserPushState>('loading');
export interface PushDiagnostics {
  permission: NotificationPermission | null;
  subscription: 'present' | 'absent' | null;
  bindingActive: boolean | null;
  available: boolean | null;
  checkedAt: number | null;
  stale: boolean;
}
const emptyDiagnostics = (): PushDiagnostics => ({
  permission: null,
  subscription: null,
  bindingActive: null,
  available: null,
  checkedAt: null,
  stale: false,
});
const diagnostics = ref<PushDiagnostics>(emptyDiagnostics());
let refreshingGeneration: number | null = null;
const busy = ref(false);
const enabled = ref(false);
// Device preference is separate from browser permission and an active subscription.
// A new key deliberately ignores the legacy account preference for existing users.
const preferred = ref(true);
const preferenceKey = (owner: string) => `light-note:browser-push-default-on:${owner}`;
function readPreference(owner: string) {
  try {
    return localStorage.getItem(preferenceKey(owner)) !== 'off';
  } catch {
    return true;
  }
}
function savePreference(value: boolean) {
  if (!currentOwner) throw new Error('PUSH_OWNER_REQUIRED');
  localStorage.setItem(preferenceKey(currentOwner), value ? 'on' : 'off');
  preferred.value = value;
}
let config: { available: boolean; publicKey: string; userId: string; enabled: boolean } | null = null;
let currentOwner = '';
let generation = 0;
let ownerGeneration = 0;
const platformSupported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  !isLightNoteAndroidApp() &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;
const supported = () => isBrowserPushDesktop() && platformSupported();
async function registration() {
  const result = await navigator.serviceWorker.register('/light-note-sw.js?v=3', {
    scope: '/',
    updateViaCache: 'none',
  });
  const installing = result.installing || result.waiting;
  if (installing && installing.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PUSH_WORKER_TIMEOUT')), 10000);
      installing.addEventListener('statechange', () => {
        if (installing.state === 'activated') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }
  if (result.active) return result;
  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PUSH_WORKER_TIMEOUT')), 10000)),
  ]);
}
async function bindingMessage(type: string, binding?: Binding | null): Promise<Binding | null> {
  const worker = (await registration()).active;
  if (!worker) throw new Error('PUSH_WORKER_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('PUSH_WORKER_TIMEOUT'));
    }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data?.error) reject(new Error('PUSH_STORAGE_FAILED'));
      else resolve(event.data?.binding || null);
    };
    worker.postMessage({ type, binding }, [channel.port2]);
  });
}
async function post(path: string, body: unknown = {}) {
  const response = await apiBasePost(`/api/notification/browser/${path}`, body, { silent: true });
  if (response?.status !== 200) throw new Error('PUSH_REQUEST_FAILED');
  return response.data;
}
export async function clearBrowserPush(): Promise<void> {
  const clearingGeneration = ++generation;
  diagnostics.value = emptyDiagnostics();
  if (!platformSupported()) {
    enabled.value = false;
    state.value = 'off';
    return;
  }
  let binding: Binding | null = null;
  let clearError: unknown;
  try {
    binding = await bindingMessage('push.binding.get');
    // Clear locally first: a queued push cannot expose the previous account while unbinding.
    await bindingMessage('push.binding.set', null);
  } catch (error) {
    clearError = error;
  }
  // Even a broken/old service worker must not prevent endpoint revocation on logout.
  const reg = (await navigator.serviceWorker.getRegistration?.('/')) || (await registration());
  const subscription = await reg.pushManager.getSubscription();
  await subscription?.unsubscribe();
  if (binding) await post('unsubscribe', binding);
  if (clearError && !subscription) throw clearError;
  if (clearingGeneration !== generation) return;
  enabled.value = false;
  state.value = 'off';
  diagnostics.value = {
    permission: typeof Notification !== 'undefined' ? Notification.permission : null,
    subscription: 'absent',
    bindingActive: false,
    available: config?.available ?? null,
    checkedAt: Date.now(),
    stale: false,
  };
}
export async function syncBrowserPushOwner(userId: string) {
  const ownerEpoch = ++ownerGeneration;
  diagnostics.value = emptyDiagnostics();
  currentOwner = userId;
  config = null;
  enabled.value = false;
  preferred.value = readPreference(userId);
  const requestGeneration = ++generation;
  if (!supported()) {
    if (!isBrowserPushDesktop() && platformSupported()) await clearBrowserPush().catch(() => {});
    state.value = 'unsupported';
    return;
  }
  try {
    const binding = await bindingMessage('push.binding.get');
    if (requestGeneration !== generation) return;
    if (binding && binding.userId !== userId) {
      await clearBrowserPush();
      if (ownerEpoch !== ownerGeneration || !userId) return;
    }
    if (!userId) {
      state.value = 'off';
      return;
    }
    await refreshBrowserPush();
  } catch {
    if (ownerEpoch === ownerGeneration) state.value = 'error';
  }
}
export async function refreshBrowserPush() {
  if (refreshingGeneration === generation || busy.value) return;
  if (!supported()) {
    state.value = 'unsupported';
    return;
  }
  const requestGeneration = generation;
  refreshingGeneration = requestGeneration;
  diagnostics.value = { ...diagnostics.value, stale: true };
  state.value = 'loading';
  try {
    const binding = await bindingMessage('push.binding.get');
    const next = await post('config', binding || {});
    if (requestGeneration !== generation) return;
    if (currentOwner && next.userId !== currentOwner) throw new Error('PUSH_OWNER_CHANGED');
    config = next;
    currentOwner = next.userId;
    preferred.value = readPreference(next.userId);
    const subscription = await (await registration()).pushManager.getSubscription();
    if (requestGeneration !== generation) return;
    diagnostics.value = {
      permission: Notification.permission,
      subscription: subscription ? 'present' : 'absent',
      bindingActive: Boolean(next.enabled && binding?.userId === next.userId),
      available: next.available,
      checkedAt: Date.now(),
      stale: false,
    };
    enabled.value = Boolean(
      next.enabled && binding?.userId === next.userId && subscription && Notification.permission === 'granted',
    );
    if (!preferred.value) {
      if (binding || subscription) await clearBrowserPush();
      state.value = 'off';
    } else if (Notification.permission === 'denied') state.value = 'denied';
    else if (!next.available) state.value = 'unavailable';
    else
      state.value =
        next.enabled && binding?.userId === next.userId && subscription && Notification.permission === 'granted'
          ? 'on'
          : 'pending';
    if (preferred.value && !enabled.value && next.available && Notification.permission === 'granted') {
      await setEnabled(true, navigator.language, false);
    }
  } catch {
    if (requestGeneration === generation) {
      state.value = 'error';
      diagnostics.value = { ...diagnostics.value, stale: true };
    }
  } finally {
    if (refreshingGeneration === requestGeneration) refreshingGeneration = null;
  }
}
function applicationKey(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function setEnabled(nextEnabled: boolean, locale: string, requestPermission = true) {
  if (busy.value) return;
  busy.value = true;
  const owner = currentOwner;
  const requestGeneration = generation;
  try {
    savePreference(nextEnabled);
    if (!nextEnabled) {
      await clearBrowserPush();
      return;
    }
    if (!supported() || !config?.available) {
      state.value = supported() ? 'unavailable' : 'unsupported';
      return;
    }
    // Permission request remains directly in the explicit click handler (Safari requirement).
    const permission =
      Notification.permission === 'granted' || !requestPermission
        ? Notification.permission
        : await Notification.requestPermission();
    if (owner !== currentOwner || requestGeneration !== generation) return;
    diagnostics.value = { ...diagnostics.value, permission, stale: true };
    if (permission !== 'granted') {
      state.value = permission === 'denied' ? 'denied' : 'pending';
      return;
    }
    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    const expectedKey = applicationKey(config.publicKey);
    const actualKey = subscription?.options.applicationServerKey;
    if (subscription && actualKey && Array.from(new Uint8Array(actualKey)).join() !== Array.from(expectedKey).join()) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expectedKey });
    const binding = (await post('subscribe', { subscription: subscription.toJSON(), locale })) as Binding;
    if (owner !== currentOwner || binding.userId !== owner || requestGeneration !== generation) {
      await subscription.unsubscribe();
      await post('unsubscribe', binding).catch(() => {});
      return;
    }
    await bindingMessage('push.binding.set', binding);
    await post('activate', binding);
    if (owner !== currentOwner || requestGeneration !== generation) {
      await clearBrowserPush();
      return;
    }
    enabled.value = true;
    diagnostics.value = {
      permission,
      subscription: 'present',
      bindingActive: true,
      available: true,
      checkedAt: Date.now(),
      stale: false,
    };
    state.value = 'on';
  } catch {
    if (owner === currentOwner && requestGeneration === generation) {
      state.value = 'error';
      diagnostics.value = { ...diagnostics.value, stale: true };
    }
  } finally {
    busy.value = false;
    if (owner !== currentOwner && currentOwner) void refreshBrowserPush();
  }
}
export function useBrowserPush() {
  return {
    state,
    busy,
    enabled,
    preferred,
    diagnostics: readonly(diagnostics),
    refresh: refreshBrowserPush,
    setEnabled,
  };
}
