import type { Component } from 'types/component'
import {
  tip,
  toArray,
  isArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents(vm: Component) {

  // 在 vm 上创建一个 _events 对象，用来存放所有的事件
  vm._events = Object.create(null)

  // 这个 bool 标志位来表明是否存在钩子
  // 而不需要通过哈希表的方法来查找是否有钩子，这样做可以减少不必要的开销，优化性能
  vm._hasHookEvent = false
  // init parent attached events
  // 初始化父组件 attach 的事件
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

// 注册一个事件
function add(event, fn) {
  target.$on(event, fn)
}

// 销毁一个事件
function remove(event, fn) {
  target.$off(event, fn)
}

// 注册一个只触发一次的方法
function createOnceHandler(event, fn) {
  const _target = target
  return function onceHandler() {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

// 更新组件的监听事件
export function updateComponentListeners(
  vm: Component,
  listeners: Object,
  oldListeners?: Object | null
) {
  target = vm
  updateListeners(
    listeners,
    oldListeners || {},
    add,
    remove,
    createOnceHandler,
    vm
  )
  target = undefined
}

// 为 Vue 原型上加入操作事件的方法
export function eventsMixin(Vue: typeof Component) {
  const hookRE = /^hook:/

  /**
   * 下面这些就是一个完整的 event-bus 的实现
   */

  // 在 vm 实例上绑定监听事件的方法
  Vue.prototype.$on = function (
    event: string | Array<string>,
    fn: Function
  ): Component {
    const vm: Component = this

    // 如果是数组的时候，则递归 $on，为每一个成员都绑定上方法
    if (isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {

      // 存储所有的事件
      ;(vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      // 这里的优化可以在 callHook 调用钩子的时候看到优化的结果，可以减少很多不必要的调用
      if (hookRE.test(event)) {

        // 这里在注册事件的时候标记 bool 值也就是个标志位来表明存在钩子
        // 而不需要通过哈希表的方法来查找是否有钩子，这样做可以减少不必要的开销，优化性能
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  // 在 vm 实例上绑定监听一次事件的方法
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on() {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  // 注销一个事件
  // 如果不传参则注销所有事件
  // 如果只传 event 名则注销该 event 下的所有方法
  Vue.prototype.$off = function (
    event?: string | Array<string>,
    fn?: Function
  ): Component {
    const vm: Component = this
    // all
    // 如果不传参，直接注销所有的事件
    if (!arguments.length) {

      // 这里通过直接将事件集合重置为 null 实现注销所有的事件
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    // 如果是数组，遍历数组注销所有的事件
    if (isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    // 如果传递了具体的事件名称，寻找具体的事件监听
    const cbs = vm._events[event!]

    // 如果传入的事件不存在，直接返回
    if (!cbs) {
      return vm
    }

    // 如果只传递了 event，则直接清空对应事件下的所有监听回调
    if (!fn) {
      vm._events[event!] = null
      return vm
    }
    // specific handler
    // 如果传入了具体的回调函数，则找到对应的回调函数进行删除
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  // 注册触发（向外派发）事件的函数
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (__DEV__) {
      // 转小写
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
            `${formatComponentName(
              vm
            )} but the handler is registered for "${event}". ` +
            `Note that HTML attributes are case-insensitive and you cannot use ` +
            `v-on to listen to camelCase events when using in-DOM templates. ` +
            `You should probably use "${hyphenate(
              event
            )}" instead of "${event}".`
        )
      }
    }

    // 找到触发事件对应的回调函数
    let cbs = vm._events[event]
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`

      // 调用事件对应注册的所有回调函数
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
