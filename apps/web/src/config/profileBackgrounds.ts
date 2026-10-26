import { isProfileBackgroundId, type ProfileBackgroundId } from '@lightnote/shared/profile-backgrounds';
import mountains from '@/assets/profile-backgrounds/mountains.webp';
import sky from '@/assets/profile-backgrounds/sky.webp';
import coast from '@/assets/profile-backgrounds/coast.webp';
import fountain from '@/assets/profile-backgrounds/fountain.webp';
import mountainsThumb from '@/assets/profile-backgrounds/mountains-thumb.webp';
import skyThumb from '@/assets/profile-backgrounds/sky-thumb.webp';
import coastThumb from '@/assets/profile-backgrounds/coast-thumb.webp';
import fountainThumb from '@/assets/profile-backgrounds/fountain-thumb.webp';
import mountainsPoster from '@/assets/profile-backgrounds/mountains-poster.webp?inline';
import skyPoster from '@/assets/profile-backgrounds/sky-poster.webp?inline';
import coastPoster from '@/assets/profile-backgrounds/coast-poster.webp?inline';
import fountainPoster from '@/assets/profile-backgrounds/fountain-poster.webp?inline';

type ProfileBackground = {
  src: string;
  srcWidth: number;
  thumbnail: string;
  poster: string;
  dark: boolean;
  animated?: 'fountain' | 'lighthouse';
};

const backgrounds: Record<ProfileBackgroundId, ProfileBackground> = {
  background_mountains: {
    src: mountains,
    srcWidth: 1600,
    thumbnail: mountainsThumb,
    poster: mountainsPoster,
    dark: false,
  },
  background_sky: { src: sky, srcWidth: 1600, thumbnail: skyThumb, poster: skyPoster, dark: false },
  background_coast: {
    src: coast,
    srcWidth: 1600,
    thumbnail: coastThumb,
    poster: coastPoster,
    dark: false,
    animated: 'lighthouse',
  },
  background_stars: {
    src: fountain,
    srcWidth: 1920,
    thumbnail: fountainThumb,
    poster: fountainPoster,
    dark: true,
    animated: 'fountain',
  },
};

export function profileBackground(id: unknown) {
  return isProfileBackgroundId(id) ? backgrounds[id] : null;
}

export function profileBackgroundAssetUrls(thumbnailsOnly = false) {
  return Object.values(backgrounds).flatMap((background) =>
    thumbnailsOnly ? [background.thumbnail] : [background.thumbnail, background.src],
  );
}
