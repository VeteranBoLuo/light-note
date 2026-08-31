export interface CommunityChatInlineEmoji {
  readonly id: string;
  readonly key: string;
  readonly token: string;
  readonly assetPath: string;
}

export type CommunityChatInlineEmojiContentSegment =
  | { type: "text"; value: string }
  | { type: "emoji"; emoji: CommunityChatInlineEmoji };

export declare const COMMUNITY_CHAT_INLINE_EMOJIS: readonly CommunityChatInlineEmoji[];
export declare const COMMUNITY_CHAT_INLINE_EMOJI_PACK: Readonly<{
  id: string;
  version: number;
  emojis: readonly CommunityChatInlineEmoji[];
}>;
export declare const COMMUNITY_CHAT_INLINE_EMOJI_MAX_PER_MESSAGE: number;
export declare const COMMUNITY_CHAT_INLINE_EMOJI_MAX_RAW_LENGTH: number;

export declare function resolveCommunityChatInlineEmoji(
  value: unknown,
): CommunityChatInlineEmoji | null;
export declare function parseCommunityChatInlineEmojiContent(
  value: unknown,
): CommunityChatInlineEmojiContentSegment[];
export declare function communityChatInlineEmojiLogicalLength(
  value: unknown,
): number;
export declare function countCommunityChatInlineEmojis(value: unknown): number;
export declare function communityChatInlineEmojiToPlainText(
  value: unknown,
  replacement?: string | ((emoji: CommunityChatInlineEmoji) => string),
): string;
export declare function findUnknownCommunityChatInlineEmojiTokens(
  value: unknown,
): string[];
