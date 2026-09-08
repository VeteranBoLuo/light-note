type ResourceType = 'bookmark' | 'note' | 'file' | 'tag';
type CheckKind = 'tags' | 'title' | 'empty' | 'duplicate' | 'archive' | 'tag_icon';
export function supportsOrganizeCheck(type: ResourceType, check: CheckKind): boolean;
export function applicableOrganizeResources(resourceTypes: ResourceType[], checks: CheckKind[]): ResourceType[];
