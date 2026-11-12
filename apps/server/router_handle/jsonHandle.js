import { resultData } from '../util/common.js';
import pool from '../db/index.js';

/**
 * 根据名称查询JSON配置
 * @param {Object} req - 请求对象，包含query参数：name（配置名称）
 * @param {Object} res - 响应对象
 */
export const getConfigByName = (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.send(resultData(null, 400, '配置名称不能为空'));
    }

    pool
      .query(
        'SELECT id, name, json_content, created_time, updated_time FROM config_json WHERE name = ? AND del_flag = 0',
        [name],
      )
      .then(([results]) => {
        if (results.length === 0) {
          return res.send(resultData(null, 404, '未找到对应的配置'));
        }
        res.send(resultData(results[0]));
      })
      .catch((err) => res.send(resultData(null, 500, '服务器内部错误: ' + err.message)));
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};
