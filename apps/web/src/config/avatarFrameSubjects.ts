import type { FrameVariant } from './growthFrames';
import archiveBase from '@/assets/avatar-frames/subjects/archive-base.webp';
import archiveBook from '@/assets/avatar-frames/subjects/archive-book.webp';
import cloudBase from '@/assets/avatar-frames/subjects/cloud-base.webp';
import cloudCloud from '@/assets/avatar-frames/subjects/cloud-cloud.webp';
import cloudPage from '@/assets/avatar-frames/subjects/cloud-page.webp';
import cloudScroll from '@/assets/avatar-frames/subjects/cloud-scroll.webp';
import galaxyBase from '@/assets/avatar-frames/subjects/galaxy-base.webp';
import galaxyPlanet from '@/assets/avatar-frames/subjects/galaxy-planet.webp';
import inkBase from '@/assets/avatar-frames/subjects/ink-base.webp';
import inkBrush from '@/assets/avatar-frames/subjects/ink-brush.webp';
import moonBase from '@/assets/avatar-frames/subjects/moon-base.webp';
import moonCloud from '@/assets/avatar-frames/subjects/moon-cloud.webp';
import moonMoon from '@/assets/avatar-frames/subjects/moon-moon.webp';

export type AvatarSubjectKey = 'archive' | 'ink' | 'cloud' | 'galaxy' | 'moon';
export interface AvatarSubjectArtwork {
  key: AvatarSubjectKey;
  assets: Record<string, string>;
  layers: readonly string[];
}
export const AVATAR_SUBJECT_ARTWORK: Partial<Record<FrameVariant, AvatarSubjectArtwork>> = {
  'bookmark-archive': {
    key: 'archive',
    assets: { base: archiveBase, book: archiveBook },
    layers: ['base', 'book', 'left', 'right'],
  },
  'note-constellation': { key: 'ink', assets: { base: inkBase, brush: inkBrush }, layers: ['base', 'brush'] },
  'file-constellation': {
    key: 'cloud',
    assets: { base: cloudBase, cloud: cloudCloud, page: cloudPage, scroll: cloudScroll },
    layers: ['base', 'scroll', 'page', 'cloud'],
  },
  galaxy: { key: 'galaxy', assets: { base: galaxyBase, planet: galaxyPlanet }, layers: ['base', 'planet'] },
  'streak-month': {
    key: 'moon',
    assets: { base: moonBase, cloud: moonCloud, moon: moonMoon },
    layers: ['base', 'moon', 'cloud'],
  },
};
