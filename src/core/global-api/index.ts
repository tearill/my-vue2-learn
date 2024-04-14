import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'
import type { GlobalAPI } from 'types/global-api'

// 初始化全局 API
export function initGlobalAPI(Vue: GlobalAPI) {
  // config
  const configDef: Record<string, any> = {}
  configDef.get = () => config
  if (__DEV__) {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // 和 $set、$delete、$nextTick 一样
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  // 初始化全局的组件 指令 过滤器
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  // _base 指向 Vue
  // 加一个 _base 为了确保在不同的情况下都能正确地访问到 Vue 构造函数
  // 这样做的好处是，无论在哪个子类中，都可以通过 _base 属性访问到 Vue 构造函数，而不会受到执行上下文的影响
  Vue.options._base = Vue

  // 加入内置组件，keep-alive
  extend(Vue.options.components, builtInComponents)

  // use 方法
  initUse(Vue)

  // mixin 方法
  initMixin(Vue)

  // extend 方法
  initExtend(Vue)

  //assets 注册方法 包含组件 指令和过滤器
  initAssetRegisters(Vue)
}
