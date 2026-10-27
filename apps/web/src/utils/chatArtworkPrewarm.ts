import { PREWARM_PRIORITY } from '@/config/staticPrewarmGroups';
import { COMMUNITY_CHAT_OFFICIAL_STICKERS } from '@lightnote/shared/community-chat-stickers';
import { publicArtworkUrl, publicArtworkUrls } from './publicArtwork';
import type { PrewarmSelection } from './staticPrewarm';

/** First-screen stickers are useful before chat opens; the rest follow current usage. */
export function chatArtworkPrewarmSelections(active: boolean): PrewarmSelection[] {
  const selections: PrewarmSelection[] = [
    {
      priority: active ? PREWARM_PRIORITY.current : PREWARM_PRIORITY.nearby,
      urls: COMMUNITY_CHAT_OFFICIAL_STICKERS.slice(0, 8).map((item) => publicArtworkUrl(item.assetPath)),
    },
  ];
  selections.push({
    priority: active ? PREWARM_PRIORITY.current : PREWARM_PRIORITY.detail,
    optional: !active,
    urls: [
      ...publicArtworkUrls('/community-chat/inline-emojis/'),
      ...COMMUNITY_CHAT_OFFICIAL_STICKERS.map((item) => publicArtworkUrl(item.assetPath)),
    ],
  });
  return selections;
}
