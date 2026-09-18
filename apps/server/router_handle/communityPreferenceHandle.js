import { capabilities as feedCapabilities } from '../util/communityFeed/core.js';
import { resultData } from '../util/agent/data.js';
import { getCommunityPreferences, updateCommunityPreferences } from '../util/services/communityPreferenceService.js';
import { communityCapabilities } from '../util/communityPreferences.js';

export async function capabilities(_req, res) {
  res
    .set('Cache-Control', 'private, no-store')
    .send(resultData(communityCapabilities((await feedCapabilities()).feedEnabled)));
}
export function createPreferenceHandler(service) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.adminContext)
      return res
        .status(403)
        .send(
          resultData(
            { code: 'COMMUNITY_ADMIN_CONTEXT_FORBIDDEN' },
            403,
            '请退出管理员预览后操作 / Exit administrator preview',
          ),
        );
    try {
      const data = await service({ user: req.user, input: req.body });
      return res.send(resultData(data));
    } catch (error) {
      const known = [
        'COMMUNITY_LOGIN_REQUIRED',
        'COMMUNITY_ACCOUNT_UNAVAILABLE',
        'COMMUNITY_INVALID_PREFERENCE',
        'COMMUNITY_VIEW_UNAVAILABLE',
        'COMMUNITY_PREFERENCE_CONFLICT',
      ].includes(error?.code);
      const status = known ? error.status : 503;
      return res
        .status(status)
        .send(
          resultData(
            { code: known ? error.code : 'COMMUNITY_PREFERENCES_UNAVAILABLE' },
            status,
            '社区设置暂未保存，请刷新后重试 / Refresh community settings and retry',
          ),
        );
    }
  };
}
export const preferences = createPreferenceHandler(getCommunityPreferences);
export const updatePreferences = createPreferenceHandler(updateCommunityPreferences);
