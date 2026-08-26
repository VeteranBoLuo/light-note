import type { ExtensionOperationReceipt } from './types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

async function fingerprintPayload(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(payload)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function resolveExtensionOperationReceipt({
  current,
  scope,
  payload,
}: {
  current?: ExtensionOperationReceipt | null;
  scope: 'bookmark:formal' | 'bookmark:inbox' | 'note';
  payload: unknown;
}): Promise<ExtensionOperationReceipt> {
  const fingerprint = await fingerprintPayload(payload);
  const prefix = `browser-extension:${scope}:`;
  if (
    current?.fingerprint === fingerprint
    && current.key.startsWith(prefix)
    && current.key.length <= 160
  ) {
    return current;
  }
  return {
    key: `${prefix}${crypto.randomUUID()}`,
    fingerprint,
  };
}

export const extensionOperationInternals = Object.freeze({ canonicalize, fingerprintPayload });
