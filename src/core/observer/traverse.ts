import { _Set as Set, isObject, isArray } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'
import { isRef } from '../../v3'

// 用来存放 Observer 实例等 id，避免重复读取
const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse(val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
  return val
}

function _traverse(val: any, seen: SimpleSet) {
  let i, keys
  const isA = isArray(val)

  // 不是数组 && 不是对象
  // 存在跳过标记
  // frozen 的对象
  // VNode
  // 直接 return，不需要收集深层依赖关系
  if (
    (!isA && !isObject(val)) ||
    val.__v_skip /* ReactiveFlags.SKIP */ ||
    Object.isFrozen(val) ||
    val instanceof VNode
  ) {
    return
  }

  // 根据 id 判断，避免重复读取
  if (val.__ob__) {
    const depId = val.__ob__.dep.id

    // 如果已经遍历过，跳过
    if (seen.has(depId)) {
      return
    }

    // 如果没有，标记为已遍历
    seen.add(depId)
  }

  // 递归数组
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else if (isRef(val)) {
    _traverse(val.value, seen)
  } else {
    // 递归对象
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
