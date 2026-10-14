import { isProfileBackgroundId, type ProfileBackgroundId } from '@lightnote/shared/profile-backgrounds';
import mountains from '@/assets/profile-backgrounds/mountains.webp';
import sky from '@/assets/profile-backgrounds/sky.webp';
import coast from '@/assets/profile-backgrounds/coast.webp';
import stars from '@/assets/profile-backgrounds/stars.webp';

const backgrounds: Record<ProfileBackgroundId, { src: string; dark: boolean }> = {
  background_mountains: { src: mountains, dark: false },
  background_sky: { src: sky, dark: false },
  background_coast: { src: coast, dark: false },
  background_stars: { src: stars, dark: true },
};

export function profileBackground(id: unknown) {
  return isProfileBackgroundId(id) ? backgrounds[id] : null;
}
