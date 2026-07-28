export interface LightNoteAndroidBridge {
  postMessage: (message: string) => void;
}

declare global {
  interface Window {
    LightNoteAndroid?: LightNoteAndroidBridge;
  }
}

export function hasAndroidBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.LightNoteAndroid?.postMessage === 'function';
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
