import { resultData } from '../util/common.js';
import { prepareFilePreview, resolveFilePreview } from '../util/filePreview/service.js';
import { imagePreviewsEnabled } from '../util/filePreview/image.js';
import { getCommunityChatImageDownload } from '../util/services/communityChatImageService.js';

export async function imagePreviewBatch(req, res, { chat = false, prepare = false } = {}) {
  const ids = req.body?.ids;
  const strategy = req.body?.strategy || 'image_thumbnail';
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 40 ||
    ids.some((id) => typeof id !== 'string' && typeof id !== 'number') ||
    !['image_thumbnail', 'image_display'].includes(strategy)
  ) {
    return res.send(resultData(null, 400, 'Invalid image preview request'));
  }
  const sourceType = chat ? 'community_chat_image' : 'cloud_file';
  if (!imagePreviewsEnabled(sourceType)) return res.send(resultData({ enabled: false, items: [] }));
  const unique = [...new Set(ids.map(String))];
  const items = [];
  // 批量接口限制在途源验证数；不让 40 张图片同时访问数据库和 OBS。
  for (let offset = 0; offset < unique.length; offset += 4) {
    items.push(
      ...(await Promise.all(
        unique.slice(offset, offset + 4).map(async (id) => {
          try {
            let ownerUserId = (req.resourceUser || req.user).id;
            let fileId = Number(id);
            if (chat) {
              const source = await getCommunityChatImageDownload({
                user: req.user,
                imagePublicId: id,
                returnSource: true,
              });
              ownerUserId = source.ownerUserId;
              fileId = source.id;
            } else if (!Number.isSafeInteger(fileId) || fileId <= 0) {
              return { id, strategy, status: 'failed', errorCode: 'FILE_NOT_FOUND' };
            }
            const input = { ownerUserId, fileId, sourceType, strategy, touch: !req.adminContext };
            let state = await resolveFilePreview(input);
            if (
              prepare &&
              !req.adminContext &&
              (state.status === 'missing' || (req.body?.retry === true && state.status === 'failed'))
            ) {
              state = await prepareFilePreview({ ...input, retry: req.body?.retry === true });
            }
            if (prepare && req.adminContext && state.status === 'missing')
              state = { ...state, status: 'failed', errorCode: 'FILE_PREVIEW_NOT_READY' };
            if (chat) await getCommunityChatImageDownload({ user: req.user, imagePublicId: id, returnSource: true });
            // Internal chat image ids are never part of the public response.
            const { fileId: internalId, ...publicState } = state;
            return { id, strategy, ...publicState };
          } catch (error) {
            const code = String(error?.code || 'IMAGE_PREVIEW_UNAVAILABLE');
            return { id, strategy, status: 'failed', errorCode: /^[A-Z_]+$/.test(code) ? code : 'IMAGE_PREVIEW_UNAVAILABLE' };
          }
        }),
      )),
    );
  }
  return res.send(resultData({ enabled: true, items }));
}
export const resolveCloudImagePreviews = (req, res) => imagePreviewBatch(req, res);
export const prepareCloudImagePreviews = (req, res) => imagePreviewBatch(req, res, { prepare: true });
export const resolveChatImagePreviews = (req, res) => imagePreviewBatch(req, res, { chat: true });
export const prepareChatImagePreviews = (req, res) => imagePreviewBatch(req, res, { chat: true, prepare: true });
