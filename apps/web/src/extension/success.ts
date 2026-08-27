import { EXTENSION_APP_ORIGIN } from './api';
import { buildResourceHref } from '@lightnote/shared';
import type { ExtensionSuccess } from './types';

export function extensionResourcePath(result: ExtensionSuccess): string {
  const canonicalPath = buildResourceHref({ type: result.type, id: String(result.resourceId || '') });
  if (canonicalPath) return canonicalPath;
  if (result.type === 'bookmark') return '/home';
  if (result.type === 'note') return '/noteLibrary';
  return '/cloudSpace';
}

export function extensionResourceUrl(result: ExtensionSuccess): string {
  return `${EXTENSION_APP_ORIGIN}${extensionResourcePath(result)}`;
}
