import queryPlatformResources from './query_platform_resources.js';

/**
 * “某时间段新增的用户，又新增了哪些资源”是一个双时间范围的同表联查，不能拆成
 * query_notes / query_bookmarks / query_files 三个个人作用域调用。单独注册这个能力，
 * 让 Planner 面对合并问句时有唯一、一次即可完成的工具语义。
 */
export default {
  name: 'query_new_user_resources',
  appliesToDomains: ['admin', 'content', 'note', 'bookmark', 'file'],
  description:
    '【管理员】一次查询某时间段新注册用户创建的书签、笔记和云空间文件。' +
    '专门回答“今天新增用户今天新增了哪些资源”“本周新用户都创建了什么”这类同时限定用户注册时间与资源创建时间的问题。' +
    '这类问题只调用本工具一次；不要再并行调用 query_notes、query_bookmarks、query_files，也不需要先调用 query_users。',
  routing: {
    targetScope: 'platform',
    requireAny: [
      /(?:新增|新注册|注册).{0,24}(?:用户|账号).{0,48}(?:新增|创建|产生|保存|上传|收藏|都有什么).{0,18}(?:资源|内容|书签|笔记|文件|什么)/iu,
      /(?:这些|上述|他们|新用户).{0,28}(?:新增|创建|产生|保存|上传|收藏|资源|书签|笔记|文件)/iu,
    ],
    preferAny: [
      /(?:新增|新注册|注册).{0,24}(?:用户|账号).{0,48}(?:资源|内容|书签|笔记|文件)/iu,
      /(?:这些|上述|他们|新用户).{0,28}(?:资源|书签|笔记|文件|创建了什么)/iu,
    ],
    excludeAny: [/(?:最多|排行|排名|榜单|第[一1]名|top\s*\d*)/iu],
  },
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['registeredWithin', 'resourceTimeRange'],
    properties: {
      registeredWithin: {
        type: 'string',
        description: '用户注册时间范围，如“今天”“昨天”“本周”“最近7天”',
      },
      resourceTimeRange: {
        type: 'string',
        description: '资源创建时间范围，如“今天”“昨天”“本周”；问同一天时与 registeredWithin 传相同值',
      },
      resourceType: {
        type: 'string',
        enum: ['all', 'bookmark', 'note', 'file'],
        description: '资源类型，默认 all',
      },
      includeInternal: {
        type: 'boolean',
        description: '是否包含 root/test 等内部账号，默认 false',
      },
      limit: {
        type: 'integer',
        description: '返回条数，默认30，最大100',
      },
    },
  },
  requireRoot: true,
  execute(args = {}) {
    if (!String(args.registeredWithin || '').trim()) throw new Error('新用户资源联查需要明确用户注册时间');
    if (!String(args.resourceTimeRange || '').trim()) throw new Error('新用户资源联查需要明确资源创建时间');
    return queryPlatformResources.execute({
      timeRange: args.resourceTimeRange,
      registeredWithin: args.registeredWithin,
      resourceType: args.resourceType,
      includeInternal: args.includeInternal,
      limit: args.limit,
    });
  },
  transform: queryPlatformResources.transform,
  summarize: queryPlatformResources.summarize,
};
