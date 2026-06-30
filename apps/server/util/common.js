import userRouter from '../router/user.js';
import commonRouter from '../router/common.js';
import noteLibraryRouter from '../router/noteLibrary.js';
import bookmarkRouter from '../router/bookmark.js';
import opinionRouter from '../router/opinion.js';
import fileRouter from '../router/file.js';
import chatRouter from '../router/chat.js';
import jsonRouter from '../router/json.js';
import searchRouter from '../router/search.js';
import workbenchRouter from '../router/workbench.js';
import knowledgeBaseRouter from '../router/knowledgeBase.js';
import securityRouter from '../router/security.js';
import trashRouter from '../router/trash.js';

export const resultData = function (data = null, status = 200, msg = '') {
  if (status !== 200 && status !== 'visitor' && status !== 'preview') {
    console.error(status, msg + ' ' + formatDateTime(new Date()));
  }
  return {
    data: camelCaseKeys(data),
    status: status,
    msg: msg,
  };
};

export const formatDateTime = function (date) {
  const pad = (v) => v.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// 下划线转驼峰
const camelCaseKeys = function (input) {
  // 定义一个处理函数，用于将单个对象中的键转换为驼峰命名
  function toCamelCase(obj) {
    // Format Date to local datetime string
    if (obj instanceof Date) {
      return formatDateTime(obj);
    }
    if (Array.isArray(obj)) {
      // 如果是数组，递归映射每个元素到处理函数
      return obj.map(toCamelCase);
    } else if (typeof obj === 'object' && obj !== null) {
      // 如果是对象，递归处理每个属性
      const result = {};
      for (let key in obj) {
        // 递归处理对象的值
        const value = toCamelCase(obj[key]);
        let newKey =
          key[0].toLowerCase() +
          key.slice(1).replace(/_([a-z])/g, function ($0, $1) {
            return $1.toUpperCase();
          });
        result[newKey] = value;
      }
      return result;
    } else {
      // 如果既不是对象也不是数组，返回原值
      return obj;
    }
  }

  // 检查输入类型并调用处理函数
  return toCamelCase(input);
};

// 驼峰转下划线
export const snakeCaseKeys = function (input) {
  // 定义一个处理函数，用于将单个对象中的键转换为下划线命名
  function toSnakeCase(obj) {
    if (Array.isArray(obj)) {
      // 如果是数组，递归映射每个元素到处理函数
      return obj.map(toSnakeCase);
    } else if (typeof obj === 'object' && obj !== null) {
      // 如果是对象，递归处理每个属性
      const result = {};
      for (let key in obj) {
        // 递归处理对象的值
        const value = toSnakeCase(obj[key]);
        let newKey =
          key[0].toLowerCase() +
          key.slice(1).replace(/([A-Z])/g, function ($0, $1) {
            return '_' + $1.toLowerCase();
          });
        result[newKey] = value;
      }
      return result;
    } else {
      // 如果既不是对象也不是数组，返回原值
      return obj;
    }
  }

  // 检查输入类型并调用处理函数
  if (input === null || input === undefined) return input;
  return toSnakeCase(JSON.parse(JSON.stringify(input)));
};

// 函数用于将 ISO 8601 格式转换为数据库存储的格式
export const convertISOToDatabaseFormat = function (isoDate) {
  // 创建一个 Date 对象
  const date = new Date(isoDate);
  // 将 Date 对象转换为数据库存储的格式
  const databaseFormat = date.toISOString().replace('T', ' ').replace('.000Z', '');
  return databaseFormat;
};

// 前端没有传但后端定义了的参数过滤掉
export const mergeExistingProperties = function (source, outValue = [undefined], outKey = []) {
  let target = {};
  for (const key in source) {
    // 检查value是否在outValue中
    if (outValue.includes(source[key])) {
      continue;
    }
    // 检查key是否在outKey中
    if (outKey.includes(key)) {
      continue;
    }
    // 需要判断空数组
    if (outValue.some((value) => Array.isArray(value) && value.length === 0) && source[key].length === 0) {
      continue;
    }
    // 如果都不在，则添加到target中
    target[key] = source[key];
  }
  return target;
};
// 生成 UUID v1（时间戳-based，与 MySQL UUID() 格式一致，InnoDB 友好）
export const generateUUID = function () {
  const EPOCH_OFFSET = 122192928000000000;
  const timestamp = Date.now() * 10000 + EPOCH_OFFSET;

  const timeLow = (timestamp & 0xFFFFFFFF) >>> 0;
  const timeMid = ((timestamp / 0x100000000) & 0xFFFF) >>> 0;
  const timeHi = (((timestamp / 0x10000000000) & 0x0FFF) | 0x1000) >>> 0;

  const clockSeq = ((Math.random() * 0x4000) | 0x8000) >>> 0;

  const node = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));

  const h = (n, len) => n.toString(16).padStart(len, '0');
  return `${h(timeLow, 8)}-${h(timeMid, 4)}-${h(timeHi, 4)}-${h(clockSeq, 4)}-${node.map(b => h(b, 2)).join('')}`;
};

// INSERT 专用：自动注入 UUID 并转 snake_case
export const insertData = function (params) {
  const data = { ...params };
  if (!data.id || data.id === '') {
    data.id = generateUUID();
  }
  return snakeCaseKeys(data);
};

export const baseRouter = [
  {
    path: '/user',
    router: userRouter,
  },
  {
    path: '/json',
    router: jsonRouter,
  },
  {
    path: '/common',
    router: commonRouter,
  },
  {
    path: '/note',
    router: noteLibraryRouter,
  },
  {
    path: '/bookmark',
    router: bookmarkRouter,
  },
  {
    path: '/opinion',
    router: opinionRouter,
  },
  {
    path: '/file',
    router: fileRouter,
  },
  {
    path: '/chat',
    router: chatRouter,
  },
  {
    path: '/search',
    router: searchRouter,
  },
  {
    path: '/workbench',
    router: workbenchRouter,
  },
  {
    path: '/security',
    router: securityRouter,
  },
  {
    path: '/trash',
    router: trashRouter,
  },
  {
    path: '/knowledgeBase',
    router: knowledgeBaseRouter,
  },
];
