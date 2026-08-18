const PAPER_SPIRIT_PACK_ID = "paper-spirit-v1";

const paperSpiritSticker = (id) =>
  Object.freeze({
    id,
    key: `${PAPER_SPIRIT_PACK_ID}:${id}`,
    assetPath: `/community-chat/stickers/${PAPER_SPIRIT_PACK_ID}/${id.replaceAll("_", "-")}.png`,
  });

export const COMMUNITY_CHAT_OFFICIAL_STICKERS = Object.freeze(
  [
    "hello",
    "received",
    "thanks",
    "approve",
    "happy",
    "thinking",
    "surprised",
    "helpless",
    "cheer",
    "hug",
    "hard_work",
    "wait",
    "organizing",
    "complete",
    "good_night",
    "goodbye",
  ].map(paperSpiritSticker),
);

export const COMMUNITY_CHAT_OFFICIAL_STICKER_PACK = Object.freeze({
  id: PAPER_SPIRIT_PACK_ID,
  version: 1,
  stickers: COMMUNITY_CHAT_OFFICIAL_STICKERS,
});

const officialStickerByKey = new Map(
  COMMUNITY_CHAT_OFFICIAL_STICKERS.map((sticker) => [sticker.key, sticker]),
);

export function resolveCommunityChatOfficialSticker(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return officialStickerByKey.get(key) || null;
}
