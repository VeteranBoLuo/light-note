// noinspection JSUnusedGlobalSymbols

import { Ref } from 'vue';

export const copyTextToClipboard = function (text) {
  // 检查浏览器是否支持Clipboard API
  if (navigator.clipboard) {
    try {
      // 使用navigator.clipboard.writeText()来复制文本
      navigator.clipboard.writeText(text).then(() => {});
      // 复制文本成功，直接返回true
      return true;
    } catch (err) {
      // 复制文本失败，处理错误
      console.error('复制文本失败：', err);
      // 根据需要，你可以在这里执行其他错误处理逻辑
      return false;
    }
  } else {
    console.error('浏览器不支持Clipboard API');
    // 如果不支持Clipboard API，返回false或抛出错误
    return false;
  }
};

//  防抖函数
/**
 * 防抖函数：延迟执行函数，直到停止调用后的指定时间
 * @param func 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}
 // 节流函数：限制函数调用频率
export function throttle(func: Function, delay: number) {
    let timeoutId: number | null = null;
    return (...args: any[]) => {
      if (timeoutId === null) {
        func(...args);
        timeoutId = setTimeout(() => {
          timeoutId = null;
        }, delay);
      }
    };
  }

// 获取浏览器类型
export function getBrowserType() {
  let browserType = null;
  try {
    let ua = navigator.userAgent.toLocaleLowerCase();
    function _mime(option, value) {
      const mimeTypes = navigator.mimeTypes;
      for (let mt in mimeTypes) {
        if (mimeTypes[mt][option] == value) {
          return true;
        }
      }
      return false;
    }
    if (ua.match(/msie/) != null || ua.match(/trident/) != null) {
      browserType = 'IE';
    } else if (ua.match(/firefox/) != null) {
      browserType = 'firefox';
    } else if (ua.match(/ucbrowser/) != null) {
      browserType = 'UC';
    } else if (ua.match(/opera/) != null || ua.match(/opr/) != null) {
      browserType = 'opera';
    } else if (ua.match(/bidubrowser/) != null) {
      browserType = 'baidu';
    } else if (ua.match(/metasr/) != null) {
      browserType = 'sougou';
    } else if (ua.match(/tencenttraveler/) != null || ua.match(/qqbrowse/) != null) {
      browserType = 'QQ';
    } else if (ua.match(/maxthon/) != null) {
      browserType = 'maxthon';
    } else if (ua.match(/chrome/) != null) {
      const is360 = _mime('type', 'application/vnd.chromium.remoting-viewer');
      if (is360) {
        browserType = '360';
      } else {
        browserType = 'chrome';
      }
    } else if (ua.match(/safari/) != null) {
      browserType = 'Safari';
    } else {
      browserType = 'others';
    }
  } catch (e) {}
  return browserType;
}

export function getUserOsInfo() {
  const userAgent = navigator.userAgent;
  if (userAgent.indexOf('Windows NT 10.0') !== -1) return 'Windows 10';
  if (userAgent.indexOf('Windows NT 6.2') !== -1) return 'Windows 8';
  if (userAgent.indexOf('Windows NT 6.1') !== -1) return 'Windows 7';
  if (userAgent.indexOf('Windows NT 6.0') !== -1) return 'Windows Vista';
  if (userAgent.indexOf('Windows NT 5.1') !== -1) return 'Windows XP';
  if (userAgent.indexOf('Windows NT 5.0') !== -1) return 'Windows 2000';
  if (userAgent.indexOf('Mac') !== -1) return 'Mac/iOS';
  if (userAgent.indexOf('X11') !== -1) return 'UNIX';
  if (userAgent.indexOf('Linux') !== -1) return 'Linux';
  return 'Other';
}

// fingerprint.js
export function fingerprint() {
  // 创建一个简单的哈希函数，用于生成字符串的哈希值
  const createHash = (input) => {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const character = input.charCodeAt(i);
      hash = (hash << 5) - hash + character;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(16);
  };

  // 使用canvas生成一个指纹
  const getCanvasFingerprint = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    // 在canvas上绘制一些隐藏的文字
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('browser fingerprint', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('browser fingerprint', 4, 17);
    // 返回canvas的dataURL字符串
    return canvas.toDataURL();
  };

  // 将数组元素排序并连接成字符串，然后返回
  const getArrayHash = (array) => {
    if (!Array.isArray(array)) {
      return '';
    }
    return array
      .sort((a, b) => (a.name || a.type || a).localeCompare(b.name || b.type || b))
      .map((item) => item.name || item.type || item)
      .join(';');
  };

  // 获取浏览器和设备信息
  const navigatorInfo = window.navigator;
  const screenInfo = window.screen;
  const plugins = Array.from(navigatorInfo.plugins);
  const mimeTypes = Array.from(navigatorInfo.mimeTypes);
  // 将各种浏览器属性组合成一个字符串数组
  const attributes = [
    navigatorInfo.language, // 浏览器语言
    screenInfo.width, // 屏幕宽度
    screenInfo.height, // 屏幕高度
    screenInfo.colorDepth, // 屏幕颜色深度
    getArrayHash(plugins), // 插件列表哈希
    getArrayHash(mimeTypes), // MIME类型列表哈希
    getCanvasFingerprint(), // Canvas指纹
    Intl.DateTimeFormat().resolvedOptions().timeZone, // 时区
    navigator.hardwareConcurrency, // 硬件并发性
    window.devicePixelRatio, // 设备像素比
    getUserOsInfo(), // // 自定义属性：操作系统信息
  ];

  // 将属性数组连接成一个字符串并生成哈希值作为指纹
  const fingerprintString = attributes.join(';');
  return createHash(fingerprintString);
}
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    let r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function customTimer(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function closeOpenWindow(className: string, flag: Ref<boolean>, remove?: boolean) {
  if (remove) {
    document.removeEventListener(
      'click',
      (e: any) => {
        if (!e.target.matches(`.${className} *`)) {
          flag.value = false;
        }
      },
      true,
    );
  } else {
    document.addEventListener(
      'click',
      (e: any) => {
        if (!e.target.matches(`.${className} *`)) {
          flag.value = false;
        }
      },
      true,
    );
  }
}

export function openPage(url, newPage: boolean = true) {
  window.open(url, newPage ? '_blank' : '_self');
}
