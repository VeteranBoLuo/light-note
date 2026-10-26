import urls from 'virtual:lightnote-public-art';

/** Canonical identifiers and stored message URLs remain stable. Only presentation resolves the current asset. */
export function publicArtworkUrl(url: string) {
  if (urls[url]) return urls[url];
  if (typeof location !== 'undefined' && url.startsWith(location.origin + '/'))
    return urls[url.slice(location.origin.length)] || url;
  return url;
}

export function publicArtworkUrls(prefix: string, smallOnly = false) {
  return Object.entries(urls)
    .filter(([url]) => url.startsWith(prefix) && (!smallOnly || url.endsWith('-small.webp')))
    .map(([, url]) => url);
}
