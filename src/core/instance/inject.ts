import { warn, hasSymbol, isFunction, isObject } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'
import type { Component } from 'types/component'
import { resolveProvided } from 'v3/apiInject'

export function initProvide(vm: Component) {
  // 拿到传入的 provide 配置
  const provideOption = vm.$options.provide
  if (provideOption) {

    // 通过传入的函数或者是配置，获取一下 provide 属性值
    const provided = isFunction(provideOption)
      ? provideOption.call(vm)
      : provideOption

    // 如果不是对象，直接退出
    if (!isObject(provided)) {
      return
    }
    const source = resolveProvided(vm)
    // IE9 doesn't support Object.getOwnPropertyDescriptors so we have to
    // iterate the keys ourselves.
    const keys = hasSymbol ? Reflect.ownKeys(provided) : Object.keys(provided)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      Object.defineProperty(
        source,
        key,
        Object.getOwnPropertyDescriptor(provided, key)!
      )
    }
  }
}

export function initInjections(vm: Component) {
  const result = resolveInject(vm.$options.inject, vm)
  if (result) {
    // 标记不可 observe
    toggleObserving(false)

    // 把 inject 的数据变成响应式
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (__DEV__) {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
              `overwritten whenever the provided component re-renders. ` +
              `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key])
      }
    })

    // 标记 observe
    toggleObserving(true)
  }
}

export function resolveInject(
  inject: any,
  vm: Component
): Record<string, any> | undefined | null {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    const keys = hasSymbol ? Reflect.ownKeys(inject) : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      const provideKey = inject[key].from

      // 判断 inject 注册的值是否有对应的 provider
      if (provideKey in vm._provided) {
        result[key] = vm._provided[provideKey]
      } else if ('default' in inject[key]) {

        // 存在默认值
        const provideDefault = inject[key].default
        result[key] = isFunction(provideDefault)
          ? provideDefault.call(vm)
          : provideDefault
      } else if (__DEV__) {
        warn(`Injection "${key as string}" not found`, vm)
      }
    }
    return result
  }
}
