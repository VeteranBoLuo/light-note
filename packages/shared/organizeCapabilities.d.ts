type ResourceType = 'bookmark' | 'note' | 'file';
type CheckKind = 'tags' | 'title' | 'empty' | 'duplicate';
export function supportsOrganizeCheck(type: ResourceType, check: CheckKind): boolean;
export function applicableOrganizeResources(resourceTypes: ResourceType[], checks: CheckKind[]): ResourceType[];
