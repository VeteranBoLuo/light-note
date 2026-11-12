import { snakeCaseKeys } from './common.js';

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
