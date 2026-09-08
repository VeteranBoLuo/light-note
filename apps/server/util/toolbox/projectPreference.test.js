import { describe, it, expect } from 'vitest';
import { preserveWorkshopPreference } from './projectPreference.js';
describe('workshop intro preference', () => {
  it('preserves dismissal through ordinary stale preference writes', () => {
    expect(JSON.parse(preserveWorkshopPreference({ theme: 'day' }, '{"workshopIntroDismissed":true}'))).toEqual({
      theme: 'day',
      workshopIntroDismissed: true,
    });
    expect(
      JSON.parse(preserveWorkshopPreference({ workshopIntroDismissed: false }, { workshopIntroDismissed: true }))
        .workshopIntroDismissed,
    ).toBe(true);
  });
  it('only the dedicated endpoint can set dismissal', () => {
    expect(JSON.parse(preserveWorkshopPreference({ workshopIntroDismissed: true }, null))).toEqual({});
  });
});
