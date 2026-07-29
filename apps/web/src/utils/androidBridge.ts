export interface LightNoteAndroidBridge {
  postMessage: (message: string) => void;
}

export type AndroidLegalDocument = 'privacy-policy.html' | 'user-agreement.html';

declare global {
  interface Window {
    LightNoteAndroid?: LightNoteAndroidBridge;
  }
}

export function hasLightNoteAndroidUserAgent(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
) {
  return /\bLightNoteAndroid\/[\w.-]+/i.test(userAgent);
}

export function hasAndroidBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.LightNoteAndroid?.postMessage === 'function';
}

export function isLightNoteAndroidApp(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
) {
  return hasAndroidBridge() || hasLightNoteAndroidUserAgent(userAgent);
}

export function isAndroidWebViewRuntime(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
) {
  return (
    isLightNoteAndroidApp(userAgent) ||
    (/Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent))
  );
}

export function postAndroidMessage(payload: Record<string, unknown>): boolean {
  if (!hasAndroidBridge()) return false;

  try {
    window.LightNoteAndroid!.postMessage(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('Android 原生通道不可用:', error);
    return false;
  }
}

export function postAndroidAppReady(): boolean {
  return postAndroidMessage({ type: 'app.ready' });
}

export function postAndroidOpenLegalDocument(document: AndroidLegalDocument): boolean {
  return postAndroidMessage({ type: 'legal.open', document });
}
