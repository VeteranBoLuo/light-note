// noinspection JSUnusedGlobalSymbols

import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';

export interface EndCondition {
  endCondition: boolean | (() => boolean);
  message: string;
  type?: 'warning' | 'success' | 'error';
}

/**
 * 检查结束条件数组，只要任意条件满足，就显示消息并返回 true
 * @param conditions 条件数组
 * @returns 是否有条件满足
 */
export function checkEndCondition(conditions: EndCondition[]): boolean {
  for (const condition of conditions) {
    // 支持函数或布尔值
    const isEnd = typeof condition.endCondition === 'function' ? condition.endCondition() : condition.endCondition;

    if (isEnd) {
      if (condition.message) {
        const type = condition.type ?? 'warning';
        message[type](condition.message);
      }
      return true;
    }
  }
  return false;
}

/**
 * 判断对象是否有某个属性（安全版本）
 * @param object 目标对象
 * @param property 属性名
 * @returns 是否拥有该属性
 */
export function hasOwnProperty(object: Record<string, any>, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, property);
}

/**
 * 判断值是否为空
 * @param val 要检查的值
 * @returns 是否为空
 */
export function isEmpty(val: unknown): boolean {
  if (val === '' || val === null || val === undefined) {
    return true;
  }
  if (typeof val === 'object' && val !== null) {
    if (Array.isArray(val)) {
      return val.length === 0;
    }
    if (val instanceof Map || val instanceof Set) {
      return val.size === 0;
    }
    return Object.keys(val).length === 0;
  }
  return false;
}

/**
 * 判断元素是否为当前聚焦元素
 * @param element DOM 元素
 * @returns 是否聚焦
 */
export function isFocused(element: Element): boolean {
  return document.activeElement === element;
}

/**
 * 基础邮箱格式校验。用于不依赖第三方表单组件的轻量表单场景。
 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
