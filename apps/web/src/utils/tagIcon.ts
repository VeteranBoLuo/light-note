const SVG_DATA_URL_PREFIX = 'data:image/svg+xml;base64,';

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function normalizeTagIconValue(input?: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image/')) return raw;
  if (raw.includes('<svg')) return `${SVG_DATA_URL_PREFIX}${encodeUtf8Base64(raw)}`;
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 64) return `${SVG_DATA_URL_PREFIX}${raw}`;
  return raw;
}
