import { warn } from 'core/util/index'

export * from './attrs'
export * from './class'
export * from './element'

/**
 * Query an element selector if it's not an element already.
 */
// 转换成 DOM 对象
export function query(el: string | Element): Element {

  // 如果是字符串，使用 querySelector API 查找元素，找到了就返回，没找到报错并创建返回一个空的 div
  if (typeof el === 'string') {
    const selected = document.querySelector(el)
    if (!selected) {
      __DEV__ && warn('Cannot find element: ' + el)
      return document.createElement('div')
    }
    return selected
  } else {
    // 如果是 DOM 对象，直接返回该元素
    return el
  }
}
