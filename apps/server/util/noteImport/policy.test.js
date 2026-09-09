import { describe, it, expect } from 'vitest';
import { resolveRequestFieldPolicy } from '../security/requestFieldPolicy.js';
import { summarizeApiLogPayload, shouldSkipApiLog } from '../logPolicy.js';
describe('note import boundaries', () => {
  it('only exempts bounded import titles at the exact field and route', () => {
    const context = {
      method: 'POST',
      path: '/api/note/imports/start',
      body: { items: [{ title: 'SELECT * FROM notes' }] },
    };
    expect(resolveRequestFieldPolicy(context, 'body.items.0.title')).toBeTruthy();
    expect(resolveRequestFieldPolicy({ ...context, path: '/api/other' }, 'body.items.0.title')).toBeNull();
    expect(
      resolveRequestFieldPolicy({ ...context, body: { items: [{ title: 'x'.repeat(256) }] } }, 'body.items.0.title'),
    ).toMatchObject({ withinBudget: false, trustedEnvelope: false });
  });
  it('omits document titles and bodies from import logs and skips passive polling', () => {
    const summary = summarizeApiLogPayload('/api/note/imports/start', {
      items: [{ title: 'private title' }],
      content: 'private content',
    });
    expect(JSON.stringify(summary)).not.toContain('private');
    expect(summary.itemCount).toBe(1);
    expect(shouldSkipApiLog('/api/note/imports/detail')).toBe(true);
  });
});
