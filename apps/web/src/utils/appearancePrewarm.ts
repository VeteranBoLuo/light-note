import { PREWARM_PRIORITY } from '@/config/staticPrewarmGroups';
import { avatarFrameArtwork } from '@/config/avatarFrameArtwork';
import { AVATAR_SUBJECT_ARTWORK } from '@/config/avatarFrameSubjects';
import { FRAME_IDS, frameVariant } from '@/config/growthFrames';
import { profileBackground, profileBackgroundAssetUrls } from '@/config/profileBackgrounds';
import { builtinAvatarAssetUrls } from '@/config/builtinAvatars';
import { scheduleStaticPrewarm } from './staticPrewarm';

export function frameAssetUrls(id?: string | null): string[] {
  const variant = frameVariant(id);
  const artwork = avatarFrameArtwork(variant);
  if (!variant || !artwork) return [];
  return [
    ...new Set(
      [
        artwork.src,
        artwork.motionSrc,
        artwork.effectSrc,
        artwork.trailSrc,
        artwork.accentSrc,
        artwork.motionSpriteSrc,
        ...(artwork.particleSrcs || []),
        ...Object.values(AVATAR_SUBJECT_ARTWORK[variant]?.assets || {}),
      ].filter((url): url is string => Boolean(url)),
    ),
  ];
}

export function scheduleAppearancePrewarm(options: {
  frame?: string | null;
  background?: string | null;
  profileContext?: boolean;
  ownedFrames?: readonly string[];
}) {
  const background = profileBackground(options.background);
  const stops = [
    scheduleStaticPrewarm({
      priority: PREWARM_PRIORITY.current,
      urls: [
        ...frameAssetUrls(options.frame),
        ...(background ? [background.thumbnail, background.src] : []),
      ],
    }),
    scheduleStaticPrewarm({
      priority: PREWARM_PRIORITY.nearby,
      urls: profileBackgroundAssetUrls(true),
    }),
  ];
  if (options.profileContext)
    stops.push(
      scheduleStaticPrewarm({
        priority: PREWARM_PRIORITY.current,
        urls: [...builtinAvatarAssetUrls(), ...(options.ownedFrames || []).flatMap(frameAssetUrls)],
      }),
    );
  stops.push(
    scheduleStaticPrewarm({
      priority: PREWARM_PRIORITY.decorative,
      optional: true,
      urls: [...profileBackgroundAssetUrls(), ...FRAME_IDS.flatMap(frameAssetUrls)],
    }),
  );
  return () => stops.forEach((stop) => stop());
}
