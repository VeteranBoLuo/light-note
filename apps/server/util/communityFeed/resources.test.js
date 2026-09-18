import { describe, it, expect } from 'vitest';
import { noteSnapshot, bookmarkSnapshot, eligibleResources } from './resources.js';
import { normalizeCommunityPost } from '@lightnote/shared/community-feed';
import { randomUUID } from 'node:crypto';
describe('fixed resource snapshots', () => {
  it('keeps readable text and code without HTML or private link targets', () => {
    expect(
      noteSnapshot({
        type: 'html',
        content: '<h2>A &amp; B</h2><p><a href="/note/private">label</a></p><pre>&lt;img src=x&gt;</pre>',
      }),
    ).toBe('A & B\n\nlabel\n\n<img src=x>');
    expect(noteSnapshot({ type: 'markdown', content: '# Title\n\nA **note**\n\n```js\nconst a = 1;\n```' })).toContain(
      'const a = 1;',
    );
    expect(noteSnapshot({ type: 'md', content: '<p>Legacy HTML</p>' })).toBe('Legacy HTML');
  });
  it('rejects images, embedded media, drawings, empty and oversized notes without silently dropping content', () => {
    for (const content of ['<img src=x>', '<video></video>', '<iframe></iframe>', '<svg></svg>'])
      expect(() => noteSnapshot({ type: 'html', content })).toThrow('COMMUNITY_RESOURCE_TEXT_ONLY');
    expect(() => noteSnapshot({ type: 'markdown', content: 'text ![a](private.png)' })).toThrow(
      'COMMUNITY_RESOURCE_TEXT_ONLY',
    );
    expect(() => noteSnapshot({ type: 'drawing', content: '{}' })).toThrow('COMMUNITY_RESOURCE_TEXT_ONLY');
    expect(() => noteSnapshot({ type: 'html', content: '<p></p>' })).toThrow('COMMUNITY_RESOURCE_EMPTY');
    expect(() => noteSnapshot({ type: 'html', content: 'a'.repeat(30001) })).toThrow('COMMUNITY_RESOURCE_TOO_LARGE');
  });
  it('accepts ordinary URLs without turning tickets or executable URLs into resource links', () => {
    expect(bookmarkSnapshot('https://example.com/a?q=docs')).toBe('https://example.com/a?q=docs');
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///a',
      'https://u:p@example.com',
      'https://example.com/#token=secret',
      'https://example.com/?%74oken=secret',
      'https://example.com/?access_token=secret',
    ])
      expect(() => bookmarkSnapshot(url)).toThrow('COMMUNITY_RESOURCE_INVALID_URL');
  });
  it('bounds resource count and accepts IDs only', () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    expect(normalizeCommunityPost({ kind: 'share', body: 'x', resources: ids }).resources).toEqual(ids);
    for (const resources of [
      [...ids, randomUUID()],
      [ids[0], ids[0].toUpperCase()],
      ['https://example.com'],
      [{ id: ids[0] }],
    ])
      expect(() => normalizeCommunityPost({ kind: 'share', body: 'x', resources })).toThrow();
  });
  it('filters owned candidates with the same snapshot rules without writes or content in the response', async () => {
    const calls = [];
    const db = {
      query: async (sql, args) => {
        calls.push([sql, args]);
        if (sql.includes('FROM user')) return [[{ id: 'owner', role: 'root', del_flag: 0 }]];
        expect(args[0]).toBe('owner');
        if (sql.includes('FROM note'))
          return [
            [
              { id: 'text', title: 'Text', type: 'html', content: '<p>private text</p>' },
              { id: 'image', title: 'Image', type: 'html', content: '<p>text</p><img src="private">' },
              { id: 'empty', title: 'Empty', type: 'html', content: '' },
            ],
          ];
        return [[{ id: 'link', title: 'Link', url: 'https://example.com' }]];
      },
    };
    const args = {
      db,
      user: { id: 'owner', role: 'root' },
      env: {
        COMMUNITY_FEED_ENABLED: 'true',
        COMMUNITY_FEED_WRITES_ENABLED: 'true',
      },
      input: {
        items: JSON.stringify([
          ...['text', 'image', 'empty', 'missing'].map((id) => ({ type: 'note', id })),
          { type: 'bookmark', id: 'link' },
        ]),
      },
    };
    expect(await eligibleResources(args)).toEqual({ keys: ['note:text', 'bookmark:link'] });
    expect(calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
    await expect(eligibleResources({ ...args, user: null })).rejects.toThrow('COMMUNITY_LOGIN_REQUIRED');
    await expect(
      eligibleResources({ ...args, input: { items: JSON.stringify(Array(41).fill({ type: 'note', id: 'x' })) } }),
    ).rejects.toThrow('COMMUNITY_INVALID_INPUT');
  });
});
