const PAPER_SPIRIT_PACK_ID = "paper-spirit-v3";

const paperSpiritSticker = (packId, id) =>
  Object.freeze({
    id,
    key: `${packId}:${id}`,
    assetPath: `/community-chat/stickers/${packId}/${id.replaceAll("_", "-")}.png`,
  });

// Historical messages keep the artwork associated with their original version.
const legacyPaperSpiritStickers = Object.freeze(
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
  ].map((id) => paperSpiritSticker("paper-spirit-v1", id)),
);

// The captioned v2 and caption-free v3 share the same expression vocabulary.
const paperSpiritEmotionIds = Object.freeze([
  "laughing_tears",
  "eating_watermelon",
  "go_on",
  "smug",
  "meltdown",
  "lying_flat",
  "confused",
  "aggrieved",
  "angry",
  "refuse",
  "received",
  "hug",
  "snicker",
  "speechless",
  "slacking",
  "buffering",
  "leaving",
  "sleepy",
  "busy",
  "thanks",
  "approve",
  "please",
  "good_night",
  "really",
]);

export const COMMUNITY_CHAT_OFFICIAL_STICKERS = Object.freeze(
  paperSpiritEmotionIds.map((id) =>
    paperSpiritSticker(PAPER_SPIRIT_PACK_ID, id),
  ),
);

export const COMMUNITY_CHAT_OFFICIAL_STICKER_PACK = Object.freeze({
  id: PAPER_SPIRIT_PACK_ID,
  version: 3,
  stickers: COMMUNITY_CHAT_OFFICIAL_STICKERS,
});

const officialStickerByKey = new Map(
  [
    ...legacyPaperSpiritStickers,
    ...paperSpiritEmotionIds.map((id) =>
      paperSpiritSticker("paper-spirit-v2", id),
    ),
    ...COMMUNITY_CHAT_OFFICIAL_STICKERS,
  ].map((sticker) => [sticker.key, sticker]),
);

export function resolveCommunityChatOfficialSticker(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return officialStickerByKey.get(key) || null;
}
