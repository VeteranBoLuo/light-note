import { afterEach, expect, it, vi } from 'vitest';
import * as images from '../util/communityFeed/images.js';
import { image } from './communityFeedHandle.js';

function response() {
  const headers = {};
  const res = {
    headers,
    headersSent: false,
    set: vi.fn((name, value) => {
      headers[name] = value;
      return res;
    }),
    status: vi.fn(() => res),
    end: vi.fn(),
    sendStatus: vi.fn(),
    type: vi.fn(),
  };
  return res;
}
const request = (values = {}) => ({
  user: { id: 'reader' },
  params: { id: 'image' },
  query: {},
  fresh: true,
  ...values,
});
const metadata = {
  object_key: 'private/original.png',
  content_hash: 'a'.repeat(64),
  content_type: 'image/png',
  signedUrl: 'https://fixture.invalid/signed',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('revalidates image permission before returning a private cached response', async () => {
  const read = vi.spyOn(images, 'readImage').mockResolvedValue(metadata);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const res = response();
  await image(request(), res);
  expect(read).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 'reader' } }));
  expect(res.headers['Cache-Control']).toBe('private, no-cache');
  expect(res.headers.ETag).toMatch(/^"[a-f0-9]{64}"$/);
  expect(res.status).toHaveBeenCalledWith(304);
  expect(fetch).not.toHaveBeenCalled();
});
it('refuses a cached image after the post becomes inaccessible', async () => {
  vi.spyOn(images, 'readImage').mockRejectedValue(new Error('not visible'));
  const res = response();
  await image(request(), res);
  expect(res.headers['Cache-Control']).toBe('private, no-store');
  expect(res.sendStatus).toHaveBeenCalledWith(404);
  expect(res.status).not.toHaveBeenCalled();
});
it('keeps administrator media uncached and binds it to the selected resource user', async () => {
  const read = vi.spyOn(images, 'readImage').mockResolvedValue(metadata);
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', fetch);
  const res = response();
  await image(request({ adminContext: { id: 'preview' }, resourceUser: { id: 'subject' } }), res);
  expect(read).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 'subject' } }));
  expect(res.headers['Cache-Control']).toBe('private, no-store');
  expect(res.headers.ETag).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not cache a transient storage failure under the original image validator', async () => {
  vi.spyOn(images, 'readImage').mockResolvedValue(metadata);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  const res = response();
  await image(request({ fresh: false }), res);
  expect(res.headers['Cache-Control']).toBe('private, no-store');
  expect(res.sendStatus).toHaveBeenCalledWith(404);
});
