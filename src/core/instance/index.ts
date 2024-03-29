import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'
import type { GlobalAPI } from 'types/global-api'

function Vue(options) {
  if (__DEV__ && !(this instanceof Vue)) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }

  // 从这里开始看
  // 初始化 Vue
  // _init 里面主要做两件事
  // 1. 合并 options，将传入的 options 合并到 $options 上
  // 2. 执行一堆初始化函数
  // 3. 执行挂载操作
  this._init(options)
}

//@ts-expect-error Vue has function type
// 向 Vue 原型上挂载 _init 方法
initMixin(Vue)
//@ts-expect-error Vue has function type
// 相当于初始化了原型上的一堆属性和一堆函数
// $set、$del、$watch
stateMixin(Vue)
//@ts-expect-error Vue has function type
// 为 Vue 原型上加入操作事件的方法，就是完整的 event-bus 系列方法
eventsMixin(Vue)
//@ts-expect-error Vue has function type
// 向 Vue 原型上挂载生命周期函数相关方法
lifecycleMixin(Vue)
//@ts-expect-error Vue has function type
renderMixin(Vue)

export default Vue as unknown as GlobalAPI
