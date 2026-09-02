import { describe, expect, it } from 'vitest';
import {
  assertLocalViteBackend,
  createLocalBackendProxy,
  LOCAL_VITE_BACKEND_TARGET,
} from './localBackendProxy';

describe('Vite 本地后端代理边界', () => {
  it.each([undefined, '', 'local', ' LOCAL '])('允许缺省或本地环境 %s', (value) => {
    expect(() => assertLocalViteBackend(value)).not.toThrow();
  });

  it.each(['production', 'remote', 'https://boluo66.top'])('拒绝开发服务器代理远程环境 %s', (value) => {
    expect(() => assertLocalViteBackend(value)).toThrow('VITE_REMOTE_BACKEND_PROXY_BLOCKED');
  });

  it('REST、上传和实时连接全部只指向本机后端', () => {
    const proxy = createLocalBackendProxy();

    expect(Object.values(proxy).every((entry) => entry.target === LOCAL_VITE_BACKEND_TARGET)).toBe(true);
    expect(proxy['^/api(?:/|$)'].rewrite('/api/community-chat/access')).toBe('/community-chat/access');
    expect(proxy['/realtime/chat']).toMatchObject({ ws: true, changeOrigin: false });
    expect(proxy['/realtime/notifications']).toMatchObject({ ws: true, changeOrigin: false });
  });
});
