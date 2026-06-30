import searchKnowledgeBase from './search_knowledge_base.js';
import queryBookmarks from './query_bookmarks.js';
import queryNotes from './query_notes.js';
import queryFiles from './query_files.js';
import getStorageUsage from './get_storage_usage.js';
import getSecurityEvents from './get_security_events.js';
import getSecuritySummary from './get_security_summary.js';
import queryUsers from './query_users.js';
import queryApiLogs from './query_api_logs.js';
import queryOperationLogs from './query_operation_logs.js';
import getActiveUsers from './get_active_users.js';
import getTokenUsage from './get_token_usage.js';
import createNote from './create_note.js';
import queryTrash from './query_trash.js';
import restoreTrash from './restore_trash.js';
import addTag from './add_tag.js';
import queryTags from './query_tags.js';
import writeKnowledgeBase from './write_knowledge_base.js';

export default [
  searchKnowledgeBase,
  queryBookmarks,
  queryNotes,
  queryFiles,
  getStorageUsage,
  getSecurityEvents,
  getSecuritySummary,
  queryUsers,
  queryApiLogs,
  queryOperationLogs,
  getActiveUsers,
  getTokenUsage,
  createNote,
  queryTrash,
  restoreTrash,
  addTag,
  queryTags,
  writeKnowledgeBase,
];
