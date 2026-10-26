import { resultData } from '../util/common.js';
import { cloudSpacePreference } from '../util/services/cloudSpacePreferenceService.js';

function handler(write) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.adminContext)
      return res.status(403).send(resultData(null, 403, '请退出管理员预览后操作 / Exit administrator preview'));
    try {
      return res.send(resultData(await cloudSpacePreference({ user: req.user, input: req.body, write })));
    } catch (error) {
      const known = [
        'CLOUD_PREFERENCE_LOGIN_REQUIRED',
        'CLOUD_PREFERENCE_INVALID',
        'CLOUD_PREFERENCE_ACCOUNT_UNAVAILABLE',
      ].includes(error?.code);
      const status = known ? error.status : 503;
      return res
        .status(status)
        .send(
          resultData(
            { code: known ? error.code : 'CLOUD_PREFERENCE_UNAVAILABLE' },
            status,
            '文件显示设置暂未保存，请重试 / File display settings could not be saved. Please retry',
          ),
        );
    }
  };
}
export const getCloudSpacePreference = handler(false);
export const saveCloudSpacePreference = handler(true);
