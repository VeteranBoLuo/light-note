export type BuiltinNoteBodyKey =
  | "daily"
  | "weekly"
  | "meeting"
  | "reading"
  | "project"
  | "review"
  | "knowledge"
  | "mindmap";
export declare const BUILTIN_NOTE_BODIES: Record<
  BuiltinNoteBodyKey,
  {
    content: Record<"zh-CN" | "en-US", string>;
    exampleContent: Record<"zh-CN" | "en-US", string>;
  }
>;
