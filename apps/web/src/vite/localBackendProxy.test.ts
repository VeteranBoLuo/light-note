import { describe, expect, it } from 'vitest';
import {
  assertLocalViteBackend,
  createLocalBackendProxy,
  isPublicUploadReadMethod,
  LOCAL_VITE_BACKEND_TARGET,
  PUBLIC_UPLOAD_ORIGIN,
  stripPublicUploadRequestCredentials,
  stripPublicUploadResponseCookies,
} from './localBackendProxy';

describe('Vite 本地后端代理边界', () => {
  it.each([undefined, '', 'local', ' LOCAL '])('允许缺省或本地环境 %s', (value) => {
    expect(() => assertLocalViteBackend(value)).not.toThrow();
  });

  it.each(['production', 'remote', 'https://boluo66.top'])('拒绝开发服务器代理远程环境 %s', (value) => {
    expect(() => assertLocalViteBackend(value)).toThrow('VITE_REMOTE_BACKEND_PROXY_BLOCKED');
  });

  it('REST 和实时连接只指向本机，公开上传资源只读线上', () => {
    const proxy = createLocalBackendProxy();

    expect(proxy['^/api(?:/|$)'].rewrite('/api/community-chat/access')).toBe('/community-chat/access');
    expect(proxy['^/api(?:/|$)'].target).toBe(LOCAL_VITE_BACKEND_TARGET);
    expect(proxy['/realtime/chat']).toMatchObject({ ws: true, changeOrigin: false });
    expect(proxy['/realtime/notifications']).toMatchObject({ ws: true, changeOrigin: false });
    expect(proxy['^/uploads(?:/|$)']).toMatchObject({ target: PUBLIC_UPLOAD_ORIGIN, changeOrigin: true });
    expect(proxy['^/uploads(?:/|$)'].bypass?.({ method: 'GET' } as never, undefined, {} as never)).toBeUndefined();
    expect(proxy['^/uploads(?:/|$)'].bypass?.({ method: 'POST' } as never, undefined, {} as never)).toBe(false);
  });

  it.each(['GET', 'get', 'HEAD'])('allows public upload read method %s', (method) => {
    expect(isPublicUploadReadMethod(method)).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', undefined])('rejects public upload non-read method %s', (method) => {
    expect(isPublicUploadReadMethod(method)).toBe(false);
  });

  it('removes credentials before forwarding public uploads', () => {
    const removeHeader = vi.fn();

    stripPublicUploadRequestCredentials({ removeHeader } as never);

    expect(removeHeader.mock.calls.map(([header]) => header)).toEqual(
      expect.arrayContaining([
        'authorization',
        'cookie',
        'x-session-id',
        'x-admin-context',
        'fingerprint',
        'x-device-id',
        'x-log-device-id',
      ]),
    );
  });

  it('does not allow the public upload origin to set localhost cookies', () => {
    const response = { headers: { 'set-cookie': ['sid=remote'], etag: 'asset-etag' } };

    stripPublicUploadResponseCookies(response);

    expect(response.headers).toEqual({ etag: 'asset-etag' });
  });
});
