import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { resolveNotificationLink } from './notificationLink';

const origin = 'https://boluo66.top';

describe('通知链接导航', () => {
  it.each([
    '/f/survey?channel=notification#question',
    'https://boluo66.top/f/survey?channel=notification#question',
    ' HTTPS://BOLUO66.TOP:443/f/survey?channel=notification#question ',
    '//boluo66.top/f/survey?channel=notification#question',
  ])('站内和完整链接都进入同一表单，保留查询和锚点：%s', (link) => {
    const target = resolveNotificationLink(link, origin);
    expect(target).toEqual({ kind: 'internal', url: '/f/survey?channel=notification#question' });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/f/:publicId', name: 'form', component: {} }],
    });
    expect(router.resolve(target!.url)).toMatchObject({
      name: 'form',
      params: { publicId: 'survey' },
      query: { channel: 'notification' },
      hash: '#question',
    });
  });

  it('到账通知的明细地址保持原查询参数', () => {
    expect(resolveNotificationLink('/growth?section=rewards&reward=ledger', origin)).toEqual({
      kind: 'internal',
      url: '/growth?section=rewards&reward=ledger',
    });
  });

  it.each(['https://example.com/f/survey', 'http://boluo66.top/f/survey', '//example.com/f/survey'])(
    '外站 HTTP(S) 地址不伪装成站内路径：%s',
    (link) => {
      expect(resolveNotificationLink(link, origin)).toMatchObject({ kind: 'external' });
    },
  );

  it.each([
    '',
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///etc/hosts',
    'intent://f/survey',
    'ftp://boluo66.top/f/survey',
    'https://name:secret@boluo66.top/f/survey',
    'https://boluo66.top/\n/f/survey',
    '/\\example.com/f/survey',
    'https://',
    'survey',
  ])('无效地址或不支持的协议不导航：%s', (link) => {
    expect(resolveNotificationLink(link, origin)).toBeNull();
  });
});
