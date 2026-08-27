import { EXTENSION_APP_ORIGIN, extensionGet, extensionPost, isExtensionAuthError } from './api';
import {
  clearExtensionSession,
  getExtensionSession,
  getOrCreateDeviceId,
  saveExtensionSession,
} from './storage';
import type { ExtensionSession, ExtensionUser } from './types';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

async function sha256Base64Url(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeUser(value: any): ExtensionUser {
  return {
    id: String(value?.id || ''),
    alias: String(value?.alias || ''),
    email: String(value?.email || ''),
    role: String(value?.role || 'user'),
    headPicture: String(value?.headPicture || value?.head_picture || ''),
  };
}

async function persistSession(sid: string, user: any): Promise<ExtensionSession> {
  const session = {
    sid: String(sid || ''),
    deviceId: await getOrCreateDeviceId(),
    user: normalizeUser(user),
  };
  if (!session.sid || !session.user.id) throw new Error('登录结果无效，请重试');
  await saveExtensionSession(session);
  return session;
}

export async function loginExtensionWithEmail(email: string, password: string): Promise<ExtensionSession> {
  const data = await extensionPost<any>(
    '/api/user/login',
    { email: email.trim(), password, rememberMe: true },
    false,
  );
  return persistSession(data?.sid, data);
}

export async function loginExtensionThroughWebsite(): Promise<ExtensionSession> {
  const deviceId = await getOrCreateDeviceId();
  const clientId = chrome.runtime.id;
  const redirectUri = chrome.identity.getRedirectURL('light-note-auth');
  const state = randomToken();
  const codeVerifier = randomToken();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: await sha256Base64Url(codeVerifier),
    code_challenge_method: 'S256',
    device_digest: await sha256Hex(deviceId),
  });
  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: `${EXTENSION_APP_ORIGIN}/extension/authorize?${params.toString()}`,
    interactive: true,
  });
  if (!resultUrl) throw new Error('网站授权已取消');
  const callback = new URL(resultUrl);
  if (callback.searchParams.get('state') !== state) throw new Error('网站授权状态校验失败，请重试');
  const providerError = callback.searchParams.get('error');
  if (providerError) throw new Error(callback.searchParams.get('error_description') || '网站授权未完成');
  const code = callback.searchParams.get('code');
  if (!code) throw new Error('网站没有返回授权码');
  const data = await extensionPost<any>(
    '/api/user/extension/exchange',
    { code, codeVerifier, clientId, redirectUri },
    false,
  );
  return persistSession(data?.sid, data?.user);
}

export async function restoreExtensionSession(): Promise<ExtensionSession | null> {
  const stored = await getExtensionSession();
  if (!stored?.sid) return null;
  try {
    const user = await extensionGet<any>('/api/user/me');
    return persistSession(stored.sid, user);
  } catch (error) {
    if (isExtensionAuthError(error)) {
      await clearExtensionSession();
      return null;
    }
    // 临时断网不应把仍可能有效的设备会话抹掉，保留本地身份供用户重试。
    return stored;
  }
}

export async function logoutExtension(): Promise<void> {
  try {
    await extensionPost('/api/user/logout', {});
  } catch {
    // 本地会话必须始终可清除；服务端会话过期或断网不阻断退出界面。
  } finally {
    await clearExtensionSession();
  }
}

export const extensionAuthInternals = Object.freeze({ base64Url, sha256Base64Url, sha256Hex });
