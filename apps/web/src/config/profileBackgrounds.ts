import { isProfileBackgroundId, type ProfileBackgroundId } from '@lightnote/shared/profile-backgrounds';
import mountains from '@/assets/profile-backgrounds/mountains.webp';
import sky from '@/assets/profile-backgrounds/sky.webp';
import coast from '@/assets/profile-backgrounds/coast.webp';
import stars from '@/assets/profile-backgrounds/stars.webp';
import mountainsThumb from '@/assets/profile-backgrounds/mountains-thumb.webp';
import skyThumb from '@/assets/profile-backgrounds/sky-thumb.webp';
import coastThumb from '@/assets/profile-backgrounds/coast-thumb.webp';
import starsThumb from '@/assets/profile-backgrounds/stars-thumb.webp';
import mountainsPoster from '@/assets/profile-backgrounds/mountains-poster.webp?inline';
import skyPoster from '@/assets/profile-backgrounds/sky-poster.webp?inline';
import coastPoster from '@/assets/profile-backgrounds/coast-poster.webp?inline';
import starsPoster from '@/assets/profile-backgrounds/stars-poster.webp?inline';

type ProfileBackground = { src: string; thumbnail: string; poster: string; dark: boolean; animated?: boolean };

const backgrounds: Record<ProfileBackgroundId, ProfileBackground> = {
  background_mountains: { src: mountains, thumbnail: mountainsThumb, poster: mountainsPoster, dark: false },
  background_sky: { src: sky, thumbnail: skyThumb, poster: skyPoster, dark: false },
  background_coast: { src: coast, thumbnail: coastThumb, poster: coastPoster, dark: false },
  background_stars: { src: stars, thumbnail: starsThumb, poster: starsPoster, dark: true, animated: true },
};

export function profileBackground(id: unknown) {
  return isProfileBackgroundId(id) ? backgrounds[id] : null;
}
