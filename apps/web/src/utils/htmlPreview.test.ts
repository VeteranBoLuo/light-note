import { describe, expect, it } from 'vitest';
import { HTML_PREVIEW_REFERRER_POLICY, HTML_PREVIEW_SANDBOX } from './htmlPreview';

describe('HTML preview sandbox policy', () => {
  it('allows interactive scripts without exposing the Light Note origin', () => {
    const tokens = new Set(HTML_PREVIEW_SANDBOX.split(/\s+/));

    expect(tokens).toContain('allow-scripts');
    expect(tokens).toContain('allow-pointer-lock');
    expect(tokens).not.toContain('allow-same-origin');
  });

  it.each([
    'allow-forms',
    'allow-popups',
    'allow-downloads',
    'allow-top-navigation',
    'allow-top-navigation-by-user-activation',
  ])('does not grant %s', (permission) => {
    expect(HTML_PREVIEW_SANDBOX.split(/\s+/)).not.toContain(permission);
  });

  it('does not expose the Light Note page as a referrer', () => {
    expect(HTML_PREVIEW_REFERRER_POLICY).toBe('no-referrer');
  });
});
