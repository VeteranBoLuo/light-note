import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLightNoteAndroidVersion,
  hasAndroidNativeNotificationCapability,
  hasAndroidBridge,
  hasLightNoteAndroidUserAgent,
  isAndroidWebViewRuntime,
  isLightNoteAndroidApp,
  postAndroidAppReady,
  clearAndroidChatNotifications,
  configureAndroidNotifications,
  postAndroidMessage,
  postAndroidOpenLegalDocument,
  postAndroidChatNotification,
  syncAndroidNotifications,
} from './androidBridge';

afterEach(() => {
  delete window.LightNoteAndroid;
  vi.restoreAllMocks();
});

describe('androidBridge', () => {
  it('区分轻笺 APK、普通安卓浏览器与系统 WebView', () => {
    const chromeUa =
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36';
    const appUa = `${chromeUa} LightNoteAndroid/1.0.0`;
    const notificationAppUa = `${appUa} LightNoteNativeNotifications/1`;
    const webViewUa =
      'Mozilla/5.0 (Linux; Android 12; HUAWEI) AppleWebKit/537.36 Version/4.0 Chrome/114.0.0.0 Mobile Safari/537.36; wv)';

    expect(hasLightNoteAndroidUserAgent(chromeUa)).toBe(false);
    expect(hasLightNoteAndroidUserAgent(appUa)).toBe(true);
    expect(isLightNoteAndroidApp(chromeUa)).toBe(false);
    expect(isLightNoteAndroidApp(appUa)).toBe(true);
    expect(isLightNoteAndroidApp(webViewUa)).toBe(false);
    expect(isAndroidWebViewRuntime(chromeUa)).toBe(false);
    expect(isAndroidWebViewRuntime(webViewUa)).toBe(true);

    // 应用内更新检查要拿到具体版本号，不只是"是不是 App"
    expect(getLightNoteAndroidVersion(appUa)).toBe('1.0.0');
    expect(getLightNoteAndroidVersion(`${chromeUa} LightNoteAndroid/1.2.10`)).toBe('1.2.10');
    expect(getLightNoteAndroidVersion(chromeUa)).toBe('');
    expect(getLightNoteAndroidVersion(webViewUa)).toBe('');
    expect(hasAndroidNativeNotificationCapability(appUa)).toBe(false);
    expect(hasAndroidNativeNotificationCapability(notificationAppUa)).toBe(true);
  });

  it('没有原生通道时安全回退', () => {
    expect(hasAndroidBridge()).toBe(false);
    expect(postAndroidMessage({ type: 'download' })).toBe(false);
  });

  it('把结构化消息序列化后交给受信原生通道', () => {
    const postMessage = vi.fn();
    window.LightNoteAndroid = { postMessage };

    expect(postAndroidMessage({ type: 'privacyConsent.withdraw' })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'privacyConsent.withdraw' }));
  });

  it('首个路由页面完成绘制后可通知原生壳撤掉品牌封面', () => {
    const postMessage = vi.fn();
    window.LightNoteAndroid = { postMessage };

    expect(postAndroidAppReady()).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'app.ready' }));
  });

  it('设置页可让原生壳打开内置协议文档', () => {
    const postMessage = vi.fn();
    window.LightNoteAndroid = { postMessage };

    expect(postAndroidOpenLegalDocument('privacy-policy.html')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'legal.open', document: 'privacy-policy.html' }));
  });

  it('原生通知桥严格区分普通未读角标和不参与角标的聊天室定向提醒', () => {
    const postMessage = vi.fn();
    window.LightNoteAndroid = { postMessage };

    configureAndroidNotifications(true);
    syncAndroidNotifications({ unreadCount: 3, badgeEnabled: true, alert: true, path: '/notifications' });
    postAndroidChatNotification({
      notificationId: 'notice-1',
      title: '有人提及了你',
      content: '测试内容',
      path: '/community-chat?message=message-1',
    });
    clearAndroidChatNotifications();

    expect(postMessage.mock.calls.map(([value]) => JSON.parse(value))).toEqual([
      { type: 'notifications.configure', enabled: true },
      {
        type: 'notifications.sync',
        unreadCount: 3,
        badgeEnabled: true,
        alert: true,
        path: '/notifications',
      },
      {
        type: 'notifications.chat',
        notificationId: 'notice-1',
        title: '有人提及了你',
        content: '测试内容',
        path: '/community-chat?message=message-1',
      },
      { type: 'notifications.chat.clear' },
    ]);
  });

  it('原生通道抛错时不阻断网页回退逻辑', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.LightNoteAndroid = {
      postMessage() {
        throw new Error('bridge unavailable');
      },
    };

    expect(postAndroidMessage({ type: 'download' })).toBe(false);
  });
});
