export type CommunityChatOfficialStickerId =
  | "hello"
  | "received"
  | "thanks"
  | "approve"
  | "happy"
  | "thinking"
  | "surprised"
  | "helpless"
  | "cheer"
  | "hug"
  | "hard_work"
  | "wait"
  | "organizing"
  | "complete"
  | "good_night"
  | "goodbye";

export interface CommunityChatOfficialStickerDefinition {
  readonly id: CommunityChatOfficialStickerId;
  readonly key: string;
  readonly assetPath: string;
}

export declare const COMMUNITY_CHAT_OFFICIAL_STICKERS: readonly CommunityChatOfficialStickerDefinition[];

export declare const COMMUNITY_CHAT_OFFICIAL_STICKER_PACK: {
  readonly id: "paper-spirit-v1";
  readonly version: 1;
  readonly stickers: readonly CommunityChatOfficialStickerDefinition[];
};

export declare function resolveCommunityChatOfficialSticker(
  value: unknown,
): CommunityChatOfficialStickerDefinition | null;
