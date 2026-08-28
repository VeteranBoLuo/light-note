const JIAN_TUAN_PACK_ID = "jian-tuan-v1";

const jianTuanInlineEmoji = (id) =>
  Object.freeze({
    id,
    key: `${JIAN_TUAN_PACK_ID}:${id}`,
    token: `[[ln-emoji:${JIAN_TUAN_PACK_ID}:${id}]]`,
    assetPath: `/community-chat/inline-emojis/${JIAN_TUAN_PACK_ID}/${id}.png`,
  });

export const COMMUNITY_CHAT_INLINE_EMOJIS = Object.freeze(
  [
    "gentle-smile",
    "delighted",
    "laughing",
    "laughing-tears",
    "heart-struck",
    "kiss",
    "shy",
    "smug",
    "aggrieved",
    "sobbing",
    "meltdown",
    "angry",
    "furious",
    "speechless",
    "eye-roll",
    "disgusted",
    "shocked",
    "frightened",
    "confused",
    "thinking",
    "awkward",
    "guilty",
    "anxious",
    "blank",
    "thumbs-up",
    "ok",
    "received",
    "thanks",
    "hug",
    "cheer",
    "please",
    "refuse",
    "peek",
    "facepalm",
    "eating-watermelon",
    "watching",
    "slacking",
    "busy",
    "exhausted",
    "leaving",
    "eating",
    "milk-tea",
    "celebrate",
    "gift",
    "wait",
    "sigh",
    "sleepy",
    "good-night",
  ].map(jianTuanInlineEmoji),
);

export const COMMUNITY_CHAT_INLINE_EMOJI_PACK = Object.freeze({
  id: JIAN_TUAN_PACK_ID,
  version: 1,
  emojis: COMMUNITY_CHAT_INLINE_EMOJIS,
});

export const COMMUNITY_CHAT_INLINE_EMOJI_MAX_PER_MESSAGE = 100;
export const COMMUNITY_CHAT_INLINE_EMOJI_MAX_RAW_LENGTH = 12_000;

const INLINE_EMOJI_TOKEN_PATTERN_SOURCE = String.raw`\[\[ln-emoji:([a-z0-9-]{1,40}):([a-z0-9-]{1,48})\]\]`;
const inlineEmojiByKey = new Map(
  COMMUNITY_CHAT_INLINE_EMOJIS.map((emoji) => [emoji.key, emoji]),
);
const inlineEmojiByToken = new Map(
  COMMUNITY_CHAT_INLINE_EMOJIS.map((emoji) => [emoji.token, emoji]),
);

function createTokenPattern() {
  return new RegExp(INLINE_EMOJI_TOKEN_PATTERN_SOURCE, "g");
}

function pushTextSegment(segments, value) {
  if (!value) return;
  const previous = segments.at(-1);
  if (previous?.type === "text") previous.value += value;
  else segments.push({ type: "text", value });
}

export function resolveCommunityChatInlineEmoji(value) {
  const normalized = String(value || "").trim();
  return (
    inlineEmojiByToken.get(normalized) ||
    inlineEmojiByKey.get(normalized) ||
    null
  );
}

export function parseCommunityChatInlineEmojiContent(value) {
  const content = String(value || "");
  const segments = [];
  const tokenPattern = createTokenPattern();
  let cursor = 0;
  let match;

  while ((match = tokenPattern.exec(content))) {
    pushTextSegment(segments, content.slice(cursor, match.index));
    const emoji = inlineEmojiByToken.get(match[0]);
    if (emoji) segments.push({ type: "emoji", emoji });
    else pushTextSegment(segments, match[0]);
    cursor = match.index + match[0].length;
  }
  pushTextSegment(segments, content.slice(cursor));
  return segments;
}

export function communityChatInlineEmojiLogicalLength(value) {
  return parseCommunityChatInlineEmojiContent(value).reduce(
    (length, segment) =>
      length +
      (segment.type === "emoji" ? 1 : Array.from(segment.value).length),
    0,
  );
}

export function countCommunityChatInlineEmojis(value) {
  return parseCommunityChatInlineEmojiContent(value).reduce(
    (count, segment) => count + (segment.type === "emoji" ? 1 : 0),
    0,
  );
}

export function communityChatInlineEmojiToPlainText(
  value,
  replacement = "[表情]",
) {
  return parseCommunityChatInlineEmojiContent(value)
    .map((segment) => {
      if (segment.type === "text") return segment.value;
      return typeof replacement === "function"
        ? replacement(segment.emoji)
        : replacement;
    })
    .join("");
}

export function findUnknownCommunityChatInlineEmojiTokens(value) {
  const content = String(value || "");
  return [...content.matchAll(createTokenPattern())]
    .map((match) => match[0])
    .filter((token) => !inlineEmojiByToken.has(token));
}
