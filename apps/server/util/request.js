import { snakeCaseKeys } from './common.js';
import pool from '../db/index.js';

export const validateQueryParams = function (queryBody) {
  let { pageSize, currentPage, order, filters } = queryBody;
  order = snakeCaseKeys(order);
  filters = snakeCaseKeys(filters);
  // 检查必传参数：pageSize = -1 时不限数量，不需要 currentPage
  if (pageSize === undefined || pageSize === null) {
    throw new Error('pageSize是必传参数');
  }
  if (pageSize !== -1 && !currentPage) {
    throw new Error('pageSize为-1时不限数量，否则currentPage是必传参数');
  }
  return { pageSize, currentPage, order, filters };
};

// 基础查询请求
export const baseQuery = async function (req, tableName, options = { whereSign: 'AND' }) {
  try {
    const { pageSize, currentPage, order, filters } = validateQueryParams(req.body);

    // 处理排序
    let orderClause = '';
    if (order && typeof order === 'object' && Object.keys(order).length > 0) {
      const orderBy = [];
      for (const [field, method] of Object.entries(order)) {
        if (!['asc', 'desc'].includes(method.toLowerCase())) {
          throw new Error(`排序方法${method}无效，必须是asc或desc`);
        }
        orderBy.push(`${field} ${method.toUpperCase()}`);
      }
      orderClause = `ORDER BY ${orderBy.join(', ')}`;
    }

    // 处理分页
    let limitClause = '';
    let offset = 0;
    if (pageSize !== -1) {
      const totalPage = parseInt(pageSize);
      const currentPageNum = parseInt(currentPage);
      offset = (currentPageNum - 1) * totalPage;
      limitClause = `LIMIT ${totalPage} OFFSET ${offset}`;
    }

    // 处理过滤条件
    let whereClause = '';
    const whereParams = [];

    // 检查是否需要添加默认的del_flag条件
    if (!filters || !filters.hasOwnProperty('del_flag')) {
      whereClause += 'WHERE del_flag = 0';
    }

    if (filters && Object.keys(filters).length > 0) {
      const conditions = [];
      for (const [key, value] of Object.entries(filters)) {
        if (value === null || value === undefined || value === '') {
          continue;
        }
        // 检查是否有特殊操作符
        const parts = key.split('__');
        if (parts.length === 2) {
          const [field, operator] = parts;
          switch (operator.toLowerCase()) {
            case 'startswith':
              if (value === '') {
                throw new Error('startswith操作符的值不能为空');
              }
              conditions.push(`${field} LIKE ?`);
              whereParams.push(`${value}%`);
              break;
            case 'contains':
              conditions.push(`${field} LIKE ?`);
              whereParams.push(`%${value}%`);
              break;
            case 'endswith':
              if (value === '') {
                throw new Error('endswith操作符的值不能为空');
              }
              conditions.push(`${field} LIKE ?`);
              whereParams.push(`%${value}`);
              break;
            default:
              throw new Error(`无效的操作符${operator}`);
          }
        } else {
          // 普通等值条件
          conditions.push(`${key} = ?`);
          whereParams.push(value);
        }
      }
      if (conditions.length > 0) {
        if (whereClause === '') {
          whereClause += 'WHERE ';
        } else {
          whereClause += ' AND ';
        }
        whereClause += conditions.join(` ${options.whereSign} `);
      }
    }
    // 构建SQL查询
    const querySql = `SELECT * FROM ${tableName} ${whereClause} ${orderClause} ${limitClause}`;
    const [result] = await pool.query(querySql, whereParams);

    // 计算总记录数
    let totalSql = `SELECT COUNT(*) AS total FROM ${tableName} ${whereClause}`;
    const [totalResult] = await pool.query(totalSql, whereParams);
    const total = totalResult[0].total;

    return {
      items: result,
      total: total,
    };
  } catch (e) {
    throw e; // 将错误抛出，让上层处理
  }
};

// 基础新增请求
export const baseCreate = async function (req, tableName) {
  let { data } = req.body;
  if (!data) {
    throw new Error('data is required');
  }
  // 确保data是一个数组
  data = Array.isArray(data) ? data : [data];
  // 转换为蛇形命名
  data = data.map(snakeCaseKeys);

  if (data.length === 0) {
    throw new Error('No data to insert');
  }

  // 获取列名
  const firstItem = data[0];
  const columns = Object.keys(firstItem);
  // 检查所有数据项的字段是否一致
  for (const item of data) {
    if (Object.keys(item).some((key) => !columns.includes(key))) {
      throw new Error('Data items have inconsistent columns');
    }
  }

  // 构建占位符
  const placeholders = columns.map(() => '?').join(', ');
  // 提取所有值
  const values = data.flatMap((item) => columns.map((col) => item[col]));

  // 构建SQL语句
  const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
  // 执行插入操作
  const [result] = await pool.query(insertSql, values);

  return result;
};

// 基础修改请求
export const baseUpdate = async function (req, tableName) {
  let { query, update } = req.body;
  const safeQuery = snakeCaseKeys(query);
  // 检查查询参数是否为空
  if (!safeQuery || Object.keys(safeQuery).length === 0) {
    throw new Error('No query conditions provided');
  }
  let whereClause = '';
  const conditions = [];
  for (const [key, value] of Object.entries(safeQuery)) {
    conditions.push(`${key} = ?`);
  }
  whereClause = `WHERE ${conditions.join(' AND ')}`;
  const updateSql = `UPDATE ${tableName} SET ? ${whereClause}`;
  const [result] = await pool.query(updateSql, [update, ...Object.values(safeQuery)]);
  return result;
};

// 基础删除请求
export const baseDelete = async function (req, tableName) {
  const { filters } = req.body;
  const safeFilters = snakeCaseKeys(filters);

  // 检查查询参数是否为空
  if (!safeFilters || Object.keys(safeFilters).length === 0) {
    throw new Error('No query conditions provided');
  }

  // 构造 WHERE 子句和参数列表
  const whereConditions = [];
  const whereParams = [];

  for (const [key, value] of Object.entries(safeFilters)) {
    if (Array.isArray(value)) {
      // 处理数组，使用 IN 操作符
      whereConditions.push(`${key} IN (${value.map(() => '?').join(', ')})`);
      whereParams.push(...value);
    } else {
      // 普通等值条件
      whereConditions.push(`${key} = ?`);
      whereParams.push(value);
    }
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const deleteSql = `DELETE FROM ${tableName} ${whereClause}`;

  const [result] = await pool.query(deleteSql, whereParams);
  return result;
};

// 工具函数：带超时的 fetch 请求
export const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'MyApp',
        ...(options.headers || {})
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error.name === 'AbortError'
      ? new Error('Request timed out')
      : error;
  }
};