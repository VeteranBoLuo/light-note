import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_KEYS } from './achievements';
import { achievementArtwork } from './achievementArtwork';
import { ACHIEVEMENT_MOTION, achievementMotionLayer } from './achievementMotion';

describe('packaged achievement artwork', () => {
  it('ships a WebP thumbnail and detail image for every catalog key', () => {
    let thumbnailBytes = 0;
    for (const key of ACHIEVEMENT_KEYS.filter((key) => !key.startsWith('public_resource_'))) {
      for (const large of [false, true]) {
        const asset = achievementArtwork(key, large)!;
        const bytes = readFileSync(resolve(process.cwd(), 'public', asset.slice(1)));
        expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
        expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
        if (!large) thumbnailBytes += bytes.length;
      }
    }
    // Shared avatars and a complete wall must not pull in all large detail images.
    expect(thumbnailBytes).toBeLessThan(1024 * 1024);
  });
  it('packages both resolutions for every motion layer within the thumbnail budget', () => {
    let bytes = 0;
    for (const artwork of Object.values(ACHIEVEMENT_MOTION)) {
      for (const layer of artwork.layers) {
        for (const large of [false, true]) {
          const file = readFileSync(
            resolve(process.cwd(), 'public', achievementMotionLayer(artwork, layer, large).slice(1)),
          );
          expect(file.toString('ascii', 8, 12)).toBe('WEBP');
          if (!large) bytes += file.length;
        }
      }
    }
    expect(bytes).toBeLessThan(600 * 1024);
  });
  it('uses registered contribution glyphs without requesting nonexistent bitmaps', () => {
    for (const key of ACHIEVEMENT_KEYS.filter((key) => key.startsWith('public_resource_'))) expect(achievementArtwork(key)).toBeUndefined();
  });
  it('does not construct asset URLs for unknown keys', () => {
    expect(achievementArtwork('future_achievement')).toBeUndefined();
  });
});
