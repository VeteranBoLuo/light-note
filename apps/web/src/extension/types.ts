export type ExtensionResourceType = 'bookmark' | 'note' | 'file';

export interface ExtensionUser {
  id: string;
  alias?: string;
  email?: string;
  role?: string;
  headPicture?: string;
}

export interface ExtensionSession {
  sid: string;
  deviceId: string;
  user: ExtensionUser;
}

export interface CapturedPage {
  tabId: number;
  url: string;
  title: string;
  selection: string;
}

export interface ExtensionSuccess {
  type: ExtensionResourceType;
  resourceId?: string;
  title: string;
  count?: number;
  duplicate?: boolean;
}

export interface ExtensionOperationReceipt {
  key: string;
  fingerprint: string;
}

export interface BookmarkDraft {
  mode: 'formal' | 'inbox';
  url: string;
  name: string;
  description: string;
  selectedTagIds: string[];
  selectedNewTags: string[];
  operations?: Partial<Record<'formal' | 'inbox', ExtensionOperationReceipt>>;
}

export interface NoteDraft {
  title: string;
  content: string;
  type: 'markdown' | 'html';
  addToInbox: boolean;
  operation?: ExtensionOperationReceipt;
}
