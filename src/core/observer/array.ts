/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { TriggerOpTypes } from '../../v3'
import { def } from '../util/index'

// 拷贝一份数组的原型
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

// 拦截的数组方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
// 重写原型方法，并在方法里面通知 observer 变更
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator(...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }

    // 如果发生了新增操作，对新增的每一项进行观测
    if (inserted) ob.observeArray(inserted)

    // notify change
    if (__DEV__) {
      ob.dep.notify({
        type: TriggerOpTypes.ARRAY_MUTATION,
        target: this,
        key: method
      })
    } else {

      // 检测到变化，通知所有 dep 管家，让他去通知所有的 watcher 进行更新
      ob.dep.notify()
    }
    return result
  })
})
