export interface AdminUserAgentLabel {
  browser: string;
  device: string;
}

function version(match: RegExpMatchArray | null) {
  return match?.[1] ? ` ${match[1]}` : '';
}

export function formatAdminUserAgent(userAgent: unknown, unknownLabel = '-'): AdminUserAgentLabel {
  const ua = String(userAgent || '').trim();
  if (!ua) return { browser: unknownLabel, device: unknownLabel };

  const browser = (() => {
    const candidates: Array<[RegExp, string]> = [
      [/HuaweiBrowser\/([\d.]+)/i, 'Huawei Browser'],
      [/SamsungBrowser\/([\d.]+)/i, 'Samsung Internet'],
      [/(?:Edg|EdgiOS|EdgA)\/([\d.]+)/i, 'Edge'],
      [/(?:OPR|Opera)\/([\d.]+)/i, 'Opera'],
      [/QQBrowser\/([\d.]+)/i, 'QQ Browser'],
      [/MicroMessenger\/([\d.]+)/i, 'WeChat'],
      [/(?:FxiOS|Firefox)\/([\d.]+)/i, 'Firefox'],
      [/(?:CriOS|Chrome)\/([\d.]+)/i, 'Chrome'],
      [/Version\/([\d.]+).*Safari/i, 'Safari'],
    ];
    for (const [pattern, name] of candidates) {
      const match = ua.match(pattern);
      if (match) return `${name}${version(match)}`;
    }
    return unknownLabel;
  })();

  const device = /Android/i.test(ua)
    ? 'Android'
    : /iPad/i.test(ua)
      ? 'iPadOS'
      : /iPhone/i.test(ua)
        ? 'iOS'
        : /Macintosh|Mac OS X/i.test(ua)
          ? 'macOS'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /Linux/i.test(ua)
              ? 'Linux'
              : unknownLabel;

  return { browser, device };
}

export function formatAdminDeviceLabel(userAgent: unknown, unknownLabel = '-') {
  const { browser, device } = formatAdminUserAgent(userAgent, unknownLabel);
  if (browser === unknownLabel) return device;
  if (device === unknownLabel) return browser;
  return `${device} · ${browser}`;
}
