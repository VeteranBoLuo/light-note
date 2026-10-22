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
  | "goodbye"
  | "laughing_tears"
  | "eating_watermelon"
  | "go_on"
  | "smug"
  | "meltdown"
  | "lying_flat"
  | "confused"
  | "aggrieved"
  | "angry"
  | "refuse"
  | "snicker"
  | "speechless"
  | "slacking"
  | "buffering"
  | "leaving"
  | "sleepy"
  | "busy"
  | "please"
  | "really";

export interface CommunityChatOfficialStickerDefinition {
  readonly id: CommunityChatOfficialStickerId;
  readonly key: string;
  readonly assetPath: string;
}

export declare const COMMUNITY_CHAT_OFFICIAL_STICKERS: readonly CommunityChatOfficialStickerDefinition[];

export declare const COMMUNITY_CHAT_OFFICIAL_STICKER_PACK: {
  readonly id: "paper-spirit-v3";
  readonly version: 3;
  readonly stickers: readonly CommunityChatOfficialStickerDefinition[];
};

export declare function resolveCommunityChatOfficialSticker(
  value: unknown,
): CommunityChatOfficialStickerDefinition | null;
