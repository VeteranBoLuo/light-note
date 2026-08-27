import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  values: new Map(),
  setEx: vi.fn(async (key, _ttl, value) => {
    redis.values.set(key, value);
    return 'OK';
  }),
  getDel: vi.fn(async (key) => {
    const value = redis.values.get(key) ?? null;
    redis.values.delete(key);
    return value;
  }),
}));

vi.mock('./redisClient.js', () => ({ default: redis }));

const { consumeExtensionAuthorizationCode, createExtensionAuthorizationCode, extensionAuthInternals } =
  await import('./extensionAuth.js');

const clientId = 'abcdefghijklmnopabcdefghijklmnop';
const redirectUri = `https://${clientId}.chromiumapp.org/light-note-auth`;
const deviceId = 'device-7d1719f5-59f2-4f16-a4af-53e9840dc624';
const codeVerifier = 'x'.repeat(64);
const env = { LIGHTNOTE_EXTENSION_IDS: clientId };

function authorizationRequest(overrides = {}) {
  return {
    clientId,
    redirectUri,
    state: 's'.repeat(43),
    codeChallenge: extensionAuthInternals.sha256Base64Url(codeVerifier),
    codeChallengeMethod: 'S256',
    deviceDigest: extensionAuthInternals.sha256Hex(deviceId),
    ...overrides,
  };
}

describe('extensionAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.values.clear();
  });

  it('签发只存摘要键并以 PKCE、扩展身份和设备绑定后一次性交换', async () => {
    const authorization = await createExtensionAuthorizationCode({
      userId: 'user-1',
      request: authorizationRequest(),
      env,
    });
    const [storedKey, ttl] = redis.setEx.mock.calls[0];
    expect(storedKey).not.toContain(authorization.code);
    expect(ttl).toBe(5 * 60);

    await expect(
      consumeExtensionAuthorizationCode({
        code: authorization.code,
        codeVerifier,
        deviceId,
        clientId,
        redirectUri,
        env,
      }),
    ).resolves.toEqual({ userId: 'user-1', clientId });
    await expect(
      consumeExtensionAuthorizationCode({
        code: authorization.code,
        codeVerifier,
        deviceId,
        clientId,
        redirectUri,
        env,
      }),
    ).rejects.toMatchObject({ code: 'EXTENSION_CODE_INVALID' });
  });

  it('错误 PKCE 会消费授权码，之后正确 verifier 也不能重放', async () => {
    const authorization = await createExtensionAuthorizationCode({
      userId: 'user-1',
      request: authorizationRequest(),
      env,
    });
    await expect(
      consumeExtensionAuthorizationCode({
        code: authorization.code,
        codeVerifier: 'y'.repeat(64),
        deviceId,
        clientId,
        redirectUri,
        env,
      }),
    ).rejects.toMatchObject({ code: 'EXTENSION_CODE_INVALID' });
    await expect(
      consumeExtensionAuthorizationCode({
        code: authorization.code,
        codeVerifier,
        deviceId,
        clientId,
        redirectUri,
        env,
      }),
    ).rejects.toMatchObject({ code: 'EXTENSION_CODE_INVALID' });
  });

  it('拒绝未列入白名单的扩展与伪造 chromiumapp 回调', async () => {
    await expect(
      createExtensionAuthorizationCode({
        userId: 'user-1',
        request: authorizationRequest(),
        env: { LIGHTNOTE_EXTENSION_IDS: 'pppppppppppppppppppppppppppppppp' },
      }),
    ).rejects.toMatchObject({ code: 'EXTENSION_CLIENT_FORBIDDEN', status: 403 });
    await expect(
      createExtensionAuthorizationCode({
        userId: 'user-1',
        request: authorizationRequest({ redirectUri: 'https://example.com/callback' }),
        env,
      }),
    ).rejects.toMatchObject({ code: 'EXTENSION_REDIRECT_INVALID' });
  });

  it('设备摘要不匹配时拒绝交换', async () => {
    const authorization = await createExtensionAuthorizationCode({
      userId: crypto.randomUUID(),
      request: authorizationRequest(),
      env,
    });
    await expect(
      consumeExtensionAuthorizationCode({
        code: authorization.code,
        codeVerifier,
        deviceId: 'another-device',
        clientId,
        redirectUri,
        env,
      }),
    ).rejects.toMatchObject({ code: 'EXTENSION_CODE_INVALID' });
  });
});
