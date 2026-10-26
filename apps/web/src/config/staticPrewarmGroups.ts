/** Only these runtime entry points may be fetched speculatively; dynamic imports stay demand-driven. */
export const PREWARM_RUNTIME_ENTRIES: Record<string, string> = {
  'editor.html': 'components/noteLibrary/detail/TinyMceEditorRuntime.vue',
  'editor.markdown': 'components/noteLibrary/detail/MarkdownCodeMirror.vue',
  'route.noteDetail': 'view/noteLibrary/NoteDetail.vue',
  'route.workbenches': 'view/workbenches/Workbenches.vue',
  'route.home': 'view/home/Home.vue',
  'route.bookmarkMg': 'view/manage/BookmarkMg.vue',
  'route.noteLibrary': 'view/noteLibrary/NoteLibrary.vue',
  'route.cloudSpace': 'view/cloudSpace/cloudSpace.vue',
  'route.tagMg': 'components/tagSpace/TagSpaceEntry.vue',
  'route.searchCenter': 'view/search/SearchCenter.vue',
  'route.support': 'view/support/SupportUs.vue',
  'route.entitlementStore': 'view/entitlementStore/EntitlementStore.vue',
  'route.campaign': 'view/campaign/CampaignPage.vue',
  account: 'view/login/UserAuthModal.vue',
};
