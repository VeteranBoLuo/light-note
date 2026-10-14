import { beforeEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ extensionRequest: request }));
import { createExtensionBookmarkAiAdoption } from './bookmarkAiAdoption';

const generated = { name: 'Private title', description: 'Private body', relatedTags: ['id:private-tag'] };
function setup() {
  const tracker = createExtensionBookmarkAiAdoption();
  tracker.setOwner('owner-1');
  tracker.setUrl('https://example.com/a');
  return tracker;
}
const events = () => request.mock.calls.map(([, options]) => options.body.dimensions);
beforeEach(() => {
  request.mockReset().mockResolvedValue({ accepted: true });
});
describe('extension bookmark adoption', () => {
  it('counts the submitted snapshot only after confirmed save, once, without content', () => {
    const tracker = setup();
    tracker.begin().filled('request-1', {}, generated, []);
    const saved = tracker.prepareSave(generated);
    expect(events().map((e) => e.adoptionKind)).toEqual(['draft']);
    tracker.setUrl('https://example.com/b');
    saved();
    saved();
    expect(events().map((e) => e.adoptionKind)).toEqual(['draft', 'saved']);
    expect(events()[1]).toMatchObject({
      requestId: 'request-1',
      measurementVersion: '2',
      surface: 'browser_extension.bookmark',
    });
    const serialized = JSON.stringify(request.mock.calls);
    for (const privateValue of ['Private title', 'Private body', 'private-tag', 'example.com'])
      expect(serialized).not.toContain(privateValue);
    expect(request.mock.calls[1][1]).toMatchObject({ expectedUserId: 'owner-1', silentAuthFailure: true });
  });
  it('retains attribution after failed save and does not count completely rewritten or unchanged output', () => {
    const tracker = setup();
    tracker.begin().filled('unchanged', generated, generated, []);
    tracker.prepareSave(generated)();
    expect(request).not.toHaveBeenCalled();
    tracker.begin().filled('request-2', {}, generated, []);
    tracker.prepareSave(generated); // Failed operation never confirms its receipt.
    tracker.prepareSave({ name: 'Manual', description: '', relatedTags: [] })();
    expect(events().map((e) => e.adoptionKind)).toEqual(['draft']);
    tracker.begin().filled('request-3', {}, generated, []);
    tracker.prepareSave(generated); // A retry takes another immutable snapshot.
    tracker.prepareSave(generated)();
    expect(
      events()
        .filter((e) => e.adoptionKind === 'saved')
        .map((e) => e.requestId),
    ).toEqual(['request-3']);
  });
  it('counts explicit new-tag selection and excludes tags omitted by inbox mode', () => {
    const tracker = setup();
    tracker.begin().filled('tags', {}, {}, ['Selected']);
    expect(request).not.toHaveBeenCalled();
    tracker.selectNewTag('Not suggested');
    tracker.selectNewTag('Selected');
    tracker.prepareSave({ relatedTags: [] })();
    expect(events().map((e) => e.adoptionKind)).toEqual(['draft']);
    tracker.begin().filled('tags-2', {}, {}, ['Selected']);
    tracker.selectNewTag('Selected');
    tracker.prepareSave({ relatedTags: ['name:Selected'] })();
    expect(events().at(-1)).toMatchObject({ requestId: 'tags-2', adoptionKind: 'saved' });
  });
  it('preserves the side-panel draft across remounts but rejects stale URL and account responses', () => {
    const tracker = setup();
    tracker.begin().filled('kept', {}, generated, []);
    tracker.setUrl('https://example.com/a');
    tracker.prepareSave(generated)();
    expect(events().at(-1).adoptionKind).toBe('saved');
    const stale = tracker.begin();
    tracker.setUrl('https://example.com/b');
    expect(stale.current()).toBe(false);
    stale.filled('stale-url', {}, generated, []);
    const oldOwner = tracker.begin();
    tracker.setOwner('owner-2');
    oldOwner.filled('stale-owner', {}, generated, []);
    tracker.prepareSave(generated)();
    expect(events()).toHaveLength(2);
  });
  it('isolates synchronous and async telemetry failure', async () => {
    const tracker = setup();
    request
      .mockImplementationOnce(() => {
        throw new Error('transport');
      })
      .mockRejectedValue(new Error('network'));
    expect(() => tracker.begin().filled('request', {}, generated, [])).not.toThrow();
    expect(() => tracker.prepareSave(generated)()).not.toThrow();
    await Promise.resolve();
  });
});
