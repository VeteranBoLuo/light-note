export const COMMUNITY_FEED_SCHEMA = {
  community_accepted_answers: {
    columns: ['comment_id', 'user_id', 'accepted_at'],
    indexes: [
      ['PRIMARY', 'comment_id', 0],
      ['idx_user', 'user_id,accepted_at', 1],
    ],
  },
  community_task_rewards: {
    columns: ['topic_id', 'starts_at', 'ends_at', 'reward_exp', 'reward_points'],
    indexes: [['PRIMARY', 'topic_id', 0]],
  },
  community_task_awards: {
    columns: ['topic_id', 'user_id', 'post_id', 'reward_exp', 'reward_points', 'earned_at', 'claimed_at'],
    indexes: [
      ['PRIMARY', 'topic_id,user_id', 0],
      ['idx_user_claim', 'user_id,claimed_at,topic_id', 1],
    ],
  },
  community_comment_likes: {
    columns: ['user_id', 'comment_id', 'created_at'],
    indexes: [
      ['PRIMARY', 'user_id,comment_id', 0],
      ['idx_comment', 'comment_id', 1],
    ],
  },
  community_posts: {
    columns: [
      'id',
      'public_id',
      'author_id',
      'status',
      'published_revision_id',
      'pending_revision_id',
      'row_revision',
      'published_at',
      'created_at',
      'updated_at',
      'locked',
      'resolved',
      'solution_comment_id',
    ],
    indexes: [
      ['PRIMARY', 'id', 0],
      ['uk_public', 'public_id', 0],
      ['idx_feed', 'status,published_at,id', 1],
      ['idx_author', 'author_id,status,published_at,id', 1],
    ],
  },
  community_post_revisions: {
    columns: ['id', 'post_id', 'revision_no', 'kind', 'title', 'body', 'mentions', 'status', 'created_at'],
    indexes: [
      ['PRIMARY', 'id', 0],
      ['uk_revision', 'post_id,revision_no', 0],
      ['idx_review', 'status,id', 1],
    ],
  },
  community_topics: {
    columns: ['id', 'slug', 'name_zh', 'name_en', 'enabled', 'sort_order'],
    indexes: [
      ['PRIMARY', 'id', 0],
      ['uk_slug', 'slug', 0],
    ],
  },
  community_topic_details: {
    columns: [
      'topic_id',
      'description_zh',
      'description_en',
      'official_pinned',
      'post_task',
      'row_revision',
      'updated_by',
      'updated_at',
    ],
    indexes: [['PRIMARY', 'topic_id', 0]],
  },
  community_revision_topics: {
    columns: ['revision_id', 'topic_id'],
    indexes: [['PRIMARY', 'revision_id,topic_id', 0]],
  },
  community_post_topics: {
    columns: ['post_id', 'topic_id'],
    indexes: [
      ['PRIMARY', 'post_id,topic_id', 0],
      ['idx_topic', 'topic_id,post_id', 1],
    ],
  },
  community_comments: {
    columns: [
      'id',
      'public_id',
      'post_id',
      'author_id',
      'root_comment_id',
      'reply_to_comment_id',
      'body',
      'mentions',
      'status',
      'row_revision',
      'created_at',
    ],
    indexes: [
      ['PRIMARY', 'id', 0],
      ['uk_public', 'public_id', 0],
      ['idx_thread', 'post_id,root_comment_id,status,id', 1],
      ['idx_author', 'author_id,id', 1],
    ],
  },
  community_post_user_states: {
    columns: ['user_id', 'post_id', 'liked', 'subscription', 'hidden'],
    indexes: [
      ['PRIMARY', 'user_id,post_id', 0],
      ['idx_post', 'post_id,liked,user_id', 1],
    ],
  },
  community_follows: {
    columns: ['follower_user_id', 'followee_user_id', 'created_at'],
    indexes: [
      ['PRIMARY', 'follower_user_id,followee_user_id', 0],
      ['idx_followee', 'followee_user_id,follower_user_id', 1],
    ],
  },
  community_user_mutes: {
    columns: ['user_id', 'target_user_id'],
    indexes: [['PRIMARY', 'user_id,target_user_id', 0]],
  },
  community_profile_options: {
    columns: [
      'user_id',
      'enabled',
      'consent_version',
      'row_revision',
      'interests',
      'featured_posts',
      'comment_notifications_enabled',
      'mention_notifications_enabled',
      'like_notifications_enabled',
    ],
    indexes: [['PRIMARY', 'user_id', 0]],
  },
  community_operation_receipts: {
    columns: ['actor_id', 'request_id', 'request_hash', 'result', 'created_at'],
    indexes: [['PRIMARY', 'actor_id,request_id', 0]],
  },
  community_outbox: {
    columns: [
      'id',
      'event_key',
      'kind',
      'actor_id',
      'post_id',
      'comment_id',
      'action_id',
      'revision_id',
      'status',
      'recipient_cursor',
      'attempts',
      'next_attempt_at',
      'lease_until',
      'lease_token',
      'created_at',
    ],
    indexes: [
      ['PRIMARY', 'id', 0],
      ['uk_event', 'event_key', 0],
      ['idx_claim', 'status,next_attempt_at,id', 1],
    ],
  },
  community_event_recipients: {
    columns: ['dedupe_key', 'user_id', 'outcome', 'notification_id'],
    indexes: [['PRIMARY', 'dedupe_key,user_id', 0]],
  },
  community_content_reports: {
    columns: [
      'id',
      'public_id',
      'reporter_id',
      'post_id',
      'comment_id',
      'reason',
      'detail',
      'status',
      'action_id',
      'created_at',
    ],
    indexes: [
      ['PRIMARY', 'id', 0],
      ['uk_public', 'public_id', 0],
      ['uk_report', 'reporter_id,post_id,comment_id', 0],
      ['idx_pending', 'status,id', 1],
    ],
  },
  community_moderation_actions: {
    columns: [
      'id',
      'public_id',
      'actor_id',
      'subject_id',
      'post_id',
      'comment_id',
      'target_revision',
      'action',
      'reason',
      'created_at',
    ],
    indexes: [
      ['PRIMARY', 'id', 0],
      ['uk_public', 'public_id', 0],
      ['idx_subject', 'subject_id,id', 1],
      ['idx_post', 'post_id,id', 1],
    ],
  },
  community_appeals: {
    columns: [
      'id',
      'public_id',
      'action_id',
      'author_id',
      'body',
      'status',
      'result',
      'reviewed_by',
      'row_revision',
      'created_at',
    ],
    indexes: [
      ['PRIMARY', 'id', 0],
      ['uk_public', 'public_id', 0],
      ['uk_action', 'action_id,author_id', 0],
      ['idx_pending', 'status,id', 1],
    ],
  },
};

// Optional image capability; absence must not disable text posts.
export const COMMUNITY_IMAGE_SCHEMA = {
  community_post_images: {
    columns: [
      'public_id',
      'owner_id',
      'post_id',
      'object_key',
      'content_type',
      'content_hash',
      'file_size',
      'width',
      'height',
      'status',
      'created_at',
    ],
    indexes: [
      ['PRIMARY', 'public_id', 0],
      ['idx_owner', 'owner_id,status', 1],
      ['idx_cleanup', 'status,created_at', 1],
    ],
  },
  community_revision_images: {
    columns: ['revision_id', 'image_id', 'sort_order'],
    indexes: [
      ['PRIMARY', 'revision_id,image_id', 0],
      ['uk_order', 'revision_id,sort_order', 0],
      ['idx_image', 'image_id', 1],
    ],
  },
};

export const COMMUNITY_RESOURCE_SCHEMA = {
  community_resource_snapshots: {
    columns: ['public_id', 'owner_id', 'post_id', 'kind', 'title', 'body', 'url', 'created_at'],
    indexes: [
      ['PRIMARY', 'public_id', 0],
      ['idx_owner', 'owner_id,post_id', 1],
      ['idx_cleanup', 'post_id,created_at', 1],
    ],
  },
  community_revision_resources: {
    columns: ['revision_id', 'resource_id', 'sort_order'],
    indexes: [
      ['PRIMARY', 'revision_id,resource_id', 0],
      ['uk_order', 'revision_id,sort_order', 0],
      ['idx_resource', 'resource_id', 1],
    ],
  },
};
