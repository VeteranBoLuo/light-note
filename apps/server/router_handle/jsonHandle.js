import { resultData } from '../util/common.js';
import pool from '../db/index.js';
import { ensureNotVisitor } from '../util/auth.js';

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

export const updateConfig = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  if (req.user?.role !== "root") return res.send(resultData(null, 403, "没有操作权限"));
  try {
    const { name, jsonContent } = req.body;
    const [result] = await pool.query('UPDATE config_json SET json_content = ? WHERE name = ?', [jsonContent, name]);
    res.send(resultData(result, 200));
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};

/**
 * 根据ID软删除JSON配置
 * @param {Object} req - 请求对象，包含query参数：id（配置ID）
 * @param {Object} res - 响应对象
 */
export const deleteConfigById = (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  if (req.user?.role !== "root") return res.send(resultData(null, 403, "没有操作权限"));
  try {
    const { id } = req.query;

    if (!id) {
      return res.send(resultData(null, 400, '配置ID不能为空'));
    }

    pool
      .query('UPDATE config_json SET del_flag = 1 WHERE id = ?', [id])
      .then(([result]) => {
        if (result.affectedRows === 0) {
          return res.send(resultData(null, 404, '未找到对应的配置或配置已被删除'));
        }
        res.send(resultData({ affectedRows: result.affectedRows }, 200, '删除成功'));
      })
      .catch((err) => res.send(resultData(null, 500, '服务器内部错误: ' + err.message)));
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};
