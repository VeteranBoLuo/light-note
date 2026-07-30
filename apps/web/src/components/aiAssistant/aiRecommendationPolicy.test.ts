import { describe, expect, it } from 'vitest';
import { recommendedQuestionKeys } from './aiRecommendationPolicy';

describe('recommendedQuestionKeys', () => {
  it('does not recommend private account queries to visitors', () => {
    const keys = recommendedQuestionKeys('/cloudSpace', { role: 'visitor' });
    expect(keys).toContain('cloudSpaceUsage');
    expect(keys).not.toContain('storageUsage');
    expect(keys).not.toContain('recentCloudFiles');
  });

  it('uses current page capabilities for signed-in accounts', () => {
    expect(recommendedQuestionKeys('/noteLibrary', { role: 'user' })).toContain('recentNoteDigest');
    expect(recommendedQuestionKeys('/workbenches', { role: 'root', adminMode: 'readonly' })).toContain(
      'weeklyChallengeStatus',
    );
  });
});
