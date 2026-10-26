import { COMMUNITY_CHAT_OFFICIAL_STICKERS } from '@lightnote/shared/community-chat-stickers';
import { publicArtworkUrl, publicArtworkUrls } from './publicArtwork';
import type { PrewarmSelection } from './staticPrewarm';

/** First-screen stickers are useful before chat opens; the rest follow current usage. */
export function chatArtworkPrewarmSelections(active: boolean): PrewarmSelection[] {
  const selections: PrewarmSelection[] = [
    {
      priority: 1,
      urls: COMMUNITY_CHAT_OFFICIAL_STICKERS.slice(0, 8).map((item) => publicArtworkUrl(item.assetPath)),
    },
  ];
  selections.push({
    priority: active ? 1 : 3,
    optional: !active,
    urls: [
      ...publicArtworkUrls('/community-chat/inline-emojis/'),
      ...COMMUNITY_CHAT_OFFICIAL_STICKERS.map((item) => publicArtworkUrl(item.assetPath)),
    ],
  });
  return selections;
}
