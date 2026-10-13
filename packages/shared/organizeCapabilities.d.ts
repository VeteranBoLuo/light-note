type ResourceType = 'bookmark' | 'note' | 'file' | 'tag';
type CheckKind =
  | 'tags'
  | 'title'
  | 'description'
  | 'tag_merge'
  | 'bookmark_health'
  | 'empty'
  | 'duplicate'
  | 'archive'
  | 'tag_icon';
export function supportsOrganizeCheck(type: ResourceType, check: CheckKind): boolean;
export function applicableOrganizeResources(resourceTypes: ResourceType[], checks: CheckKind[]): ResourceType[];
