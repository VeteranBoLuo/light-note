import pool from '../db/index.js';
import { L, resultData } from '../util/common.js';
import { ensureNotVisitor, ensureUserOrAdminPolicy } from '../util/auth.js';
import { ADMIN_POLICIES } from '../util/adminRoutePolicy.js';
import { getTagEditorBootstrap } from '../util/services/tagEditorService.js';
import { getTagSpaceOverview, queryTagSpaceList, queryTagSpaceResources } from '../util/services/tagSpaceService.js';

function getResourceUserId(req) {
  return (req.resourceUser || req.user)?.id;
}

// 标签空间与 queryTagList 一致：游客只读共享游客账号的示例标签；管理员上下文仍按读取策略授权。
// 标签编辑器数据只服务于编辑，继续拒绝游客。
function ensureTagSpaceRead(req, res) {
  if (req.adminContext) return ensureUserOrAdminPolicy(req, res, [ADMIN_POLICIES.READ]);
  return Boolean(getResourceUserId(req)) || ensureNotVisitor(req, res);
}

export async function getTagEditorData(req, res) {
  if (!ensureUserOrAdminPolicy(req, res, [ADMIN_POLICIES.READ])) return;
  try {
    const data = await getTagEditorBootstrap(pool, {
      userId: getResourceUserId(req),
      tagId: req.body?.tagId,
    });
    if (!data) return res.send(resultData(null, 404, L(req, '标签不存在', 'Tag not found')));
    return res.send(resultData(data));
  } catch (error) {
    console.error(
      '[tag-editor] bootstrap failed code=%s',
      String(error?.code || error?.message || 'TAG_EDITOR_BOOTSTRAP_FAILED'),
    );
    return res.send(resultData(null, 500, L(req, '标签编辑器加载失败，请稍后重试', 'Failed to load tag editor')));
  }
}

export async function queryTagSpaces(req, res) {
  if (!ensureTagSpaceRead(req, res)) return;
  try {
    const data = await queryTagSpaceList(pool, {
      userId: getResourceUserId(req),
      keyword: req.body?.keyword,
      filter: req.body?.filter,
      sort: req.body?.sort,
      includeEmpty: req.body?.includeEmpty,
      includeMetadata: req.body?.includeMetadata,
      page: req.body?.page ?? req.body?.currentPage,
      pageSize: req.body?.pageSize,
    });
    return res.send(resultData(data));
  } catch (error) {
    console.error('[tag-space] list failed code=%s', String(error?.code || error?.message || 'TAG_SPACE_LIST_FAILED'));
    return res.send(resultData(null, 500, L(req, '标签空间加载失败，请稍后重试', 'Failed to load tag spaces')));
  }
}

export async function getTagSpace(req, res) {
  if (!ensureTagSpaceRead(req, res)) return;
  try {
    const data = await getTagSpaceOverview(pool, {
      userId: getResourceUserId(req),
      tagId: req.body?.id ?? req.body?.filters?.id,
      relatedLimit: req.body?.relatedLimit,
    });
    if (!data) {
      return res.send(resultData(null, 404, L(req, '标签不存在', 'Tag not found')));
    }
    return res.send(resultData(data));
  } catch (error) {
    console.error(
      '[tag-space] detail failed code=%s',
      String(error?.code || error?.message || 'TAG_SPACE_DETAIL_FAILED'),
    );
    return res.send(resultData(null, 500, L(req, '标签空间加载失败，请稍后重试', 'Failed to load tag space')));
  }
}

export async function queryTagSpaceResourceList(req, res) {
  if (!ensureTagSpaceRead(req, res)) return;
  try {
    const data = await queryTagSpaceResources(pool, {
      userId: getResourceUserId(req),
      tagId: req.body?.id ?? req.body?.filters?.id,
      keyword: req.body?.keyword,
      type: req.body?.type,
      sort: req.body?.sort,
      page: req.body?.page ?? req.body?.currentPage,
      pageSize: req.body?.pageSize,
    });
    if (!data) return res.send(resultData(null, 404, L(req, '标签不存在', 'Tag not found')));
    return res.send(resultData(data));
  } catch (error) {
    console.error(
      '[tag-space] resources failed code=%s',
      String(error?.code || error?.message || 'TAG_SPACE_RESOURCES_FAILED'),
    );
    return res.send(resultData(null, 500, L(req, '标签内容加载失败，请稍后重试', 'Failed to load tag resources')));
  }
}
